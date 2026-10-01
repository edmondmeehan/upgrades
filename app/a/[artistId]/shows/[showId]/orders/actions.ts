"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireArtist } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { refundOrder } from "@/lib/refunds";
import { withMsg } from "@/lib/util";

const REASONS: Record<string, string> = { fan_request: "Fan asked for a refund", cant_attend: "Fan can't attend", artist_change: "Change on our side", duplicate: "Duplicate order", other: "Other" };

/** Refund a whole order, or some passes on it. Owners and P&T only, since it moves money. */
export async function refundOrderAction(artistId: string, showId: string, orderId: string, fd: FormData) {
  const { user } = await requireArtist(artistId, ["owner"]);
  const back = `/a/${artistId}/shows/${showId}/orders`;
  const whole = fd.get("scope") !== "some";
  const items = whole ? null : [...fd.entries()].filter(([k]) => k.startsWith("qty_")).map(([k, v]) => ({ item_id: k.slice(4), qty: Math.floor(Number(v)) })).filter((i) => i.qty > 0);
  const reason = REASONS[String(fd.get("reason"))] ?? "Refund";
  const r = await refundOrder(orderId, { items, reason, issuedBy: user.id, note: String(fd.get("note") ?? "").trim().slice(0, 500) || undefined });
  revalidatePath(back);
  redirect(withMsg(back, r.ok ? "ok" : "err", r.ok ? `Refunded $${((r.amount ?? 0) / 100).toFixed(2)}. The fan has been emailed.` : r.error ?? "Refund failed."));
}

/** After a partial refund made directly in Stripe, the artist picks which pass(es) to void. */
export async function voidPassAction(artistId: string, showId: string, passId: string) {
  await requireArtist(artistId, ["owner", "rep"]);
  const db = createAdminClient();
  if (db) {
    const { data: p } = await db.from("passes").select("id, artist_id, checked_in_at").eq("id", passId).single();
    if (p && p.artist_id === artistId && !p.checked_in_at) await db.from("passes").update({ voided_at: new Date().toISOString(), void_reason: "voided by artist" }).eq("id", passId);
  }
  revalidatePath(`/a/${artistId}/shows/${showId}/orders`);
}

/** Cancels the show, refunds every paid order in full, and emails each fan. */
export async function cancelShowAndRefund(artistId: string, showId: string, fd: FormData) {
  const { user, supabase } = await requireArtist(artistId, ["owner"]);
  const back = `/a/${artistId}/shows/${showId}/orders`;
  if (String(fd.get("confirm") ?? "").trim().toUpperCase() !== "CANCEL") redirect(withMsg(back, "err", "Type CANCEL to confirm."));
  const note = String(fd.get("note") ?? "").trim().slice(0, 500);
  const db = createAdminClient();
  if (!db) redirect(withMsg(back, "err", "Refunds aren't available right now."));
  const { data: orders } = await db.from("orders").select("id").eq("show_id", showId).eq("artist_id", artistId).eq("is_sample", false).in("status", ["paid", "partially_refunded"]);
  let ok = 0, failed = 0;
  for (const o of orders ?? []) {
    const r = await refundOrder(o.id, { items: null, reason: "Show cancelled", issuedBy: user.id, note: note || "Unfortunately this show has been cancelled, so we've refunded your VIP upgrade in full." });
    if (r.ok) ok++; else failed++;
  }
  await supabase.from("shows").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", showId).eq("artist_id", artistId);
  revalidatePath(back);
  redirect(withMsg(back, failed ? "err" : "ok", `Show cancelled. ${ok} order${ok === 1 ? "" : "s"} refunded and emailed.${failed ? ` ${failed} couldn't be refunded; try those individually or in Stripe.` : ""}`));
}
