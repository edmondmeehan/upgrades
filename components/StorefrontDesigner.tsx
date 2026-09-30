"use client";
import { useState } from "react";
import { ImageUpload } from "./ImageUpload";
import { SubmitButton } from "./SubmitButton";
import { DEFAULT_ACCENT, DEFAULT_BRAND, PALETTES, contrast, isHex, safeAccent, textOn } from "@/lib/color";
import { GENRES } from "@/lib/genres";

type Props = {
  action: (fd: FormData) => void | Promise<void>;
  artistId: string; name: string; handle: string;
  initial: { brand_color: string | null; accent_color: string | null; header_image_url: string | null; avatar_url: string | null; tagline: string | null; bio: string | null; genres?: string[] };
};

export function StorefrontDesigner({ action, artistId, name, handle, initial }: Props) {
  const [brand, setBrand] = useState(initial.brand_color ?? DEFAULT_BRAND);
  const [accent, setAccent] = useState(initial.accent_color ?? DEFAULT_ACCENT);
  const [tagline, setTagline] = useState(initial.tagline ?? "");
  const [genres, setGenres] = useState<string[]>(initial.genres ?? []);
  const toggleGenre = (g: string) => setGenres((cur) => cur.includes(g) ? cur.filter((x) => x !== g) : cur.length >= 3 ? cur : [...cur, g]);
  const b = isHex(brand) ? brand : DEFAULT_BRAND, a = isHex(accent) ? accent : DEFAULT_ACCENT;
  const fg = textOn(b), acc = safeAccent(b, a), accFg = textOn(acc);
  const lowContrast = contrast(b, a) < 3;

  return (
    <form action={action} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid gap-6">
        <section className="panel grid gap-5">
          <h2>Colors</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PALETTES.map((p) => {
              const on = p.brand === b && p.accent === a;
              return (
                <button key={p.name} type="button" onClick={() => { setBrand(p.brand); setAccent(p.accent); }} aria-pressed={on}
                  className={`grid gap-2 rounded-2xl border p-2.5 text-left ${on ? "border-violet shadow-[0_0_0_3px_#dcd5fa]" : "border-line hover:border-edge"}`}>
                  <span className="flex h-10 overflow-hidden rounded-lg"><span className="flex-[3]" style={{ background: p.brand }} /><span className="flex-1" style={{ background: p.accent }} /></span>
                  <span className="text-[13px] font-semibold">{p.name}</span>
                </button>
              );
            })}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {([["Main color", brand, setBrand, "brand_color", "Background behind your name at the top"], ["Accent color", accent, setAccent, "accent_color", "Your name, buttons, and highlights"]] as const).map(([label, v, setV, n, hint]) => (
              <label key={n} className="field"><span>{label}</span>
                <span className="flex items-center gap-3">
                  <input type="color" value={isHex(v) ? v : "#000000"} onChange={(e) => setV(e.target.value)} className="h-12 w-14 cursor-pointer rounded-xl border border-edge bg-white p-1" aria-label={`${label} picker`} />
                  <input className="input input-sm w-32 font-mono uppercase" name={n} value={v} onChange={(e) => setV(e.target.value)} maxLength={7} aria-label={`${label} hex`} />
                </span>
                <small>{hint}</small>
              </label>
            ))}
          </div>
          {lowContrast && <p className="alert alert-yellow">Those two colors are hard to read together, so your storefront will use {textOn(b) === "#ffffff" ? "white" : "black"} instead of the accent for text on the main color.</p>}
        </section>

        <section className="panel grid gap-5">
          <h2>Images</h2>
          <ImageUpload artistId={artistId} folder="header" name="header_image_url" defaultValue={initial.header_image_url} label="Header image" hint="A wide live photo works best, at least 2000 pixels across. Text sits on top, so a darker image reads best." />
          <div className="max-w-[220px]">
            <ImageUpload artistId={artistId} folder="avatar" name="avatar_url" defaultValue={initial.avatar_url} label="Profile image or logo" aspect="aspect-square" hint="Square, at least 400 pixels." />
          </div>
        </section>

        <section className="panel grid gap-5">
          <h2>Words</h2>
          <label className="field"><span>Tagline</span><input className="input" name="tagline" maxLength={140} value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="VIP upgrades for the Fall 2026 tour" /><small>One line under your name.</small></label>
          <div className="field">
            <span>Genres (up to 3)</span>
            <input type="hidden" name="genres" value={genres.join(",")} />
            <div className="flex flex-wrap gap-2">
              {GENRES.map((g) => {
                const on = genres.includes(g);
                return <button key={g} type="button" aria-pressed={on} onClick={() => toggleGenre(g)} disabled={!on && genres.length >= 3}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold ${on ? "bg-violet text-white" : "bg-paper text-ink hover:bg-[#ebe8f4] disabled:opacity-40"}`}>{g}</button>;
              })}
            </div>
            <small>Fans browse the OnTour home page by genre.</small>
          </div>
          <label className="field"><span>About</span><textarea className="input" name="bio" maxLength={600} defaultValue={initial.bio ?? ""} placeholder="A few sentences fans see above your shows." /></label>
        </section>

        <div><SubmitButton size="lg" pendingText="Saving…">Save storefront</SubmitButton></div>
      </div>

      <aside className="grid gap-2 lg:sticky lg:top-6">
        <p className="eyebrow">Preview</p>
        <div className="overflow-hidden rounded-[20px] border border-line bg-white">
          <div className="relative px-5 pb-6 pt-10" style={{ background: b, color: fg }}>
            <p className="text-[30px] font-extrabold uppercase leading-[0.95] tracking-[-0.03em]" style={{ color: acc }}>{name}</p>
            {tagline && <p className="mt-2 text-[14px] opacity-85">{tagline}</p>}
          </div>
          <div className="grid gap-3 p-5">
            <div className="rounded-2xl border border-line p-4">
              <p className="eyebrow">Sat, Nov 7</p>
              <p className="mt-1 font-extrabold">Nashville, TN</p>
              <p className="text-[13px] text-mute">Meet &amp; greet + photo, $150</p>
              <span className="mt-3 inline-flex h-9 items-center rounded-full px-4 text-[13px] font-bold" style={{ background: acc, color: accFg }}>Get VIP</span>
            </div>
          </div>
        </div>
        <p className="help">upgrades.ontour.vip/{handle}</p>
      </aside>
    </form>
  );
}
