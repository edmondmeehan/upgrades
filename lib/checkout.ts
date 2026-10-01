import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, siteUrl } from "@/lib/email";
import { dollars } from "@/lib/packages";
import { SHOW_CHECKIN_COLUMNS, checkinNotes, checkinRows, hasCheckinDetails, mapsUrl, type CheckinShow } from "@/lib/checkinEmail";

export type OrderView = {
  hold: { id: string; show_id: string; status: string; quantity: number; unit_price_cents: number; service_fee_cents: number; stripe_account_id: string; stripe_session_id: string | null; order_id: string | null; expires_at: string };
  artist: { name: string; handle: string };
  show: CheckinShow & { slug: string };
  product: { name: string; includes_photo: boolean; included: string[] };
  pkgCheckin: { time: string | null; notes: string | null };
  order: { id: string; confirmation_code: string; total_cents: number; created_at: string; fans: { email: string; name: string | null } | null } | null;
  passes: { code: string }[];
  photos: { url: string } | null; // gallery link, once the artist has sent photos
};

/** Everything the order page and confirmation email need, read with the service role (the hold id is the secret). */
export async function loadOrder(holdId: string): Promise<OrderView | null> {
  const db = createAdminClient();
  if (!db || !/^[0-9a-f-]{36}$/i.test(holdId)) return null;
  const { data: hold } = await db.from("checkout_holds").select("*").eq("id", holdId).maybeSingle();
  if (!hold) return null;
  const [{ data: artist }, { data: show }, { data: sp }] = await Promise.all([
    db.from("artists").select("name, handle").eq("id", hold.artist_id).single(),
    db.from("shows").select(`slug, ${SHOW_CHECKIN_COLUMNS}`).eq("id", hold.show_id).single(),
    db.from("show_products").select("checkin_time, checkin_notes, products(name, includes_photo, included)").eq("id", hold.show_product_id).single(),
  ]);
  let order = null, passes: { code: string }[] = [];
  if (hold.order_id) {
    const { data: o } = await db.from("orders").select("id, confirmation_code, total_cents, created_at, fans(email, name)").eq("id", hold.order_id).single();
    order = o as OrderView["order"];
    const { data: items } = await db.from("order_items").select("id").eq("order_id", hold.order_id);
    const { data: ps } = await db.from("passes").select("code").in("order_item_id", (items ?? []).map((i) => i.id)).is("voided_at", null).order("code");
    passes = ps ?? [];
  }
  let photos: OrderView["photos"] = null;
  if (order) {
    const { data: g } = await db.from("photo_galleries").select("token, first_sent_at").eq("show_id", hold.show_id).maybeSingle();
    if (g?.first_sent_at) photos = { url: `/photos/${g.token}?o=${order.confirmation_code}` };
  }
  const spx = sp as unknown as { checkin_time: string | null; checkin_notes: string | null; products: OrderView["product"] };
  return { hold, artist: artist!, show: show as unknown as OrderView["show"], product: spx.products, pkgCheckin: { time: spx.checkin_time, notes: spx.checkin_notes }, order, passes, photos };
}

/**
 * Turns a paid Checkout session (on the artist's connected account) into an order.
 * Called from the success page and from the webhook; safe to run twice.
 */
