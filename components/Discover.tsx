"use client";
import Link from "next/link";
import { dollars } from "@/lib/packages";
import { useMemo, useState } from "react";
import { GENRES, US_STATES } from "@/lib/genres";
import { DEFAULT_ACCENT, DEFAULT_BRAND, isHex, safeAccent, textOn } from "@/lib/color";

type A = { name: string; handle: string; genres: string[]; avatar_url: string | null; header_image_url: string | null; brand_color: string | null; accent_color: string | null; tagline?: string | null; upcoming?: number };
type S = { slug: string; date: string; city: string | null; region: string | null; country: string; venue: string | null; doors: string | null; tonight: boolean; from_cents: number; currency?: string; lat?: number | null; lng?: number | null; artist: A };
export type DiscoverData = { shows: S[]; artists: A[] };
export type Geo = { region: string | null; city: string | null; country: string | null; lat: number | null; lng: number | null };

const NEAR_MILES = 250;
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const stateName = (code: string | null) => US_STATES.find(([c]) => c === code)?.[1] ?? code ?? "";
const colors = (a: A) => { const b = isHex(a.brand_color) ? a.brand_color : DEFAULT_BRAND; const acc = safeAccent(b, isHex(a.accent_color) ? a.accent_color : DEFAULT_ACCENT); return { b, fg: textOn(b), acc }; };
const miles = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = (x: number) => (x * Math.PI) / 180, R = 3958.8;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  return 2 * R * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2));
};
const place = (s: S) => [s.city, s.region ?? (s.country !== "US" ? (s.country === "GB" ? "UK" : s.country) : null)].filter(Boolean).join(", ");
const cheapest = (shows: S[]) => shows.reduce((m, s) => (s.from_cents < m.from_cents ? s : m), shows[0]);

type Entry = { artist: A; shows: S[]; near: S[] };

