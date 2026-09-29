"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireArtist } from "@/lib/auth";
import { sendEmail, siteUrl } from "@/lib/email";
import { cleanError, slugify, withMsg } from "@/lib/util";
import type { MemberRole, ProofMethod } from "@/lib/types";
import { ROLE_LABEL } from "@/lib/types";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string) => str(fd, k) || null;

function done(path: string, error: { message?: string } | null, okMsg: string): never {
  revalidatePath(path.split("?")[0]);
  redirect(withMsg(path, error ? "err" : "ok", error ? cleanError(error) : okMsg));
}

// ── Tours ────────────────────────────────────────────────────
export async function createTour(artistId: string, fd: FormData) {
  const { supabase, user } = await requireArtist(artistId, ["owner", "rep"]);
  const name = str(fd, "name");
  if (!name) redirect(withMsg(`/a/${artistId}/tours`, "err", "Give the tour a name."));
  const { data, error } = await supabase.from("tours")
    .insert({ artist_id: artistId, name, description: opt(fd, "description"), created_by: user.id })
    .select("id").single();
  if (error || !data) done(`/a/${artistId}/tours`, error, "");
  redirect(withMsg(`/a/${artistId}/tours/${data.id}`, "ok", "Tour created. Add your first show below."));
}

export async function updateTour(artistId: string, tourId: string, fd: FormData) {
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const { error } = await supabase.from("tours")
    .update({ name: str(fd, "name"), description: opt(fd, "description"), status: str(fd, "status") === "archived" ? "archived" : "active" })
    .eq("id", tourId).eq("artist_id", artistId);
  done(`/a/${artistId}/tours/${tourId}`, error, "Tour saved.");
}

export async function deleteTour(artistId: string, tourId: string) {
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const { count } = await supabase.from("shows").select("id", { count: "exact", head: true }).eq("tour_id", tourId).neq("status", "draft");
  if (count) redirect(withMsg(`/a/${artistId}/tours/${tourId}`, "err", "This tour has published or cancelled shows. Archive it instead."));
  const { error } = await supabase.from("tours").delete().eq("id", tourId).eq("artist_id", artistId);
  if (error) done(`/a/${artistId}/tours/${tourId}`, error, "");
  redirect(withMsg(`/a/${artistId}/tours`, "ok", "Tour deleted."));
}

// ── Shows ────────────────────────────────────────────────────
function showFields(fd: FormData) {
  return {
    show_date: str(fd, "show_date"),
    doors_time: opt(fd, "doors_time"),
    show_time: opt(fd, "show_time"),
    timezone: str(fd, "timezone") || "America/New_York",
    venue_name: str(fd, "venue_name"),
    address: opt(fd, "address"),
    city: str(fd, "city"),
    region: opt(fd, "region"),
    country: (str(fd, "country") || "US").toUpperCase().slice(0, 2),
    postal_code: opt(fd, "postal_code"),
  };
}

export async function createShow(artistId: string, tourId: string, fd: FormData) {
  const { supabase, user } = await requireArtist(artistId, ["owner", "rep"]);
  const f = showFields(fd);
  const back = `/a/${artistId}/tours/${tourId}`;
  if (!f.show_date || !f.venue_name || !f.city) redirect(withMsg(back, "err", "Date, venue, and city are required."));
  const base = `${f.show_date}-${slugify(f.city)}`;
  let lastError: { message?: string; code?: string } | null = null;
  for (let n = 1; n <= 5; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const { error } = await supabase.from("shows").insert({ ...f, artist_id: artistId, tour_id: tourId, slug, created_by: user.id });
    if (!error) done(back, null, `Show added: ${f.city}, ${f.show_date}.`);
    lastError = error;
    if (error.code !== "23505") break;
  }
  done(back, lastError, "");
}

export async function updateShow(artistId: string, showId: string, fd: FormData) {
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const f = showFields(fd);
  if (!f.show_date || !f.venue_name || !f.city) redirect(withMsg(`/a/${artistId}/shows/${showId}`, "err", "Date, venue, and city are required."));
  const { error } = await supabase.from("shows").update(f).eq("id", showId).eq("artist_id", artistId);
  done(`/a/${artistId}/shows/${showId}`, error, "Show saved.");
}

export async function setShowStatus(artistId: string, showId: string, fd: FormData) {
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const status = str(fd, "status");
  if (!["draft", "published", "cancelled"].includes(status)) redirect(`/a/${artistId}/shows/${showId}`);
  const { error } = await supabase.from("shows")
    .update({ status, cancelled_at: status === "cancelled" ? new Date().toISOString() : null })
    .eq("id", showId).eq("artist_id", artistId);
  const msg = { draft: "Show moved back to draft.", published: "Show published.", cancelled: "Show cancelled." }[status]!;
  done(`/a/${artistId}/shows/${showId}`, error, msg);
}

