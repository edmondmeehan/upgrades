import Link from "next/link";
import { requireArtist } from "@/lib/auth";
import { Flash } from "@/components/Flash";
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

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div>
        <Flash ok={ok} err={err} />
        <h2 className="mb-4">Tours</h2>
        {tours.length === 0 ? (
          <p className="muted">No tours yet. Create one to start adding show dates.</p>
        ) : (
          <ul className="grid gap-3">
            {tours.map((t) => {
              const dates = t.shows.map((s) => s.show_date).sort();
              const live = t.shows.filter((s) => s.status === "published").length;
              return (
                <li key={t.id}>
                  <Link href={`/a/${artistId}/tours/${t.id}`} className="panel block !no-underline text-stage hover:border-stage">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-display text-xl font-semibold">{t.name}</span>
                      {t.status === "archived" && <span className="pill text-mute">Archived</span>}
                    </div>
                    <p className="muted mt-1">
                      {t.shows.length === 0 ? "No shows yet"
                        : `${t.shows.length} show${t.shows.length === 1 ? "" : "s"}, ${live} published. ${formatDate(dates[0], { month: "short", day: "numeric", year: "numeric" })} to ${formatDate(dates[dates.length - 1], { month: "short", day: "numeric", year: "numeric" })}`}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <form action={createTour.bind(null, artistId)} className="panel grid content-start gap-4">
        <h3>New tour</h3>
        <label className="field"><span>Tour name</span><input className="input" name="name" required placeholder="Fall 2026 headline run" /></label>
        <label className="field"><span>Notes for your team</span><textarea className="input" name="description" /><small>Only your team sees this.</small></label>
        <div><SubmitButton>Create tour</SubmitButton></div>
      </form>
    </div>
  );
}
