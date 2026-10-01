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
  const { data: orders } = await db.from("orders").select("id").eq("show_id", showId).eq("artist_id", artistId).eq("is_sample", false).eq("is_comp", false).in("status", ["paid", "partially_refunded"]);
  // Comps have no payment: just void their passes.
  const { data: comps } = await db.from("orders").select("id, order_items(id)").eq("show_id", showId).eq("artist_id", artistId).eq("is_comp", true).neq("status", "refunded");
  for (const c of (comps ?? []) as { id: string; order_items: { id: string }[] }[]) {
    for (const i of c.order_items) await db.from("passes").update({ voided_at: new Date().toISOString(), void_reason: "show cancelled" }).eq("order_item_id", i.id).is("voided_at", null);
    await db.from("orders").update({ status: "refunded" }).eq("id", c.id);
  }
  let ok = 0, failed = 0;
  for (const o of orders ?? []) {
    const r = await refundOrder(o.id, { items: null, reason: "Show cancelled", issuedBy: user.id, note: note || "Unfortunately this show has been cancelled, so we've refunded your VIP upgrade in full." });
    if (r.ok) ok++; else failed++;
  }
  await supabase.from("shows").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", showId).eq("artist_id", artistId);
  revalidatePath(back);
  redirect(withMsg(back, failed ? "err" : "ok", `Show cancelled. ${ok} order${ok === 1 ? "" : "s"} refunded and emailed.${failed ? ` ${failed} couldn't be refunded; try those individually or in Stripe.` : ""}`));
}

// ── Order management ─────────────────────────────────────────
async function holdFor(orderId: string) {
  const db = createAdminClient();
  const { data } = db ? await db.from("checkout_holds").select("id").eq("order_id", orderId).maybeSingle() : { data: null };
  return data?.id as string | undefined;
}

/** Free passes for crew, radio winners and friends. */
export async function createComp(artistId: string, showId: string, fd: FormData) {
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const back = `/a/${artistId}/shows/${showId}/orders`;
  const { data, error } = await supabase.rpc("create_comp_order", {
    p_show_product: String(fd.get("show_product") ?? ""), p_qty: Math.floor(Number(fd.get("qty") ?? 1)),
    p_name: String(fd.get("name") ?? ""), p_email: String(fd.get("email") ?? ""), p_note: String(fd.get("note") ?? ""),
    p_allow_over: fd.get("allow_over") === "on",
  });
  if (error || !data) redirect(withMsg(back, "err", error?.message?.replace(/^.*?: /, "") ?? "Couldn't add the comp."));
  const { hold_id, order_id } = data as { hold_id: string; order_id: string };
  const { stripeMode } = await import("@/lib/stripe");
  if (stripeMode() === "live") { const adm = createAdminClient(); if (adm) await adm.from("orders").update({ livemode: true }).eq("id", order_id); }
  let sent = false;
  if (fd.get("send") === "on") { const { sendOrderConfirmation } = await import("@/lib/checkout"); await sendOrderConfirmation(hold_id); sent = true; }
  revalidatePath(back);
  redirect(withMsg(back, "ok", `Comp added.${sent ? " The guest has been emailed their passes." : ""}`));
}

export async function resendConfirmation(artistId: string, showId: string, orderId: string) {
  await requireArtist(artistId, ["owner", "rep"]);
  const hold = await holdFor(orderId);
  const back = `/a/${artistId}/shows/${showId}/orders`;
  if (!hold) redirect(withMsg(back, "err", "This order has no confirmation to resend."));
  const { sendOrderConfirmation } = await import("@/lib/checkout");
  await sendOrderConfirmation(hold);
  redirect(withMsg(back, "ok", "Confirmation resent."));
}

/** Artist sets the guest on a pass, and optionally emails that guest their pass. */
export async function setGuest(artistId: string, showId: string, orderId: string, passId: string, fd: FormData) {
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const back = `/a/${artistId}/shows/${showId}/orders`;
  const { error } = await supabase.rpc("set_pass_guest", { p_pass: passId, p_name: String(fd.get("name") ?? ""), p_email: String(fd.get("email") ?? "") });
  if (error) redirect(withMsg(back, "err", "Couldn't save the guest."));
  let msg = "Guest saved.";
  if (fd.get("send") === "on") {
    const hold = await holdFor(orderId);
    const { sendPassToGuest } = await import("@/lib/checkout");
    const r = hold ? await sendPassToGuest(hold, passId) : { sent: false, error: "No order link." };
    msg = r.sent ? "Guest saved and their pass emailed." : `Guest saved, but the pass didn't send (${r.error ?? "email error"}).`;
  }
  revalidatePath(back);
  redirect(withMsg(back, "ok", msg));
}

/** Takes back comp passes (no money involved). */
export async function cancelComp(artistId: string, showId: string, orderId: string) {
  await requireArtist(artistId, ["owner", "rep"]);
  const db = createAdminClient();
  const back = `/a/${artistId}/shows/${showId}/orders`;
  if (!db) redirect(back);
  const { data: o } = await db.from("orders").select("id, artist_id, is_comp").eq("id", orderId).single();
  if (!o?.is_comp || o.artist_id !== artistId) redirect(withMsg(back, "err", "Only comp orders can be cancelled this way."));
  const { data: items } = await db.from("order_items").select("id, quantity").eq("order_id", orderId);
  for (const i of items ?? []) {
    await db.from("passes").update({ voided_at: new Date().toISOString(), void_reason: "comp cancelled" }).eq("order_item_id", i.id).is("checked_in_at", null).is("voided_at", null);
    await db.from("order_items").update({ refunded_quantity: i.quantity }).eq("id", i.id);
  }
  await db.from("orders").update({ status: "refunded" }).eq("id", orderId);
  revalidatePath(back);
  redirect(withMsg(back, "ok", "Comp cancelled. Its passes no longer work."));
}
