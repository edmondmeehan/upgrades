"use client";
import { useMemo, useState } from "react";
import { SubmitButton } from "./SubmitButton";
import { rowsFromText } from "@/lib/showImport";
import { TEMPLATES } from "@/lib/packages";
import { currencyForCountry, currencySymbol } from "@/lib/money";
import type { WizardPackage, WizardShow } from "@/app/a/[artistId]/launch/actions";

type Props = {
  artistName: string; hasBandsintown: boolean; blockers: string[];
  importBit: () => Promise<{ rows: WizardShow[]; error?: string }>;
  submit: (fd: FormData) => Promise<void>;
};
const STEPS = ["Dates", "Packages", "Prices", "On sale", "Review"];
const fromTemplate = (t: (typeof TEMPLATES)[number]): WizardPackage => ({ kind: t.kind, name: t.name, description: t.description, included: t.included, includes_photo: t.includes_photo, price: String(t.price), capacity: String(t.capacity), currency_prices: {} });
/** Tidy a pasted row: "Nashville TN" splits into city + state; a long "state" is really the venue; well-known cities get their country. */
const ABROAD: Record<string, string> = { london: "GB", manchester_uk: "GB", glasgow: "GB", birmingham_uk: "GB", dublin: "IE", paris: "FR", berlin: "DE", amsterdam: "NL", madrid: "ES", barcelona: "ES",
  milan: "IT", brussels: "BE", vienna: "AT", lisbon: "PT", toronto: "CA", vancouver: "CA", montreal: "CA", sydney: "AU", melbourne: "AU", brisbane: "AU" };
