import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExportShow } from "@/lib/linkExport";

/** Upcoming published dates, optionally for one tour. */
export async function exportShows(supabase: SupabaseClient, artistId: string, tourId?: string | null) {
  let q = supabase.from("shows").select("slug, show_date, show_time, city, region, country, venue_name, tour_id, tours(name)")
    .eq("artist_id", artistId).eq("status", "published").gte("show_date", new Date().toISOString().slice(0, 10)).order("show_date");
  if (tourId) q = q.eq("tour_id", tourId);
  const { data } = await q;
  return (data ?? []) as unknown as (ExportShow & { tour_id: string })[];
}
