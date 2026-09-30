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
  const { sent, error: mailErr } = await sendEmail({
    to: email,
    subject: "You've been invited to OnTour Upgrades admin",
    eyebrow: "Staff invitation",
    title: "Join the P&T admin team",
    body: [`${profile.name ?? profile.email} invited you to be a P&T admin on OnTour Upgrades. Admins approve artists, set fees, and see platform finance.`],
    button: { label: "Accept invitation", url: `${siteUrl()}/admin-invite/${token}` },
    footnote: "This link works for 7 days. If you weren't expecting it, you can ignore this email.",
  });
  redirect(withMsg("/admin/team", sent ? "ok" : "err", sent ? `Invite sent to ${email}.` : `Invite created for ${email}, but the email didn't send (${mailErr ?? "email isn't connected"}). Copy the link below and send it yourself.`));
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

/** Sends a test email to the signed-in admin and shows Resend's answer on screen. */
export async function sendTestEmail() {
  const { profile } = await requireSuperAdmin();
  const { sent, error } = await sendEmail({
    to: profile.email, subject: "OnTour Upgrades test email", eyebrow: "Test", title: "Email is working",
    body: ["If you're reading this, OnTour Upgrades can send email from upgrades@ontour.vip."],
  });
  redirect(withMsg("/admin/team", sent ? "ok" : "err", sent
    ? `Test email sent to ${profile.email}. If it isn't in your inbox within a minute, check spam, then Resend's Emails page.`
    : `Test email failed. ${error ?? ""}`));
}

/** Sends yesterday's daily sales email to the signed-in admin only (for checking it looks right). */
export async function sendMeDailyReport() {
  const { profile } = await requireSuperAdmin();
  const { sendDailyReport, yesterdayNY } = await import("@/lib/dailyReport");
  const r = await sendDailyReport(yesterdayNY(), { onlyTo: profile.email });
  redirect(withMsg("/admin/team", r.sent ? "ok" : "err", r.sent ? `Yesterday's report sent to ${profile.email}.` : `The report didn't send (${"skipped" in r ? r.skipped : "email error"}).`));
}

export async function setMyDailyReport(on: boolean) {
  const { supabase, profile } = await requireSuperAdmin();
  await supabase.from("profiles").update({ daily_report: on }).eq("id", profile.id);
  redirect(withMsg("/admin/team", "ok", on ? "You'll get the daily sales email every morning." : "Daily sales email turned off for you."));
}

// ── Promo codes ──────────────────────────────────────────────
const promoBack = "/admin/promos";
export async function createPromo(fd: FormData) {
  const { supabase } = await requireSuperAdmin();
  const code = String(fd.get("code") ?? "").trim().toUpperCase().replace(/\s+/g, "") ||
    Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "23456789ABCDEFGHJKMNPQRSTUVWXYZ"[b % 31]).join("");
  if (!/^[A-Z0-9-]{3,30}$/.test(code)) redirect(withMsg(promoBack, "err", "Codes are 3 to 30 letters, numbers or dashes."));
  const fee = Number(String(fd.get("fee_percent") ?? "").replace("%", ""));
  if (!Number.isFinite(fee) || fee < 0 || fee > 50) redirect(withMsg(promoBack, "err", "Set the promo service fee between 0% and 50%."));
  const num = (k: string) => { const v = String(fd.get(k) ?? "").trim(); return v ? Math.floor(Number(v)) : null; };
  const months = num("months"), shows = num("show_limit"), max = num("max_redemptions");
  if (!months && !shows) redirect(withMsg(promoBack, "err", "Give the promo a length: a number of months, a number of show dates, or both."));
  const expires = String(fd.get("expires_at") ?? "").trim();
  const { error } = await supabase.rpc("admin_save_promo", {
    p_id: null, p_code: code, p_description: String(fd.get("description") ?? ""), p_fee_bps: Math.round(fee * 100),
    p_months: months, p_show_limit: shows, p_max: max, p_expires: expires ? new Date(`${expires}T23:59:59-05:00`).toISOString() : null, p_active: true,
  });
  if (error) redirect(withMsg(promoBack, "err", /duplicate|unique/i.test(error.message) ? `The code ${code} already exists.` : cleanError(error)));
  revalidatePath(promoBack);
  redirect(withMsg(promoBack, "ok", `Promo ${code} created.`));
}

export async function setPromoActive(id: string, code: string, active: boolean) {
  const { supabase } = await requireSuperAdmin();
  const { data: c } = await supabase.from("promo_codes").select("description, max_redemptions, expires_at").eq("id", id).single();
  await supabase.rpc("admin_save_promo", { p_id: id, p_code: code, p_description: c?.description ?? "", p_fee_bps: 0, p_months: null,
    p_show_limit: null, p_max: c?.max_redemptions ?? null, p_expires: c?.expires_at ?? null, p_active: active });
  revalidatePath(promoBack);
  redirect(withMsg(promoBack, "ok", active ? `${code} is active again.` : `${code} is turned off. Artists who already redeemed it keep their deal.`));
}
