import Link from "next/link";
import { Logo } from "./Logo";
import { Icon } from "./Icon";
import { Countdown } from "./Countdown";
import { ShareButtons } from "./ShareButtons";
import { BuyButton } from "./BuyButton";
import { startCheckout } from "@/app/[handle]/actions";
import { formatDate } from "@/lib/util";
import { dollars } from "@/lib/packages";
import { cityOf, storeUrl, type Store, type StorePackage, type StoreShow } from "@/lib/storefront";

type Theme = { brand: string; fg: string; accent: string; accentFg: string };

export function StoreHero({ s, t, compact = false }: { s: Store; t: Theme; compact?: boolean }) {
  return (
    <section className="relative overflow-hidden" style={{ background: t.brand, color: t.fg }}>
      {s.header_image_url && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.header_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${t.brand}66 0%, ${t.brand}cc 55%, ${t.brand} 100%)` }} />
        </>
      )}
      <div className="home-wrap relative pb-9">
        <div className="home-top-bar">
          <Logo href={`/${s.handle}`} label={`${s.name} upgrades`} chip={t.fg === "#0b0b0f"} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link href="/find-order" className="inline-flex h-[38px] items-center rounded-full px-3.5 text-[14px] font-bold !no-underline"
              style={{ color: t.fg, boxShadow: `inset 0 0 0 1.5px ${t.fg === "#ffffff" ? "rgba(255,255,255,.5)" : "rgba(0,0,0,.25)"}` }}>Find my order</Link>
            <Link href={`/${s.handle}/support`} className="inline-flex h-[38px] items-center gap-1.5 rounded-full px-3.5 text-[14px] font-bold !no-underline"
              style={{ background: t.accent, color: t.accentFg }}><Icon name="help" size={16} />Fan Support</Link>
          </div>
        </div>
        <div className={`flex flex-wrap items-end gap-5 ${compact ? "mt-8" : "mt-10 md:mt-16"}`}>
          {s.avatar_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.avatar_url} alt="" className={`${compact ? "size-16" : "size-24 md:size-28"} rounded-full object-cover shadow-[0_0_0_4px_rgba(255,255,255,.9)]`} />
          )}
          <div className="min-w-0">
            {compact
              ? <Link href={`/${s.handle}`} className="!no-underline"><p className="text-[clamp(28px,5vw,44px)] font-extrabold uppercase leading-[0.92] tracking-[-0.03em]" style={{ color: t.accent }}>{s.name}</p></Link>
              : <h1 className="text-[clamp(36px,7vw,68px)] font-extrabold uppercase leading-[0.92] tracking-[-0.03em]" style={{ color: t.accent }}>{s.name}</h1>}
            {s.tagline && <p className="mt-2 text-[17px] font-medium opacity-90">{s.tagline}</p>}
          </div>
        </div>
        {!compact && s.verified && <p className="mt-4"><span className="badge" style={{ background: t.accent, color: t.accentFg }}><Icon name="badge" size={14} />Verified artist</span></p>}
        {!compact && s.bio && <p className="mt-4 max-w-[640px] text-[16px] leading-relaxed opacity-90">{s.bio}</p>}
        {!compact && (
          <div className="mt-6">
            <ShareButtons tone={t.fg === "#ffffff" ? "dark" : "light"} url={storeUrl(s.handle)} title={`${s.name} VIP upgrades`}
              text={`VIP upgrades for ${s.name} shows are here`} />
          </div>
        )}
      </div>
    </section>
  );
}

export function PackageCard({ p, t, show, s, err }: { p: StorePackage; t: Theme; show: StoreShow; s: Store; err?: string }) {
  const upcoming = p.on_sale_at && new Date(p.on_sale_at) > new Date();
  const soldOut = p.remaining <= 0;
  const fee = Math.round(p.price_cents * s.fee_bps / 10000);
  const maxQty = Math.min(4, p.remaining);
  return (
    <div id={`p-${p.id}`} className="grid scroll-mt-6 overflow-hidden rounded-2xl border border-line bg-white">
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
            {p.included.map((i) => <li key={i} className="flex gap-2"><span aria-hidden className="font-bold text-violet">✓</span><span>{i}</span></li>)}
          </ul>
        )}
        <div className="flex flex-wrap gap-1.5">
          {p.presale && <span className="badge b-lilac">Presale code needed</span>}
          {!soldOut && !upcoming && p.remaining <= 10 && <span className="badge b-pending">Only {p.remaining} left</span>}
        </div>
        {soldOut ? (
          <button type="button" disabled className="btn w-full" style={{ background: "#e7e5ee", color: "#5a5866" }}>Sold out</button>
        ) : upcoming ? (
          <div className="rounded-2xl p-3" style={{ background: t.brand, color: t.fg }}><Countdown to={p.on_sale_at!} onDark={t.fg === "#ffffff"} /></div>
        ) : !s.accepting_payments ? (
          <button type="button" disabled className="btn w-full" style={{ background: t.accent, color: t.accentFg, opacity: 0.6 }}>Checkout opens soon</button>
        ) : (
          <form action={startCheckout} className="grid gap-2.5">
            <input type="hidden" name="handle" value={s.handle} />
            <input type="hidden" name="slug" value={show.slug} />
            <input type="hidden" name="sp" value={p.id} />
            {err && <p role="alert" className="alert alert-red !py-2.5 !text-[14px]">{err}</p>}
            <div className="flex gap-2">
              {maxQty > 1 && (
                <label className="field w-24"><span className="!text-[12px]">Quantity</span>
                  <select name="qty" className="input input-sm" defaultValue="1">{Array.from({ length: maxQty }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select>
                </label>
              )}
              {p.presale && (
                <label className="field flex-1"><span className="!text-[12px]">Presale code</span>
                  <input name="code" className="input input-sm uppercase" required autoComplete="off" /></label>
              )}
            </div>
            {maxQty <= 1 && <input type="hidden" name="qty" value="1" />}
            <BuyButton label={`Get VIP, ${dollars(p.price_cents)}`} bg={t.accent} fg={t.accentFg} />
          </form>
        )}
        <p className="help text-center">{fee > 0 ? `Plus a ${dollars(fee)} service fee each.` : ""} Concert ticket sold separately.</p>
        <div className="flex justify-center">
          <ShareButtons menu url={`${storeUrl(s.handle, show.slug)}#p-${p.id}`} title={`${p.name}: ${s.name} in ${show.city}`}
            text={`${p.name} for ${s.name} in ${cityOf(show)} on ${formatDate(show.date, { month: "short", day: "numeric" })}`} />
        </div>
      </div>
    </div>
  );
}

