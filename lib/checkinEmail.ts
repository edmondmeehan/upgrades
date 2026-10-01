import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmailBatch, siteUrl } from "@/lib/email";
import { formatTime } from "@/lib/util";

export type CheckinShow = {
  id: string; artist_id: string; show_date: string; timezone: string; venue_name: string | null; address: string | null; city: string | null;
  region: string | null; postal_code: string | null; doors_time: string | null; show_time: string | null;
  checkin_time: string | null; checkin_location: string | null; checkin_contact_name: string | null; checkin_contact_phone: string | null;
  checkin_notes: string | null; checkin_email_days: number; checkin_sent_at: string | null; checkin_updated_at: string | null;
};
type Pkg = { name: string; qty: number; time: string | null; notes: string | null };
type Recipient = { order_id: string; hold_id: string | null; email: string; name: string | null; confirmation_code: string; packages: Pkg[] | null; sent: boolean };

export const SHOW_CHECKIN_COLUMNS = "id, artist_id, show_date, timezone, venue_name, address, city, region, postal_code, doors_time, show_time, checkin_time, checkin_location, checkin_contact_name, checkin_contact_phone, checkin_notes, checkin_email_days, checkin_sent_at, checkin_updated_at";

export const hasCheckinDetails = (s: Pick<CheckinShow, "checkin_time" | "checkin_location">) => !!(s.checkin_time || s.checkin_location);

export function mapsUrl(s: Pick<CheckinShow, "venue_name" | "address" | "city" | "region" | "postal_code">) {
  const q = [s.venue_name, s.address, s.city, s.region, s.postal_code].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
export const fullAddress = (s: Pick<CheckinShow, "address" | "city" | "region" | "postal_code">) =>
  [s.address, [s.city, [s.region, s.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(", ");

/** The label/value rows used in emails and on the order page. */
export function checkinRows(s: CheckinShow, pkgs: Pkg[] = []): [string, string][] {
  const rows: [string, string][] = [];
  const date = new Date(`${s.show_date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  rows.push(["Date", date]);
  const times = pkgs.filter((p) => p.time && p.time !== s.checkin_time);
  if (s.checkin_time && times.length === 0) rows.push(["Check-in", formatTime(s.checkin_time)!]);
  else if (s.checkin_time || times.length) {
    pkgs.forEach((p) => { const t = p.time ?? s.checkin_time; if (t) rows.push([`Check-in, ${p.name}`, formatTime(t)!]); });
  }
  if (s.checkin_location) rows.push(["Where to go", s.checkin_location]);
  rows.push(["Venue", [s.venue_name, fullAddress(s)].filter(Boolean).join(", ") || "TBA"]);
  if (s.doors_time) rows.push(["Doors", formatTime(s.doors_time)!]);
  if (s.checkin_contact_name || s.checkin_contact_phone) rows.push(["Day-of contact", [s.checkin_contact_name, s.checkin_contact_phone].filter(Boolean).join(", ")]);
  return rows;
}

export function checkinNotes(s: CheckinShow, pkgs: Pkg[] = []) {
  return [s.checkin_notes, ...pkgs.filter((p) => p.notes).map((p) => `${p.name}: ${p.notes}`)].filter(Boolean) as string[];
}

/**
 * Emails check-in details for a show. "details" goes to everyone who hasn't had it yet;
 * "update" re-sends to everyone (after the artist changes something).
 */
export async function sendCheckinEmails(showId: string, kind: "details" | "update"): Promise<{ sent: number; total: number; error?: string }> {
  const db = createAdminClient();
  if (!db) return { sent: 0, total: 0, error: "not configured" };
  const { data: s } = await db.from("shows").select(SHOW_CHECKIN_COLUMNS).eq("id", showId).single<CheckinShow>();
  if (!s) return { sent: 0, total: 0, error: "show not found" };
  if (!hasCheckinDetails(s)) return { sent: 0, total: 0, error: "Add a check-in time or location first." };
  const [{ data: artist }, { data: rec }] = await Promise.all([
    db.from("artists").select("name, handle, support_email").eq("id", s.artist_id).single<{ name: string; handle: string; support_email: string | null }>(),
    db.rpc("checkin_recipients", { p_show: showId }),
  ]);
  const list = ((rec ?? []) as Recipient[]).filter((r) => kind === "update" || !r.sent);
  if (!artist || list.length === 0) return { sent: 0, total: 0 };
  const passes = await passesByOrder(db, list.map((r) => r.order_id));
  const when = new Date(`${s.show_date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

  const { sent, error } = await sendEmailBatch(list.map((r) => {
    const pkgs = r.packages ?? [];
    const codes = passes.get(r.order_id) ?? [];
    return {
      to: r.email, replyTo: artist.support_email ?? undefined,
      subject: kind === "update" ? `Updated check-in details: ${artist.name}, ${when}` : `Check-in details for ${artist.name}, ${when}`,
      eyebrow: kind === "update" ? "Updated check-in details" : "Your VIP check-in",
      title: kind === "update" ? "Your check-in details changed" : `See you ${s.show_date === todayIn(s.timezone) ? "tonight" : `on ${when}`}`,
      preheader: `${artist.name} in ${s.city}: check-in ${s.checkin_time ? `at ${formatTime(s.checkin_time)}` : "details"}`,
      body: [
        `Hi ${r.name?.split(" ")[0] ?? "there"}, here's everything you need for your ${pkgs.map((p) => p.name).join(" and ") || "VIP upgrade"} with ${artist.name}.`,
        ...(kind === "update" ? ["Something changed since we last emailed, so please use these details."] : []),
        ...checkinNotes(s, pkgs),
      ],
      details: [...checkinRows(s, pkgs), ["Confirmation number", r.confirmation_code]],
      images: codes.map((c, i) => ({ src: `${siteUrl()}/qr/${c}.png`, alt: `QR code for pass ${c}`, caption: codes.length > 1 ? `${c}  (guest ${i + 1})` : c })),
      button: { label: "Get directions", url: mapsUrl(s) },
      footnote: `Show the QR code at VIP check-in${r.hold_id ? `, or open your passes at ${siteUrl()}/order/${r.hold_id}` : ""}. Your concert ticket is separate. Questions? Reply to this email to reach the ${artist.name} team.`,
    };
  }));
  if (sent > 0) {
    await db.from("checkin_emails").insert(list.slice(0, sent).map((r) => ({ show_id: showId, order_id: r.order_id, kind })));
    await db.from("shows").update({ checkin_sent_at: s.checkin_sent_at ?? new Date().toISOString(), ...(kind === "update" ? { checkin_updated_at: null } : {}) }).eq("id", showId);
  }
  return { sent, total: list.length, error };
}

async function passesByOrder(db: SupabaseClient, orderIds: string[]) {
  const map = new Map<string, string[]>();
  if (!orderIds.length) return map;
  const { data } = await db.from("passes").select("code, voided_at, order_items!inner(order_id)").in("order_items.order_id", orderIds).is("voided_at", null).order("code");
  ((data ?? []) as unknown as { code: string; order_items: { order_id: string } }[]).forEach((p) => {
    const l = map.get(p.order_items.order_id) ?? []; l.push(p.code); map.set(p.order_items.order_id, l);
  });
  return map;
}

function todayIn(tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
