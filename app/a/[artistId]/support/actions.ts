"use server";
import { revalidatePath } from "next/cache";
import { requireArtist } from "@/lib/auth";

export async function setSupportStatus(artistId: string, id: string, resolved: boolean) {
  const { supabase, profile } = await requireArtist(artistId, ["owner", "rep"]);
  await supabase.from("support_requests").update(resolved
    ? { status: "resolved", resolved_at: new Date().toISOString(), resolved_by: profile.id }
    : { status: "open", resolved_at: null, resolved_by: null }).eq("id", id).eq("artist_id", artistId);
  revalidatePath(`/a/${artistId}/support`);
}
