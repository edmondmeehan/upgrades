"use server";
import { revalidatePath } from "next/cache";
import { requireArtist } from "@/lib/auth";

export type CheckInResult = {
  result: "ok" | "already" | "not_found" | "wrong_show" | "void" | "error";
  code?: string; pass_id?: string; name?: string | null; email?: string | null; package?: string | null;
  guest?: number; of?: number; at?: string; by?: string | null; other_city?: string | null; other_date?: string | null; message?: string;
  answers?: Record<string, string> | null; answersText?: string;
};

export async function checkInCode(artistId: string, showId: string, code: string): Promise<CheckInResult> {
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const { data, error } = await supabase.rpc("check_in_pass", { p_show: showId, p_code: code });
  if (error) return { result: "error", message: "Couldn't check in. Check your connection and try again." };
  revalidatePath(`/a/${artistId}/check-in/${showId}`);
  const r = data as CheckInResult;
  if (r.answers && Object.keys(r.answers).length) r.answersText = Object.values(r.answers).join(", ");
  return r;
}

export async function undoCheckIn(artistId: string, showId: string, passId: string) {
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const { error } = await supabase.rpc("undo_check_in", { p_pass: passId });
  revalidatePath(`/a/${artistId}/check-in/${showId}`);
  return { ok: !error };
}
