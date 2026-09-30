"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { sendEmail, siteUrl } from "@/lib/email";
import { cleanError, withMsg } from "@/lib/util";

const CHECKS = ["website", "socials", "proof", "stripe"] as const;

export async function reviewArtist(artistId: string, fd: FormData) {
  const { supabase } = await requireSuperAdmin();
  const decision = String(fd.get("decision") ?? "");
  const notes = String(fd.get("notes") ?? "").trim();
  const checklist = Object.fromEntries(CHECKS.map((k) => [k, fd.get(`check_${k}`) === "on"]));
  const back = `/admin/artists/${artistId}`;
  const { error } = await supabase.rpc("review_artist", { p_artist: artistId, p_decision: decision, p_notes: notes || null, p_checklist: checklist });
  if (error) redirect(withMsg(back, "err", cleanError(error)));

  const { data: owners } = await supabase.from("artist_members")
    .select("profiles!artist_members_user_id_fkey(email), artists(name)").eq("artist_id", artistId).eq("role", "owner")
    .returns<{ profiles: { email: string }; artists: { name: string } }[]>();
  const link = `${siteUrl()}/a/${artistId}`;
  const name = owners?.[0]?.artists.name ?? "Your artist";
  const mail: Record<string, Parameters<typeof sendEmail>[0] | undefined> = {
    approve: { to: "", subject: `${name} is verified on OnTour Upgrades`, eyebrow: "Verified", title: "You're approved",
      body: [`${name} is verified. Your storefront is live, and every show you publish is listed there.`, "Next, set up payouts with Stripe and add your VIP packages so fans can start buying."],
      button: { label: "Open your dashboard", url: link } },
    reject: { to: "", subject: `${name} needs a few changes`, eyebrow: "Verification", title: "A few changes needed",
      body: ["P&T reviewed your verification and needs a few changes before approving:", notes, "Update your details and resubmit when you're ready."],
      button: { label: "Update and resubmit", url: `${link}/verification` } },
    suspend: { to: "", subject: `${name} storefront is offline`, eyebrow: "Account", title: "Your storefront is offline",
      body: ["P&T has taken your storefront offline.", ...(notes ? [notes] : []), "Reply through help.please.co and we'll sort it out."],
      button: { label: "Contact support", url: "https://help.please.co" } },
    reinstate: { to: "", subject: `${name} storefront is back online`, eyebrow: "Account", title: "You're back online",
      body: ["Your account has been reinstated and your storefront is live again."], button: { label: "Open your dashboard", url: link } },
  };
  const m = mail[decision];
  if (m) for (const o of owners ?? []) await sendEmail({ ...m, to: o.profiles.email });
  revalidatePath("/admin");
  const done = { approve: "Approved. The artist has been emailed.", reject: "Changes requested. The artist has been emailed.", suspend: "Suspended.", reinstate: "Reinstated." }[decision] ?? "Saved.";
  redirect(withMsg(back, "ok", done));
}

export async function setFee(artistId: string, fd: FormData) {
  const { supabase } = await requireSuperAdmin();
  const percent = Number(String(fd.get("fee_percent") ?? "").replace("%", ""));
  const back = `/admin/artists/${artistId}`;
  if (!Number.isFinite(percent)) redirect(withMsg(back, "err", "Enter the fee as a percentage, like 10 or 8.5."));
  const { error } = await supabase.rpc("set_artist_fee", { p_artist: artistId, p_bps: Math.round(percent * 100), p_note: String(fd.get("note") ?? "").trim() || null });
  redirect(withMsg(back, error ? "err" : "ok", error ? cleanError(error) : `Service fee set to ${percent}%.`));
}

export async function toggleManaged(artistId: string, flag: boolean) {
  const { supabase } = await requireSuperAdmin();
  const { error } = await supabase.rpc("set_managed_candidate", { p_artist: artistId, p_flag: flag });
  redirect(withMsg(`/admin/artists/${artistId}`, error ? "err" : "ok", error ? cleanError(error) : flag ? "Flagged for a managed P&T program." : "Flag removed."));
}

export async function openAsAdmin(artistId: string) {
  const { supabase } = await requireSuperAdmin();
  await supabase.rpc("log_assist", { p_artist: artistId });
  redirect(`/a/${artistId}`);
}

export async function loadSampleSales(artistId: string) {
  const { supabase } = await requireSuperAdmin();
  const { data, error } = await supabase.rpc("generate_sample_sales", { p_artist: artistId });
  redirect(withMsg(`/admin/artists/${artistId}`, error ? "err" : "ok", error ? cleanError(error) : `Loaded ${data} sample orders. Open their financials to see them.`));
}

export async function clearSampleSales(artistId: string) {
  const { supabase } = await requireSuperAdmin();
  const { error } = await supabase.rpc("clear_sample_sales", { p_artist: artistId });
  redirect(withMsg(`/admin/artists/${artistId}`, error ? "err" : "ok", error ? cleanError(error) : "Sample sales removed."));
}

// ── P&T admin team ───────────────────────────────────────────
export async function inviteAdmin(fd: FormData) {
  const { supabase, profile } = await requireSuperAdmin();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const { data: token, error } = await supabase.rpc("create_admin_invitation", { p_email: email });
  if (error) redirect(withMsg("/admin/team", "err", cleanError(error)));
  const { sent } = await sendEmail({
    to: email,
    subject: "You've been invited to OnTour Upgrades admin",
    eyebrow: "Staff invitation",
    title: "Join the P&T admin team",
    body: [`${profile.name ?? profile.email} invited you to be a P&T admin on OnTour Upgrades. Admins approve artists, set fees, and see platform finance.`],
    button: { label: "Accept invitation", url: `${siteUrl()}/admin-invite/${token}` },
    footnote: "This link works for 7 days. If you weren't expecting it, you can ignore this email.",
  });
  redirect(withMsg("/admin/team", "ok", sent ? `Invite sent to ${email}.` : `Invite created for ${email}. Email isn't connected yet, so copy the link below and send it yourself.`));
}

export async function revokeAdminInvite(id: string) {
  const { supabase } = await requireSuperAdmin();
  const { error } = await supabase.rpc("revoke_admin_invitation", { p_id: id });
  redirect(withMsg("/admin/team", error ? "err" : "ok", error ? cleanError(error) : "Invite revoked."));
}

export async function removeAdmin(userId: string) {
  const { supabase } = await requireSuperAdmin();
  const { error } = await supabase.rpc("remove_admin", { p_user: userId });
  redirect(withMsg("/admin/team", error ? "err" : "ok", error ? cleanError(error) : "Admin access removed."));
}
