"use client";
import Link from "next/link";
import { dollars } from "@/lib/packages";
import { useMemo, useState } from "react";
import { GENRES, US_STATES } from "@/lib/genres";
import { DEFAULT_ACCENT, DEFAULT_BRAND, isHex, safeAccent, textOn } from "@/lib/color";

type A = { name: string; handle: string; genres: string[]; avatar_url: string | null; header_image_url: string | null; brand_color: string | null; accent_color: string | null; tagline?: string | null; upcoming?: number };
type S = { slug: string; date: string; city: string | null; region: string | null; country: string; venue: string | null; doors: string | null; tonight: boolean; from_cents: number; currency?: string; artist: A };
export type DiscoverData = { shows: S[]; artists: A[] };

const money = (c: number, cur = "usd") => dollars(c, cur);
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const stateName = (code: string | null) => US_STATES.find(([c]) => c === code)?.[1] ?? code ?? "";
const colors = (a: A) => { const b = isHex(a.brand_color) ? a.brand_color : DEFAULT_BRAND; const acc = safeAccent(b, isHex(a.accent_color) ? a.accent_color : DEFAULT_ACCENT); return { b, fg: textOn(b), acc }; };

function ShowTile({ s }: { s: S }) {
  const c = colors(s.artist);
  return (
    <Link href={`/${s.artist.handle}/${s.slug}`} className="group grid overflow-hidden rounded-[20px] border border-line bg-white !no-underline text-ink transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(19,0,86,.12)]">
      <div className="relative aspect-[16/9] overflow-hidden" style={{ background: c.b, color: c.fg }}>
        {s.artist.header_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.artist.header_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 30%, ${c.b}ee 100%)` }} />
        <div className="absolute inset-x-4 bottom-3">
          {s.tonight && <span className="badge mb-1.5" style={{ background: c.acc, color: textOn(c.acc) }}>Tonight</span>}
          <p className="text-[22px] font-extrabold uppercase leading-[0.95] tracking-[-0.02em]" style={{ color: c.acc }}>{s.artist.name}</p>
        </div>
      </div>
      <div className="grid gap-0.5 p-4">
        <p className="eyebrow">{fmt(s.date)}</p>
        <p className="text-[17px] font-extrabold leading-tight">{s.city}{s.region ? `, ${s.region}` : ""}</p>
        <p className="truncate text-[14px] text-mute">{s.venue}</p>
        <p className="mt-2 text-[14px] font-bold text-violet">VIP from {money(s.from_cents, s.currency)}</p>
      </div>
    </Link>
  );
}

export function Discover({ data, geo }: { data: DiscoverData; geo: { region: string | null; city: string | null } }) {
  const [q, setQ] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const [near, setNear] = useState<string>(geo.region ?? "");

  const usedGenres = useMemo(() => GENRES.filter((g) => data.artists.some((a) => a.genres?.includes(g))), [data.artists]);
  const match = (s: S) => {
    const t = q.trim().toLowerCase();
    return (!genre || s.artist.genres?.includes(genre))
      && (!t || [s.artist.name, s.city, s.region, s.venue, stateName(s.region)].some((v) => v?.toLowerCase().includes(t)));
  };
  const shows = data.shows.filter(match);
  const tonightNear = near ? shows.filter((s) => s.tonight && s.region?.toUpperCase() === near) : [];
  const soonNear = near ? shows.filter((s) => !s.tonight && s.region?.toUpperCase() === near).slice(0, 12) : [];
  const tonightAll = shows.filter((s) => s.tonight && !tonightNear.includes(s));
  const rest = shows.filter((s) => !s.tonight && !soonNear.includes(s));
  const artists = data.artists.filter((a) => (!genre || a.genres?.includes(genre)) && (!q.trim() || a.name.toLowerCase().includes(q.trim().toLowerCase())));
  const where = near ? (geo.region === near && geo.city ? geo.city : stateName(near)) : null;
  const searching = !!q.trim() || !!genre;

  const Grid = ({ items }: { items: S[] }) => <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">{items.map((s) => <ShowTile key={`${s.artist.handle}-${s.slug}`} s={s} />)}</div>;

  return (
    <div className="grid gap-8">
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <input className="input min-w-[240px] flex-1" type="search" placeholder="Search artists, cities or venues" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          <label className="flex items-center gap-2">
            <span className="text-[14px] font-semibold">Near</span>
            <select className="input !w-auto" value={near} onChange={(e) => setNear(e.target.value)} aria-label="Location">
              <option value="">Anywhere</option>
              {US_STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
            </select>
          </label>
        </div>
        {usedGenres.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Genre">
            <button type="button" aria-pressed={!genre} onClick={() => setGenre(null)} className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold ${!genre ? "bg-ink text-white" : "bg-paper"}`}>All</button>
            {usedGenres.map((g) => (
              <button key={g} type="button" aria-pressed={genre === g} onClick={() => setGenre(genre === g ? null : g)}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold ${genre === g ? "bg-ink text-white" : "bg-paper hover:bg-[#ebe8f4]"}`}>{g}</button>
            ))}
          </div>
        )}
      </div>

      {where && (
        <section className="grid gap-4">
          <h2 className="text-[22px]">Tonight near {where}</h2>
          {tonightNear.length ? <Grid items={tonightNear} /> : <p className="muted">Nothing with VIP tonight near {where}{searching ? " that matches" : ""}.{soonNear.length ? " Here's what's coming up." : ""}</p>}
          {soonNear.length > 0 && (<><h3 className="mt-2 text-[17px]">Coming up in {stateName(near)}</h3><Grid items={soonNear} /></>)}
        </section>
      )}

      {tonightAll.length > 0 && (
        <section className="grid gap-4"><h2 className="text-[22px]">{where ? "Tonight elsewhere" : "Tonight"}</h2><Grid items={tonightAll} /></section>
      )}

      <section className="grid gap-4">
        <h2 className="text-[22px]">{searching ? "Matching shows" : "Upcoming shows with VIP"}</h2>
        {rest.length ? <Grid items={rest.slice(0, 60)} /> : <p className="muted">{searching ? "No shows match. Try another search or genre." : "No upcoming shows yet. Check back soon."}</p>}
      </section>

      {artists.length > 0 && (
        <section className="grid gap-4">
          <h2 className="text-[22px]">Artists</h2>
          <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
            {artists.map((a) => {
              const c = colors(a);
              return (
                <li key={a.handle}>
                  <Link href={`/${a.handle}`} className="card flex items-center gap-3 p-3 !no-underline text-ink hover:border-violet">
                    {a.avatar_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={a.avatar_url} alt="" className="size-12 rounded-full object-cover" />
                      : <span className="grid size-12 place-items-center rounded-full text-[18px] font-extrabold" style={{ background: c.b, color: c.acc }}>{a.name.charAt(0)}</span>}
                    <span className="min-w-0">
                      <span className="block truncate font-extrabold">{a.name}</span>
                      <span className="block truncate text-[13px] text-mute">{a.genres?.length ? a.genres.join(", ") : `${a.upcoming ?? 0} upcoming show${a.upcoming === 1 ? "" : "s"}`}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
