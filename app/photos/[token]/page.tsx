import { notFound } from "next/navigation";
import { StoreHero, ArtistDisclaimer } from "@/components/StorefrontParts";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadStore, theme } from "@/lib/storefront";
import { formatDate } from "@/lib/util";

export const metadata = { title: "Your photos", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
type P = { params: Promise<{ token: string }>; searchParams: Promise<{ o?: string }> };

export default async function Gallery({ params, searchParams }: P) {
  const { token } = await params;
  const { o } = await searchParams;
  const db = createAdminClient();
  if (!db || !/^[0-9a-f]{36}$/.test(token)) notFound();
  const { data: g } = await db.from("photo_galleries").select("show_id, artist_id, first_sent_at").eq("token", token).maybeSingle();
  if (!g?.first_sent_at) notFound();
  const [{ data: show }, { data: artist }, { data: photos }] = await Promise.all([
    db.from("shows").select("id, show_date, city, region, venue_name").eq("id", g.show_id).single(),
    db.from("artists").select("handle, name").eq("id", g.artist_id).single(),
    db.from("show_photos").select("path, thumb_path, width, height").eq("show_id", g.show_id).order("position").order("created_at"),
  ]);
  if (!show || !artist) notFound();

  // Count the first open per order when the link came from that fan's email.
  if (o) {
    const { data: ord } = await db.from("orders").select("id").eq("confirmation_code", o.toUpperCase()).eq("show_id", g.show_id).maybeSingle();
    if (ord) await db.from("photo_deliveries").update({ opened_at: new Date().toISOString() }).eq("show_id", g.show_id).eq("order_id", ord.id).is("opened_at", null);
  }

  const list = photos ?? [];
  const [{ data: thumbs }, { data: fulls }, { data: downloads }] = list.length ? await Promise.all([
    db.storage.from("photos").createSignedUrls(list.map((p) => p.thumb_path), 3 * 3600),
    db.storage.from("photos").createSignedUrls(list.map((p) => p.path), 3 * 3600),
    db.storage.from("photos").createSignedUrls(list.map((p) => p.path), 3 * 3600, { download: true }),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const store = await loadStore(artist.handle);
  const where = `${show.city ?? ""}${show.region ? `, ${show.region}` : ""}`;

  return (
    <div className="min-h-screen bg-paper">
      {store && <StoreHero s={store} t={theme(store)} compact />}
      <main className="home-wrap grid gap-5 py-8">
        <div>
          <p className="eyebrow">{formatDate(show.show_date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
          <h1 className="mt-1 text-[30px]">Photos from {where}</h1>
          <p className="muted mt-1">{list.length} photo{list.length === 1 ? "" : "s"} from the {artist.name} meet &amp; greet{show.venue_name ? ` at ${show.venue_name}` : ""}. Tap a photo to open it full size, or save it to your phone.</p>
        </div>
        {list.length === 0 ? <p className="card px-4 py-12 text-center muted">Photos are on their way. Check back soon.</p> : (
          <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))] sm:[grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {list.map((p, i) => (
              <li key={p.path} className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,.06)]">
                <a href={fulls?.[i]?.signedUrl ?? undefined} target="_blank" rel="noopener noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbs?.[i]?.signedUrl ?? undefined} alt={`Photo ${i + 1} of ${list.length}`} loading="lazy" className="aspect-square w-full object-cover" />
                </a>
                <a href={downloads?.[i]?.signedUrl ?? undefined} className="flex h-10 items-center justify-center text-[13px] font-bold !no-underline text-violet hover:bg-paper">Save photo</a>
              </li>
            ))}
          </ul>
        )}
        <p className="help text-center">This link is just for fans who bought a photo package, so please don&apos;t post it publicly. Share your favorite photos instead.</p>
      </main>
      <ArtistDisclaimer name={artist.name} handle={artist.handle} order={o} />
    </div>
  );
}
