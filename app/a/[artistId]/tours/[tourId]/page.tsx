import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArtist } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { ShowStatus } from "@/components/ShowStatus";
import { ShowBuilder } from "@/components/ShowBuilder";
import { bulkCreateShows, publishReadyShows, updateTour, deleteTour } from "../../actions";
import { formatDate, formatTime } from "@/lib/util";
import type { Show, Tour } from "@/lib/types";

type P = { params: Promise<{ artistId: string; tourId: string }>; searchParams: Promise<{ ok?: string; err?: string }> };

export default async function TourPage({ params, searchParams }: P) {
  const { artistId, tourId } = await params;
  const { ok, err } = await searchParams;
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const { data: tour } = await supabase.from("tours").select("*").eq("id", tourId).eq("artist_id", artistId).maybeSingle<Tour>();
  if (!tour) notFound();
  const { data } = await supabase.from("shows").select("*").eq("tour_id", tourId).order("show_date").returns<Show[]>();
  const shows = data ?? [];

  const published = shows.filter((s) => s.status === "published").length;
  const needsDetails = shows.filter((s) => s.status === "draft" && (!s.city || !s.venue_name)).length;
  const ready = shows.filter((s) => s.status === "draft" && s.city && s.venue_name).length;
  const first = shows[0]?.show_date, last = shows[shows.length - 1]?.show_date;

  return (
    <div className="grid gap-6">
      <PageHead crumbs={[{ href: `/a/${artistId}/tours`, label: "Tours & shows" }]} title={tour.name}
        aside={<>
          {tour.status === "archived" && <span className="badge b-archived">Archived</span>}
          {ready > 0 && (
            <form action={publishReadyShows.bind(null, artistId, tourId)}>
              <SubmitButton variant="dark" pendingText="Publishing…">Publish {ready} ready draft{ready === 1 ? "" : "s"}</SubmitButton>
            </form>
          )}
        </>}>
        {shows.length === 0 ? "No shows yet."
          : `${formatDate(first!, { month: "short", day: "numeric", year: "numeric" })} to ${formatDate(last!, { month: "short", day: "numeric", year: "numeric" })}`}
      </PageHead>
      <Flash ok={ok} err={err} />

      {shows.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="stat"><b>{shows.length}</b><span>Shows</span></div>
            <div className="stat"><b>{published}</b><span>Published</span></div>
            <div className="stat"><b>{ready}</b><span>Ready to publish</span></div>
            <div className="stat"><b>{needsDetails}</b><span>Need city or venue</span></div>
          </div>
          <section className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="list min-w-[40rem]">
                <thead><tr><th className="!pt-4">Date</th><th className="!pt-4">City</th><th className="!pt-4">Venue</th><th className="!pt-4">Times</th><th className="!pt-4">Status</th></tr></thead>
                <tbody>
                  {shows.map((s) => {
                    const href = `/a/${artistId}/shows/${s.id}`;
                    const times = [s.doors_time && `Doors ${formatTime(s.doors_time)}`, s.show_time && `Show ${formatTime(s.show_time)}`].filter(Boolean).join(", ");
                    return (
                      <tr key={s.id} className="hover:bg-paper">
                        <td className="whitespace-nowrap"><Link href={href} className="text-ink">{formatDate(s.show_date, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</Link></td>
                        <td className={s.city ? "font-semibold" : "text-mute"}>{s.city ? `${s.city}${s.region ? `, ${s.region}` : ""}` : "City TBD"}</td>
                        <td className={s.venue_name ? "" : "text-mute"}>{s.venue_name ?? "Venue TBD"}</td>
                        <td className="muted whitespace-nowrap text-[13px]">{times || "Not set"}</td>
                        <td><ShowStatus status={s.status} incomplete={!s.city || !s.venue_name} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <ShowBuilder key={shows.length} action={bulkCreateShows.bind(null, artistId, tourId)} existingDates={shows.map((s) => s.show_date)} />

      <details className="panel">
        <summary className="cursor-pointer text-[16px] font-extrabold">Tour settings</summary>
        <form action={updateTour.bind(null, artistId, tourId)} className="mt-4 grid max-w-xl gap-4">
          <label className="field"><span>Tour name</span><input className="input" name="name" required defaultValue={tour.name} /></label>
          <label className="field"><span>Notes for your team</span><textarea className="input" name="description" defaultValue={tour.description ?? ""} /></label>
          <label className="field"><span>Status</span>
            <select className="input" name="status" defaultValue={tour.status}><option value="active">Active</option><option value="archived">Archived</option></select>
          </label>
          <div><SubmitButton variant="dark">Save tour</SubmitButton></div>
        </form>
        <form action={deleteTour.bind(null, artistId, tourId)} className="mt-4 border-t-[1.5px] border-line pt-4">
          <SubmitButton variant="danger" confirm="Delete this tour and its draft shows?">Delete tour</SubmitButton>
          <p className="muted mt-2 text-sm">Only tours with nothing but draft shows can be deleted.</p>
        </form>
      </details>
    </div>
  );
}
