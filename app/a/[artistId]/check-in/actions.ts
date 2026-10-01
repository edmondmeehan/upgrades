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
  const { supabase } = await requireArtist(artistId, ["owner", "rep", "door"]);
  const { data, error } = await supabase.rpc("check_in_pass", { p_show: showId, p_code: code });
  if (error) return { result: "error", message: "Couldn't check in. Check your connection and try again." };
  revalidatePath(`/a/${artistId}/check-in/${showId}`);
  const r = data as CheckInResult;
  if (r.answers && Object.keys(r.answers).length) r.answersText = Object.values(r.answers).join(", ");
  return r;
}

export async function undoCheckIn(artistId: string, showId: string, passId: string) {
  const { supabase } = await requireArtist(artistId, ["owner", "rep", "door"]);
  const { error } = await supabase.rpc("undo_check_in", { p_pass: passId });
  revalidatePath(`/a/${artistId}/check-in/${showId}`);
  return { ok: !error };
}

export type DoorGuest = { pass_id: string; code: string; name: string; buyer: string | null; email: string | null; pkg: string; guest: number; of_qty: number;
  checked_in_at: string | null; is_void: boolean; is_comp: boolean; answers: Record<string, string> | null };

/** The door list, fetched by the check-in app (and saved on the phone for offline use). */
export async function getGuestList(artistId: string, showId: string): Promise<DoorGuest[]> {
  const { supabase } = await requireArtist(artistId, ["owner", "rep", "door"]);
  const { data } = await supabase.rpc("checkin_guest_list", { p_show: showId });
  return (data ?? []) as DoorGuest[];
}

/** Sends check-ins that were made offline. Returns each code's result so the phone can reconcile. */
export async function syncCheckIns(artistId: string, showId: string, codes: string[]) {
  const { supabase } = await requireArtist(artistId, ["owner", "rep", "door"]);
  const results: { code: string; result: string; by?: string | null; at?: string }[] = [];
  for (const code of codes.slice(0, 500)) {
    const { data, error } = await supabase.rpc("check_in_pass", { p_show: showId, p_code: code });
    const r = (data ?? {}) as CheckInResult;
    results.push({ code, result: error ? "error" : r.result, by: r.by, at: r.at });
  }
  return results;
}