export function ShowCard({ sh, s, t, linkTitle = true, err }: { sh: StoreShow; s: Store; t: Theme; linkTitle?: boolean; err?: { pkg: string; msg: string } }) {
  const title = <p className="mt-1 text-[20px] font-extrabold leading-tight">{cityOf(sh)}</p>;
  return (
    <li id={sh.slug} className="card grid scroll-mt-6 gap-4 p-5 md:grid-cols-[220px_minmax(0,1fr)] md:p-6">
      <div className="grid content-start gap-1">
        <p className="eyebrow">{formatDate(sh.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</p>
        {linkTitle ? <Link href={`/${s.handle}/${sh.slug}`} className="text-ink">{title}</Link> : title}
        <p className="muted font-medium">{sh.venue}</p>
        <div className="mt-2"><ShareButtons menu url={storeUrl(s.handle, sh.slug)} title={`${s.name} VIP in ${sh.city}`}
          text={`VIP upgrades for ${s.name} in ${cityOf(sh)}, ${formatDate(sh.date, { month: "short", day: "numeric" })}`} /></div>
      </div>
      {sh.packages.length === 0
        ? <p className="help self-center">VIP upgrades for this show aren&apos;t on sale yet.</p>
        : <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">{sh.packages.map((p) => <PackageCard key={p.id} p={p} t={t} show={sh} s={s} err={err?.pkg === p.id ? err.msg : undefined} />)}</div>}
    </li>
  );
}
