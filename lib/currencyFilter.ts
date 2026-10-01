import type { SupabaseClient } from "@supabase/supabase-js";
import { isCurrency, type Currency } from "@/lib/money";

/** Which currencies this artist (or the whole platform, when artistId is null) has sold in, and which to show now. */
export async function pickCurrency(supabase: SupabaseClient, artistId: string | null, requested: string | undefined) {
  let q = supabase.from("orders").select("currency").eq("is_sample", false).limit(5000);
  if (artistId) q = q.eq("artist_id", artistId);
  const { data } = await q;
  const counts = new Map<string, number>();
  (data ?? []).forEach((r) => counts.set(r.currency, (counts.get(r.currency) ?? 0) + 1));
  const list = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).filter(isCurrency) as Currency[];
  const cur: Currency = isCurrency(requested) && (list.includes(requested) || !list.length) ? requested : list.includes("usd") ? "usd" : list[0] ?? "usd";
  return { cur, list };
}
