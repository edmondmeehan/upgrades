"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireArtist } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmailBatch, siteUrl } from "@/lib/email";
import { withMsg } from "@/lib/util";

type Uploaded = { path: string; thumb_path: string; width: number; height: number; bytes: number };

export async function registerPhotos(artistId: string, showId: string, items: Uploaded[]) {
  const { supabase, profile } = await requireArtist(artistId, ["owner", "rep"]);
  const prefix = `${artistId}/${showId}/`;
  const rows = items.filter((i) => i.path.startsWith(prefix) && i.thumb_path.startsWith(prefix)).slice(0, 500);
  const { data: last } = await supabase.from("show_photos").select("position").eq("show_id", showId).order("position", { ascending: false }).limit(1).maybeSingle();
  let pos = (last?.position ?? 0) + 1;
  const { error } = await supabase.from("show_photos").insert(rows.map((r) => ({ ...r, artist_id: artistId, show_id: showId, position: pos++, created_by: profile.id })));
  revalidatePath(`/a/${artistId}/photos/${showId}`);
  return { ok: !error, added: error ? 0 : rows.length };
}

export async function deletePhoto(artistId: string, showId: string, photoId: string) {
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const { data: p } = await supabase.from("show_photos").select("path, thumb_path").eq("id", photoId).eq("show_id", showId).maybeSingle();
  if (p) {
    await supabase.storage.from("photos").remove([p.path, p.thumb_path]);
    await supabase.from("show_photos").delete().eq("id", photoId);
  }
  revalidatePath(`/a/${artistId}/photos/${showId}`);
}

export async function movePhoto(artistId: string, showId: string, photoId: string, dir: -1 | 1) {
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const { data: all } = await supabase.from("show_photos").select("id, position").eq("show_id", showId).order("position").order("created_at");
  const list = all ?? [];
  const i = list.findIndex((p) => p.id === photoId), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await Promise.all(list.map((p, k) => supabase.from("show_photos").update({ position: k + 1 }).eq("id", p.id)));
  revalidatePath(`/a/${artistId}/photos/${showId}`);
}

/** Emails the gallery link to every photo buyer at this show who hasn't been sent it yet. */
export async function sendPhotos(artistId: string, showId: string) {
  const { supabase, artist } = await requireArtist(artistId, ["owner", "rep"]);
  const back = `/a/${artistId}/photos/${showId}`;
  const db = createAdminClient();
  if (!db) redirect(withMsg(back, "err", "Sending isn't available right now."));
  const [{ count }, { data: buyers }, { data: show }, { data: sup }] = await Promise.all([
    supabase.from("show_photos").select("id", { count: "exact", head: true }).eq("show_id", showId),
    supabase.rpc("photo_buyers", { p_show: showId }),
    supabase.from("shows").select("show_date, city, region, venue_name").eq("id", showId).eq("artist_id", artistId).single(),
    supabase.from("artists").select("support_email").eq("id", artistId).single<{ support_email: string | null }>(),
  ]);
  if (!show) redirect(withMsg(back, "err", "Show not found."));
  if (!count) redirect(withMsg(back, "err", "Upload some photos first."));
  const pending = ((buyers ?? []) as { order_id: string; email: string; name: string | null; confirmation_code: string; sent_at: string | null }[]).filter((b) => !b.sent_at);
  if (pending.length === 0) redirect(withMsg(back, "ok", "Everyone who bought a photo package has already been sent the link."));

  let { data: g } = await db.from("photo_galleries").select("token, first_sent_at").eq("show_id", showId).maybeSingle();
  if (!g) ({ data: g } = await db.from("photo_galleries").insert({ show_id: showId, artist_id: artistId }).select("token, first_sent_at").single());
  const date = new Date(`${show.show_date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const where = `${show.city ?? ""}${show.region ? `, ${show.region}` : ""}`;

  const { sent, error } = await sendEmailBatch(pending.map((b) => ({
    to: b.email, replyTo: sup?.support_email ?? undefined,
    subject: `Your photos from ${artist.name} in ${show.city} are ready`,
    eyebrow: `${artist.name} photos`, title: "Your photos are ready",
    preheader: `Photos from ${artist.name}, ${date}`,
    body: [`Hi ${b.name?.split(" ")[0] ?? "there"}, here are the photos from ${artist.name} in ${where} on ${date}.`],
    button: { label: "View and save your photos", url: `${siteUrl()}/photos/${g!.token}?o=${b.confirmation_code}` },
    footnote: `The gallery has every photo from the ${where} meet & greet, so scroll through to find yours. You can save any photo to your phone. Questions? Reply to this email to reach the ${artist.name} team.`,
  })));
  if (sent > 0) {
    await db.from("photo_deliveries").upsert(pending.slice(0, sent).map((b) => ({ show_id: showId, order_id: b.order_id, email: b.email })), { onConflict: "show_id,order_id" });
    if (!g!.first_sent_at) await db.from("photo_galleries").update({ first_sent_at: new Date().toISOString() }).eq("show_id", showId);
  }
  revalidatePath(back);
  redirect(withMsg(back, sent ? "ok" : "err", sent ? `Photos sent to ${sent} fan${sent === 1 ? "" : "s"}.` : `The emails didn't send (${error ?? "unknown error"}).`));
}
