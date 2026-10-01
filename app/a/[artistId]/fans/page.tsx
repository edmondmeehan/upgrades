import { requireArtist } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { dollars } from "@/lib/packages";
import { US_STATES } from "@/lib/genres";
import { sendAnnouncement } from "./actions";

export const metadata = { title: "Fans" };
export const dynamic = "force-dynamic";
type P = { params: Promise<{ artistId: string }>; searchParams: Promise<{ ok?: string; err?: string; q?: string }> };
type Fan = { email: string; name: string | null; orders: number; spent_cents: number; passes: number; shows_attended: number; first_order_at: string; last_order_at: string; last_city: string | null; opted_in: boolean; following: boolean };

export default async function Fans({ params, searchParams }: P) {
  const { artistId } = await params;
  const { ok, err, q } = await searchParams;
  const { supabase, artist } = await requireArtist(artistId, ["owner", "rep"]);
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: fansRaw }, { data: follows }, { data: shows }, { data: lastAnn }] = await Promise.all([
    supabase.rpc("superfans", { p_artist: artistId }),
    supabase.from("follows").select("region, source, created_at").eq("artist_id", artistId).not("confirmed_at", "is", null).is("unsubscribed_at", null),
    supabase.from("shows").select("id, show_date, city, region, announced_at").eq("artist_id", artistId).eq("status", "published").gte("show_date", today).order("show_date"),
    supabase.from("announcements").select("created_at, sent_to").eq("artist_id", artistId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const term = (q ?? "").trim().toLowerCase();
  const fans = ((fansRaw ?? []) as Fan[]).filter((f) => !term || [f.email, f.name, f.last_city].some((v) => v?.toLowerCase().includes(term)));
  const followers = follows ?? [];
  const byState = new Map<string, number>();
  followers.forEach((f) => byState.set(f.region ?? "", (byState.get(f.region ?? "") ?? 0) + 1));
  const states = [...byState.entries()].filter(([k]) => k).sort((a, b) => b[1] - a[1]);
  const fmt = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="grid max-w-6xl gap-6">
      <PageHead title="Fans" aside={<a href={`/a/${artistId}/fans/export?list=superfans`} className="btn btn-ghost">Download fans (CSV)</a>}>
        Your best fans, who follows you, and announcements when you add shows.
      </PageHead>
      <Flash ok={ok} err={err} />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([["Fans who've bought", String((fansRaw ?? []).length)], ["Followers", String(followers.length)],
           ["Bought 2+ times", String(((fansRaw ?? []) as Fan[]).filter((f) => f.orders >= 2).length)],
           ["Opted in to news", String(((fansRaw ?? []) as Fan[]).filter((f) => f.opted_in).length)]] as const)
          .map(([l, v]) => <div key={l} className="stat"><b>{v}</b><span>{l}</span></div>)}
      </section>

      <section className="panel grid gap-4">
        <div>
          <h2>Tell your followers</h2>
          <p className="muted mt-1">Email followers when you add shows or put VIP on sale.{lastAnn ? ` Last announcement: ${fmt(lastAnn.created_at)}, to ${lastAnn.sent_to}.` : ""} Only people who followed you or opted in at checkout get these.</p>
        </div>
        {followers.length === 0 ? <p className="alert alert-gray">No followers yet. Fans can follow from the Follow button on your storefront, and anyone who ticks &quot;Email me news&quot; at checkout follows you automatically. Share your storefront link to grow the list.</p>
          : (shows ?? []).length === 0 ? <p className="alert alert-gray">Publish an upcoming show first, then announce it here.</p> : (
          <form action={sendAnnouncement.bind(null, artistId)} className="grid gap-4">
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-[14px] font-bold">Shows to announce</legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {shows!.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-[14px]">
                    <input type="checkbox" name="show" value={s.id} defaultChecked={!s.announced_at} className="check" />
                    {new Date(`${s.show_date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}, {s.city}{s.region ? `, ${s.region}` : ""}
                    {s.announced_at && <span className="text-[12px] text-mute">(announced {fmt(s.announced_at)})</span>}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="field"><span>Message (optional)</span><textarea name="message" maxLength={1000} className="input" placeholder="We're coming back to the Southeast this fall, and meet & greets always sell out. Grab yours early!" /></label>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-[14px] font-bold">Who gets it</legend>
              <label className="flex items-center gap-2 text-[14px]"><input type="radio" name="audience" value="all" defaultChecked className="check" />All {followers.length} followers</label>
              <label className="flex items-center gap-2 text-[14px]"><input type="radio" name="audience" value="states" className="check" />Only followers in these states:</label>
              <div className="ml-7 flex flex-wrap gap-2">
                {(states.length ? states.map(([c, n]) => [c, `${US_STATES.find(([x]) => x === c)?.[1] ?? c} (${n})`]) : US_STATES.slice(0, 0)).map(([c, label]) => (
                  <label key={c} className="flex items-center gap-1.5 rounded-full bg-paper px-3 py-1 text-[13px]"><input type="checkbox" name="region" value={c} className="check !size-4" />{label}</label>
                ))}
                {states.length === 0 && <span className="help">No followers have shared their state yet.</span>}
              </div>
              {byState.get("") ? <p className="help ml-7">{byState.get("")} follower{byState.get("") === 1 ? " hasn't" : "s haven't"} shared a state and only get &quot;all followers&quot; announcements.</p> : null}
            </fieldset>
            <div><SubmitButton pendingText="Sending…" confirm="Send this announcement now?">Send announcement</SubmitButton></div>
          </form>
        )}
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2>Superfans</h2>
          <a href={`/a/${artistId}/fans/export?list=followers`} className="text-[14px] font-semibold">Download followers (CSV)</a>
        </div>
        <form className="flex gap-2" role="search"><input name="q" defaultValue={q ?? ""} className="input flex-1" placeholder="Search name, email or city" aria-label="Search fans" /><button className="btn btn-ghost">Search</button></form>
        {fans.length === 0 ? <p className="card px-4 py-10 text-center muted">{(fansRaw ?? []).length ? "No fans match." : `No buyers yet. Fans who buy ${artist.name} VIP show up here, ranked by what they've spent.`}</p> : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[14px]">
              <thead className="bg-paper"><tr className="th">{["#", "Fan", "Spent", "Orders", "Passes", "Shows attended", "Last order", ""].map((h, i) => <th key={i} className={`px-4 py-3 ${i >= 2 && i <= 5 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {fans.slice(0, 300).map((f, i) => (
                  <tr key={f.email}>
                    <td className="px-4 py-3 text-mute">{i + 1}</td>
                    <td className="px-4 py-3"><span className="block font-bold">{f.name ?? f.email}</span><span className="text-[12px] text-mute">{f.email}{f.last_city ? `, ${f.last_city}` : ""}</span></td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{dollars(Number(f.spent_cents))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{f.orders}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{f.passes}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{f.shows_attended}</td>
                    <td className="px-4 py-3 text-mute">{fmt(f.last_order_at)}</td>
                    <td className="px-4 py-3">{f.following ? <span className="badge b-approved">Follows you</span> : f.opted_in ? <span className="badge b-lilac">Opted in</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="help">Only email fans marked &quot;Follows you&quot; or &quot;Opted in&quot; with marketing. Everyone else bought from you but didn&apos;t agree to news.</p>
      </section>
    </div>
  );
}