function tidy(r: WizardShow): WizardShow {
  let { city, region, venue_name, country } = r;
  if (!venue_name && region && region.length > 3) { venue_name = region; region = ""; }
  const m = city.match(/^(.*?)[,\s]+([A-Za-z]{2})$/);
  if (m && !region && m[2].toUpperCase() !== "UK") { city = m[1].trim(); region = m[2].toUpperCase(); }
  if (m && m[2].toUpperCase() === "UK") { city = m[1].trim(); country = "GB"; }
  if ((!country || country === "US") && !region && ABROAD[city.trim().toLowerCase()]) country = ABROAD[city.trim().toLowerCase()];
  return { ...r, city, region, venue_name, country: country || "US" };
}
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Guided first tour: dates, packages, prices, on-sale, review. Creates everything in one go. */
export function LaunchWizard({ artistName, hasBandsintown, blockers, importBit, submit }: Props) {
  const [step, setStep] = useState(0);
  const [tourName, setTourName] = useState("");
  const [paste, setPaste] = useState("");
  const [shows, setShows] = useState<WizardShow[]>([]);
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [bitBusy, setBitBusy] = useState(false);
  const [pkgs, setPkgs] = useState<WizardPackage[]>([fromTemplate(TEMPLATES[0])]);
  const [onSale, setOnSale] = useState<"now" | "later">("now");
  const [onSaleAt, setOnSaleAt] = useState("");
  const [publish, setPublish] = useState(true);

  const others = useMemo(() => [...new Set(shows.map((s) => currencyForCountry(s.country)))].filter((c) => c !== "usd"), [shows]);
  const hasUS = shows.some((s) => currencyForCountry(s.country) === "usd") || shows.length === 0;
  const ready = shows.filter((s) => s.city && s.venue_name).length;

  const readPaste = () => {
    const r = rowsFromText(paste);
    const rows = r.rows.filter((x) => x.show_date).map((x) => tidy({ show_date: x.show_date, city: x.city, region: x.region, venue_name: x.venue_name, country: x.country || "US", timezone: x.timezone, doors_time: x.doors_time, show_time: x.show_time, address: x.address, postal_code: x.postal_code }));
    setShows((cur) => [...cur, ...rows].sort((a, b) => a.show_date.localeCompare(b.show_date)));
    setPasteNote(rows.length ? `Added ${rows.length} date${rows.length === 1 ? "" : "s"}.${r.unreadable ? ` ${r.unreadable} line${r.unreadable === 1 ? "" : "s"} couldn't be read.` : ""}` : "We couldn't read any dates. Try one show per line: date, city, venue.");
    if (rows.length) setPaste("");
  };
  const pullBit = async () => {
    setBitBusy(true);
    const r = await importBit();
    setBitBusy(false);
    if (r.error) { setPasteNote(r.error); return; }
    const have = new Set(shows.map((s) => `${s.show_date}|${s.city.toLowerCase()}`));
    const add = r.rows.filter((x) => !have.has(`${x.show_date}|${x.city.toLowerCase()}`));
    setShows((cur) => [...cur, ...add].sort((a, b) => a.show_date.localeCompare(b.show_date)));
    setPasteNote(`Added ${add.length} date${add.length === 1 ? "" : "s"} from Bandsintown.`);
  };
  const setShow = (i: number, patch: Partial<WizardShow>) => setShows((cur) => cur.map((s, n) => (n === i ? { ...s, ...patch } : s)));
  const setPkg = (i: number, patch: Partial<WizardPackage>) => setPkgs((cur) => cur.map((p, n) => (n === i ? { ...p, ...patch } : p)));
  const togglePkg = (t: (typeof TEMPLATES)[number]) => setPkgs((cur) => (cur.some((p) => p.kind === t.kind && t.kind !== "custom") ? cur.filter((p) => p.kind !== t.kind) : [...cur, fromTemplate(t)]));

  const canNext = [shows.length > 0, pkgs.length > 0 && pkgs.every((p) => p.name.trim()), pkgs.every((p) => Number(p.price) >= 1 && Number(p.capacity) >= 1), onSale === "now" || !!onSaleAt, true][step];
  const payload = JSON.stringify({ tour_name: tourName || `${artistName} tour`, shows, packages: pkgs, on_sale: onSale, on_sale_at: onSaleAt, publish });

  return (
    <div className="grid gap-5">
      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}><button type="button" disabled={i > step && !canNext} onClick={() => i <= step && setStep(i)}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold ${i === step ? "bg-ink text-white" : i < step ? "bg-yellow text-ink" : "bg-paper text-mute"}`}
            aria-current={i === step ? "step" : undefined}>{i < step ? "✓ " : `${i + 1}. `}{s}</button></li>
        ))}
      </ol>

      {step === 0 && (
        <section className="panel grid gap-4">
          <div><h2>Your tour dates</h2><p className="muted mt-1">Paste them from a spreadsheet or your website{hasBandsintown ? ", or pull them from Bandsintown" : ""}. You can fix anything after.</p></div>
          <label className="field"><span>Tour name</span><input value={tourName} onChange={(e) => setTourName(e.target.value)} className="input" placeholder={`${artistName} 2026 Tour`} /></label>
          <label className="field"><span>Paste dates, one show per line</span>
            <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={5} className="input font-mono !text-[13px]" placeholder={"Nov 7, Nashville TN, Ryman Auditorium\nNov 9, Atlanta GA, Tabernacle\nNov 21, London UK, O2 Academy Brixton"} /></label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={readPaste} disabled={!paste.trim()} className="btn btn-sm">Add these dates</button>
            {hasBandsintown && <button type="button" onClick={pullBit} disabled={bitBusy} className="btn btn-ghost btn-sm">{bitBusy ? "Getting dates…" : "Import from Bandsintown"}</button>}
          </div>
          {pasteNote && <p role="status" className="help">{pasteNote}</p>}
          {shows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-[14px]">
                <thead><tr className="th">{["Date", "City", "State", "Country", "Venue", ""].map((h) => <th key={h} className="px-2 py-2">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-line">
                  {shows.map((s, i) => (
                    <tr key={`${s.show_date}-${i}`}>
                      <td className="px-2 py-1.5 whitespace-nowrap font-semibold">{fmt(s.show_date)}</td>
                      <td className="px-2 py-1.5"><input value={s.city} onChange={(e) => setShow(i, { city: e.target.value })} className="input input-sm" aria-label="City" /></td>
                      <td className="px-2 py-1.5 w-20"><input value={s.region} onChange={(e) => setShow(i, { region: e.target.value.toUpperCase().slice(0, 3) })} className="input input-sm uppercase" aria-label="State" /></td>
                      <td className="px-2 py-1.5 w-20"><input value={s.country} onChange={(e) => setShow(i, { country: e.target.value.toUpperCase().slice(0, 2) })} className="input input-sm uppercase" aria-label="Country" title="2-letter country code, e.g. US, GB, CA" /></td>
                      <td className="px-2 py-1.5"><input value={s.venue_name} onChange={(e) => setShow(i, { venue_name: e.target.value })} className="input input-sm" aria-label="Venue" /></td>
                      <td className="px-2 py-1.5"><button type="button" onClick={() => setShows((cur) => cur.filter((_, n) => n !== i))} className="text-[13px] font-bold text-rope underline">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="help mt-2">{shows.length} date{shows.length === 1 ? "" : "s"}. Dates without a city and venue are saved as drafts. Country sets the currency (GB is pounds, CA Canadian dollars, and so on).</p>
            </div>
          )}
        </section>
      )}

      {step === 1 && (
        <section className="panel grid gap-4">
          <div><h2>Pick your VIP packages</h2><p className="muted mt-1">Start from a template; rename anything. Each package goes on sale at every date.</p></div>
          <div className="grid gap-2 sm:grid-cols-2">
            {TEMPLATES.filter((t) => t.kind !== "custom").map((t) => {
              const on = pkgs.some((p) => p.kind === t.kind);
              return (
                <button key={t.kind} type="button" onClick={() => togglePkg(t)} aria-pressed={on}
                  className={`grid gap-1 rounded-2xl border-2 p-4 text-left ${on ? "border-violet bg-[#f1eefc]" : "border-line bg-white"}`}>
                  <span className="flex items-center justify-between gap-2 font-extrabold">{t.name}<span aria-hidden className={`grid size-6 place-items-center rounded-full text-[13px] ${on ? "bg-violet text-white" : "bg-paper"}`}>{on ? "✓" : "+"}</span></span>
                  <span className="text-[13px] text-mute">{t.description}</span>
                </button>
              );
            })}
            <button type="button" onClick={() => setPkgs((cur) => [...cur, fromTemplate(TEMPLATES.find((t) => t.kind === "custom")!)])} className="grid place-items-center rounded-2xl border-2 border-dashed border-line p-4 font-bold text-mute">+ Your own package</button>
          </div>
          {pkgs.length > 0 && (
            <ul className="grid gap-2">
              {pkgs.map((p, i) => (
                <li key={i} className="grid gap-2 rounded-2xl bg-paper p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <input value={p.name} onChange={(e) => setPkg(i, { name: e.target.value })} className="input input-sm font-semibold" placeholder="Package name" aria-label="Package name" />
                  <button type="button" onClick={() => setPkgs((cur) => cur.filter((_, n) => n !== i))} className="text-[13px] font-bold text-rope underline">Remove</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="panel grid gap-4">
          <div><h2>Price and quantity</h2><p className="muted mt-1">One price and quantity for every date. Change single dates later in the inventory grid. Fans also pay a service fee on top.</p></div>
          {pkgs.map((p, i) => (
            <div key={i} className="grid gap-3 rounded-2xl bg-paper p-4">
              <p className="font-extrabold">{p.name}</p>
              <div className="flex flex-wrap gap-3">
                {hasUS && (
                  <label className="field"><span className="!text-[12px]">Price{others.length ? " (USD)" : ""}</span>
                    <span className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-mute">$</span><input value={p.price} onChange={(e) => setPkg(i, { price: e.target.value })} inputMode="decimal" className="input input-sm w-28 !pl-7" /></span></label>
                )}
                {others.map((c) => (
                  <label key={c} className="field"><span className="!text-[12px]">Price ({c.toUpperCase()})</span>
                    <span className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-mute">{currencySymbol(c)}</span>
                      <input value={p.currency_prices[c] ?? (hasUS ? "" : p.price)} onChange={(e) => setPkg(i, hasUS ? { currency_prices: { ...p.currency_prices, [c]: e.target.value } } : { price: e.target.value, currency_prices: { ...p.currency_prices, [c]: e.target.value } })} inputMode="decimal" placeholder={p.price} className="input input-sm w-28 !pl-9" /></span></label>
                ))}
                <label className="field"><span className="!text-[12px]">Quantity per date</span><input value={p.capacity} onChange={(e) => setPkg(i, { capacity: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className="input input-sm w-28" /></label>
              </div>
              {p.included.length > 0 && <p className="help">Includes: {p.included.join(", ")}. Edit details on the package page later.</p>}
            </div>
          ))}
        </section>
      )}

      {step === 3 && (
        <section className="panel grid gap-4">
          <div><h2>When does VIP go on sale?</h2><p className="muted mt-1">A countdown shows on your storefront until then.</p></div>
          <label className="flex items-center gap-2"><input type="radio" className="check" checked={onSale === "now"} onChange={() => setOnSale("now")} />As soon as I publish</label>
          <label className="flex items-center gap-2"><input type="radio" className="check" checked={onSale === "later"} onChange={() => setOnSale("later")} />At a set time</label>
          {onSale === "later" && <label className="field ml-7 max-w-xs"><span className="!text-[12px]">On sale</span><input type="datetime-local" value={onSaleAt} onChange={(e) => setOnSaleAt(e.target.value)} className="input input-sm" /></label>}
        </section>
      )}

      {step === 4 && (
        <form action={submit} className="panel grid gap-4">
          <input type="hidden" name="payload" value={payload} />
          <h2>Review</h2>
          <ul className="grid gap-1.5 text-[15px]">
            <li><b>{tourName || `${artistName} tour`}</b>: {shows.length} date{shows.length === 1 ? "" : "s"}, {fmt(shows[0].show_date)} to {fmt(shows[shows.length - 1].show_date)}</li>
            {pkgs.map((p, i) => <li key={i}>{p.name}: {[...(hasUS ? [`$${p.price}`] : []), ...others.map((c) => `${currencySymbol(c)}${p.currency_prices[c] || p.price}`)].join(" / ")}, {p.capacity} per date</li>)}
            <li>On sale: {onSale === "now" ? "when published" : new Date(onSaleAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</li>
          </ul>
          <label className="flex items-start gap-2"><input type="checkbox" className="check mt-0.5" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            <span>Publish the {ready} date{ready === 1 ? "" : "s"} that have a city and venue{shows.length - ready ? ` (${shows.length - ready} will be saved as drafts)` : ""}</span></label>
          {blockers.length > 0 && (
            <div className="alert alert-yellow flex-col items-start !text-[14px]">
              <b>Fans can&apos;t buy yet, because:</b>
              <ul className="list-disc pl-5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
              <span>You can still set everything up now; it goes live once these are done.</span>
            </div>
          )}
          <div><SubmitButton size="lg" pendingText="Setting up your tour…">Create my tour</SubmitButton></div>
        </form>
      )}

      {step < 4 && (
        <div className="flex justify-between gap-2">
          <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="btn btn-ghost">Back</button>
          <button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canNext} className="btn">Next: {STEPS[step + 1]}</button>
        </div>
      )}
    </div>
  );
}
