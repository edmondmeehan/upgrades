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

export type StripeState = "not_started" | "in_progress" | "reviewing" | "ready";

export function stripeState(s: Partial<ArtistStripe> | null | undefined): StripeState {
  if (!s?.stripe_account_id) return "not_started";
  if (s.charges_enabled && s.payouts_enabled) return "ready";
  if (s.details_submitted) return "reviewing";
  return "in_progress";
}

export const STRIPE_STATE_LABEL: Record<StripeState, [string, string]> = {
  not_started: ["Not started", "b-neutral"],
  in_progress: ["Setup in progress", "b-pending"],
  reviewing: ["Stripe is reviewing", "b-pending"],
  ready: ["Ready to get paid", "b-approved"],
};

export type V2Account = Stripe.V2.Core.Account;

/** What we ask Stripe to include when reading an artist's Accounts v2 object. */
export const ACCOUNT_INCLUDE = ["configuration.merchant", "requirements", "identity", "defaults"] as const;

export async function retrieveAccount(accountId: string) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe isn't configured");
  return stripe.v2.core.accounts.retrieve(accountId, { include: [...ACCOUNT_INCLUDE] });
}

/** Copies an artist's Accounts v2 status from Stripe into our database. */
export async function saveAccount(artistId: string, a: V2Account) {
  const db = createAdminClient();
  if (!db) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  const caps = a.configuration?.merchant?.capabilities;
  const cardStatus = caps?.card_payments?.status;
  const payoutStatus = caps?.stripe_balance?.payouts?.status;
  const due = (a.requirements?.entries ?? []).filter((e) => e.awaiting_action_from === "user");
  const { error } = await db.from("artist_stripe").upsert({
    artist_id: artistId,
    stripe_account_id: a.id,
    country: a.identity?.country?.toUpperCase() ?? null,
    charges_enabled: cardStatus === "active",
    payouts_enabled: payoutStatus === "active",
    details_submitted: due.length === 0, // nothing left for the artist to provide
    requirements_due: due.map((e) => e.description).filter(Boolean),
    disabled_reason: cardStatus === "restricted" || payoutStatus === "restricted" ? "restricted" : null,
    livemode: a.livemode,
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

/** Stripe's requirement descriptions are already readable; tidy them for display. */
export function requirementLabel(text: string) {
  const t = text.replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** A fresh Stripe onboarding link for an artist's connected account. Server-only helper, not an action. */
export async function onboardingLink(artistId: string, accountId: string) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe isn't configured");
  const link = await stripe.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["merchant"],
        refresh_url: `${siteUrl()}/a/${artistId}/payments/return?refresh=1`,
        return_url: `${siteUrl()}/a/${artistId}/payments/return`,
      },
    },
  });
  return link.url;
}

