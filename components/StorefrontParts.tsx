import Link from "next/link";
import { Icon } from "./Icon";
import { Countdown } from "./Countdown";
import { ShareButtons } from "./ShareButtons";
import { BuyButton } from "./BuyButton";
import { HumanCheck } from "./HumanCheck";
import { BuyFields } from "./BuyFields";
import { startCheckout, followArtist } from "@/app/[handle]/actions";
import { US_STATES } from "@/lib/genres";
import { formatDate } from "@/lib/util";
import { dollars } from "@/lib/packages";
import { cityOf, storeUrl, type Store, type StorePackage, type StoreShow } from "@/lib/storefront";

type Theme = { brand: string; fg: string; accent: string; accentFg: string };

export function StoreHero({ s, t, compact = false, follow }: { s: Store; t: Theme; compact?: boolean; follow?: { state?: string; err?: string } }) {
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
          <Link href={`/${s.handle}`} className="inline-flex items-center gap-2 text-[14px] font-extrabold uppercase tracking-[0.08em] !no-underline" style={{ color: t.fg }}>
            {s.avatar_url && compact
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={s.avatar_url} alt="" className="size-8 rounded-full object-cover" />
              : null}
            VIP upgrades
          </Link>
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
          <details id="follow" className="mt-6 max-w-[520px] scroll-mt-6" open={!!follow?.state || !!follow?.err}>
            <summary className="inline-flex h-[42px] cursor-pointer list-none items-center gap-2 rounded-full px-5 text-[15px] font-bold [&::-webkit-details-marker]:hidden" style={{ background: t.accent, color: t.accentFg }}>
              <Icon name="star" size={16} />Follow {s.name}
            </summary>
            <div className="mt-3 rounded-2xl bg-white p-4 text-ink shadow-[0_12px_32px_rgba(0,0,0,.18)]">
              {follow?.state === "check" ? <p className="font-semibold">Check your email to confirm. Then you&apos;ll hear first when {s.name} announces new VIP.</p>
                : follow?.state === "already" ? <p className="font-semibold">You&apos;re already following {s.name}.</p>
                : (
                  <form action={followArtist.bind(null, s.handle)} className="grid gap-2">
                    <p className="text-[14px]">Get an email when {s.name} announces new shows and VIP upgrades. No spam, unsubscribe any time.</p>
                    {follow?.err && <p role="alert" className="alert alert-red !py-2 !text-[13px]">{follow.err.slice(0, 120)}</p>}
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px]">
                      <input name="email" type="email" required placeholder="Your email" className="input input-sm" aria-label="Email" />
                      <select name="region" className="input input-sm" aria-label="Your state" defaultValue=""><option value="">State (optional)</option>{US_STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
                    </div>
                    <HumanCheck />
                    <button className="btn btn-sm justify-self-start">Follow</button>
                  </form>
                )}
            </div>
          </details>
        )}
        {!compact && (
          <div className="mt-4">
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
  const fee = Math.round(p.price_cents * (show.fee_bps ?? s.fee_bps) / 10000); // promo codes can lower this per show
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
          <p className="text-[16px] font-extrabold">{dollars(p.price_cents, show.currency)}</p>
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
            <BuyFields maxQty={maxQty} questions={p.questions ?? []} presale={p.presale} />
            <label className="flex items-start gap-2 text-[13px] text-mute">
              <input type="checkbox" name="marketing" className="check mt-0.5 !size-4" />
              <span>Email me news and future shows from {s.name}</span>
            </label>
            <HumanCheck />
            <BuyButton label={`Get VIP, ${dollars(p.price_cents, show.currency)}`} bg={t.accent} fg={t.accentFg} />
          </form>
        )}
        <p className="help text-center">{fee > 0 ? `Plus a ${dollars(fee, show.currency)} service fee each.` : "No service fee."} Concert ticket sold separately.</p>
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

