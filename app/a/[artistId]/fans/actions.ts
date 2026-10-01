"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireArtist } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmailBatch, siteUrl } from "@/lib/email";
import { dollars } from "@/lib/packages";
import { withMsg } from "@/lib/util";

/** Emails followers about new shows. Optional message; optionally only followers in certain states. */
export async function sendAnnouncement(artistId: string, fd: FormData) {
  const { profile } = await requireArtist(artistId, ["owner", "rep"]);
  const back = `/a/${artistId}/fans`;
  const showIds = fd.getAll("show").map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 20);
  const message = String(fd.get("message") ?? "").trim().slice(0, 1000);
  const regions = fd.get("audience") === "states" ? fd.getAll("region").map(String).filter((r) => /^[A-Z]{2}$/.test(r)) : [];
  if (!showIds.length) redirect(withMsg(back, "err", "Pick at least one show to announce."));
  if (fd.get("audience") === "states" && !regions.length) redirect(withMsg(back, "err", "Pick at least one state, or send to everyone."));
  const db = createAdminClient();
  if (!db) redirect(withMsg(back, "err", "Sending isn't available right now."));

  const [{ data: artist }, { data: shows }, { data: followers }] = await Promise.all([
    db.from("artists").select("name, handle, support_email").eq("id", artistId).single(),
    db.from("shows").select("id, slug, show_date, city, region, venue_name, show_products(price_cents, active, is_sample)").eq("artist_id", artistId).eq("status", "published").in("id", showIds).order("show_date"),
    (() => { let q = db.from("follows").select("email, name, token, region").eq("artist_id", artistId).not("confirmed_at", "is", null).is("unsubscribed_at", null);
      if (regions.length) q = q.in("region", regions); return q; })(),
  ]);
  if (!artist || !shows?.length) redirect(withMsg(back, "err", "Those shows aren't published."));
  if (!followers?.length) redirect(withMsg(back, "err", regions.length ? "No followers in those states yet." : "You don't have any followers yet."));

  type S = { id: string; slug: string; show_date: string; city: string | null; region: string | null; venue_name: string | null; show_products: { price_cents: number; active: boolean; is_sample: boolean }[] };
  const rows = (shows as S[]).map((s) => {
    const prices = s.show_products.filter((p) => p.active && !p.is_sample).map((p) => p.price_cents);
    return [new Date(`${s.show_date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }),
      `${s.city ?? ""}${s.region ? `, ${s.region}` : ""}`, s.venue_name ?? "", prices.length ? `from ${dollars(Math.min(...prices))}` : "coming soon"];
  });
  const one = shows.length === 1 ? (shows as S[])[0] : null;
  const url = one ? `${siteUrl()}/${artist.handle}/${one.slug}` : `${siteUrl()}/${artist.handle}`;
  const { sent, error } = await sendEmailBatch(followers.map((f) => ({
    to: f.email, replyTo: artist.support_email ?? undefined,
    headers: { "List-Unsubscribe": `<${siteUrl()}/api/unsubscribe/${f.token}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    subject: one ? `${artist.name} VIP: ${one.city} on ${rows[0][0]}` : `${artist.name} just announced ${shows.length} new VIP dates`,
    eyebrow: `${artist.name} announcement`, title: one ? `VIP is on for ${one.city}` : `${shows.length} new VIP dates`,
    body: [...(message ? [message] : []), `${f.name ? `Hi ${f.name.split(" ")[0]}, here` : "Here"}'s what's new from ${artist.name}. VIP spots are limited.`],
    tables: [{ head: ["Date", "City", "Venue", "VIP"], rows }],
    button: { label: one ? "Get VIP" : "See all dates", url },
    footnote: `You're getting this because you follow ${artist.name} on OnTour Upgrades. Unsubscribe: ${siteUrl()}/unsubscribe/${f.token}`,
  })));
  if (sent) {
    await db.from("announcements").insert({ artist_id: artistId, show_ids: showIds, message: message || null, regions: regions.length ? regions : null, sent_to: sent, created_by: profile.id });
    await db.from("shows").update({ announced_at: new Date().toISOString() }).in("id", showIds).eq("artist_id", artistId);
  }
  revalidatePath(back);
  redirect(withMsg(back, sent ? "ok" : "err", sent ? `Announcement sent to ${sent} follower${sent === 1 ? "" : "s"}.` : `It didn't send (${error ?? "email error"}).`));
}
