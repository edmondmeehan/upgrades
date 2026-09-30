"use server";
import { redirect } from "next/navigation";
import { requireArtist } from "@/lib/auth";
import { getStripe, saveAccount, type ArtistStripe } from "@/lib/stripe";
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

/** Creates the artist's Stripe Express account if needed, then sends them to Stripe's onboarding. */
export async function startPayoutSetup(artistId: string, fd: FormData) {
  const { back, stripe, row, artist, profile } = await context(artistId);
  let accountId = row?.stripe_account_id;
  const country = String(fd.get("country") ?? "US").toUpperCase();
  if (!accountId && !COUNTRIES.has(country)) redirect(withMsg(back, "err", "Pick the country your bank account is in."));
  let url: string;
  try {
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country,
        email: profile.email,
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        business_profile: {
          name: artist.name,
          url: artist.website ? (artist.website.startsWith("http") ? artist.website : `https://${artist.website}`) : undefined,
          mcc: "7929", // bands, orchestras and entertainers
          product_description: "VIP concert upgrades sold to fans through OnTour Upgrades",
        },
        metadata: { artist_id: artistId, handle: artist.handle },
      });
      await saveAccount(artistId, account);
      accountId = account.id;
    }
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${siteUrl()}/a/${artistId}/payments/return?refresh=1`,
      return_url: `${siteUrl()}/a/${artistId}/payments/return`,
    });
    url = link.url;
  } catch (e) { fail(back, e); }
  redirect(url);
}

export async function openStripeDashboard(artistId: string) {
  const { back, stripe, row } = await context(artistId);
  if (!row?.stripe_account_id) redirect(withMsg(back, "err", "Set up payouts first."));
  let url: string;
  try { url = (await stripe.accounts.createLoginLink(row.stripe_account_id)).url; } catch (e) { fail(back, e); }
  redirect(url);
}

export async function refreshStripe(artistId: string) {
  const { back, stripe, row } = await context(artistId);
  if (!row?.stripe_account_id) redirect(back);
  try { await saveAccount(artistId, await stripe.accounts.retrieve(row.stripe_account_id)); } catch (e) { fail(back, e); }
  redirect(withMsg(back, "ok", "Status updated from Stripe."));
}

/** Card on file: a Stripe Checkout page in setup mode on P&T's platform account. */
export async function startCardSetup(artistId: string) {
  const { back, stripe, db, row, artist, profile } = await context(artistId);
  let url: string;
  try {
    let customerId = row?.customer_id;
    if (!customerId) {
      const c = await stripe.customers.create({ email: profile.email, name: artist.name, metadata: { artist_id: artistId } });
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
