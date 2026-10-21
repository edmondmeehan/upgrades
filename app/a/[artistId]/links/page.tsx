import Link from "next/link";
import { requireArtist } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { CopyButton } from "@/components/CopyButton";
import { PLATFORMS, isPlatform, place, shortDate, showLink, storeLink, type Platform } from "@/lib/linkExport";
import { exportShows } from "./data";
import { sendLinks } from "./actions";

export const metadata = { title: "Links" };
export const dynamic = "force-dynamic";
type P = { params: Promise<{ artistId: string }>; searchParams: Promise<{ p?: string; tour?: string; ok?: string; err?: string }> };

export default async function Links({ params, searchParams }: P) {
  const { artistId } = await params;
  const q = await searchParams;
  const { supabase, artist } = await requireArtist(artistId, ["owner", "rep"]);
  const p: Platform = isPlatform(q.p) ? q.p : "bandsintown";
  const tour = q.tour || "";
  const [{ data: tours }, shows] = await Promise.all([
    supabase.from("tours").select("id, name").eq("artist_id", artistId).order("created_at", { ascending: false }),
    exportShows(supabase, artistId, tour || null),
  ]);
  const base = `/a/${artistId}/links`;
  const qs = (o: Record<string, string>) => `?${new URLSearchParams(Object.entries({ p, ...(tour ? { tour } : {}), ...o }).filter(([, v]) => v)).toString()}`;
  const rows = [
    ...(p === "laylo" || p === "linkinbio" ? [{ key: "all", label: "All dates (storefront)", sub: `${artist.name} VIP upgrades`, url: storeLink(artist.handle, p) }] : []),
    ...shows.map((s) => ({ key: s.slug, label: `${shortDate(s.show_date)}, ${place(s)}`, sub: s.venue_name ?? "", url: showLink(artist.handle, s.slug, p) })),
  ];
  const all = rows.map((r) => `${r.label}${r.sub ? ` (${r.sub})` : ""}: ${r.url}`).join("\n");

  return (
    <div className="grid max-w-4xl gap-6">
      <PageHead title="Links">VIP links for every date, ready for Bandsintown, Seated, Laylo and your link in bio. Download them, copy them, or send them to whoever runs those for you.</PageHead>
      <Flash ok={q.ok} err={q.err} />

      <div className="flex flex-wrap items-center gap-3">
        <form className="flex items-center gap-2" action={base}>
          <input type="hidden" name="p" value={p} />
          <label className="text-[14px] font-bold" htmlFor="tour">Dates</label>
          <select id="tour" name="tour" defaultValue={tour} className="input input-sm !w-auto">
            <option value="">All upcoming</option>
            {(tours ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className="btn btn-ghost btn-sm">Show</button>
        </form>
        <a href={`${base}/export${qs({ p: "all" })}`} className="btn btn-ghost btn-sm">Download everything (CSV)</a>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Platform">
        {(Object.keys(PLATFORMS) as Platform[]).map((k) => (
          <Link key={k} href={`${base}${qs({ p: k })}`} aria-current={k === p ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-[14px] font-bold !no-underline ${k === p ? "bg-ink text-white" : "bg-paper text-ink"}`}>{PLATFORMS[k].label}</Link>
        ))}
      </nav>

      <section className="panel grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2>{PLATFORMS[p].label}</h2>
            <ol className="mt-2 grid list-decimal gap-1 pl-5 text-[14px]">{PLATFORMS[p].steps.map((s) => <li key={s}>{s}</li>)}</ol>
          </div>
          {rows.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <a href={`${base}/export${qs({})}`} className="btn btn-sm">Download {PLATFORMS[p].label} CSV</a>
              <CopyButton text={all} label="Copy all" />
            </div>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="help">No upcoming published dates{tour ? " on this tour" : ""}. Publish a show and its link shows up here.</p>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {rows.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0 flex-1"><span className="block font-bold">{r.label}</span>
                  <span className="block truncate text-[12px] text-mute">{r.sub ? `${r.sub} · ` : ""}{r.url}</span></span>
                <CopyButton text={r.url} label="Copy link" />
              </li>
            ))}
          </ul>
        )}
        <p className="help">Links are tagged for {PLATFORMS[p].label} so sales from it can be told apart later. They open the same VIP page either way.</p>
      </section>

      {shows.length > 0 && (
        <form action={sendLinks.bind(null, artistId)} className="panel grid gap-4">
          <div><h2>Send to someone</h2><p className="muted mt-1">Email the links and these instructions to a manager, agent or whoever updates these for {artist.name}. Replies come to you.</p></div>
          <input type="hidden" name="tour" value={tour} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field"><span>Their email</span><input name="to" type="email" required className="input" placeholder="manager@example.com" /></label>
            <fieldset className="field"><span>Platforms</span>
              <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
                {(Object.keys(PLATFORMS) as Platform[]).map((k) => (
                  <label key={k} className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="platform" value={k} defaultChecked={k === p} className="check" />{PLATFORMS[k].label}</label>
                ))}
              </div>
            </fieldset>
          </div>
          <label className="field"><span>Note (optional)</span><textarea name="note" rows={2} className="input" placeholder="Can you add these before Friday's on-sale?" /></label>
          <div><SubmitButton pendingText="Sending…">Send links</SubmitButton></div>
        </form>
      )}
    </div>
  );
}
