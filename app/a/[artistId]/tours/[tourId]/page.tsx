import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArtist } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { ShowFields } from "@/components/ShowFields";
import { ShowStatus } from "@/components/ShowStatus";
import { createShow, updateTour, deleteTour } from "../../actions";
import { formatDate } from "@/lib/util";
import type { Show, Tour } from "@/lib/types";

type P = { params: Promise<{ artistId: string; tourId: string }>; searchParams: Promise<{ ok?: string; err?: string }> };

export default async function TourPage({ params, searchParams }: P) {
  const { artistId, tourId } = await params;
  const { ok, err } = await searchParams;
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const { data: tour } = await supabase.from("tours").select("*").eq("id", tourId).eq("artist_id", artistId).maybeSingle<Tour>();
  if (!tour) notFound();
  const { data: shows } = await supabase.from("shows").select("*").eq("tour_id", tourId).order("show_date").returns<Show[]>();

  return (
    <div>
      <p className="mb-2"><Link href={`/a/${artistId}/tours`}>All tours</Link></p>
      <div className="mb-6 flex flex-wrap items-baseline gap-3">
        <h2 className="text-3xl">{tour.name}</h2>
        {tour.status === "archived" && <span className="pill text-mute">Archived</span>}
      </div>
      <Flash ok={ok} err={err} />
      <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
        <section>
          <h3 className="mb-3">Shows</h3>
          {(shows ?? []).length === 0 ? (
            <p className="muted">No shows on this tour yet. Add the first date with the form.</p>
          ) : (
            <ul className="divide-y-[1.5px] divide-line overflow-hidden rounded-xl border-[1.5px] border-line bg-card">
              {shows!.map((s) => (
                <li key={s.id}>
                  <Link href={`/a/${artistId}/shows/${s.id}`} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-4 px-4 py-3 !no-underline text-stage hover:bg-paper">
                    <span className="font-display text-lg font-semibold leading-tight">{formatDate(s.show_date, { month: "short", day: "numeric" })}<br /><span className="font-sans text-sm font-normal text-mute">{formatDate(s.show_date, { weekday: "short", year: "numeric" })}</span></span>
                    <span><span className="font-semibold">{s.city}{s.region ? `, ${s.region}` : ""}</span><br /><span className="muted">{s.venue_name}</span></span>
                    <ShowStatus status={s.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="grid content-start gap-6">
          <form action={createShow.bind(null, artistId, tourId)} className="panel grid gap-4">
            <h3>Add a show</h3>
            <ShowFields />
            <div><SubmitButton>Add show</SubmitButton></div>
          </form>
          <details className="panel">
            <summary className="cursor-pointer font-semibold">Tour settings</summary>
            <form action={updateTour.bind(null, artistId, tourId)} className="mt-4 grid gap-4">
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
      </div>
    </div>
  );
}
