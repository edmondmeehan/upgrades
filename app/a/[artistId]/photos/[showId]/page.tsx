import { notFound } from "next/navigation";
import { requireArtist } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { PhotoUploader } from "@/components/PhotoUploader";
import { formatDate } from "@/lib/util";
import { siteUrl } from "@/lib/email";
import { registerPhotos, deletePhoto, movePhoto, sendPhotos } from "../actions";

export const metadata = { title: "Show photos" };
export const dynamic = "force-dynamic";
type P = { params: Promise<{ artistId: string; showId: string }>; searchParams: Promise<{ ok?: string; err?: string }> };
type Photo = { id: string; path: string; thumb_path: string };
type Buyer = { order_id: string; email: string; name: string | null; sent_at: string | null };

export default async function ShowPhotos({ params, searchParams }: P) {
  const { artistId, showId } = await params;
  const { ok, err } = await searchParams;
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const { data: show } = await supabase.from("shows").select("id, show_date, city, region, venue_name").eq("id", showId).eq("artist_id", artistId).maybeSingle();
  if (!show) notFound();
  const [{ data: photos }, { data: buyersRaw }, { data: gallery }, { data: opens }] = await Promise.all([
    supabase.from("show_photos").select("id, path, thumb_path").eq("show_id", showId).order("position").order("created_at").returns<Photo[]>(),
    supabase.rpc("photo_buyers", { p_show: showId }),
    supabase.from("photo_galleries").select("token, first_sent_at").eq("show_id", showId).maybeSingle(),
    supabase.from("photo_deliveries").select("opened_at").eq("show_id", showId).not("opened_at", "is", null),
  ]);
  const buyers = (buyersRaw ?? []) as Buyer[];
  const pending = buyers.filter((b) => !b.sent_at).length, sent = buyers.length - pending;
  const { data: signed } = (photos ?? []).length
    ? await supabase.storage.from("photos").createSignedUrls(photos!.map((p) => p.thumb_path), 3600)
    : { data: [] };
  const url = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const where = `${show.city ?? "Show"}${show.region ? `, ${show.region}` : ""}`;

  return (
    <div className="grid max-w-5xl gap-6">
      <PageHead crumbs={[{ href: `/a/${artistId}/photos`, label: "Photos" }]} title={where}>
        {formatDate(show.show_date)}{show.venue_name ? `, ${show.venue_name}` : ""}
      </PageHead>
      <Flash ok={ok} err={err} />

      <section className="panel grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2>Send to fans</h2>
            <p className="muted mt-1">
              {buyers.length === 0 ? "Nobody has bought a package with a photo for this show yet."
                : `${buyers.length} fan${buyers.length === 1 ? "" : "s"} bought a package with a photo. ${sent ? `${sent} sent${opens?.length ? `, ${opens.length} opened` : ""}.` : "None sent yet."}`}
            </p>
          </div>
          {pending > 0 && (photos ?? []).length > 0 && (
            <form action={sendPhotos.bind(null, artistId, showId)}>
              <SubmitButton size="lg" pendingText="Sending…" confirm={`Email the gallery link to ${pending} fan${pending === 1 ? "" : "s"}?`}>
                {sent ? `Send to ${pending} new buyer${pending === 1 ? "" : "s"}` : `Send photos to ${pending} fan${pending === 1 ? "" : "s"}`}
              </SubmitButton>
            </form>
          )}
        </div>
        {gallery?.first_sent_at && <p className="help">Gallery link: <a href={`${siteUrl()}/photos/${gallery.token}`} target="_blank" rel="noopener noreferrer">{siteUrl()}/photos/{gallery.token}</a>. Photos you add later show up there straight away.</p>}
      </section>

      <PhotoUploader artistId={artistId} showId={showId} register={registerPhotos.bind(null, artistId, showId)} />

      {(photos ?? []).length > 0 && (
        <section className="grid gap-3">
          <h2>{photos!.length} photo{photos!.length === 1 ? "" : "s"}</h2>
          <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
            {photos!.map((p, i) => (
              <li key={p.id} className="group relative overflow-hidden rounded-2xl bg-paper">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url.get(p.thumb_path) ?? ""} alt={`Photo ${i + 1}`} className="aspect-square w-full object-cover" loading="lazy" />
                <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent p-2">
                  <span className="flex gap-1">
                    <form action={movePhoto.bind(null, artistId, showId, p.id, -1)}><button disabled={i === 0} aria-label="Move earlier" className="grid size-8 place-items-center rounded-full bg-white/90 text-[15px] font-bold disabled:opacity-40">‹</button></form>
                    <form action={movePhoto.bind(null, artistId, showId, p.id, 1)}><button disabled={i === photos!.length - 1} aria-label="Move later" className="grid size-8 place-items-center rounded-full bg-white/90 text-[15px] font-bold disabled:opacity-40">›</button></form>
                  </span>
                  <form action={deletePhoto.bind(null, artistId, showId, p.id)}><button aria-label="Delete photo" className="rounded-full bg-white/90 px-3 py-1.5 text-[12px] font-bold text-rope">Delete</button></form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
