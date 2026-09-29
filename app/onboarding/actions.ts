"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cleanError, withMsg } from "@/lib/util";

export async function createArtist(fd: FormData) {
  const supabase = await createClient();
  const name = String(fd.get("name") ?? "").trim();
  const handle = String(fd.get("handle") ?? "").trim().toLowerCase();
  const website = String(fd.get("website") ?? "").trim();
  if (!name) redirect(withMsg("/onboarding", "err", "Add your artist name."));
  if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(handle))
    redirect(withMsg("/onboarding", "err", "Handles are 3–40 lowercase letters, numbers, or dashes, and can't start or end with a dash."));
  const { data, error } = await supabase.rpc("create_artist", { p_name: name, p_handle: handle, p_website: website });
  if (error) redirect(withMsg("/onboarding", "err", cleanError(error)));
  redirect(withMsg(`/a/${data}`, "ok", `${name} is set up. Next, submit verification so we can approve your storefront.`));
}
