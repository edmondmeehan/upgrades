import { requireArtist } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { CopyButton } from "@/components/CopyButton";
import { storeUrl } from "@/lib/storefront";
import { formatDate } from "@/lib/util";
import { connectBandsintown, importBandsintown, connectLaylo, syncLaylo, disconnect } from "./actions";

export const metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";
type P = { params: Promise<{ artistId: string }>; searchParams: Promise<{ ok?: string; err?: string }> };
type Status = { provider: string; settings: Record<string, string>; connected_at: string; last_ok_at: string | null; last_error: string | null; last_error_at: string | null; synced_count: number; key_hint: string | null };

const when = (d: string | null) => (d ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never");

export default async function Integrations({ params, searchParams }: P) {
  const { artistId } = await params;
  const { ok, err } = await searchParams;
  const { supabase, artist, role } = await requireArtist(artistId, ["owner", "rep"]);
  const owner = role === "owner" || role === "admin";
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: st }, { data: tours }, { data: shows }] = await Promise.all([
    supabase.rpc("integration_status", { p_artist: artistId }),
    supabase.from("tours").select("id, name").eq("artist_id", artistId).order("created_at", { ascending: false }),
    supabase.from("shows").select("slug, show_date, city, region, venue_name").eq("artist_id", artistId).eq("status", "published").gte("show_date", today).order("show_date"),
  ]);
  const status = (p: string) => ((st ?? []) as Status[]).find((s) => s.provider === p);
  const bit = status("bandsintown"), laylo = status("laylo");
  const health = (s?: Status) => s?.last_error && (!s.last_ok_at || new Date(s.last_error_at!) > new Date(s.last_ok_at))
    ? <p className="alert alert-red !text-[13px]">Last attempt failed {when(s.last_error_at)}: {s.last_error}</p> : null;

  return (
    <div className="grid max-w-4xl gap-6">
      <PageHead title="Integrations">Bring your dates in from Bandsintown, put VIP buttons on your Bandsintown and Seated listings, and send fans who opt in to Laylo.</PageHead>
      <Flash ok={ok} err={err} />

      {/* Bandsintown */}
      <section className="panel grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2>Bandsintown</h2><p className="muted mt-1">Import your upcoming dates so you don&apos;t type them twice, then add each show&apos;s VIP link to Bandsintown.</p></div>
          <span className={`badge ${bit ? "b-approved" : "b-neutral"}`}>{bit ? "Connected" : "Not connected"}</span>
        </div>
        {!bit ? (
          <form action={connectBandsintown.bind(null, artistId)} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="field"><span>Bandsintown artist name</span><input name="artist_name" required className="input" defaultValue={artist.name} /><small>Exactly as it appears on your Bandsintown profile.</small></label>
              <label className="field"><span>API key</span><input name="api_key" required className="input font-mono" autoComplete="off" /><small>Bandsintown for Artists, Settings, General, Get API Key.</small></label>
            </div>
            <div><SubmitButton pendingText="Checking…">Connect Bandsintown</SubmitButton></div>
          </form>
        ) : (
          <>
            <p className="text-[14px]">Connected as <b>{bit.settings.artist_name}</b> (key {bit.key_hint}). Last import {when(bit.last_ok_at)}{bit.synced_count ? `, ${bit.synced_count} dates imported so far` : ""}.</p>
            {health(bit)}
            <form action={importBandsintown.bind(null, artistId)} className="grid gap-3 rounded-2xl bg-paper p-4">
              <p className="text-[14px] font-bold">Import upcoming dates</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="field"><span className="!text-[12px]">Add them to</span>
                  <select name="tour_id" className="input input-sm" defaultValue={tours?.[0]?.id ?? "new"}>
                    {(tours ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    <option value="new">A new tour…</option>
                  </select></label>
                <label className="field"><span className="!text-[12px]">New tour name (if new)</span><input name="new_tour" className="input input-sm" placeholder="2027 World Tour" /></label>
              </div>
              <p className="help">Dates come in as drafts. Anything already here (same date and city) is matched, not duplicated, so you can import again any time.</p>
              <div><SubmitButton size="sm" pendingText="Importing…">Import from Bandsintown</SubmitButton></div>
            </form>
            <form action={disconnect.bind(null, artistId, "bandsintown")}><SubmitButton size="sm" variant="ghost" confirm="Disconnect Bandsintown and delete the key?">Disconnect</SubmitButton></form>
          </>
        )}
      </section>

      {/* VIP links for Bandsintown + Seated */}
      <section className="panel grid gap-4">
        <div>
          <h2>VIP buttons on Bandsintown and Seated</h2>
          <p className="muted mt-1">Point each listing&apos;s VIP button at its show page here.</p>
        </div>
        <div className="grid gap-2 text-[14px]">
          <p><b>Bandsintown:</b> edit each event, add a ticket link, set its type to <b>VIP</b>, and paste the link below. (Bandsintown needs a regular Tickets link on the event too.)</p>
          <p><b>Seated:</b> download the CSV and email it to Seated support for a bulk upload. Each date gets a &quot;VIP&quot; promoted button. For one or two dates, paste the link into the date&apos;s promoted onsale instead.</p>
        </div>
        {(shows ?? []).length === 0 ? <p className="help">Publish some shows first; their VIP links show up here.</p> : (
          <>
            <a href={`/a/${artistId}/integrations/seated`} className="btn btn-ghost btn-sm justify-self-start">Download Seated CSV</a>
            <ul className="card divide-y divide-line overflow-hidden">
              {shows!.map((s) => {
                const url = storeUrl(artist.handle, s.slug);
                return (
                  <li key={s.slug} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0"><span className="block font-bold">{formatDate(s.show_date, { month: "short", day: "numeric", year: "numeric" })}, {s.city}{s.region ? `, ${s.region}` : ""}</span>
                      <span className="block truncate text-[12px] text-mute">{url}</span></span>
                    <CopyButton text={url} label="Copy VIP link" />
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/* Laylo */}
      <section className="panel grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2>Laylo</h2><p className="muted mt-1">Fans who tick &quot;Email me news&quot; at checkout, or follow you here, are added to your Laylo automatically.</p></div>
          <span className={`badge ${laylo ? "b-approved" : "b-neutral"}`}>{laylo ? "Connected" : "Not connected"}</span>
        </div>
        {laylo && <p className="text-[14px]">Key {laylo.key_hint}{laylo.settings.drop_id ? `, signups go to Drop ${laylo.settings.drop_id}` : ""}. {laylo.synced_count} fan{laylo.synced_count === 1 ? "" : "s"} sent so far; last {when(laylo.last_ok_at)}.</p>}
        {health(laylo)}
        {owner ? (
          <form action={connectLaylo.bind(null, artistId)} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="field"><span>Laylo API key</span><input name="api_key" required={!laylo} className="input font-mono" autoComplete="off" placeholder={laylo ? "Leave blank to keep the current key" : ""} /><small>Laylo, Settings, Integrations, API Keyring.</small></label>
              <label className="field"><span>Drop ID (optional)</span><input name="drop_id" defaultValue={laylo?.settings.drop_id ?? ""} className="input font-mono" /><small>Tag signups to one Laylo Drop. From the Drop&apos;s embed code, Sharing tab.</small></label>
            </div>
            <p className="help">Laylo sends each new fan its welcome message (set it in Laylo, Settings, SMS). Laylo has no test mode, so we don&apos;t send a test signup when you connect.</p>
            <div className="flex flex-wrap gap-2"><SubmitButton pendingText="Saving…">{laylo ? "Update Laylo" : "Connect Laylo"}</SubmitButton></div>
          </form>
        ) : <p className="help">Only the artist&apos;s owner can connect Laylo.</p>}
        {laylo && owner && (
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <form action={syncLaylo.bind(null, artistId)}><SubmitButton size="sm" variant="ghost" pendingText="Sending…" confirm="Send every current follower and opted-in buyer to Laylo? Each new fan gets your Laylo welcome message.">Send existing fans to Laylo</SubmitButton></form>
            <form action={disconnect.bind(null, artistId, "laylo")}><SubmitButton size="sm" variant="ghost" confirm="Disconnect Laylo and delete the key?">Disconnect</SubmitButton></form>
          </div>
        )}
      </section>
    </div>
  );
}
