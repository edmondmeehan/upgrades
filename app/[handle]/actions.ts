"use server";
import { redirect } from "next/navigation";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/email";

type Hold = { hold_id: string; quantity: number; unit_price_cents: number; service_fee_cents: number; stripe_account_id: string;
  artist_name: string; handle: string; show_slug: string; product_name: string; image_url: string | null;
  city: string | null; region: string | null; venue: string | null; show_date: string };

/** Fan clicks Get VIP: reserve the units, then send them to Stripe Checkout on the artist's account. */
export async function startCheckout(fd: FormData) {
  const handle = String(fd.get("handle") ?? ""), slug = String(fd.get("slug") ?? ""), sp = String(fd.get("sp") ?? "");
  const back = (msg: string) => `/${handle}/${slug}?err=${encodeURIComponent(msg)}&pkg=${sp}#p-${sp}`;
  const stripe = getStripe(), db = createAdminClient();
  if (!stripe || !db) redirect(back("Checkout isn't available right now. Try again soon."));

  const qty = Math.floor(Number(fd.get("qty") ?? 1));
  const { data, error } = await db.rpc("create_checkout_hold", { p_show_product: sp, p_qty: qty, p_code: String(fd.get("code") ?? "") || null });
  if (error || !data) redirect(back(error?.message?.replace(/^.*?: /, "") || "Something went wrong. Try again."));
  const h = data as Hold;

  const date = new Date(`${h.show_date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const where = `${h.city ?? ""}${h.region ? `, ${h.region}` : ""}`;
  let url: string;
  try {
    const line: import("stripe").Stripe.Checkout.SessionCreateParams.LineItem[] = [{
      quantity: h.quantity,
      price_data: {
        currency: "usd", unit_amount: h.unit_price_cents,
        product_data: {
          name: `${h.product_name}: ${h.artist_name}`,
          description: `${date}, ${where}${h.venue ? ` at ${h.venue}` : ""}. VIP upgrade only; concert ticket sold separately.`,
          ...(h.image_url?.startsWith("https://") ? { images: [h.image_url] } : {}),
        },
      },
    }];
    if (h.service_fee_cents > 0) {
      line.push({ quantity: 1, price_data: { currency: "usd", unit_amount: h.service_fee_cents, product_data: { name: "Service fee" } } });
    }
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: line,
      billing_address_collection: "auto", // collects the billing ZIP fans can use to look up their order
      client_reference_id: h.hold_id,
      metadata: { hold_id: h.hold_id, show_product_id: sp },
      payment_intent_data: {
        ...(h.service_fee_cents > 0 ? { application_fee_amount: h.service_fee_cents } : {}), // P&T's service fee (none under some promos)
        description: `${h.product_name} x ${h.quantity}: ${h.artist_name}, ${where} ${h.show_date}`,
        metadata: { hold_id: h.hold_id, show_product_id: sp },
      },
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60, // just past Stripe's 30-minute minimum; the hold lasts 35
      success_url: `${siteUrl()}/order/${h.hold_id}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/${h.handle}/${h.show_slug}#p-${sp}`,
    }, { stripeAccount: h.stripe_account_id, idempotencyKey: `ontour-checkout-${h.hold_id}` });
    await db.rpc("attach_checkout_session", { p_hold: h.hold_id, p_session: session.id });
    url = session.url!;
  } catch (e) {
    console.error("[checkout] session", e);
    redirect(back("Checkout couldn't start. Try again in a moment."));
  }
  redirect(url);
}