export async function deleteShow(artistId: string, showId: string, tourId: string) {
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const { error } = await supabase.from("shows").delete().eq("id", showId).eq("artist_id", artistId).eq("status", "draft");
  if (error) done(`/a/${artistId}/shows/${showId}`, error, "");
  redirect(withMsg(`/a/${artistId}/tours/${tourId}`, "ok", "Show deleted."));
}

// ── Verification ─────────────────────────────────────────────
export async function submitVerification(artistId: string, fd: FormData) {
  const { supabase, artist, profile } = await requireArtist(artistId, ["owner"]);
  const method = str(fd, "proof_method") as ProofMethod;
  const socials = Object.fromEntries(
    ["instagram", "tiktok", "x", "facebook", "youtube", "spotify"].map((k) => [k, str(fd, k)]).filter(([, v]) => v),
  );
  const back = `/a/${artistId}/verification`;
  if (Object.keys(socials).length === 0) redirect(withMsg(back, "err", "Add at least one official social account."));

  const { data, error } = await supabase.rpc("submit_verification", {
    p_artist: artistId, p_website: str(fd, "website"), p_socials: socials, p_method: method,
    p_proof_post_url: opt(fd, "proof_post_url"), p_third_party_name: opt(fd, "third_party_name"),
    p_third_party_email: opt(fd, "third_party_email"), p_third_party_relation: opt(fd, "third_party_relation"),
    p_notes: opt(fd, "notes"),
  });
  if (error) done(back, error, "");

  const token = (data as { third_party_token: string | null }[] | null)?.[0]?.third_party_token;
  if (method === "third_party" && token) {
    await sendEmail({
      to: str(fd, "third_party_email"),
      subject: `Please confirm ${artist.name} on OnTour Upgrades`,
      text: `Hi ${str(fd, "third_party_name")},\n\n${profile.name ?? profile.email} (${profile.email}) is setting up VIP upgrades for ${artist.name} on OnTour Upgrades by Please & Thank You, and listed you as their ${str(fd, "third_party_relation") || "contact"}.\n\nIf this is really ${artist.name}'s team, confirm it here:\n${siteUrl()}/confirm/${token}\n\nIf you don't recognize this, ignore this email and nothing will go live.`,
    });
  }
  const admin = process.env.ADMIN_NOTIFY_EMAIL;
  if (admin) {
    await sendEmail({
      to: admin,
      subject: `New artist to review: ${artist.name}`,
      text: `${artist.name} (/${artist.handle}) submitted verification by ${method.replace("_", " ")}.\n\nReview: ${siteUrl()}/admin/artists/${artistId}`,
    });
  }
  done(back, null, "Submitted. P&T will review it and email you when you're approved.");
}

// ── Team ─────────────────────────────────────────────────────
export async function inviteMember(artistId: string, fd: FormData) {
  const { supabase, artist, profile } = await requireArtist(artistId, ["owner"]);
  const email = str(fd, "email").toLowerCase();
  const role = (str(fd, "role") === "accountant" ? "accountant" : "rep") as MemberRole;
  const { data: token, error } = await supabase.rpc("create_invitation", { p_artist: artistId, p_email: email, p_role: role });
  if (error) done(`/a/${artistId}/team`, error, "");
  const link = `${siteUrl()}/invite/${token}`;
  const scope = role === "accountant"
    ? "read-only access to settlements, payouts, and year-end exports"
    : "access to set up shows, check-in details, scanning, and photos";
  const { sent } = await sendEmail({
    to: email,
    subject: `${artist.name} invited you to OnTour Upgrades`,
    text: `${profile.name ?? profile.email} added you to ${artist.name} on OnTour Upgrades as ${ROLE_LABEL[role].toLowerCase()}, with ${scope}.\n\nAccept the invite (link works for 14 days):\n${link}`,
  });
  done(`/a/${artistId}/team`, null, sent ? `Invite sent to ${email}.` : `Invite created for ${email}. Email isn't set up yet, so copy the link below and send it yourself.`);
}

export async function revokeInvite(artistId: string, invitationId: string) {
  const { supabase } = await requireArtist(artistId, ["owner"]);
  const { error } = await supabase.rpc("revoke_invitation", { p_invitation: invitationId });
  done(`/a/${artistId}/team`, error, "Invite revoked.");
}

export async function removeMember(artistId: string, userId: string) {
  const { supabase } = await requireArtist(artistId, ["owner"]);
  const { error } = await supabase.rpc("remove_member", { p_artist: artistId, p_user: userId });
  done(`/a/${artistId}/team`, error, "Removed from the team.");
}

// ── Settings ─────────────────────────────────────────────────
export async function updateArtist(artistId: string, fd: FormData) {
  const { supabase } = await requireArtist(artistId, ["owner"]);
  const { error } = await supabase.from("artists")
    .update({ name: str(fd, "name"), website: opt(fd, "website"), bio: opt(fd, "bio") })
    .eq("id", artistId);
  done(`/a/${artistId}/settings`, error, "Settings saved.");
}
