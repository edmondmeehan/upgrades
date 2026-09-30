import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Icon } from "@/components/Icon";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/util";
import { DEFAULT_ACCENT, DEFAULT_BRAND, isHex, safeAccent, textOn } from "@/lib/color";
import { dollars } from "@/lib/packages";

type Pkg = { id: string; name: string; description: string | null; included: string[]; image_url: string | null; includes_photo: boolean;
  price_cents: number; presale: boolean; on_sale_at: string | null; off_sale_at: string | null; remaining: number };
type Store = {
  name: string; handle: string; website: string | null; bio: string | null; tagline: string | null; verified: boolean;
  brand_color: string | null; accent_color: string | null; header_image_url: string | null; avatar_url: string | null;
  shows: { slug: string; date: string; venue: string; city: string; region: string | null; country: string; tour: string; packages: Pkg[] }[];
};

async function load(handle: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_storefront", { p_handle: handle });
  return data as Store | null;
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const s = await load((await params).handle);
  return s ? { title: `${s.name} VIP upgrades`, description: s.tagline ?? `VIP upgrades for ${s.name} shows.` } : { title: "Not found" };
}

function PackageCard({ p, accent, accentFg }: { p: Pkg; accent: string; accentFg: string }) {
  const notYet = p.on_sale_at && new Date(p.on_sale_at) > new Date();
  const soldOut = p.remaining <= 0;
  return (
    <div className="grid overflow-hidden rounded-2xl border border-line bg-white">
      {p.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.image_url} alt="" className="aspect-[16/9] w-full object-cover" />
      )}
      <div className="grid gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-[16px] font-extrabold leading-tight">{p.name}</p>
          <p className="text-[16px] font-extrabold">{dollars(p.price_cents)}</p>
        </div>
        {p.description && <p className="text-[14px] text-mute">{p.description}</p>}
        {p.included.length > 0 && (
          <ul className="grid gap-1 text-[14px]">
            {p.included.map((i) => <li key={i} className="flex gap-2"><span aria-hidden className="font-bold" style={{ color: accent === "#0b0b0f" || accent === "#ffffff" ? undefined : accent }}>✓</span><span>{i}</span></li>)}
          </ul>
        )}
        <div className="flex flex-wrap gap-1.5">
          {p.presale && <span className="badge b-lilac">Presale code needed</span>}
          {!soldOut && p.remaining <= 10 && <span className="badge b-pending">Only {p.remaining} left</span>}
        </div>
        <button type="button" disabled className="btn w-full" style={{ background: soldOut ? "#e7e5ee" : accent, color: soldOut ? "#5a5866" : accentFg }}>
          {soldOut ? "Sold out" : notYet ? `On sale ${new Date(p.on_sale_at!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "Checkout opens soon"}
        </button>
        <p className="help text-center">Plus a service fee at checkout. Concert ticket sold separately.</p>
      </div>
    </div>
  );
}

export default async function Storefront({ params }: { params: Promise<{ handle: string }> }) {
  const s = await load((await params).handle);
  if (!s) notFound();
  const brand = isHex(s.brand_color) ? s.brand_color : DEFAULT_BRAND;
  const fg = textOn(brand);
  const accent = safeAccent(brand, isHex(s.accent_color) ? s.accent_color : DEFAULT_ACCENT);
  const accentFg = textOn(accent);
  const withPkgs = s.shows.filter((sh) => sh.packages.length > 0).length;

  return (
    <div className="min-h-screen bg-white">
      <section className="relative overflow-hidden" style={{ background: brand, color: fg }}>
        {s.header_image_url && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.header_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${brand}66 0%, ${brand}cc 55%, ${brand} 100%)` }} />
          </>
        )}
        <div className="home-wrap relative pb-9">
          <div className="home-top-bar">
            <Logo href={`/${s.handle}`} label={`${s.name} upgrades`} chip={fg === "#0b0b0f"} />
            <a href="https://help.please.co" className="inline-flex h-[38px] items-center gap-1.5 rounded-full px-3.5 text-[14px] font-bold !no-underline"
              style={{ background: accent, color: accentFg }}><Icon name="help" size={16} />Fan Support</a>
          </div>
          <div className="mt-10 flex flex-wrap items-end gap-5 md:mt-16">
            {s.avatar_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.avatar_url} alt="" className="size-24 rounded-full object-cover shadow-[0_0_0_4px_rgba(255,255,255,.9)] md:size-28" />
            )}
            <div className="min-w-0">
              <h1 className="text-[clamp(36px,7vw,68px)] font-extrabold uppercase leading-[0.92] tracking-[-0.03em]" style={{ color: accent }}>{s.name}</h1>
              {s.tagline && <p className="mt-2 text-[17px] font-medium opacity-90">{s.tagline}</p>}
            </div>
          </div>
          {s.verified && <p className="mt-4"><span className="badge" style={{ background: accent, color: accentFg }}><Icon name="badge" size={14} />Verified artist</span></p>}
          {s.bio && <p className="mt-4 max-w-[640px] text-[16px] leading-relaxed opacity-90">{s.bio}</p>}
        </div>
      </section>

      <main className="home-wrap py-8">
        <p className="mb-4 font-bold" aria-live="polite">{s.shows.length} upcoming show{s.shows.length === 1 ? "" : "s"}{withPkgs ? `, ${withPkgs} with VIP upgrades` : ""}</p>
        {s.shows.length === 0 ? (
          <div className="grid justify-items-center gap-2 px-4 py-12 text-center">
            <span className="grid size-13 place-items-center rounded-full bg-paper"><Icon name="calendar" size={24} /></span>
            <h2 className="text-[16px]">No upcoming shows yet</h2>
            <p className="help">Check back soon.</p>
          </div>
        ) : (
          <ul className="grid gap-5">
            {s.shows.map((sh) => (
              <li key={sh.slug} className="card grid gap-4 p-5 md:grid-cols-[220px_minmax(0,1fr)] md:p-6">
                <div>
                  <p className="eyebrow">{formatDate(sh.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</p>
                  <p className="mt-1 text-[20px] font-extrabold leading-tight">{sh.city}{sh.region ? `, ${sh.region}` : ""}</p>
                  <p className="muted font-medium">{sh.venue}</p>
                </div>
                {sh.packages.length === 0
                  ? <p className="help self-center">VIP upgrades for this show aren&apos;t on sale yet.</p>
                  : <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">{sh.packages.map((p) => <PackageCard key={p.id} p={p} accent={accent} accentFg={accentFg} />)}</div>}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
