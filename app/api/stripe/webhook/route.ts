import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, retrieveAccount, saveAccount, saveCard } from "@/lib/stripe";
import { fulfillSession } from "@/lib/checkout";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const accountEventsSecret = () => process.env.STRIPE_ACCOUNT_EVENTS_WEBHOOK_SECRET || process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

/**
 * One endpoint, two Stripe event destinations:
 *  - snapshot events from P&T's account (card on file) signed with STRIPE_WEBHOOK_SECRET
 *  - snapshot events from artists' connected accounts (fan checkout) signed with STRIPE_CONNECT_WEBHOOK_SECRET
 *  - thin Accounts v2 events (v2.core.account...) signed with STRIPE_ACCOUNT_EVENTS_WEBHOOK_SECRET
 */
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const db = createAdminClient();
  if (!stripe || !db) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  let isThin = false;
  try { isThin = (JSON.parse(body) as { object?: string }).object === "v2.core.event"; } catch { /* not JSON */ }

  try {
    if (isThin) {
      const secret = accountEventsSecret();
      if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
      let note: Stripe.V2.Core.EventNotification;
      try { note = stripe.parseEventNotification(body, sig, secret); } catch { return NextResponse.json({ error: "bad signature" }, { status: 400 }); }
      const related = (note as { related_object?: { id: string; type: string } }).related_object;
      if (note.type.startsWith("v2.core.account") && related?.type === "v2.core.account") {
        const account = await retrieveAccount(related.id);
        const artistId = account.metadata?.artist_id
          ?? (await db.from("artist_stripe").select("artist_id").eq("stripe_account_id", account.id).maybeSingle()).data?.artist_id;
        if (artistId) await saveAccount(artistId, account);
      }
      return NextResponse.json({ received: true });
    }

    const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter(Boolean) as string[];
    if (secrets.length === 0) return NextResponse.json({ error: "not configured" }, { status: 503 });
    let event: Stripe.Event | null = null;
    for (const secret of secrets) { try { event = stripe.webhooks.constructEvent(body, sig, secret); break; } catch { /* try the next secret */ } }
    if (!event) return NextResponse.json({ error: "bad signature" }, { status: 400 });

    // Fan checkout on an artist's connected account.
    if (event.account && (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded")) {
      await fulfillSession(event.data.object as Stripe.Checkout.Session, event.account);
      return NextResponse.json({ received: true });
    }
    if (event.account && event.type === "checkout.session.expired") {
      await db.rpc("release_checkout_hold", { p_session: (event.data.object as Stripe.Checkout.Session).id });
      return NextResponse.json({ received: true });
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
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("[stripe webhook]", e);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
}
