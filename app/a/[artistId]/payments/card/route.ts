import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { requireArtist } from "@/lib/auth";
import { getStripe, saveCard, type ArtistStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// Stripe Checkout (setup mode) returns here once the artist has saved a card.
export async function GET(req: NextRequest, { params }: { params: Promise<{ artistId: string }> }) {
  const { artistId } = await params;
  await requireArtist(artistId, ["owner"]);
  const url = new URL(req.url);
  const dest = new URL(`/a/${artistId}/payments`, url.origin);
  const sessionId = url.searchParams.get("session_id");
  const stripe = getStripe(), db = createAdminClient();
  try {
    if (!stripe || !db || !sessionId) throw new Error("missing");
    const { data: row } = await db.from("artist_stripe").select("customer_id").eq("artist_id", artistId).maybeSingle<Pick<ArtistStripe, "customer_id">>();
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["setup_intent.payment_method"] });
    if (!row?.customer_id || session.customer !== row.customer_id || session.metadata?.artist_id !== artistId) throw new Error("mismatch");
    const si = session.setup_intent as Stripe.SetupIntent;
    const pm = si.payment_method as Stripe.PaymentMethod;
    await stripe.customers.update(row.customer_id, { invoice_settings: { default_payment_method: pm.id } });
    await saveCard(artistId, row.customer_id, pm);
    dest.searchParams.set("ok", `Card ending in ${pm.card?.last4 ?? "****"} saved.`);
  } catch (e) {
    console.error("[stripe] card", e);
    dest.searchParams.set("err", "We couldn't confirm that card. Try again.");
  }
  return NextResponse.redirect(dest);
}
