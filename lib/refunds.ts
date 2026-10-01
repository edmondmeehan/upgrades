import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, siteUrl } from "@/lib/email";
import { dollars } from "@/lib/packages";

type Item = { id: string; quantity: number; refunded_quantity: number; unit_price_cents: number; name: string };
type OrderRow = {
  id: string; artist_id: string; show_id: string; status: string; subtotal_cents: number; service_fee_cents: number; total_cents: number;
  stripe_charge_id: string | null; confirmation_code: string; fans: { email: string; name: string | null } | null;
};

async function loadForRefund(orderId: string) {
  const db = createAdminClient()!;
  const { data: o } = await db.from("orders").select("id, artist_id, show_id, status, subtotal_cents, service_fee_cents, total_cents, stripe_charge_id, confirmation_code, fans(email, name)")
    .eq("id", orderId).single<OrderRow>();
  if (!o) return null;
  const [{ data: items }, { data: refunds }, { data: st }, { data: show }, { data: artist }, { data: hold }] = await Promise.all([
    db.from("order_items").select("id, quantity, refunded_quantity, unit_price_cents, show_products(products(name))").eq("order_id", orderId),
    db.from("refunds").select("amount_cents, service_fee_refunded_cents").eq("order_id", orderId),
    db.from("artist_stripe").select("stripe_account_id").eq("artist_id", o.artist_id).single(),
    db.from("shows").select("show_date, city, region").eq("id", o.show_id).single(),
    db.from("artists").select("name, handle, support_email").eq("id", o.artist_id).single(),
    db.from("checkout_holds").select("id").eq("order_id", orderId).maybeSingle(),
  ]);
  const its: Item[] = ((items ?? []) as unknown as { id: string; quantity: number; refunded_quantity: number; unit_price_cents: number; show_products: { products: { name: string } } }[])
    .map((i) => ({ id: i.id, quantity: i.quantity, refunded_quantity: i.refunded_quantity, unit_price_cents: i.unit_price_cents, name: i.show_products.products.name }));
  const refunded = (refunds ?? []).reduce((n, r) => n + r.amount_cents, 0);
  const feeRefunded = (refunds ?? []).reduce((n, r) => n + r.service_fee_refunded_cents, 0);
  return { db, o, items: its, refunded, feeRefunded, account: st?.stripe_account_id as string | undefined, show, artist, holdId: hold?.id as string | undefined };
}

/** Refunds a whole order (items = null) or some passes, through Stripe, then records it and emails the fan. */
export async function refundOrder(orderId: string, opts: { items: { item_id: string; qty: number }[] | null; reason: string; issuedBy: string | null; notify?: boolean; note?: string }) {
  const stripe = getStripe();
  const r = await loadForRefund(orderId);
  if (!stripe || !r) return { ok: false, error: "Order not found." };
  const { db, o, items, refunded, feeRefunded, account } = r;
  if (!o.stripe_charge_id || !account) return { ok: false, error: "This order has no Stripe charge to refund." };
  const remaining = o.total_cents - refunded;
  if (remaining <= 0 || o.status === "refunded") return { ok: false, error: "This order is already fully refunded." };

  let amount: number, fee: number, picked = opts.items;
  if (!picked) { amount = remaining; fee = o.service_fee_cents - feeRefunded; }
  else {
    picked = picked.map((p) => { const it = items.find((i) => i.id === p.item_id); return it ? { item_id: it.id, qty: Math.min(p.qty, it.quantity - it.refunded_quantity) } : null; })
      .filter((p): p is { item_id: string; qty: number } => !!p && p.qty > 0);
    if (!picked.length) return { ok: false, error: "Pick at least one pass to refund." };
    const goods = picked.reduce((n, p) => n + items.find((i) => i.id === p.item_id)!.unit_price_cents * p.qty, 0);
    fee = o.subtotal_cents ? Math.round(o.service_fee_cents * goods / o.subtotal_cents) : 0;
    amount = Math.min(remaining, goods + fee);
    // Refunding every remaining pass is a full refund.
    if (items.every((i) => (picked!.find((p) => p.item_id === i.id)?.qty ?? 0) + i.refunded_quantity >= i.quantity)) { picked = null; amount = remaining; fee = o.service_fee_cents - feeRefunded; }
  }

  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create({
      charge: o.stripe_charge_id, amount, refund_application_fee: true, reason: "requested_by_customer",
      metadata: { order_id: o.id, source: "upgrades", reason: opts.reason.slice(0, 200) },
    }, { stripeAccount: account, idempotencyKey: `ontour-refund-${o.id}-${refunded}-${amount}` });
  } catch (e) {
    return { ok: false, error: `Stripe couldn't refund this: ${(e as Error).message?.slice(0, 160)}` };
  }
  const { data, error } = await db.rpc("record_refund", {
    p_charge: o.stripe_charge_id, p_refund_id: refund.id, p_amount: amount, p_fee_refunded: Math.max(0, fee), p_reason: opts.reason, p_issued_by: opts.issuedBy,
    p_items: picked ?? null,
  });
  if (error) console.error("[refund] record", error);
  if (opts.notify !== false) await emailRefund(r, amount, picked, opts.note).catch((e) => console.error("[refund] email", e));
  return { ok: true, amount, status: (data as { status?: string } | null)?.status };
}

