"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { withMsg } from "@/lib/util";

/** Deletes the signed-in user's login and personal details. Business records stay, with their name removed. */
export async function deleteMyAccount(fd: FormData) {
  const { supabase, user } = await requireUser();
  if (String(fd.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") redirect(withMsg("/account", "err", "Type DELETE to confirm."));
  const admin = createAdminClient();
  if (!admin) redirect(withMsg("/account", "err", "Account deletion isn't available right now. Contact help.please.co."));

  const { data: ok, error } = await supabase.rpc("prepare_account_deletion");
  if (error) redirect(withMsg("/account", "err", "Couldn't delete your account. Try again or contact help.please.co."));
  if (!ok) redirect(withMsg("/account", "err", "Your account can't be deleted yet. See the notes under Delete account."));

  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) redirect(withMsg("/account", "err", "Couldn't delete your login. Contact help.please.co and we'll finish it."));
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}