export async function fulfillSession(session: Stripe.Checkout.Session, accountId: string) {
  const stripe = getStripe(), db = createAdminClient();
  if (!stripe || !db) throw new Error("not configured");
  const holdId = session.metadata?.hold_id ?? session.client_reference_id;
  if (!holdId || session.mode !== "payment" || session.payment_status !== "paid") return null;

  const { data: before } = await db.from("checkout_holds").select("order_id").eq("id", holdId).maybeSingle();
  if (before?.order_id) return before.order_id as string;

  const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!piId) return null;
  const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge.balance_transaction"] }, { stripeAccount: accountId });
  const charge = pi.latest_charge as Stripe.Charge | null;
  const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null | undefined;
  const appFee = typeof charge?.application_fee === "string" ? charge.application_fee : charge?.application_fee?.id ?? null;
  // Stripe's processing fee only (the balance transaction fee also includes P&T's application fee).
  const stripeFee = bt ? (bt.fee_details ?? []).filter((f) => f.type === "stripe_fee").reduce((a, f) => a + f.amount, 0) : 0;

  const { data: orderId, error } = await db.rpc("fulfill_checkout", {
    p_hold: holdId, p_email: session.customer_details?.email ?? session.customer_email ?? "unknown@example.com",
    p_name: session.customer_details?.name ?? null, p_payment_intent: pi.id, p_charge: charge?.id ?? null,
    p_application_fee: appFee, p_stripe_fee: stripeFee, p_total: session.amount_total ?? null,
    p_postal: session.customer_details?.address?.postal_code ?? null,
  });
  if (error) throw error;
  await sendConfirmation(holdId).catch((e) => console.error("[checkout] confirmation email", e));
  return orderId as string;
}

async function sendConfirmation(holdId: string) {
  const v = await loadOrder(holdId);
  if (!v?.order?.fans?.email) return;
  const date = new Date(`${v.show.show_date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const city = `${v.show.city ?? ""}${v.show.region ? `, ${v.show.region}` : ""}`;
  const db = createAdminClient();
  const { data: sup } = db ? await db.from("artists").select("support_email").eq("handle", v.artist.handle).single<{ support_email: string | null }>() : { data: null };
  // Bought after the check-in email went out: put the check-in details in this email instead.
  const late = !!v.show.checkin_sent_at && hasCheckinDetails(v.show);
  const pkg = [{ name: v.product.name, qty: v.hold.quantity, time: v.pkgCheckin.time, notes: v.pkgCheckin.notes }];
  await sendEmail({
    to: v.order.fans.email,
    replyTo: sup?.support_email ?? undefined,
    subject: `You're going VIP: ${v.artist.name} in ${v.show.city} (${v.order.confirmation_code})`,
    eyebrow: "Order confirmed",
    title: `You're going VIP, ${v.order.fans.name?.split(" ")[0] ?? "friend"}`,
    preheader: `${v.product.name} for ${v.artist.name}, ${date}`,
    body: [`Thanks for your order. Here's what you've got for ${v.artist.name} in ${city}.`,
      ...(late ? ["Check-in details for the show are below.", ...checkinNotes(v.show, pkg)] : [])],
    details: [
      ["Confirmation number", v.order.confirmation_code],
      ["Package", `${v.product.name}${v.hold.quantity > 1 ? ` x ${v.hold.quantity}` : ""}`],
      ["Show", `${date}, ${city}`],
      ["Venue", v.show.venue_name ?? "TBA"],
      ["Total paid", dollars(v.order.total_cents)],
      [v.passes.length > 1 ? "Pass codes" : "Pass code", v.passes.map((p) => p.code).join(", ")],
      ...(late ? [...checkinRows(v.show, pkg).filter(([k]) => k !== "Date" && k !== "Venue"), ["Directions", mapsUrl(v.show)] as [string, string]] : []),
    ],
    images: v.passes.map((p, i) => ({ src: `${siteUrl()}/qr/${p.code}.png`, alt: `QR code for pass ${p.code}`, caption: v.passes.length > 1 ? `${p.code}  (guest ${i + 1})` : p.code })),
    button: { label: "View your passes", url: `${siteUrl()}/order/${holdId}` },
    footnote: `Questions about your order? Contact the ${v.artist.name} team at ${siteUrl()}/${v.artist.handle}/support or just reply to this email. Lost this email? Find your order any time at upgrades.ontour.vip/find-order with your confirmation number and last name. Show the QR code at VIP check-in. You can also save each pass as an image from your order page. Check-in details, including where and when to arrive, will be emailed a few days before the show. This is a VIP upgrade; your concert ticket is separate.`,
  });
  if (late && db) await db.from("checkin_emails").insert({ show_id: v.hold.show_id, order_id: v.order.id, kind: "details" });

}
