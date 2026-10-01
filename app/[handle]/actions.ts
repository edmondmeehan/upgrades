"use server";
import { redirect } from "next/navigation";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/email";
import { clientKey, isHuman, HUMAN_FAIL } from "@/lib/human";
import { readAnswers, sanitizeQuestions } from "@/lib/questions";

type Hold = { hold_id: string; quantity: number; unit_price_cents: number; service_fee_cents: number; stripe_account_id: string;
  artist_name: string; handle: string; show_slug: string; product_name: string; image_url: string | null;
  city: string | null; region: string | null; venue: string | null; show_date: string };

/** Fan clicks Get VIP: reserve the units, then send them to Stripe Checkout on the artist's account. */
export async function startCheckout(fd: FormData) {
  const handle = String(fd.get("handle") ?? ""), slug = String(fd.get("slug") ?? ""), sp = String(fd.get("sp") ?? "");
  const back = (msg: string) => `/${handle}/${slug}?err=${encodeURIComponent(msg)}&pkg=${sp}#p-${sp}`;
  const stripe = getStripe(), db = createAdminClient();
  if (!stripe || !db) redirect(back("Checkout isn't available right now. Try again soon."));

  if (!(await isHuman(fd))) redirect(back(HUMAN_FAIL));
  const qty = Math.floor(Number(fd.get("qty") ?? 1));
  // Check answers against the package's own questions (never trust the form for what's required).
  const { data: pq } = await db.from("show_products").select("products(questions)").eq("id", sp).maybeSingle();
  const questions = sanitizeQuestions((pq as unknown as { products: { questions: unknown } } | null)?.products?.questions);
  const { answers, error: answerErr } = readAnswers(questions, Math.min(Math.max(qty, 1), 4), fd);
  if (answerErr) redirect(back(answerErr));
  const { data, error } = await db.rpc("create_checkout_hold", {
    p_show_product: sp, p_qty: qty, p_code: String(fd.get("code") ?? "") || null,
    p_client: await clientKey("checkout"), p_marketing: fd.get("marketing") === "on", p_answers: answers,
  });
  if (error || !data) redirect(back(error?.message?.replace(/^.*?: /, "") || "Something went wrong. Try again."));
  const h = data as Hold;

  const date = new Date(`${h.show_date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const where = `${h.city ?? ""}${h.region ? `, ${h.region}` : ""}`;
  let url: string;
  try {
    const line: import("stripe").Stripe.Checkout.SessionCreateParams.LineItem[] = [{
      quantity: h.quantity,
      price_data: {
        currency: "usd", unit_amount: h.unit_price_cents,
        product_data: {
          name: `${h.product_name}: ${h.artist_name}`,
          description: `${date}, ${where}${h.venue ? ` at ${h.venue}` : ""}. VIP upgrade only; concert ticket sold separately.`,
          ...(h.image_url?.startsWith("https://") ? { images: [h.image_url] } : {}),
        },
      },
    }];
    if (h.service_fee_cents > 0) {
      line.push({ quantity: 1, price_data: { currency: "usd", unit_amount: h.service_fee_cents, product_data: { name: "Service fee" } } });
    }
    const { data: art } = await db.from("artists").select("collect_tax").eq("handle", h.handle).single<{ collect_tax: boolean }>();
    const params: import("stripe").Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      line_items: line,
      billing_address_collection: "auto", // collects the billing ZIP fans can use to look up their order
      client_reference_id: h.hold_id,
      metadata: { hold_id: h.hold_id, show_product_id: sp },
      payment_intent_data: {
        ...(h.service_fee_cents > 0 ? { application_fee_amount: h.service_fee_cents } : {}), // P&T's service fee (none under some promos)
        description: `${h.product_name} x ${h.quantity}: ${h.artist_name}, ${where} ${h.show_date}`,
        metadata: { hold_id: h.hold_id, show_product_id: sp },
      },
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60, // just past Stripe's 30-minute minimum; the hold lasts 35
      success_url: `${siteUrl()}/order/${h.hold_id}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/${h.handle}/${h.show_slug}#p-${sp}`,
    };
    let session: import("stripe").Stripe.Checkout.Session;
    if (art?.collect_tax) {
      // Stripe Tax on the artist's own account (they're the seller). If their tax settings aren't finished, sell without tax rather than fail.
      try {
        session = await stripe.checkout.sessions.create({ ...params, automatic_tax: { enabled: true } }, { stripeAccount: h.stripe_account_id, idempotencyKey: `ontour-checkout-tax-${h.hold_id}` });
      } catch (e) {
        console.error("[checkout] Stripe Tax not ready for", h.handle, (e as Error).message);
        session = await stripe.checkout.sessions.create(params, { stripeAccount: h.stripe_account_id, idempotencyKey: `ontour-checkout-${h.hold_id}` });
      }
    } else {
      session = await stripe.checkout.sessions.create(params, { stripeAccount: h.stripe_account_id, idempotencyKey: `ontour-checkout-${h.hold_id}` });
    }
    await db.rpc("attach_checkout_session", { p_hold: h.hold_id, p_session: session.id });
    url = session.url!;
  } catch (e) {
    console.error("[checkout] session", e);
    redirect(back("Checkout couldn't start. Try again in a moment."));
  }
  redirect(url);
}

/** Storefront "Follow" form: adds the fan and emails a confirmation link. */
export async function followArtist(handle: string, fd: FormData) {
  const { sendEmail, siteUrl: site } = await import("@/lib/email");
  const back = (q: string) => `/${handle}?${q}#follow`;
  if (!(await isHuman(fd))) redirect(back(`follow_err=${encodeURIComponent(HUMAN_FAIL)}`));
  const db = createAdminClient();
  if (!db) redirect(back("follow_err=Try+again+soon."));
  const { data } = await db.rpc("follow_artist", {
    p_handle: handle, p_email: String(fd.get("email") ?? ""), p_name: String(fd.get("name") ?? ""),
    p_region: String(fd.get("region") ?? ""), p_ip_hash: await clientKey("follow"),
  });
  const r = data as { result: string; token?: string; confirmed?: boolean; artist_name?: string } | null;
  if (!r || r.result === "throttled") redirect(back("follow_err=Too+many+tries.+Try+again+later."));
  if (r.result === "bad_email") redirect(back("follow_err=That+email+doesn%27t+look+right."));
  if (r.result !== "ok") redirect(`/${handle}`);
  if (!r.confirmed) {
    await sendEmail({
      to: String(fd.get("email")).trim(), subject: `Confirm: follow ${r.artist_name} on OnTour Upgrades`,
      eyebrow: "Follow", title: `Get ${r.artist_name} VIP news first`,
      body: [`Confirm your email and we'll let you know when ${r.artist_name} announces new shows and VIP upgrades.`],
      button: { label: "Yes, follow", url: `${site()}/follow/${r.token}` },
      footnote: "If you didn't ask for this, ignore this email and you won't hear from us.",
    });
  }
  redirect(back(r.confirmed ? "followed=already" : "followed=check"));
}
