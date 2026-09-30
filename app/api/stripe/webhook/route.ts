import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, saveAccount, saveCard } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Receives events from P&T's Stripe account and from connected (artist) accounts.
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const db = createAdminClient();
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter(Boolean) as string[];
  if (!stripe || !db || secrets.length === 0) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  let event: Stripe.Event | null = null;
  for (const s of secrets) {
    try { event = stripe.webhooks.constructEvent(body, sig, s); break; } catch { /* try the next secret */ }
  }
  if (!event) return NextResponse.json({ error: "bad signature" }, { status: 400 });

  try {
    if (event.type === "account.updated") {
      const a = event.data.object as Stripe.Account;
      const artistId = a.metadata?.artist_id
        ?? (await db.from("artist_stripe").select("artist_id").eq("stripe_account_id", a.id).maybeSingle()).data?.artist_id;
      if (artistId) await saveAccount(artistId, a);
    }
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.mode === "setup" && s.metadata?.purpose === "card_on_file" && s.metadata.artist_id && typeof s.customer === "string") {
        const si = await stripe.setupIntents.retrieve(s.setup_intent as string, { expand: ["payment_method"] });
        const pm = si.payment_method as Stripe.PaymentMethod;
        await stripe.customers.update(s.customer, { invoice_settings: { default_payment_method: pm.id } });
        await saveCard(s.metadata.artist_id, s.customer, pm);
      }
    }
  } catch (e) {
    console.error("[stripe webhook]", event.type, e);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
