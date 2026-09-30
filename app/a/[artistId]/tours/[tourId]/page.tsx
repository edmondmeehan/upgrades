import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArtist } from "@/lib/auth";
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
    <div className="grid gap-8">
      <div>
        <p className="mb-2"><Link href={`/a/${artistId}/tours`}>All tours</Link></p>
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-3xl">{tour.name}</h2>
          {tour.status === "archived" && <span className="pill text-mute">Archived</span>}
        </div>
        <p className="muted mt-1">
          {shows.length === 0 ? "No shows yet."
            : `${shows.length} show${shows.length === 1 ? "" : "s"}, ${published} published. ${formatDate(first!, { month: "short", day: "numeric", year: "numeric" })} to ${formatDate(last!, { month: "short", day: "numeric", year: "numeric" })}.`}
        </p>
      </div>
      <Flash ok={ok} err={err} />

      {shows.length > 0 && (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3>Shows</h3>
            {ready > 0 && (
              <form action={publishReadyShows.bind(null, artistId, tourId)}>
                <SubmitButton variant="dark" pendingText="Publishing…">Publish {ready} ready draft{ready === 1 ? "" : "s"}</SubmitButton>
              </form>
            )}
          </div>
          {needsDetails > 0 && <p className="muted">{needsDetails} draft{needsDetails === 1 ? " needs" : "s need"} a city and venue before {needsDetails === 1 ? "it" : "they"} can be published.</p>}
          <ul className="divide-y-[1.5px] divide-line overflow-hidden rounded-xl border-[1.5px] border-line bg-card">
            {shows.map((s) => {
              const incomplete = !s.city || !s.venue_name;
              const times = [s.doors_time && `Doors ${formatTime(s.doors_time)}`, s.show_time && `Show ${formatTime(s.show_time)}`].filter(Boolean).join(", ");
              return (
                <li key={s.id}>
                  <Link href={`/a/${artistId}/shows/${s.id}`} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-4 px-4 py-3 !no-underline text-stage hover:bg-paper">
                    <span className="font-display text-lg font-semibold leading-tight">
                      {formatDate(s.show_date, { month: "short", day: "numeric" })}<br />
                      <span className="font-sans text-sm font-normal text-mute">{formatDate(s.show_date, { weekday: "short", year: "numeric" })}</span>
                    </span>
                    <span>
                      <span className={`font-semibold ${!s.city ? "text-mute" : ""}`}>{s.city ? `${s.city}${s.region ? `, ${s.region}` : ""}` : "City TBD"}</span><br />
                      <span className="muted">{s.venue_name ?? "Venue TBD"}{times ? `. ${times}` : ""}</span>
                    </span>
                    {s.status === "draft" && incomplete ? <span className="pill text-mute">Needs details</span> : <ShowStatus status={s.status} />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <ShowBuilder key={shows.length} action={bulkCreateShows.bind(null, artistId, tourId)} existingDates={shows.map((s) => s.show_date)} />

      <details className="panel">
        <summary className="cursor-pointer font-semibold">Tour settings</summary>
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
