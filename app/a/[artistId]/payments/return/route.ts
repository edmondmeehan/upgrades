import { NextResponse, type NextRequest } from "next/server";
import { requireArtist } from "@/lib/auth";
import { getStripe, saveAccount, type ArtistStripe } from "@/lib/stripe";
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
    if (data?.stripe_account_id) {
      try {
        const a = await stripe.accounts.retrieve(data.stripe_account_id);
        await saveAccount(artistId, a);
        dest.searchParams.set(url.searchParams.get("refresh") ? "err" : "ok",
          url.searchParams.get("refresh") ? "That setup link expired. Click Continue setup to pick up where you left off."
            : a.charges_enabled && a.payouts_enabled ? "You're set up to get paid." : "Saved. Stripe still needs a few details from you.");
      } catch (e) { console.error("[stripe] return", e); }
    }
  }
  return NextResponse.redirect(dest);
}
