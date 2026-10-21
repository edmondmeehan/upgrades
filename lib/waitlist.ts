import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmailBatch, siteUrl } from "@/lib/email";
import { markError, markOk } from "@/lib/health";

type Claimed = { id: string; email: string; name: string | null; qty: number; token: string; open_spots: number };

/** Emails the next people in line for one package, if spots have opened. Returns how many were emailed. Never throws. */
export async function notifyWaitlist(showProductId: string): Promise<number> {
  const db = createAdminClient();
  if (!db) return 0;
  try {
    const { data } = await db.rpc("claim_waitlist_notifications", { p_show_product: showProductId });
    const list = (data ?? []) as Claimed[];
    if (!list.length) return 0;
    const { data: sp } = await db.from("show_products").select("price_cents, products(name), shows(slug, show_date, city, region, venue_name, currency, artists(name, handle, support_email))")
      .eq("id", showProductId).single();
    const x = sp as unknown as { products: { name: string }; shows: { slug: string; show_date: string; city: string | null; region: string | null; venue_name: string | null;
      artists: { name: string; handle: string; support_email: string | null } } } | null;
    if (!x) return 0;
    const a = x.shows.artists, s = x.shows;
    const date = new Date(`${s.show_date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    const where = `${s.city ?? ""}${s.region ? `, ${s.region}` : ""}`;
    const url = `${siteUrl()}/${a.handle}/${s.slug}#p-${showProductId}`;
    const { sent, error, skipped, failed } = await sendEmailBatch(list.map((w) => ({
      to: w.email, replyTo: a.support_email ?? undefined,
      subject: `VIP spots just opened: ${a.name}, ${where}`,
      eyebrow: "Waitlist", title: `Spots opened for ${x.products.name}`,
      preheader: `${a.name}, ${where}, ${date}. First to buy gets them.`,
      body: [
        `${w.name ? `Hi ${w.name.split(" ")[0]}, good` : "Good"} news: spots opened up for ${x.products.name} with ${a.name} in ${where} on ${date}${s.venue_name ? ` at ${s.venue_name}` : ""}.`,
        "We're emailing the next people on the waitlist in the order they joined. Spots aren't held, so whoever checks out first gets them.",
      ],
      button: { label: "Get VIP now", url },
      footnote: `Don't want these emails? Leave the waitlist: ${siteUrl()}/waitlist/leave/${w.token}`,
    })));
    // Only people whose email actually went out count as notified: failures go back in line,
    // and addresses that can never be delivered come off the list.
    const byEmail = (emails: string[]) => list.filter((w) => emails.includes(w.email)).map((w) => w.id);
    if (skipped.length || failed.length) {
      await db.rpc("settle_waitlist_notifications", { p_retry: byEmail(failed), p_bad: byEmail(skipped) });
    }
    if (error && !sent) await markError("waitlist", error); else await markOk("waitlist");
    return sent;
  } catch (e) {
    await markError("waitlist", e).catch(() => null);
    return 0;
  }
}

/** All packages for a show (after a refund, a capacity change, a cancelled comp...). */
export async function notifyWaitlistForShow(showId: string) {
  const db = createAdminClient();
  if (!db) return 0;
  const { data } = await db.from("show_products").select("id").eq("show_id", showId).eq("active", true);
  let n = 0;
  for (const sp of data ?? []) n += await notifyWaitlist(sp.id);
  return n;
}

/** Every package with people waiting and room now (daily sweep, and after edits that may add spots). */
export async function sweepWaitlists() {
  const db = createAdminClient();
  if (!db) return 0;
  const { data } = await db.rpc("waitlists_with_room");
  let n = 0;
  for (const r of (data ?? []) as { show_product_id: string }[]) n += await notifyWaitlist(r.show_product_id);
  return n;
}
