import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArtist } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { formatDate } from "@/lib/util";
import { dollars } from "@/lib/packages";
import { refundOrderAction, voidPassAction, cancelShowAndRefund } from "./actions";

export const metadata = { title: "Orders" };
export const dynamic = "force-dynamic";
export const maxDuration = 300; // cancelling a big show refunds many orders

type P = { params: Promise<{ artistId: string; showId: string }>; searchParams: Promise<{ ok?: string; err?: string; q?: string }> };
type Row = {
  id: string; status: string; total_cents: number; created_at: string; confirmation_code: string; fans: { name: string | null; email: string; marketing_opt_in_at: string | null } | null;
  order_items: { id: string; quantity: number; refunded_quantity: number; unit_price_cents: number; show_products: { products: { name: string } } | null;
    passes: { id: string; code: string; checked_in_at: string | null; voided_at: string | null }[] }[];
  refunds: { amount_cents: number; created_at: string }[];
};
const BADGE: Record<string, [string, string]> = {
  paid: ["Paid", "b-published"], partially_refunded: ["Partly refunded", "b-pending"], refunded: ["Refunded", "b-neutral"], disputed: ["Disputed", "b-rejected"],
};

export default async function Orders({ params, searchParams }: P) {
  const { artistId, showId } = await params;
  const { ok, err, q } = await searchParams;
  const { supabase, role } = await requireArtist(artistId, ["owner", "rep"]);
  const canRefund = role === "owner" || role === "admin";
  const { data: show } = await supabase.from("shows").select("id, show_date, city, region, venue_name, status, tour_id").eq("id", showId).eq("artist_id", artistId).maybeSingle();
  if (!show) notFound();
  const { data } = await supabase.from("orders")
    .select("id, status, total_cents, created_at, confirmation_code, fans(name, email, marketing_opt_in_at), order_items(id, quantity, refunded_quantity, unit_price_cents, show_products(products(name)), passes(id, code, checked_in_at, voided_at)), refunds(amount_cents, created_at)")
    .eq("show_id", showId).eq("is_sample", false).order("created_at", { ascending: false }).returns<Row[]>();
  const term = (q ?? "").trim().toLowerCase();
  const orders = (data ?? []).filter((o) => !term || [o.fans?.name, o.fans?.email, o.confirmation_code].some((v) => v?.toLowerCase().includes(term)));
  const all = data ?? [];
  const paid = all.filter((o) => o.status !== "refunded");
  const gross = all.reduce((n, o) => n + o.total_cents - o.refunds.reduce((m, r) => m + r.amount_cents, 0), 0);
  const where = `${show.city ?? "Show"}${show.region ? `, ${show.region}` : ""}`;

  return (
    <div className="grid max-w-5xl gap-6">
      <PageHead crumbs={[{ href: `/a/${artistId}/tours/${show.tour_id}`, label: "Tour" }, { href: `/a/${artistId}/shows/${showId}`, label: where }]} title="Orders">
        {formatDate(show.show_date)}{show.venue_name ? `, ${show.venue_name}` : ""}. {paid.length} active order{paid.length === 1 ? "" : "s"}, {dollars(gross)} collected after refunds.
      </PageHead>
      <Flash ok={ok} err={err} />

      <form className="flex gap-2" role="search">
        <input name="q" defaultValue={q ?? ""} className="input flex-1" placeholder="Search name, email or confirmation number" aria-label="Search orders" />
        <button className="btn btn-ghost">Search</button>
      </form>

      {orders.length === 0 ? <p className="card px-4 py-12 text-center muted">{all.length ? "No orders match." : "No orders for this show yet."}</p> : (
        <ul className="grid gap-3">
          {orders.map((o) => {
            const refunded = o.refunds.reduce((n, r) => n + r.amount_cents, 0);
            const passes = o.order_items.flatMap((i) => i.passes.map((p) => ({ ...p, pkg: i.show_products?.products.name ?? "VIP" })));
            const validPasses = passes.filter((p) => !p.voided_at).length;
            const refundablePasses = o.order_items.reduce((n, i) => n + i.quantity - i.refunded_quantity, 0);
            // Partly refunded in Stripe without saying which pass: the artist chooses which to void.
            const needsReview = o.status === "partially_refunded" && validPasses > refundablePasses;
            const [label, cls] = BADGE[o.status] ?? [o.status, "b-neutral"];
            return (
              <li key={o.id} className="card grid gap-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold">{o.fans?.name ?? o.fans?.email ?? "Guest"} <span className="font-medium text-mute">{o.fans?.email}</span>
                      {o.fans?.marketing_opt_in_at && <span className="badge b-lilac ml-2 align-middle">Opted in to news</span>}</p>
                    <p className="help"><span className="font-mono">{o.confirmation_code}</span>, {new Date(o.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })},{" "}
                      {o.order_items.map((i) => `${i.show_products?.products.name ?? "VIP"} x ${i.quantity}`).join(", ")}</p>
                  </div>
                  <div className="text-right">
                    <span className={`badge ${cls}`}>{label}</span>
                    <p className="mt-1 font-extrabold tabular-nums">{dollars(o.total_cents)}</p>
                    {refunded > 0 && <p className="help">{dollars(refunded)} refunded</p>}
                  </div>
                </div>

                <ul className="flex flex-wrap gap-2">
                  {passes.map((p) => (
                    <li key={p.id} className={`flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-semibold ${p.voided_at ? "bg-paper text-mute line-through" : p.checked_in_at ? "bg-[#d6f1ec] text-ok" : "bg-paper"}`}>
                      <span className="font-mono">{p.code}</span>{p.checked_in_at ? "checked in" : p.voided_at ? "void" : ""}
                      {needsReview && !p.voided_at && !p.checked_in_at && (
                        <form action={voidPassAction.bind(null, artistId, showId, p.id)}><button className="font-bold text-rope underline">Void</button></form>
                      )}
                    </li>
                  ))}
                </ul>
                {needsReview && <p className="alert alert-yellow !text-[13px]">Part of this order was refunded in Stripe. Void the pass{refundablePasses === validPasses - 1 ? "" : "es"} that {refundablePasses === validPasses - 1 ? "was" : "were"} refunded so {refundablePasses === validPasses - 1 ? "it can't" : "they can't"} be used at the door.</p>}

                {canRefund && o.status !== "refunded" && o.status !== "disputed" && (
                  <details className="rounded-2xl bg-paper p-4">
                    <summary className="cursor-pointer text-[14px] font-bold">Refund</summary>
                    <form action={refundOrderAction.bind(null, artistId, showId, o.id)} className="mt-3 grid gap-3">
                      <label className="flex items-center gap-2 text-[14px]"><input type="radio" name="scope" value="all" defaultChecked className="check" />Everything left on the order ({dollars(o.total_cents - refunded)})</label>
                      {refundablePasses > 1 && (
                        <div className="grid gap-2">
                          <label className="flex items-center gap-2 text-[14px]"><input type="radio" name="scope" value="some" className="check" />Only some passes</label>
                          {o.order_items.filter((i) => i.quantity > i.refunded_quantity).map((i) => (
                            <label key={i.id} className="ml-7 flex items-center gap-2 text-[14px]">
                              <select name={`qty_${i.id}`} className="input input-sm !w-20" defaultValue="0">{Array.from({ length: i.quantity - i.refunded_quantity + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}</select>
                              of {i.quantity - i.refunded_quantity} {i.show_products?.products.name} ({dollars(i.unit_price_cents)} each, plus its share of the service fee)
                            </label>
                          ))}
                        </div>
                      )}
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="field"><span className="!text-[12px]">Reason</span>
                          <select name="reason" className="input input-sm"><option value="fan_request">Fan asked for a refund</option><option value="cant_attend">Fan can&apos;t attend</option><option value="artist_change">Change on our side</option><option value="duplicate">Duplicate order</option><option value="other">Other</option></select></label>
                        <label className="field"><span className="!text-[12px]">Note to the fan (optional)</span><input name="note" maxLength={500} className="input input-sm" /></label>
                      </div>
                      <p className="help">The fan gets their money back to their card, including the service fee for refunded passes, and an email. Refunded passes stop working at check-in. Card processing fees aren&apos;t returned by Stripe.</p>
                      <div><SubmitButton variant="danger" size="sm" pendingText="Refunding…" confirm="Refund this order? This can't be undone.">Refund</SubmitButton></div>
                    </form>
                  </details>
                )}
                {o.status === "disputed" && <p className="help">This charge is disputed. Respond in your Stripe dashboard; the order updates here when Stripe closes the dispute.</p>}
              </li>
            );
          })}
        </ul>
      )}

      {canRefund && show.status !== "cancelled" && paid.length > 0 && (
        <section className="panel grid gap-3 !border-[#f3c9bd]">
          <h2>Cancel show and refund everyone</h2>
          <p className="muted">Refunds all {paid.length} active order{paid.length === 1 ? "" : "s"} in full, emails each fan, voids their passes, and takes the show off your storefront.</p>
          <form action={cancelShowAndRefund.bind(null, artistId, showId)} className="grid gap-3">
            <label className="field"><span>Message to fans (optional)</span><textarea name="note" maxLength={500} className="input" placeholder="We're so sorry: due to illness, tonight's show is cancelled. We'll announce a new date soon." /></label>
            <label className="field"><span>Type CANCEL to confirm</span><input name="confirm" className="input max-w-xs uppercase" autoComplete="off" required /></label>
            <div><SubmitButton variant="danger" pendingText="Refunding everyone…" confirm={`Cancel this show and refund ${paid.length} order${paid.length === 1 ? "" : "s"}?`}>Cancel show and refund everyone</SubmitButton></div>
          </form>
        </section>
      )}
      <p><Link href={`/a/${artistId}/shows/${showId}`}>Back to the show</Link></p>
    </div>
  );
}
