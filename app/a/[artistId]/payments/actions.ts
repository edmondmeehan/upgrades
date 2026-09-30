"use server";
import { redirect } from "next/navigation";
import { requireArtist } from "@/lib/auth";
import { ACCOUNT_INCLUDE, getStripe, onboardingLink, retrieveAccount, saveAccount, type ArtistStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/email";
import { withMsg } from "@/lib/util";

const COUNTRIES = new Set(["US", "CA", "GB", "IE", "AU", "NZ", "DE", "FR", "NL", "ES", "IT", "SE"]);

async function context(artistId: string) {
  const ctx = await requireArtist(artistId, ["owner"]);
  const back = `/a/${artistId}/payments`;
  const stripe = getStripe();
  const db = createAdminClient();
  if (!stripe || !db) redirect(withMsg(back, "err", "Payments aren't switched on yet. P&T is finishing the Stripe setup."));
  const { data: row } = await db.from("artist_stripe").select("*").eq("artist_id", artistId).maybeSingle<ArtistStripe>();
  return { ...ctx, back, stripe, db, row };
}

function fail(back: string, e: unknown): never {
  console.error("[stripe]", e);
  const msg = e instanceof Error ? e.message : "Stripe didn't respond. Try again.";
  redirect(withMsg(back, "err", msg));
}

/** Creates the artist's connected account if needed, then sends them to Stripe's onboarding. */
export async function startPayoutSetup(artistId: string, fd: FormData) {
  const { back, stripe, row, artist, profile } = await context(artistId);
  let accountId = row?.stripe_account_id;
  const country = String(fd.get("country") ?? "US").toUpperCase();
  if (!accountId && !COUNTRIES.has(country)) redirect(withMsg(back, "err", "Pick the country your bank account is in."));
  let url: string;
  try {
    if (!accountId) {
      // Accounts v2, set up the way Stripe recommends for direct charges: the artist is the seller,
      // Stripe collects its fees from the artist, Stripe (not P&T) covers negative balances,
      // and the artist gets the full Stripe Dashboard.
      const site = artist.website ? (artist.website.startsWith("http") ? artist.website : `https://${artist.website}`) : undefined;
      const account = await stripe.v2.core.accounts.create({
        display_name: artist.name,
        contact_email: profile.email,
        identity: { country: country.toLowerCase() },
        dashboard: "full",
        defaults: {
          responsibilities: { fees_collector: "stripe", losses_collector: "stripe" },
          profile: { business_url: site, doing_business_as: artist.name, product_description: "VIP concert upgrades sold to fans through OnTour Upgrades" },
        },
        configuration: { merchant: { mcc: "7929", capabilities: { card_payments: { requested: true } } } }, // 7929: bands, orchestras, entertainers
        metadata: { artist_id: artistId, handle: artist.handle },
        include: [...ACCOUNT_INCLUDE],
      }, { idempotencyKey: `ontour-v2-account-${artistId}-${country}` }); // a double-click can't create two accounts
      await saveAccount(artistId, account);
      accountId = account.id;
    }
    url = await onboardingLink(artistId, accountId);
  } catch (e) { fail(back, e); }
  redirect(url);
}

export async function refreshStripe(artistId: string) {
  const { back, stripe, row } = await context(artistId);
  if (!row?.stripe_account_id) redirect(back);
  try { await saveAccount(artistId, await retrieveAccount(row.stripe_account_id)); } catch (e) { fail(back, e); }
  redirect(withMsg(back, "ok", "Status updated from Stripe."));
}

/** Card on file: a Stripe Checkout page in setup mode on P&T's platform account. */
export async function startCardSetup(artistId: string) {
  const { back, stripe, db, row, artist, profile } = await context(artistId);
  let url: string;
  try {
    let customerId = row?.customer_id;
    if (!customerId) {
      const c = await stripe.customers.create(
        { email: profile.email, name: artist.name, metadata: { artist_id: artistId } },
        { idempotencyKey: `ontour-customer-${artistId}` },
      );
      customerId = c.id;
      const { error } = await db.from("artist_stripe").upsert({ artist_id: artistId, customer_id: customerId }, { onConflict: "artist_id" });
      if (error) throw error;
    }
    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: customerId,
      currency: "usd",
      payment_method_types: ["card"],
      metadata: { artist_id: artistId, purpose: "card_on_file" },
      success_url: `${siteUrl()}/a/${artistId}/payments/card?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/a/${artistId}/payments`,
    });
    url = session.url!;
  } catch (e) { fail(back, e); }
  redirect(url);
}

/** Owner adds a promo code (from marketing) to lower the service fee fans pay. */
export async function redeemPromo(artistId: string, fd: FormData) {
  const { supabase } = await requireArtist(artistId, ["owner"]);
  const back = `/a/${artistId}/payments`;
  const code = String(fd.get("code") ?? "").trim();
  if (!code) redirect(withMsg(back, "err", "Enter a promo code."));
  const { data, error } = await supabase.rpc("redeem_promo", { p_artist: artistId, p_code: code });
  if (error) redirect(withMsg(back, "err", error.message.replace(/^.*?: /, "")));
  const r = data as { code: string };
  redirect(withMsg(back, "ok", `Promo ${r.code} applied. Fans now see the lower service fee at checkout.`));
}
