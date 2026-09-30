import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/email";

export const STRIPE_API_VERSION = "2026-08-26.dahlia" as const;

let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // Pinned so an SDK upgrade can't change API behavior without us noticing.
  if (!client) client = new Stripe(key, { apiVersion: STRIPE_API_VERSION, appInfo: { name: "OnTour Upgrades", url: "https://upgrades.ontour.vip" } });
  return client;
}

export const stripeMode = () => {
  const k = process.env.STRIPE_SECRET_KEY ?? "";
  return k.startsWith("sk_live_") || k.startsWith("rk_live_") ? "live" : k ? "test" : null;
};

export type ArtistStripe = {
  artist_id: string; stripe_account_id: string | null; country: string | null; charges_enabled: boolean;
  payouts_enabled: boolean; details_submitted: boolean; requirements_due: string[]; disabled_reason: string | null;
  customer_id: string | null; payment_method_id: string | null; card_brand: string | null; card_last4: string | null;
  card_exp: string | null; livemode: boolean; updated_at: string;
};

export type StripeState = "not_started" | "in_progress" | "restricted" | "ready";

export function stripeState(s: Partial<ArtistStripe> | null | undefined): StripeState {
  if (!s?.stripe_account_id) return "not_started";
  if (s.charges_enabled && s.payouts_enabled) return "ready";
  if (s.details_submitted) return "restricted";
  return "in_progress";
}

export const STRIPE_STATE_LABEL: Record<StripeState, [string, string]> = {
  not_started: ["Not started", "b-neutral"],
  in_progress: ["Setup in progress", "b-pending"],
  restricted: ["Needs attention", "b-rejected"],
  ready: ["Ready to get paid", "b-approved"],
};

/** Copies a Connect account's status from Stripe into our database. */
export async function saveAccount(artistId: string, a: Stripe.Account) {
  const db = createAdminClient();
  if (!db) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  const { error } = await db.from("artist_stripe").upsert({
    artist_id: artistId,
    stripe_account_id: a.id,
    country: a.country ?? null,
    charges_enabled: !!a.charges_enabled,
    payouts_enabled: !!a.payouts_enabled,
    details_submitted: !!a.details_submitted,
    requirements_due: a.requirements?.currently_due ?? [],
    disabled_reason: a.requirements?.disabled_reason ?? null,
    livemode: stripeMode() === "live",
    updated_at: new Date().toISOString(),
  }, { onConflict: "artist_id" });
  if (error) throw error;
}

export async function saveCard(artistId: string, customerId: string, pm: Stripe.PaymentMethod) {
  const db = createAdminClient();
  if (!db) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  const { error } = await db.from("artist_stripe").upsert({
    artist_id: artistId,
    customer_id: customerId,
    payment_method_id: pm.id,
    card_brand: pm.card?.brand ?? null,
    card_last4: pm.card?.last4 ?? null,
    card_exp: pm.card ? `${String(pm.card.exp_month).padStart(2, "0")}/${String(pm.card.exp_year).slice(-2)}` : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "artist_id" });
  if (error) throw error;
}

/** Friendly names for Stripe's requirement codes. */
export function requirementLabel(code: string) {
  const c = code.replace(/^.*\./, "").replace(/_/g, " ");
  if (code.includes("external_account")) return "Bank account for payouts";
  if (code.includes("tos_acceptance")) return "Accept Stripe's terms";
  if (code.includes("verification.document")) return "ID document";
  if (code.includes("ssn_last_4") || code.includes("id_number")) return "Tax ID or SSN";
  if (code.includes("business_profile")) return `Business details (${c})`;
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/** A fresh Stripe onboarding link for an artist's connected account. Server-only helper, not an action. */
export async function onboardingLink(artistId: string, accountId: string) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe isn't configured");
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${siteUrl()}/a/${artistId}/payments/return?refresh=1`,
    return_url: `${siteUrl()}/a/${artistId}/payments/return`,
  });
  return link.url;
}
