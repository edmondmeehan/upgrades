import Link from "next/link";
import { requireArtist } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { PageHead } from "@/components/Shell";
import { SubmitButton } from "@/components/SubmitButton";
import { createTour } from "../actions";
import { formatDate } from "@/lib/util";

type P = { params: Promise<{ artistId: string }>; searchParams: Promise<{ ok?: string; err?: string }> };
type TourRow = { id: string; name: string; status: string; shows: { show_date: string; status: string }[] };

export default async function Tours({ params, searchParams }: P) {
  const { artistId } = await params;
  const { ok, err } = await searchParams;
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const { data } = await supabase.from("tours").select("id, name, status, shows(show_date, status)")
    .eq("artist_id", artistId).order("created_at", { ascending: false }).returns<TourRow[]>();
  const tours = data ?? [];
  const fmt = (d: string) => formatDate(d, { month: "short", day: "numeric", year: "numeric" });

  return (
    <>
      <PageHead title="Tours & shows" />
      <Flash ok={ok} err={err} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          {tours.length === 0 ? (
            <div className="card grid justify-items-center gap-2 px-4 py-12 text-center">
              <h2 className="text-[16px]">No tours yet</h2>
              <p className="help">Create one to start adding show dates.</p>
            </div>
          ) : (
            <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
              {tours.map((t) => {
                const dates = t.shows.map((s) => s.show_date).sort();
                const live = t.shows.filter((s) => s.status === "published").length;
                return (
                  <li key={t.id}>
                    <Link href={`/a/${artistId}/tours/${t.id}`} className="card grid h-full gap-3 p-5 !no-underline text-ink transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(19,0,86,.12)]">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[17px] font-extrabold leading-tight">{t.name}</span>
                        {t.status === "archived" && <span className="badge b-archived">Archived</span>}
                      </div>
                      <span className="muted text-[13px] font-medium">
                        {t.shows.length === 0 ? "No shows yet" : `${fmt(dates[0])} to ${fmt(dates[dates.length - 1])}`}
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="stat"><b>{t.shows.length}</b><span>Shows</span></div>
                        <div className="stat"><b>{live}</b><span>Published</span></div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <form action={createTour.bind(null, artistId)} className="panel grid gap-4">
          <h2>New tour</h2>
          <label className="field"><span>Tour name</span><input className="input" name="name" required placeholder="Fall 2026 headline run" /></label>
          <label className="field"><span>Notes for your team</span><textarea className="input" name="description" /><small>Only your team sees this.</small></label>
          <div><SubmitButton>Create tour</SubmitButton></div>
        </form>
      </div>
    </>
  );
}