/** Shown at the bottom of every artist page: who's selling, and who to contact. */
export function ArtistDisclaimer({ name, handle, order }: { name: string; handle: string; order?: string }) {
  return (
    <aside className="home-wrap pb-10">
      <p className="mx-auto max-w-[720px] rounded-2xl bg-paper px-5 py-4 text-center text-[13px] leading-relaxed text-mute">
        VIP upgrades on this page are sold directly by {name}, not by Please &amp; Thank You. For questions about packages, orders, refunds or check-in,
        please <Link href={`/${handle}/support${order ? `?order=${order}` : ""}`} className="font-semibold">contact {name} directly</Link>.
      </p>
    </aside>
  );
}

/** What a show's VIP button should say, from its packages. */
function vipStatus(sh: StoreShow): { kind: "buy" | "soon" | "onsale" | "soldout"; label: string; from?: number } {
  const pk = sh.packages;
  if (!pk.length) return { kind: "soon", label: "VIP coming soon" };
  const now = Date.now();
  const live = pk.filter((p) => !p.on_sale_at || new Date(p.on_sale_at).getTime() <= now);
  const available = live.filter((p) => p.remaining > 0);
  if (available.length) {
    const from = Math.min(...available.map((p) => p.price_cents));
    return { kind: "buy", label: available.every((p) => p.presale) ? "Presale VIP" : "Get VIP", from };
  }
  if (live.length === pk.length) return { kind: "soldout", label: "VIP sold out" };
  const next = pk.filter((p) => p.on_sale_at && new Date(p.on_sale_at).getTime() > now).map((p) => p.on_sale_at!).sort()[0];
  return { kind: "onsale", label: `VIP on sale ${new Date(next).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` };
}

/** Tour-page style list: one row per date with a VIP button; buying happens on the show page. */
export function TourDates({ s, t }: { s: Store; t: Theme }) {
  const thisYear = new Date().getFullYear();
  return (
    <ul className="card divide-y divide-line overflow-hidden">
      {s.shows.map((sh) => {
        const d = new Date(`${sh.date}T12:00:00Z`);
        const st = vipStatus(sh);
        const href = `/${s.handle}/${sh.slug}`;
        const place = [sh.city, sh.region ?? (sh.country && sh.country !== "US" ? (sh.country === "GB" ? "UK" : sh.country) : null)].filter(Boolean).join(", ");
        return (
          <li key={sh.slug} id={sh.slug} className="scroll-mt-6">
            <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-4 gap-y-3 px-4 py-4 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:px-6">
              <Link href={href} className="grid justify-items-center rounded-xl border border-line py-1.5 text-center !no-underline text-ink" aria-label={formatDate(sh.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}>
                <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-mute">{d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}</span>
                <span className="text-[24px] font-extrabold leading-none">{d.getUTCDate()}</span>
                <span className="text-[11px] font-semibold text-mute">{d.getUTCFullYear() !== thisYear ? d.getUTCFullYear() : d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}</span>
              </Link>
              <Link href={href} className="min-w-0 !no-underline text-ink">
                <span className="block truncate text-[18px] font-extrabold leading-tight">{place || "City TBA"}</span>
                <span className="block truncate text-[15px] text-mute">{sh.venue}</span>
              </Link>
              <div className="col-span-2 sm:col-span-1 sm:justify-self-end">
                {st.kind === "buy" ? (
                  <Link href={href} className="btn w-full !no-underline sm:w-auto" style={{ background: t.accent, color: t.accentFg }}>
                    {st.label}{st.from !== undefined ? `, from ${dollars(st.from, sh.currency)}` : ""}
                  </Link>
                ) : st.kind === "soon" ? (
                  <a href="#follow" className="btn btn-ghost w-full !no-underline sm:w-auto">{st.label}: get notified</a>
                ) : (
                  <Link href={href} className="btn btn-ghost w-full !no-underline sm:w-auto">{st.label}</Link>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
