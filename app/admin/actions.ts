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
  const mail: Record<string, [string, string] | undefined> = {
    approve: ["is verified on OnTour Upgrades", "You're approved. Your storefront is live and your published shows are listed there. Upgrades and payouts are coming next."],
    reject: ["needs a few changes", `P&T reviewed your verification and needs a few changes before approving:\n\n${notes}\n\nUpdate and resubmit here:`],
    suspend: ["storefront is offline", `Your storefront has been taken offline.${notes ? `\n\n${notes}` : ""}\n\nReply through help.please.co to sort it out.`],
    reinstate: ["storefront is back online", "Your account has been reinstated and your storefront is live again."],
  };
  const m = mail[decision];
  for (const o of owners ?? []) {
    if (m) await sendEmail({ to: o.profiles.email, subject: `${o.artists.name} ${m[0]}`, text: `${m[1]}\n\n${link}` });
  }
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
