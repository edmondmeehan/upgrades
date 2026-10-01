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
import { dollars, priceRange } from "@/lib/packages";

type P = { params: Promise<{ artistId: string; tourId: string }>; searchParams: Promise<{ ok?: string; err?: string }> };

export default async function TourPage({ params, searchParams }: P) {
  const { artistId, tourId } = await params;
  const { ok, err } = await searchParams;
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const { data: tour } = await supabase.from("tours").select("*").eq("id", tourId).eq("artist_id", artistId).maybeSingle<Tour>();
  if (!tour) notFound();
  const { data } = await supabase.from("shows").select("*").eq("tour_id", tourId).order("show_date").returns<Show[]>();
  const shows = data ?? [];
  const { data: tourPkgs } = shows.length
    ? await supabase.from("show_products").select("show_id, price_cents, active, shows(currency), products!inner(id, name, archived_at, is_sample)")
        .in("show_id", shows.map((s) => s.id)).eq("active", true)
        .returns<{ show_id: string; price_cents: number; active: boolean; products: { id: string; name: string; archived_at: string | null; is_sample: boolean } }[]>()
    : { data: [] };
  const pkgs = new Map<string, { id: string; name: string; shows: number; min: number; max: number; rows: { price_cents: number; currency: string }[] }>();
  (tourPkgs ?? []).filter((r) => !r.products.archived_at && !r.products.is_sample).forEach((r) => {
    const cur = pkgs.get(r.products.id) ?? { id: r.products.id, name: r.products.name, shows: 0, min: Infinity, max: 0, rows: [] };
    cur.shows++; cur.min = Math.min(cur.min, r.price_cents); cur.max = Math.max(cur.max, r.price_cents); cur.rows.push({ price_cents: r.price_cents, currency: (r as unknown as { shows?: { currency: string } }).shows?.currency ?? "usd" });
    pkgs.set(r.products.id, cur);
  });
  const pkgCount = new Map<string, number>();
  (tourPkgs ?? []).filter((r) => !r.products.archived_at && !r.products.is_sample).forEach((r) => pkgCount.set(r.show_id, (pkgCount.get(r.show_id) ?? 0) + 1));

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
                <thead><tr><th className="!pt-4">Date</th><th className="!pt-4">City</th><th className="!pt-4">Venue</th><th className="!pt-4">Times</th><th className="!pt-4">Packages</th><th className="!pt-4">Status</th></tr></thead>
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
                        <td className="text-[13px]">{pkgCount.get(s.id) ? <span className="font-semibold">{pkgCount.get(s.id)}</span> : <span className="text-mute">None</span>}</td>
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

      {shows.length > 0 && (
        <section className="panel grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2>VIP packages on this tour</h2>
              <p className="muted mt-1">{pkgs.size ? "What fans can buy at these shows." : "Next step: add the upgrades fans can buy at these shows."}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {pkgs.size > 0 && <Link href={`/a/${artistId}/tours/${tourId}/inventory`} className="btn">Manage inventory</Link>}
              <Link href={`/a/${artistId}/packages?tour=${tourId}`} className={`btn ${pkgs.size ? "btn-ghost" : ""}`}>{pkgs.size ? "Add a package" : "Add a VIP package"}</Link>
            </div>
          </div>
          {pkgs.size > 0 && (
            <ul className="grid gap-2">
              {[...pkgs.values()].map((p) => (
                <li key={p.id}>
                  <Link href={`/a/${artistId}/packages/${p.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-paper px-4 py-3 !no-underline text-ink hover:bg-[#efedf5]">
                    <span className="font-bold">{p.name}</span>
                    <span className="text-[14px] text-mute">{priceRange(p.rows)}, {p.shows} of {shows.length} shows</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
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
