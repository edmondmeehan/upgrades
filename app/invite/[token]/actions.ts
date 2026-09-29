"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cleanError, withMsg } from "@/lib/util";

export async function acceptInvite(token: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) redirect(withMsg(`/invite/${token}`, "err", cleanError(error)));
  redirect(withMsg(`/a/${data}`, "ok", "You've joined the team."));
}
