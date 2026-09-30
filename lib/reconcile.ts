import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";

export type Reconciliation =
  | { state: "no_stripe" }
  | { state: "error"; message: string }
  | { state: "ok" | "gap"; ours: number; stripe: number; diff: number; stripeCount: number; oursCount: number; truncated: boolean; livemode: boolean };

/**
 * Compares P&T's service fees as recorded here (real sales only, net of fee refunds)
 * with application fees Stripe actually collected into the P&T platform account for the same dates.
 */
export async function reconcileFees(supabase: SupabaseClient, fromIso: string, toIso: string): Promise<Reconciliation> {
  const stripe = getStripe();
  if (!stripe) return { state: "no_stripe" };
  const [{ data: orders }, { data: refunds }] = await Promise.all([
    supabase.from("orders").select("service_fee_cents").eq("is_sample", false).gte("created_at", fromIso).lt("created_at", toIso),
    supabase.from("refunds").select("service_fee_refunded_cents").eq("is_sample", false).gte("created_at", fromIso).lt("created_at", toIso),
  ]);
  const ours = (orders ?? []).reduce((n, o) => n + o.service_fee_cents, 0) - (refunds ?? []).reduce((n, r) => n + r.service_fee_refunded_cents, 0);
  const oursCount = (orders ?? []).filter((o) => o.service_fee_cents > 0).length;

  let stripeNet = 0, count = 0, truncated = false, livemode = false;
  try {
    const gte = Math.floor(new Date(fromIso).getTime() / 1000), lt = Math.floor(new Date(toIso).getTime() / 1000);
    let pages = 0;
    for await (const fee of stripe.applicationFees.list({ created: { gte, lt }, limit: 100 })) {
      stripeNet += fee.amount - fee.amount_refunded; count++; livemode = fee.livemode;
      if (count >= 5000) { truncated = true; break; }
      pages = Math.ceil(count / 100);
    }
    void pages;
  } catch (e) {
    return { state: "error", message: (e as Error).message?.slice(0, 160) ?? "Stripe error" };
  }
  const diff = stripeNet - ours;
  return { state: Math.abs(diff) <= 1 ? "ok" : "gap", ours, stripe: stripeNet, diff, stripeCount: count, oursCount, truncated, livemode };
}
