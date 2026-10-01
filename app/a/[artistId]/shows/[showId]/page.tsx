import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArtist } from "@/lib/auth";
import { SellingBlockers } from "@/components/SellingBlockers";
import { sellingBlockers } from "@/lib/readiness";
import { PageHead } from "@/components/Shell";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { ShowFields } from "@/components/ShowFields";
import { ShowStatus } from "@/components/ShowStatus";
import { updateShow, setShowStatus, deleteShow } from "../../actions";
import { formatDate } from "@/lib/util";
import type { Show } from "@/lib/types";
import { dollars } from "@/lib/packages";
import { CheckinDetailsPanel } from "@/components/CheckinDetailsPanel";
import { SHOW_CHECKIN_COLUMNS, type CheckinShow } from "@/lib/checkinEmail";
import { saveCheckinDetails, sendCheckinNow } from "./checkin-actions";

type P = { params: Promise<{ artistId: string; showId: string }>; searchParams: Promise<{ ok?: string; err?: string }> };

export default async function ShowPage({ params, searchParams }: P) {
  const { artistId, showId } = await params;
  const { ok, err } = await searchParams;
  const { supabase, artist } = await requireArtist(artistId, ["owner", "rep"]);
  const blockers = await sellingBlockers(supabase, artistId, artist.status);
  const { data: show } = await supabase.from("shows").select("*, tours(name)").eq("id", showId).eq("artist_id", artistId)
    .maybeSingle<Show & { tours: { name: string } }>();
  if (!show) notFound();
  const statusAction = setShowStatus.bind(null, artistId, showId);
  const { count: salesCount } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("show_id", showId).eq("is_sample", false);
  const { data: pkgs } = await supabase.from("show_products").select("id, price_cents, capacity, active, products!inner(id, name, archived_at, is_sample)")
    .eq("show_id", showId).eq("products.is_sample", false).is("products.archived_at", null)
    .returns<{ id: string; price_cents: number; capacity: number; active: boolean; products: { id: string; name: string } }[]>();
  const [{ data: ci }, { data: ciPkgs }, { data: rec }] = await Promise.all([
    supabase.from("shows").select(SHOW_CHECKIN_COLUMNS).eq("id", showId).single<CheckinShow>(),
    supabase.from("show_products").select("id, checkin_time, checkin_notes, products!inner(name, archived_at, is_sample)").eq("show_id", showId).eq("active", true)
      .eq("products.is_sample", false).is("products.archived_at", null)
      .returns<{ id: string; checkin_time: string | null; checkin_notes: string | null; products: { name: string } }[]>(),
    supabase.rpc("checkin_recipients", { p_show: showId }),
  ]);
  const recipients = (rec ?? []) as { sent: boolean }[];

  return (
    <div className="grid max-w-3xl gap-6">
      <SellingBlockers blockers={blockers} />
      <PageHead crumbs={[{ href: `/a/${artistId}/tours`, label: "Tours & shows" }, { href: `/a/${artistId}/tours/${show.tour_id}`, label: show.tours.name }]}
        title={`${show.city ?? "City TBD"}, ${formatDate(show.show_date, { month: "short", day: "numeric", year: "numeric" })}`}
        aside={<ShowStatus status={show.status} incomplete={!show.city || !show.venue_name} />}>
        {show.venue_name ?? "Venue TBD"}
      </PageHead>
      <Flash ok={ok} err={err} />

      <section className="panel grid gap-3">
        {show.status === "draft" && (
          <>
            <p>Drafts are only visible to your team. Publish when the date is confirmed.</p>
            {(!show.city || !show.venue_name) && <p className="font-semibold">Add the city and venue below before publishing.</p>}
            {artist.status !== "approved" && <p className="muted">Published shows appear on your storefront once P&amp;T approves your account.</p>}
            <form action={statusAction} className="flex flex-wrap gap-3">
              <SubmitButton name="status" value="published" pendingText="Publishing…">Publish show</SubmitButton>
            </form>
          </>
        )}
        {show.status === "published" && (
          <form action={statusAction} className="flex flex-wrap items-center gap-3">
            <p className="flex-1">This show is published{artist.status === "approved" ? " and listed on your storefront" : ""}.</p>
            <SubmitButton name="status" value="draft" variant="ghost">Unpublish</SubmitButton>
            <SubmitButton name="status" value="cancelled" variant="danger" confirm="Cancel this show? Buyers will be notified once upgrades are on sale.">Cancel show</SubmitButton>
          </form>
        )}
        {show.status === "cancelled" && (
          <form action={statusAction} className="flex flex-wrap items-center gap-3">
            <p className="flex-1">This show is cancelled and hidden from fans.</p>
            <SubmitButton name="status" value="draft" variant="ghost">Restore as draft</SubmitButton>
          </form>
        )}
      </section>

      <form action={updateShow.bind(null, artistId, showId)} className="panel grid gap-4">
        <h2>Show details</h2>
        <ShowFields show={show} currencyLocked={!!salesCount} />
        <div><SubmitButton variant="dark">Save show</SubmitButton></div>
      </form>

      <Link href={`/a/${artistId}/shows/${showId}/orders`} className="card flex items-center justify-between gap-3 p-5 !no-underline text-ink hover:border-violet">
        <span><span className="block font-extrabold">Orders and refunds</span><span className="help">See who bought, refund an order, or cancel the show and refund everyone.</span></span>
        <span className="btn btn-ghost btn-sm">Open orders</span>
      </Link>

      <section className="panel grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2>VIP packages at this show</h2>
          <Link href={`/a/${artistId}/packages?tour=${show.tour_id}`} className="btn btn-ghost btn-sm">Add a package</Link>
        </div>
        {(pkgs ?? []).length === 0 ? <p className="muted">None yet.</p> : (
          <ul className="grid gap-2">
            {pkgs!.map((sp) => (
              <li key={sp.id}>
                <Link href={`/a/${artistId}/packages/${sp.products.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-paper px-4 py-3 !no-underline text-ink">
                  <span className="font-bold">{sp.products.name}{!sp.active && <span className="badge b-neutral ml-2">Paused</span>}</span>
                  <span className="text-[14px] text-mute">{dollars(sp.price_cents, (show as unknown as { currency?: string }).currency)}, {sp.capacity} available</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {ci && (
        <CheckinDetailsPanel show={ci} pkgs={(ciPkgs ?? []).map((p) => ({ id: p.id, name: p.products.name, checkin_time: p.checkin_time, checkin_notes: p.checkin_notes }))}
          save={saveCheckinDetails.bind(null, artistId, showId)} sendNew={sendCheckinNow.bind(null, artistId, showId, "details")}
          sendUpdate={sendCheckinNow.bind(null, artistId, showId, "update")}
          recipients={recipients.length} sentCount={recipients.filter((r) => r.sent).length} />
      )}

      {show.status === "draft" && (
        <form action={deleteShow.bind(null, artistId, showId, show.tour_id)}>
          <SubmitButton variant="danger" confirm="Delete this draft show?">Delete show</SubmitButton>
        </form>
      )}
    </div>
  );
}
