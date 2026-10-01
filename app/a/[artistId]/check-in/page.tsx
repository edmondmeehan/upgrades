import Link from "next/link";
import { requireArtist } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { formatDate } from "@/lib/util";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { inviteMember } from "../actions";

export const metadata = { title: "Check-in" };
type P = { params: Promise<{ artistId: string }>; searchParams?: Promise<{ ok?: string; err?: string }> };
type S = { id: string; show_date: string; city: string | null; region: string | null; venue_name: string | null; status: string };

export default async function CheckInShows({ params, searchParams }: P) {
  const { artistId } = await params;
  const { ok, err } = (await searchParams) ?? {};
  const { supabase, role } = await requireArtist(artistId, ["owner", "rep", "door"]);
  const today = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const { data: shows } = await supabase.from("shows").select("id, show_date, city, region, venue_name, status").eq("artist_id", artistId)
    .neq("status", "cancelled").gte("show_date", since).order("show_date").limit(60).returns<S[]>();
  const ids = (shows ?? []).map((s) => s.id);
  const { data: passes } = ids.length
    ? await supabase.from("passes").select("show_id, checked_in_at, voided_at").in("show_id", ids).is("voided_at", null)
        .returns<{ show_id: string; checked_in_at: string | null; voided_at: string | null }[]>()
    : { data: [] };
  const count = (id: string) => { const p = (passes ?? []).filter((x) => x.show_id === id); return { total: p.length, in: p.filter((x) => x.checked_in_at).length }; };
  const upcoming = (shows ?? []).filter((s) => s.show_date >= today), recent = (shows ?? []).filter((s) => s.show_date < today).reverse();

  const Row = ({ s }: { s: S }) => {
    const c = count(s.id), isToday = s.show_date === today;
    return (
      <li>
        <Link href={`/a/${artistId}/check-in/${s.id}`} className={`card flex flex-wrap items-center justify-between gap-3 p-5 !no-underline text-ink hover:border-violet ${isToday ? "!border-violet shadow-[0_0_0_3px_#dcd5fa]" : ""}`}>
          <span>
            <span className="eyebrow">{isToday ? "Tonight" : formatDate(s.show_date, { weekday: "short", month: "short", day: "numeric" })}</span>
            <span className="block text-[18px] font-extrabold">{s.city ? `${s.city}${s.region ? `, ${s.region}` : ""}` : "City TBD"}</span>
            <span className="muted text-[14px]">{s.venue_name ?? ""}</span>
          </span>
          <span className="text-right">
            <span className="block text-[20px] font-extrabold">{c.in} / {c.total}</span>
            <span className="help">checked in</span>
          </span>
        </Link>
      </li>
    );
  };

  return (
    <>
      <PageHead title="Check-in">Pick a show to scan VIP passes at the door. Works on any phone browser, with no app to install, and keeps working if the signal drops.</PageHead>
      <Flash ok={ok} err={err} />
      {upcoming.length === 0 && recent.length === 0 ? <p className="card px-4 py-12 text-center muted">No shows to check in yet.</p> : (
        <>
          {upcoming.length > 0 && <ul className="grid gap-3">{upcoming.map((s) => <Row key={s.id} s={s} />)}</ul>}
          {recent.length > 0 && (<><h2 className="mt-2">Recent shows</h2><ul className="grid gap-3">{recent.map((s) => <Row key={s.id} s={s} />)}</ul></>)}
        </>
      )}
      {role !== "door" && (
        <details className="panel mt-2">
          <summary className="cursor-pointer font-extrabold">Invite door staff</summary>
          <form action={inviteMember.bind(null, artistId)} className="mt-3 grid gap-3">
            <input type="hidden" name="role" value="door" /><input type="hidden" name="from" value="check-in" />
            <p className="help">Venue staff or crew who check fans in. They only see Check-in: guest names and packages, no emails, orders or money.</p>
            <div className="flex flex-wrap gap-2">
              <input name="email" type="email" required placeholder="Their email" className="input input-sm min-w-[240px] flex-1" aria-label="Email" />
              <SubmitButton size="sm" pendingText="Sending…">Send invite</SubmitButton>
            </div>
          </form>
        </details>
      )}
    </>
  );
}
