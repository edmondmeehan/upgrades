"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireArtist } from "@/lib/auth";
import { isHex } from "@/lib/color";
import { GENRES } from "@/lib/genres";
import { cleanError, withMsg } from "@/lib/util";

const img = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/storefront/`;
  return s.startsWith(base) ? s : null; // only images uploaded to our storefront bucket
};

export async function saveStorefront(artistId: string, fd: FormData) {
  const { supabase, artist } = await requireArtist(artistId, ["owner"]);
  const brand = String(fd.get("brand_color") ?? ""), accent = String(fd.get("accent_color") ?? "");
  const { error } = await supabase.from("artists").update({
    brand_color: isHex(brand) ? brand.toLowerCase() : null,
    accent_color: isHex(accent) ? accent.toLowerCase() : null,
    header_image_url: img(fd.get("header_image_url")),
    avatar_url: img(fd.get("avatar_url")),
    tagline: String(fd.get("tagline") ?? "").trim().slice(0, 140) || null,
    bio: String(fd.get("bio") ?? "").trim().slice(0, 600) || null,
    genres: String(fd.get("genres") ?? "").split(",").filter((g) => (GENRES as readonly string[]).includes(g)).slice(0, 3),
  }).eq("id", artistId);
  revalidatePath(`/${artist.handle}`);
  revalidatePath("/");
  redirect(withMsg(`/a/${artistId}/storefront`, error ? "err" : "ok", error ? cleanError(error) : "Storefront saved."));
}

/** Spotify player, YouTube video, official website and up to six more links. */
export async function saveMedia(artistId: string, fd: FormData) {
  const { supabase, artist } = await requireArtist(artistId, ["owner"]);
  const { spotifyEmbed, youtubeEmbed, cleanUrl, guessLabel } = await import("@/lib/media");
  const back = `/a/${artistId}/storefront#media`;
  const spIn = String(fd.get("spotify_url") ?? "").trim(), ytIn = String(fd.get("youtube_url") ?? "").trim(), webIn = String(fd.get("website") ?? "").trim();
  const sp = spIn ? spotifyEmbed(spIn) : null, yt = ytIn ? youtubeEmbed(ytIn) : null, web = webIn ? cleanUrl(webIn) : null;
  if (spIn && !sp) redirect(withMsg(back, "err", "That Spotify link didn't work. In Spotify, tap Share, then Copy link, on your artist page, an album, a track or a playlist."));
  if (ytIn && !yt) redirect(withMsg(back, "err", "That YouTube link didn't work. Use the link to one video (Share, then Copy link), not a channel."));
  if (webIn && !web) redirect(withMsg(back, "err", "Your website address doesn't look right."));
  const links: { label: string; url: string }[] = [];
  for (let i = 0; i < 6; i++) {
    const raw = String(fd.get(`link_url_${i}`) ?? "").trim();
    if (!raw) continue;
    const url = cleanUrl(raw);
    if (!url) redirect(withMsg(back, "err", `Link ${i + 1} doesn't look like a web address.`));
    links.push({ label: String(fd.get(`link_label_${i}`) ?? "").trim().slice(0, 40) || guessLabel(url), url });
  }
  const { error } = await supabase.from("artists").update({
    spotify_url: sp?.canonical ?? null, youtube_url: yt?.canonical ?? null, website: web, links,
  }).eq("id", artistId);
  revalidatePath(`/${artist.handle}`);
  redirect(withMsg(back, error ? "err" : "ok", error ? cleanError(error) : "Music, video and links saved."));
}