async function emailRefund(r: NonNullable<Awaited<ReturnType<typeof loadForRefund>>>, amount: number, picked: { item_id: string; qty: number }[] | null, note?: string) {
  if (!r.o.fans?.email || !r.artist || !r.show) return;
  const date = new Date(`${r.show.show_date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const what = picked ? picked.map((p) => `${p.qty} x ${r.items.find((i) => i.id === p.item_id)?.name}`).join(", ") : "your whole order";
  await sendEmail({
    to: r.o.fans.email, replyTo: r.artist.support_email ?? undefined,
    subject: `Refund for your ${r.artist.name} order (${r.o.confirmation_code})`,
    eyebrow: "Refund", title: `${dollars(amount)} is on its way back`,
    body: [
      ...(note ? [note] : []),
      `We've refunded ${dollars(amount)} for ${what} for ${r.artist.name} in ${r.show.city}${r.show.region ? `, ${r.show.region}` : ""} on ${date}.`,
      "Refunds go back to the card you paid with and usually show up within 5 to 10 business days, depending on your bank.",
      ...(picked ? ["Your other passes on this order still work."] : ["The passes on this order are no longer valid."]),
    ],
    details: [["Confirmation number", r.o.confirmation_code], ["Refunded", dollars(amount)]],
    ...(picked && r.holdId ? { button: { label: "View your order", url: `${siteUrl()}/order/${r.holdId}` } } : {}),
    footnote: `Questions? Reply to this email to reach the ${r.artist.name} team.`,
  });
}

/** Webhook: a charge on an artist's account was refunded (possibly directly in Stripe). Records any refund we don't have yet. */
export async function syncChargeRefunds(charge: Stripe.Charge, accountId: string) {
  const stripe = getStripe(), db = createAdminClient();
  if (!stripe || !db) return;
  const refunds = charge.refunds?.data?.length ? charge.refunds.data
    : (await stripe.refunds.list({ charge: charge.id, limit: 100 }, { stripeAccount: accountId })).data;
  // P&T's fee refunded so far lives on the application fee in the platform account.
  let feeRefundedTotal = 0;
  const appFeeId = typeof charge.application_fee === "string" ? charge.application_fee : charge.application_fee?.id;
  if (appFeeId) { try { feeRefundedTotal = (await stripe.applicationFees.retrieve(appFeeId)).amount_refunded; } catch { /* leave 0 */ } }
  const { data: order } = await db.from("orders").select("id").eq("stripe_charge_id", charge.id).maybeSingle();
  if (!order) return;
  for (const rf of refunds.filter((x) => x.status === "succeeded" || x.status === "pending").sort((a, b) => a.created - b.created)) {
    const { data: done } = await db.from("refunds").select("id").eq("stripe_refund_id", rf.id).maybeSingle();
    if (done) continue;
    const { data: prev } = await db.from("refunds").select("service_fee_refunded_cents").eq("order_id", order.id);
    const already = (prev ?? []).reduce((n, p) => n + p.service_fee_refunded_cents, 0);
    await db.rpc("record_refund", {
      p_charge: charge.id, p_refund_id: rf.id, p_amount: rf.amount, p_fee_refunded: Math.max(0, feeRefundedTotal - already),
      p_reason: rf.reason ?? "refunded in Stripe", p_issued_by: null, p_items: null,
    });
  }
}

/** Webhook: a dispute opened, changed, or closed on an artist's account. */
export async function syncDispute(dispute: Stripe.Dispute, accountId: string, opened: boolean) {
  const db = createAdminClient();
  if (!db) return;
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
  const fee = (dispute.balance_transactions ?? []).reduce((n, bt) => n + (bt.fee ?? 0), 0);
  const status = dispute.status === "won" ? "won" : dispute.status === "lost" ? "lost" : "open";
  const { data } = await db.rpc("record_dispute", {
    p_charge: chargeId, p_dispute_id: dispute.id, p_amount: dispute.amount, p_fee: fee, p_status: status, p_reason: dispute.reason, p_fee_reversed: 0,
  });
  if (!opened) return;
  // Tell the artist: they have to respond in Stripe, and check-in records are good evidence.
  const orderId = (data as { order_id?: string } | null)?.order_id;
  if (!orderId) return;
  const { data: o } = await db.from("orders").select("artist_id, show_id, confirmation_code").eq("id", orderId).single();
  if (!o) return;
  const [{ data: artist }, { data: owner }, { data: inPasses }] = await Promise.all([
    db.from("artists").select("name, support_email").eq("id", o.artist_id).single(),
    db.from("artist_members").select("profiles(email)").eq("artist_id", o.artist_id).eq("role", "owner").limit(1).maybeSingle(),
    db.from("passes").select("checked_in_at, order_items!inner(order_id)").eq("order_items.order_id", orderId).not("checked_in_at", "is", null),
  ]);
  const to = artist?.support_email ?? (owner as unknown as { profiles: { email: string } } | null)?.profiles?.email;
  if (!to) return;
  const due = dispute.evidence_details?.due_by ? new Date(dispute.evidence_details.due_by * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : null;
  await sendEmail({
    to, subject: `A fan disputed a charge (${o.confirmation_code})`,
    eyebrow: "Dispute", title: "A fan disputed a VIP charge",
    body: [
      `The bank for order ${o.confirmation_code} opened a dispute for ${dollars(dispute.amount)} (reason: ${dispute.reason.replace(/_/g, " ")}).`,
      `Respond in your Stripe dashboard${due ? ` by ${due}` : ""} or the fan keeps the money and Stripe adds a dispute fee.`,
      (inPasses?.length ?? 0) > 0
        ? `Good news for your case: ${inPasses!.length} pass${inPasses!.length === 1 ? " was" : "es were"} checked in at the show. Mention the check-in time as evidence.`
        : "Include the order confirmation and anything showing the fan was told what the package includes.",
    ],
    button: { label: "Open Stripe disputes", url: "https://dashboard.stripe.com/disputes" },
    footnote: "OnTour Upgrades keeps the order marked as disputed until Stripe closes it.",
  });
}