function ArtistCard({ e, nearby }: { e: Entry; nearby: boolean }) {
  const c = colors(e.artist);
  const list = nearby && e.near.length ? e.near : e.shows;
  const next = list[0], low = cheapest(list);
  return (
    <Link href={`/${e.artist.handle}`} className="group grid overflow-hidden rounded-[20px] border border-line bg-white !no-underline text-ink transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(19,0,86,.12)]">
      <div className="relative aspect-[16/9] overflow-hidden" style={{ background: c.b, color: c.fg }}>
        {e.artist.header_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={e.artist.header_image_url} alt="" className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-[1.02]" />
        )}
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 25%, ${c.b}f0 100%)` }} />
        <div className="absolute inset-x-4 bottom-3 flex items-end gap-3">
          {e.artist.avatar_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={e.artist.avatar_url} alt="" className="size-12 shrink-0 rounded-full border-2 object-cover" style={{ borderColor: c.acc }} />
          )}
          <div className="min-w-0">
            {list.some((s) => s.tonight) && <span className="badge mb-1" style={{ background: c.acc, color: textOn(c.acc) }}>Tonight</span>}
            <p className="truncate text-[22px] font-extrabold uppercase leading-[0.95] tracking-[-0.02em]" style={{ color: c.acc }}>{e.artist.name}</p>
          </div>
        </div>
      </div>
      <div className="grid gap-1 p-4">
        {e.artist.genres?.length > 0 && <p className="eyebrow truncate">{e.artist.genres.slice(0, 3).join(" · ")}</p>}
        <p className="text-[15px] font-bold leading-snug">
          {nearby && e.near.length ? `Near you: ${fmt(next.date)}, ${place(next)}` : `${e.shows.length} date${e.shows.length === 1 ? "" : "s"} with VIP, next ${fmt(next.date)} in ${place(next)}`}
        </p>
        {nearby && e.near.length > 1 && <p className="text-[13px] text-mute">+{e.near.length - 1} more nearby</p>}
        <p className="mt-1 text-[14px] font-bold text-violet">VIP from {dollars(low.from_cents, low.currency)} <span aria-hidden>→</span></p>
      </div>
    </Link>
  );
}

/** Homepage: artists, not dates. Artists playing near the visitor first (by distance, or state), then everyone else with VIP. */
export function Discover({ data, geo }: { data: DiscoverData; geo: Geo }) {
  const [q, setQ] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const [where, setWhere] = useState<string>(geo.region && geo.country === "US" ? "auto" : geo.lat != null ? "auto" : "any");

  const entries = useMemo(() => {
    const by = new Map<string, Entry>();
    data.shows.forEach((s) => {
      const e = by.get(s.artist.handle) ?? { artist: s.artist, shows: [], near: [] };
      e.shows.push(s); by.set(s.artist.handle, e);
    });
    const isNear = (s: S) => {
      if (where === "any") return false;
      if (where !== "auto") return s.country === "US" && s.region === where;
      if (geo.lat != null && geo.lng != null && s.lat != null && s.lng != null) return miles({ lat: geo.lat, lng: geo.lng }, { lat: Number(s.lat), lng: Number(s.lng) }) <= NEAR_MILES;
      return !!geo.country && s.country === geo.country && (geo.country !== "US" || (!!geo.region && s.region === geo.region));
    };
    const t = q.trim().toLowerCase();
    return [...by.values()]
      .map((e) => ({ ...e, shows: e.shows.sort((a, b) => a.date.localeCompare(b.date)), near: e.shows.filter(isNear).sort((a, b) => a.date.localeCompare(b.date)) }))
      .filter((e) => !genre || e.artist.genres?.includes(genre))
      .filter((e) => !t || [e.artist.name, ...(e.artist.genres ?? []), ...e.shows.map((s) => s.city ?? "")].some((v) => v.toLowerCase().includes(t)));
  }, [data.shows, q, genre, where, geo]);

  const nearby = entries.filter((e) => e.near.length).sort((a, b) => a.near[0].date.localeCompare(b.near[0].date));
  const others = entries.filter((e) => !e.near.length).sort((a, b) => a.shows[0].date.localeCompare(b.shows[0].date));
  const genresInUse = GENRES.filter((g) => data.shows.some((s) => s.artist.genres?.includes(g)));
  const nearLabel = where === "auto" ? (geo.city ? `near ${geo.city}` : geo.region && geo.country === "US" ? `in ${stateName(geo.region)}` : "near you") : where === "any" ? "" : `in ${stateName(where)}`;

  return (
    <div className="grid gap-8">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} className="input min-w-[220px] flex-1" placeholder="Search artists, genres or cities" aria-label="Search" />
          <label className="flex items-center gap-2 text-[14px] font-bold">Near
            <select value={where} onChange={(e) => setWhere(e.target.value)} className="input !w-auto">
              {(geo.lat != null || geo.region) && <option value="auto">{geo.city ? `Me (${geo.city})` : "Me"}</option>}
              <option value="any">Anywhere</option>
              {US_STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
            </select>
          </label>
        </div>
        {genresInUse.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Genre">
            <button type="button" aria-pressed={!genre} onClick={() => setGenre(null)} className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold ${!genre ? "bg-ink text-white" : "bg-paper"}`}>All</button>
            {genresInUse.map((g) => <button key={g} type="button" aria-pressed={genre === g} onClick={() => setGenre(genre === g ? null : g)} className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold ${genre === g ? "bg-ink text-white" : "bg-paper"}`}>{g}</button>)}
          </div>
        )}
      </div>

      {where !== "any" && (
        <section className="grid gap-3">
          <h2 className="text-[24px]">Playing {nearLabel}</h2>
          {nearby.length === 0
            ? <p className="muted">No VIP shows {nearLabel} right now. Here&apos;s everyone else with VIP on sale.</p>
            : <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">{nearby.map((e) => <ArtistCard key={e.artist.handle} e={e} nearby />)}</div>}
        </section>
      )}

      {others.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-[24px]">{where === "any" ? "Artists with VIP" : "More artists with VIP"}</h2>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">{others.map((e) => <ArtistCard key={e.artist.handle} e={e} nearby={false} />)}</div>
        </section>
      )}

      {entries.length === 0 && <p className="card px-4 py-12 text-center muted">{data.shows.length ? "No artists match." : "No VIP upgrades on sale yet. Check back soon."}</p>}
    </div>
  );
}
