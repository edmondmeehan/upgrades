import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArtist } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { ShowFields } from "@/components/ShowFields";
import { ShowStatus } from "@/components/ShowStatus";
import { updateShow, setShowStatus, deleteShow } from "../../actions";
import { formatDate } from "@/lib/util";
import type { Show } from "@/lib/types";

type P = { params: Promise<{ artistId: string; showId: string }>; searchParams: Promise<{ ok?: string; err?: string }> };

export default async function ShowPage({ params, searchParams }: P) {
  const { artistId, showId } = await params;
  const { ok, err } = await searchParams;
  const { supabase, artist } = await requireArtist(artistId, ["owner", "rep"]);
  const { data: show } = await supabase.from("shows").select("*, tours(name)").eq("id", showId).eq("artist_id", artistId)
    .maybeSingle<Show & { tours: { name: string } }>();
  if (!show) notFound();
  const statusAction = setShowStatus.bind(null, artistId, showId);

  return (
    <div className="grid max-w-3xl gap-6">
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
        <ShowFields show={show} />
        <div><SubmitButton variant="dark">Save show</SubmitButton></div>
      </form>

      <p className="help">Upgrades, check-in details, scanning, and photos for this show arrive in the next phases.</p>

      {show.status === "draft" && (
        <form action={deleteShow.bind(null, artistId, showId, show.tour_id)}>
          <SubmitButton variant="danger" confirm="Delete this draft show?">Delete show</SubmitButton>
        </form>
      )}
    </div>
  );
}
