import { spotifyEmbed, youtubeEmbed, type ArtistLink } from "@/lib/media";
import type { theme } from "@/lib/storefront";
type Theme = ReturnType<typeof theme>;

export type Media = { spotify_url: string | null; youtube_url: string | null; website: string | null; links: ArtistLink[] };

/** Listen, watch and links, under the tour dates on an artist's page. Renders nothing if the artist added none. */
export function ArtistMedia({ m, name, t }: { m: Media | null; name: string; t: Theme }) {
  if (!m) return null;
  const sp = spotifyEmbed(m.spotify_url), yt = youtubeEmbed(m.youtube_url);
  const links = [...(m.website ? [{ label: "Official website", url: m.website }] : []), ...(m.links ?? [])];
  if (!sp && !yt && !links.length) return null;
  return (
    <section className="mt-10 grid gap-6" aria-label={`More from ${name}`}>
      {(sp || yt) && (
        <div className={`grid gap-6 ${sp && yt ? "md:grid-cols-2" : ""}`}>
          {yt && (
            <div className="grid content-start gap-2">
              <h2 className="text-[22px]">Watch</h2>
              <div className="relative aspect-video overflow-hidden rounded-[20px] bg-ink">
                <iframe src={yt.url} title={`${name} on YouTube`} loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  className="absolute inset-0 h-full w-full border-0" />
              </div>
            </div>
          )}
          {sp && (
            <div className="grid content-start gap-2">
              <h2 className="text-[22px]">Listen</h2>
              <iframe src={sp.url} title={`${name} on Spotify`} loading="lazy" height={sp.height}
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                className="w-full rounded-[12px] border-0" style={{ height: sp.height }} />
            </div>
          )}
        </div>
      )}
      {links.length > 0 && (
        <div className="grid gap-3">
          <h2 className="text-[22px]">Links</h2>
          <ul className="flex flex-wrap gap-2">
            {links.map((l, i) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noopener noreferrer"
                  className={`btn !no-underline ${i === 0 && m.website ? "" : "btn-ghost"}`} style={i === 0 && m.website ? { background: t.accent, color: t.accentFg } : undefined}>
                  {l.label} <span aria-hidden>↗</span><span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
