"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cleanError, withMsg } from "@/lib/util";

export async function acceptAdminInvite(token: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_admin_invitation", { p_token: token });
  if (error) redirect(withMsg(`/admin-invite/${token}`, "err", cleanError(error)));
  redirect(withMsg("/admin", "ok", "You're now a P&T admin."));
}
