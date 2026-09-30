import { NextResponse, type NextRequest } from "next/server";
import { requireArtist } from "@/lib/auth";
import { getStripe, onboardingLink, saveAccount, type ArtistStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// Stripe sends the artist back here after onboarding (or when the onboarding link expired).
export async function GET(req: NextRequest, { params }: { params: Promise<{ artistId: string }> }) {
  const { artistId } = await params;
  await requireArtist(artistId, ["owner"]);
  const url = new URL(req.url);
  const dest = new URL(`/a/${artistId}/payments`, url.origin);
  const stripe = getStripe(), db = createAdminClient();
  if (stripe && db) {
    const { data } = await db.from("artist_stripe").select("stripe_account_id").eq("artist_id", artistId).maybeSingle<Pick<ArtistStripe, "stripe_account_id">>();
    if (data?.stripe_account_id && url.searchParams.get("refresh")) {
      // The onboarding link expired or was reused: send them straight back to Stripe with a fresh one.
      try { return NextResponse.redirect(await onboardingLink(artistId, data.stripe_account_id)); }
      catch (e) { console.error("[stripe] refresh link", e); }
    }
    if (data?.stripe_account_id) {
      try {
        const a = await stripe.accounts.retrieve(data.stripe_account_id);
        await saveAccount(artistId, a);
        dest.searchParams.set("ok", a.charges_enabled && a.payouts_enabled ? "You're set up to get paid." : "Saved. Stripe still needs a few details from you.");
      } catch (e) { console.error("[stripe] return", e); }
    }
  }
  return NextResponse.redirect(dest);
}
