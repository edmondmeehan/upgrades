/**
 * Turns the links artists paste into players. Accepts the forms people actually copy:
 * Spotify share links (with ?si=..., intl-xx/ prefixes, spotify: URIs) and YouTube watch,
 * youtu.be, shorts, live and embed links.
 */

export type SpotifyEmbed = { url: string; canonical: string; height: number };
export type YouTubeEmbed = { url: string; canonical: string; id: string };

const SPOTIFY_TYPES = ["artist", "album", "track", "playlist", "episode", "show"] as const;

export function spotifyEmbed(input: string | null | undefined): SpotifyEmbed | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  let type: string | undefined, id: string | undefined;
  const uri = s.match(/^spotify:(artist|album|track|playlist|episode|show):([A-Za-z0-9]{10,32})$/);
  if (uri) [, type, id] = uri;
  else {
    try {
      const u = new URL(s);
      if (u.hostname !== "open.spotify.com") return null;
      const parts = u.pathname.split("/").filter(Boolean).filter((p) => !/^intl-[a-z]{2}/i.test(p) && p !== "embed");
      [type, id] = parts;
    } catch { return null; }
  }
  if (!type || !id || !(SPOTIFY_TYPES as readonly string[]).includes(type) || !/^[A-Za-z0-9]{10,32}$/.test(id)) return null;
  return {
    url: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator`,
    canonical: `https://open.spotify.com/${type}/${id}`,
    height: type === "track" || type === "episode" ? 152 : 352,
  };
}

export function youtubeEmbed(input: string | null | undefined): YouTubeEmbed | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  let id: string | null = null;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^(www\.|m\.)/, "");
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") id = u.searchParams.get("v");
      else { const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/); if (m) id = m[1]; }
    }
  } catch { return null; }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  return { id, url: `https://www.youtube-nocookie.com/embed/${id}?rel=0`, canonical: `https://www.youtube.com/watch?v=${id}` };
}

export type ArtistLink = { label: string; url: string };

/** A link's address, made safe: https only (adds it if missing), no spaces. */
export function cleanUrl(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".") || /\s/.test(s)) return null;
    u.protocol = "https:";
    return u.toString();
  } catch { return null; }
}

/** A friendly name for a link if the artist doesn't give one. */
export function guessLabel(url: string): string {
  const h = new URL(url).hostname.replace(/^www\./, "");
  const known: Record<string, string> = {
    "instagram.com": "Instagram", "tiktok.com": "TikTok", "x.com": "X", "twitter.com": "X", "facebook.com": "Facebook",
    "youtube.com": "YouTube", "open.spotify.com": "Spotify", "music.apple.com": "Apple Music", "bandcamp.com": "Bandcamp",
    "soundcloud.com": "SoundCloud", "threads.net": "Threads", "bandsintown.com": "Bandsintown", "linktr.ee": "Linktree",
  };
  return known[h] ?? (h.endsWith(".bandcamp.com") ? "Bandcamp" : h);
}
