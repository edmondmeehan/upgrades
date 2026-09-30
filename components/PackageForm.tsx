"use client";
import { useMemo, useState } from "react";
import { SubmitButton } from "./SubmitButton";
import { ImageUpload } from "./ImageUpload";
import type { PackageTemplate } from "@/lib/packages";

export type FormShow = {
  id: string; date: string; label: string; venue: string | null; tour_id: string; tour_name: string; past: boolean;
  selected: boolean; price: string; capacity: string; sold: number; // price/capacity "" = use the package default
};

type Props = {
  action: (fd: FormData) => void | Promise<void>;
  artistId: string;
  initial: { kind: string; name: string; description: string; included: string[]; includes_photo: boolean; image_url: string | null;
    on_sale_at: string | null; off_sale_at: string | null; presale_code: string | null; default_price: string; default_capacity: string };
  shows: FormShow[];
  template?: PackageTemplate;
  submitLabel: string;
};

const toLocal = (isoStr: string | null) => {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function PackageForm({ action, artistId, initial, shows: startShows, submitLabel }: Props) {
  const [shows, setShows] = useState(startShows);
  const [defPrice, setDefPrice] = useState(initial.default_price);
  const [defCap, setDefCap] = useState(initial.default_capacity);
  const [onSale, setOnSale] = useState(toLocal(initial.on_sale_at));
  const [offSale, setOffSale] = useState(toLocal(initial.off_sale_at));
  const [showPast, setShowPast] = useState(false);

  const tours = useMemo(() => {
    const m = new Map<string, { id: string; name: string; shows: FormShow[] }>();
    shows.forEach((s) => { if (!showPast && s.past && !s.selected) return; const t = m.get(s.tour_id) ?? { id: s.tour_id, name: s.tour_name, shows: [] }; t.shows.push(s); m.set(s.tour_id, t); });
    return [...m.values()];
  }, [shows, showPast]);

  const set = (id: string, patch: Partial<FormShow>) => setShows((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const setTour = (tourId: string, on: boolean) => setShows((prev) => prev.map((s) => (s.tour_id === tourId && (!s.past || showPast) ? { ...s, selected: on } : s)));
  const selected = shows.filter((s) => s.selected);
  const custom = selected.filter((s) => s.price || s.capacity).length;
  const resetAll = () => setShows((prev) => prev.map((s) => ({ ...s, price: "", capacity: "" })));

  return (
    <form action={action} className="grid gap-6">
      <input type="hidden" name="kind" value={initial.kind} />
      <input type="hidden" name="shows" value={JSON.stringify(selected.map((s) => ({ show_id: s.id, price: s.price || null, capacity: s.capacity || null })))} />
      <input type="hidden" name="on_sale_at" value={onSale ? new Date(onSale).toISOString() : ""} />
      <input type="hidden" name="off_sale_at" value={offSale ? new Date(offSale).toISOString() : ""} />

      <section className="panel grid gap-5">
        <h2>What fans get</h2>
        <label className="field"><span>Package name</span><input className="input" name="name" required maxLength={120} defaultValue={initial.name} placeholder="Meet & greet + photo" /></label>
        <label className="field"><span>Short description</span><textarea className="input !min-h-24" name="description" maxLength={600} defaultValue={initial.description} placeholder="What makes this special, in a sentence or two." /></label>
        <label className="field"><span>What&apos;s included</span>
          <textarea className="input" name="included" defaultValue={initial.included.join("\n")} placeholder={"Meet & greet with the band\nProfessional photo\nCommemorative laminate"} />
          <small>One item per line. Fans see these as a checklist.</small>
        </label>
        <label className="flex items-start gap-3 rounded-2xl bg-paper p-4">
          <input type="checkbox" name="includes_photo" defaultChecked={initial.includes_photo} className="check mt-0.5" />
          <span><span className="font-semibold">Includes a photo</span><span className="help block">Buyers get their meet &amp; greet photos delivered after the show.</span></span>
        </label>
        <ImageUpload artistId={artistId} folder="packages" name="image_url" defaultValue={initial.image_url} label="Package image (optional)" aspect="aspect-[16/9] max-w-md" hint="A photo from a past meet & greet or show works well. JPG or PNG, up to 8 MB." />
      </section>

      <section className="panel grid gap-5">
        <div>
          <h2>Shows and pricing</h2>
          <p className="muted mt-1">Pick the shows this package is sold at. Prices are what you get; fans see the service fee added on top.</p>
        </div>

        {shows.length === 0 ? (
          <div className="alert alert-yellow">Add shows to a tour first, then come back to put this package on sale.</div>
        ) : (
          <>
            <div className="grid gap-4 rounded-2xl bg-paper p-4 sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:items-end">
              <label className="field"><span>Default price</span>
                <span className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-mute">$</span>
                  <input className="input w-36 !pl-8" name="default_price" inputMode="decimal" required value={defPrice} onChange={(e) => setDefPrice(e.target.value)} /></span></label>
              <label className="field"><span>Default quantity per show</span>
                <input className="input w-36" name="default_capacity" inputMode="numeric" required value={defCap} onChange={(e) => setDefCap(e.target.value.replace(/\D/g, ""))} /></label>
              <p className="help sm:pb-3">
                Every show starts with these. Type a different price or quantity on any show to change just that one.
                {custom > 0 && <> {custom} show{custom === 1 ? " has" : "s have"} custom values. <button type="button" className="font-semibold text-violet underline" onClick={resetAll}>Reset all to default</button></>}
              </p>
            </div>

            {tours.map((t) => {
              const all = t.shows.every((s) => s.selected);
              return (
                <div key={t.id} className="overflow-x-auto rounded-2xl border border-line">
                  <table className="w-full min-w-[40rem] text-left text-[14px]">
                    <thead className="bg-paper">
                      <tr>
                        <th className="px-3 py-2.5">
                          <label className="flex items-center gap-2 text-[14px] font-extrabold normal-case tracking-normal text-ink">
                            <input type="checkbox" className="check" checked={all} onChange={(e) => setTour(t.id, e.target.checked)} aria-label={`Select every show on ${t.name}`} />
                            {t.name}
                          </label>
                        </th>
                        <th className="th px-3 py-2.5">Price</th><th className="th px-3 py-2.5">Quantity</th><th className="th px-3 py-2.5">Inventory</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line bg-card">
                      {t.shows.map((s) => (
                        <tr key={s.id} className={s.selected ? "" : "text-mute"}>
                          <td className="px-3 py-2">
                            <label className="flex items-center gap-2">
                              <input type="checkbox" className="check" checked={s.selected} onChange={(e) => set(s.id, { selected: e.target.checked })} />
                              <span><span className="font-semibold text-ink">{s.label}</span><span className="block text-[13px] text-mute">{fmtDate(s.date)}{s.venue ? `, ${s.venue}` : ""}{s.past ? " (past)" : ""}</span></span>
                            </label>
                          </td>
                          <td className="px-3 py-2"><span className="relative inline-block"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-mute">$</span>
                            <input aria-label={`Price for ${s.label}`} className={`input input-sm w-28 !pl-6 ${s.price ? "!border-violet" : ""}`} inputMode="decimal" disabled={!s.selected}
                              placeholder={defPrice || "0"} value={s.price} onChange={(e) => set(s.id, { price: e.target.value })} /></span></td>
                          <td className="px-3 py-2"><input aria-label={`Quantity for ${s.label}`} className={`input input-sm w-24 ${s.capacity ? "!border-violet" : ""}`} inputMode="numeric" disabled={!s.selected}
                              placeholder={defCap || "0"} value={s.capacity} onChange={(e) => set(s.id, { capacity: e.target.value.replace(/\D/g, "") })} /></td>
                          <td className="px-3 py-2 text-[13px]">
                            {s.selected ? (() => { const cap = Number(s.capacity || defCap || 0); return <><span className="font-semibold">{s.sold} sold</span><span className="block text-mute">{Math.max(0, cap - s.sold)} left of {cap}</span></>; })() : <span className="text-mute">Not sold here</span>}
                            {(s.price || s.capacity) && s.selected && <button type="button" className="mt-0.5 block text-[12px] font-semibold text-violet underline" onClick={() => set(s.id, { price: "", capacity: "" })}>Use default</button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
            {shows.some((s) => s.past) && (
              <button type="button" className="btn btn-text btn-sm justify-self-start" onClick={() => setShowPast(!showPast)}>{showPast ? "Hide past shows" : "Show past shows"}</button>
            )}
          </>
        )}
      </section>

      <section className="panel grid gap-5">
        <h2>When it&apos;s on sale</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field"><span>On sale from</span><input className="input" type="datetime-local" value={onSale} onChange={(e) => setOnSale(e.target.value)} /><small>Leave blank to go on sale as soon as the show is published.</small></label>
          <label className="field"><span>Off sale at</span><input className="input" type="datetime-local" value={offSale} onChange={(e) => setOffSale(e.target.value)} /><small>Leave blank to sell until the day of the show.</small></label>
        </div>
        <label className="field"><span>Presale code (optional)</span><input className="input max-w-xs uppercase" name="presale_code" defaultValue={initial.presale_code ?? ""} placeholder="FANCLUB" maxLength={30} /><small>Fans need this code to buy. Share it with your fan club or mailing list.</small></label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton size="lg" pendingText="Saving…">{submitLabel}</SubmitButton>
        <span className="help">{selected.length} show{selected.length === 1 ? "" : "s"} selected</span>
      </div>
    </form>
  );
}
