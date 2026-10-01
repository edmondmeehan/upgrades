"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireArtist } from "@/lib/auth";
import { sendCheckinEmails } from "@/lib/checkinEmail";
import { cleanError, withMsg } from "@/lib/util";

const t = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? "").trim(); return /^\d{1,2}:\d{2}$/.test(v) ? v : null; };
const s = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max) || null;

export async function saveCheckinDetails(artistId: string, showId: string, fd: FormData) {
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const back = `/a/${artistId}/shows/${showId}#checkin`;
  const { data: before } = await supabase.from("shows").select("checkin_sent_at").eq("id", showId).single();
  const days = Math.min(14, Math.max(0, Math.floor(Number(fd.get("checkin_email_days") ?? 2))));
  const { error } = await supabase.from("shows").update({
    address: s(fd, "address", 200), postal_code: s(fd, "postal_code", 20),
    checkin_time: t(fd, "checkin_time"), checkin_location: s(fd, "checkin_location", 300),
    checkin_contact_name: s(fd, "checkin_contact_name", 120), checkin_contact_phone: s(fd, "checkin_contact_phone", 40),
    checkin_notes: s(fd, "checkin_notes", 2000), checkin_email_days: Number.isFinite(days) ? days : 2,
    ...(before?.checkin_sent_at ? { checkin_updated_at: new Date().toISOString() } : {}),
  }).eq("id", showId).eq("artist_id", artistId);
  if (error) redirect(withMsg(back, "err", cleanError(error)));

  // Per-package overrides: fields named pkg_time_<id> / pkg_notes_<id>
  const ids = [...fd.keys()].filter((k) => k.startsWith("pkg_time_")).map((k) => k.slice(9));
  for (const id of ids) {
    await supabase.from("show_products").update({ checkin_time: t(fd, `pkg_time_${id}`), checkin_notes: s(fd, `pkg_notes_${id}`, 1000) })
      .eq("id", id).eq("show_id", showId);
  }
  revalidatePath(`/a/${artistId}/shows/${showId}`);
  redirect(withMsg(back, "ok", before?.checkin_sent_at ? "Saved. Fans already got the check-in email, so send them an update if anything important changed." : "Check-in details saved."));
}

export async function sendCheckinNow(artistId: string, showId: string, kind: "details" | "update") {
  await requireArtist(artistId, ["owner", "rep"]);
  const back = `/a/${artistId}/shows/${showId}#checkin`;
  const r = await sendCheckinEmails(showId, kind);
  revalidatePath(`/a/${artistId}/shows/${showId}`);
  if (r.error && !r.sent) redirect(withMsg(back, "err", r.error));
  redirect(withMsg(back, "ok", r.total === 0 ? "Everyone already has the check-in details." : `Check-in details sent to ${r.sent} fan${r.sent === 1 ? "" : "s"}.`));
}
