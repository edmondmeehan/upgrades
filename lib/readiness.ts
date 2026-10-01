import type { SupabaseClient } from "@supabase/supabase-js";

export type Blocker = { key: string; label: string; href: string; cta: string };

/** Why fans can't buy from this artist right now (empty = nothing blocking at the account level). */
export async function sellingBlockers(supabase: SupabaseClient, artistId: string, status: string): Promise<Blocker[]> {
  const base = `/a/${artistId}`;
  const { data: pay } = await supabase.from("artist_stripe").select("charges_enabled, details_submitted").eq("artist_id", artistId).maybeSingle();
  const out: Blocker[] = [];
  if (status === "draft" || status === "rejected") out.push({ key: "verify", label: "Your account isn't verified yet", href: `${base}/verification`, cta: "Get verified" });
  else if (status === "pending") out.push({ key: "review", label: "P&T is reviewing your verification (usually within a business day)", href: `${base}/verification`, cta: "See status" });
  else if (status === "suspended") out.push({ key: "suspended", label: "Your storefront is offline; contact P&T", href: `${base}/settings`, cta: "Details" });
  if (!pay?.charges_enabled) out.push({ key: "stripe", label: pay?.details_submitted ? "Stripe is still reviewing your payout details" : "Payouts aren't set up, so you can't take payments", href: `${base}/payments`, cta: "Set up payouts" });
  return out;
}
