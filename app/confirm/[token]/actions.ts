"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function confirmArtist(token: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("confirm_third_party", { p_token: token });
  redirect(`/confirm/${token}?${data ? "done=1" : "failed=1"}`);
}
