import Link from "next/link";
import { requireArtist } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { Flash } from "@/components/Flash";
import { StorefrontDesigner } from "@/components/StorefrontDesigner";
import { saveStorefront, saveMedia } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { ShareButtons } from "@/components/ShareButtons";
import { siteUrl } from "@/lib/email";

export const metadata = { title: "Storefront" };
type P = { params: Promise<{ artistId: string }>; searchParams: Promise<{ ok?: string; err?: string }> };
type Design = { brand_color: string | null; accent_color: string | null; header_image_url: string | null; avatar_url: string | null; tagline: string | null; bio: string | null; genres: string[] };

export default async function Storefront({ params, searchParams }: P) {
  const { artistId } = await params;
  const { ok, err } = await searchParams;
  const { supabase, artist } = await requireArtist(artistId, ["owner"]);
  const { data: d } = await supabase.from("artists").select("brand_color, accent_color, header_image_url, avatar_url, tagline, bio, genres").eq("id", artistId).single<Design>();
  const { data: m } = await supabase.from("artists").select("spotify_url, youtube_url, website, links").eq("id", artistId)
    .single<{ spotify_url: string | null; youtube_url: string | null; website: string | null; links: { label: string; url: string }[] }>();
  const links = [...(m?.links ?? []), ...Array(6).fill({ label: "", url: "" })].slice(0, 6);
  return (
    <>
      <PageHead title="Storefront" aside={artist.status === "approved" ? <Link href={`/${artist.handle}`} target="_blank" className="btn btn-ghost">View live page</Link> : undefined}>
        How your page at upgrades.ontour.vip/{artist.handle} looks to fans.{artist.status !== "approved" && " It goes live once P&T approves your account."}
      </PageHead>
      <Flash ok={ok} err={err} />
      {artist.status === "approved" && (
        <section className="panel grid gap-3">
          <h2>Share your storefront</h2>
          <ShareButtons url={`${siteUrl()}/${artist.handle}`} title={`${artist.name} VIP upgrades`} text={`VIP upgrades for ${artist.name} shows are here`} />
          <p className="help">Links show a preview card with your colors, header image and upcoming shows. Each show and package on your storefront has its own share buttons too.</p>
        </section>
      )}
      <StorefrontDesigner action={saveStorefront.bind(null, artistId)} artistId={artistId} name={artist.name} handle={artist.handle}
        initial={d ?? { brand_color: null, accent_color: null, header_image_url: null, avatar_url: null, tagline: null, bio: artist.bio }} />

      <form id="media" action={saveMedia.bind(null, artistId)} className="panel mt-6 grid scroll-mt-6 gap-5">
        <div><h2>Music, video and links</h2><p className="muted mt-1">These show under your tour dates. Leave anything blank to hide it.</p></div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="field"><span>Spotify link</span>
            <input name="spotify_url" defaultValue={m?.spotify_url ?? ""} className="input" placeholder="https://open.spotify.com/artist/..." />
            <small>In Spotify, tap Share, then Copy link, on your artist page, an album, a track or a playlist.</small></label>
          <label className="field"><span>YouTube video link</span>
            <input name="youtube_url" defaultValue={m?.youtube_url ?? ""} className="input" placeholder="https://youtu.be/..." />
            <small>One video, such as a new single or a live clip. Plays right on your page.</small></label>
        </div>
        <label className="field"><span>Official website</span>
          <input name="website" defaultValue={m?.website ?? ""} className="input" placeholder="yourband.com" />
          <small>Shown as the first, highlighted link.</small></label>
        <fieldset className="grid gap-2">
          <legend className="mb-1 font-bold">More links (up to 6)</legend>
          <p className="help -mt-1 mb-1">Instagram, TikTok, merch, fan club, anything. Leave the name blank and we&apos;ll fill it in (for example &quot;Instagram&quot;).</p>
          {links.map((l, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
              <input name={`link_label_${i}`} defaultValue={l.label} className="input input-sm" placeholder="Name" aria-label={`Link ${i + 1} name`} maxLength={40} />
              <input name={`link_url_${i}`} defaultValue={l.url} className="input input-sm" placeholder="https://..." aria-label={`Link ${i + 1} address`} />
            </div>
          ))}
        </fieldset>
        <div><SubmitButton pendingText="Saving…">Save music, video and links</SubmitButton></div>
      </form>
    </>
  );
}
