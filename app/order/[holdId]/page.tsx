import Link from "next/link";
import { notFound } from "next/navigation";
import { ArtistDisclaimer } from "@/components/StorefrontParts";
import { Icon } from "@/components/Icon";
import { getStripe } from "@/lib/stripe";
import { fulfillSession, loadOrder } from "@/lib/checkout";
import { dollars } from "@/lib/packages";
import { qrSvg } from "@/lib/qr";
import { checkinNotes, checkinRows, hasCheckinDetails, mapsUrl } from "@/lib/checkinEmail";

export const metadata = { title: "Your order", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type P = { params: Promise<{ holdId: string }>; searchParams: Promise<{ session_id?: string }> };

export default async function Order({ params, searchParams }: P) {
  const { holdId } = await params;
  const { session_id } = await searchParams;
  let v = await loadOrder(holdId);
  if (!v) notFound();

  // Coming back from Stripe: confirm the payment right away instead of waiting for the webhook.
  if (!v.order && session_id && session_id === v.hold.stripe_session_id) {
    const stripe = getStripe();
    try {
      const s = await stripe?.checkout.sessions.retrieve(session_id, {}, { stripeAccount: v.hold.stripe_account_id });
      if (s?.payment_status === "paid") { await fulfillSession(s, v.hold.stripe_account_id); v = await loadOrder(holdId); }
    } catch (e) { console.error("[order] confirm", e); }
  }
  if (!v) notFound();

  const date = new Date(`${v.show.show_date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const city = `${v.show.city ?? ""}${v.show.region ? `, ${v.show.region}` : ""}`;
  const pending = !v.order && v.hold.status === "pending";
  const qrs = await Promise.all(v.passes.map((p) => qrSvg(p.code)));

  return (
    <div className="min-h-screen bg-paper">
      {pending && <meta httpEquiv="refresh" content="4" />}
      <header className="bg-navy">
        <div className="home-wrap flex items-center justify-between py-5">
          <Link href={`/${v.artist.handle}`} className="text-[15px] font-extrabold uppercase tracking-[0.06em] text-yellow !no-underline">{v.artist.name} VIP</Link>
          <Link href={`/${v.artist.handle}/support${v.order ? `?order=${v.order.confirmation_code}` : ""}`} className="fan-nav-btn solid"><Icon name="help" size={16} /><span>Fan Support</span></Link>
        </div>
      </header>
      <main className="mx-auto grid max-w-[560px] gap-5 px-4 py-8">
        {v.order ? (
          <>
            <div className="card grid gap-4 p-6">
              {v.order.status === "refunded"
                ? <p className="alert alert-gray">This order was refunded, so its passes are no longer valid. The money goes back to your card within 5 to 10 business days.</p>
                : v.order.status === "partially_refunded"
                  ? <span className="badge b-pending justify-self-start">Partly refunded</span>
                  : <span className="badge b-published justify-self-start">Order confirmed</span>}
              {v.photos && v.product.includes_photo && (
                <a href={v.photos.url} className="flex items-center justify-between gap-3 rounded-2xl bg-navy px-5 py-4 !no-underline text-white">
                  <span><span className="block text-[17px] font-extrabold text-yellow">Your photos are ready</span><span className="text-[14px] text-[#d9d5e6]">View and save them to your phone</span></span>
                  <span className="btn btn-yellow btn-sm">View photos</span>
                </a>
              )}
              <h1 className="text-[28px]">You&apos;re going VIP{v.order.fans?.name ? `, ${v.order.fans.name.split(" ")[0]}` : ""}</h1>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-edge px-4 py-3">
                <span className="th">Confirmation number</span>
                <span className="font-mono text-[20px] font-extrabold tracking-[0.08em]">{v.order.confirmation_code}</span>
              </div>
              <p className="muted">A confirmation is on its way to {v.order.fans?.email}. You can come back to this order any time at <Link href="/find-order">upgrades.ontour.vip/find-order</Link> with your confirmation number and last name.</p>
              <dl className="grid gap-2 rounded-2xl bg-paper p-4 text-[15px]">
                {[["Artist", v.artist.name], ["Package", `${v.product.name}${v.hold.quantity > 1 ? ` x ${v.hold.quantity}` : ""}`], ["Show", date], ["Where", `${v.show.venue_name ?? "Venue TBA"}, ${city}`],
                  ["Total paid", dollars(v.order.total_cents)]].map(([k, val]) => (
                  <div key={k} className="grid grid-cols-[96px_1fr] gap-3"><dt className="th pt-0.5">{k}</dt><dd className="font-semibold">{val}</dd></div>
                ))}
              </dl>
              {v.product.included?.length > 0 && (
                <div><p className="eyebrow mb-2">What&apos;s included</p>
                  <ul className="grid gap-1 text-[15px]">{v.product.included.map((i) => <li key={i} className="flex gap-2"><span aria-hidden className="font-bold text-violet">✓</span>{i}</li>)}</ul></div>
              )}
            </div>
            {hasCheckinDetails(v.show) && (() => {
              const pkg = [{ name: v.product.name, qty: v.hold.quantity, time: v.pkgCheckin.time, notes: v.pkgCheckin.notes }];
              return (
                <div className="card grid gap-3 p-6">
                  <h2>Check-in</h2>
                  <dl className="grid gap-2 text-[15px]">
                    {checkinRows(v.show, pkg).map(([k, val]) => (
                      <div key={k} className="grid grid-cols-[110px_1fr] gap-3"><dt className="th pt-0.5">{k}</dt><dd className="font-semibold">{val}</dd></div>
                    ))}
                  </dl>
                  {checkinNotes(v.show, pkg).map((n) => <p key={n} className="rounded-2xl bg-paper px-4 py-3 text-[14px]">{n}</p>)}
                  <a href={mapsUrl(v.show)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost justify-self-start">Get directions</a>
                </div>
              );
            })()}
            <div className="card grid gap-3 p-6">
              <h2>{v.passes.length > 1 ? "Your passes" : "Your pass"}</h2>
              <p className="muted text-[14px]">Show {v.passes.length > 1 ? "these QR codes" : "this QR code"} at VIP check-in, or give your name. {hasCheckinDetails(v.show) ? "Check-in details are above." : "You'll get check-in details, including where and when to arrive, by email before the show."}</p>
              <ul className="grid gap-4">
                {v.passes.map((p, i) => (
                  <li key={p.code} className="overflow-hidden rounded-[20px] bg-navy text-white">
                    <div className="flex items-center justify-between px-5 pt-4">
                      <span className="text-[13px] font-semibold text-[#b7b1cc]">{v.passes.length > 1 ? `Guest ${i + 1} of ${v.passes.length}` : "VIP pass"}</span>
                      <span className="text-[13px] font-bold text-yellow">{v.product.name}</span>
                    </div>
                    <div className="m-4 grid justify-items-center gap-2 rounded-2xl bg-white p-5 text-ink">
                      <div className="w-full max-w-[260px] [&_svg]:h-auto [&_svg]:w-full" aria-label={`QR code for pass ${p.code}`} role="img" dangerouslySetInnerHTML={{ __html: qrs[i] }} />
                      <span className="font-mono text-[22px] font-bold tracking-[0.14em]">{p.code}</span>
                    </div>
                    <div className="px-4 pb-4">
                      <a href={`/order/${holdId}/pass/${p.code}`} download={`vip-pass-${p.code}.png`} className="btn btn-yellow w-full">Save pass to my phone</a>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="help">Tip: on iPhone, open the saved pass and add it to your Photos favorites so it&apos;s one tap away at the door. Brighten your screen when you scan.</p>
              <p className="help">This is a VIP upgrade. Your concert ticket is separate.{v.product.includes_photo ? " Your meet & greet photos will be emailed after the show." : ""}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/${v.artist.handle}`} className="btn btn-ghost">Back to {v.artist.name}</Link>
              <Link href={`/${v.artist.handle}/support?order=${v.order.confirmation_code}`} className="btn btn-ghost">Questions? Contact {v.artist.name}</Link>
            </div>
          </>
        ) : pending ? (
          <div className="card grid justify-items-start gap-3 p-6" role="status">
            <span className="badge b-pending">Confirming payment</span>
            <h1 className="text-[26px]">Almost there</h1>
            <p className="muted">We&apos;re confirming your payment with Stripe. This page updates by itself in a few seconds.</p>
            <p className="help">If you left checkout without paying, nothing was charged. Your spot is held until {new Date(v.hold.expires_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.</p>
            <Link href={`/${v.artist.handle}/${v.show.slug}`} className="btn btn-ghost">Back to the show</Link>
          </div>
        ) : (
          <div className="card grid justify-items-start gap-3 p-6">
            <span className="badge b-neutral">Checkout expired</span>
            <h1 className="text-[26px]">This checkout has expired</h1>
            <p className="muted">Nothing was charged. If there are still spots left, you can start again.</p>
            <Link href={`/${v.artist.handle}/${v.show.slug}`} className="btn">Back to {v.artist.name}</Link>
          </div>
        )}
      </main>
      <ArtistDisclaimer name={v.artist.name} handle={v.artist.handle} order={v.order?.confirmation_code} />
    </div>
  );
}
