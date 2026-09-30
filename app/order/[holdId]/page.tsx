import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Icon } from "@/components/Icon";
import { getStripe } from "@/lib/stripe";
import { fulfillSession, loadOrder } from "@/lib/checkout";
import { dollars } from "@/lib/packages";
import { formatTime } from "@/lib/util";

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

  return (
    <div className="min-h-screen bg-paper">
      {pending && <meta httpEquiv="refresh" content="4" />}
      <header className="bg-navy">
        <div className="home-wrap flex items-center justify-between py-5">
          <Logo href={`/${v.artist.handle}`} label={`${v.artist.name} upgrades`} />
          <a href="https://help.please.co" className="fan-nav-btn solid"><Icon name="help" size={16} /><span>Fan Support</span></a>
        </div>
      </header>
      <main className="mx-auto grid max-w-[560px] gap-5 px-4 py-8">
        {v.order ? (
          <>
            <div className="card grid gap-4 p-6">
              <span className="badge b-published justify-self-start">Order confirmed</span>
              <h1 className="text-[28px]">You&apos;re going VIP{v.order.fans?.name ? `, ${v.order.fans.name.split(" ")[0]}` : ""}</h1>
              <p className="muted">A confirmation is on its way to {v.order.fans?.email}. Keep this page; it&apos;s your record of the order.</p>
              <dl className="grid gap-2 rounded-2xl bg-paper p-4 text-[15px]">
                {[["Artist", v.artist.name], ["Package", `${v.product.name}${v.hold.quantity > 1 ? ` x ${v.hold.quantity}` : ""}`], ["Show", date], ["Where", `${v.show.venue_name ?? "Venue TBA"}, ${city}`],
                  ...(v.show.doors_time ? [["Doors", formatTime(v.show.doors_time)!]] : []), ["Total paid", dollars(v.order.total_cents)]].map(([k, val]) => (
                  <div key={k} className="grid grid-cols-[96px_1fr] gap-3"><dt className="th pt-0.5">{k}</dt><dd className="font-semibold">{val}</dd></div>
                ))}
              </dl>
              {v.product.included?.length > 0 && (
                <div><p className="eyebrow mb-2">What&apos;s included</p>
                  <ul className="grid gap-1 text-[15px]">{v.product.included.map((i) => <li key={i} className="flex gap-2"><span aria-hidden className="font-bold text-violet">✓</span>{i}</li>)}</ul></div>
              )}
            </div>
            <div className="card grid gap-3 p-6">
              <h2>{v.passes.length > 1 ? "Your passes" : "Your pass"}</h2>
              <p className="muted text-[14px]">Show {v.passes.length > 1 ? "these codes" : "this code"} at VIP check-in. You&apos;ll get check-in details, including where and when to arrive, a few days before the show.</p>
              <ul className="grid gap-2">
                {v.passes.map((p, i) => (
                  <li key={p.code} className="flex items-center justify-between rounded-2xl bg-navy px-5 py-4 text-white">
                    <span className="text-[13px] font-semibold text-[#b7b1cc]">Guest {i + 1}</span>
                    <span className="font-mono text-[22px] font-bold tracking-[0.12em] text-yellow">{p.code}</span>
                  </li>
                ))}
              </ul>
              <p className="help">This is a VIP upgrade. Your concert ticket is separate.{v.product.includes_photo ? " Your meet & greet photos will be emailed after the show." : ""}</p>
            </div>
            <Link href={`/${v.artist.handle}`} className="btn btn-ghost justify-self-start">Back to {v.artist.name}</Link>
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
    </div>
  );
}
