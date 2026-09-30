import Link from "next/link";
import { requireArtist } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { formatDate } from "@/lib/util";

export const metadata = { title: "Photos" };
type P = { params: Promise<{ artistId: string }> };
type S = { id: string; show_date: string; city: string | null; region: string | null; venue_name: string | null; tour_id: string; tours: { name: string } };

export default async function Photos({ params }: P) {
  const { artistId } = await params;
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const { data: shows } = await supabase.from("shows").select("id, show_date, city, region, venue_name, tour_id, tours(name)")
    .eq("artist_id", artistId).neq("status", "cancelled").order("show_date", { ascending: false }).limit(200).returns<S[]>();
  const ids = (shows ?? []).map((s) => s.id);
  const [{ data: photos }, { data: deliveries }, buyerCounts] = await Promise.all([
    ids.length ? supabase.from("show_photos").select("show_id").in("show_id", ids) : Promise.resolve({ data: [] as { show_id: string }[] }),
    ids.length ? supabase.from("photo_deliveries").select("show_id").in("show_id", ids) : Promise.resolve({ data: [] as { show_id: string }[] }),
    Promise.all(ids.map(async (id) => [id, ((await supabase.rpc("photo_buyers", { p_show: id })).data ?? []).length] as const)),
  ]);
  const count = (arr: { show_id: string }[] | null, id: string) => (arr ?? []).filter((r) => r.show_id === id).length;
  const buyers = new Map(buyerCounts);
  const tours = new Map<string, { name: string; shows: S[] }>();
  (shows ?? []).forEach((s) => { const t = tours.get(s.tour_id) ?? { name: s.tours?.name ?? "Tour", shows: [] }; t.shows.push(s); tours.set(s.tour_id, t); });

  return (
    <>
      <PageHead title="Photos">Upload each show&apos;s meet &amp; greet photos, then send them to everyone who bought a package that includes a photo.</PageHead>
      {tours.size === 0 ? <p className="card px-4 py-12 text-center muted">No shows yet.</p> : [...tours.entries()].map(([id, t]) => (
        <section key={id} className="grid gap-3">
          <h2>{t.name}</h2>
          <ul className="card divide-y divide-line overflow-hidden">
            {t.shows.map((s) => {
              const n = count(photos, s.id), b = buyers.get(s.id) ?? 0, sent = count(deliveries, s.id);
              const status = n === 0 ? (b ? ["Needs photos", "b-pending"] : ["No photos", "b-neutral"])
                : sent === 0 ? ["Not sent yet", "b-draft"] : sent < b ? [`Sent to ${sent} of ${b}`, "b-pending"] : ["Sent", "b-published"];
              return (
                <li key={s.id}>
                  <Link href={`/a/${artistId}/photos/${s.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 !no-underline text-ink hover:bg-paper">
                    <span>
                      <span className="eyebrow">{formatDate(s.show_date, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
                      <span className="block font-extrabold">{s.city ? `${s.city}${s.region ? `, ${s.region}` : ""}` : "City TBD"}</span>
                      <span className="text-[13px] text-mute">{n} photo{n === 1 ? "" : "s"}, {b} photo buyer{b === 1 ? "" : "s"}</span>
                    </span>
                    <span className={`badge ${status[1]}`}>{status[0]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
