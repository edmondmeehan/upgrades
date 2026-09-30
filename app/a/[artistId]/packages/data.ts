import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormShow } from "@/components/PackageForm";
import type { ShowProduct } from "@/lib/packages";

type ShowRow = { id: string; show_date: string; city: string | null; region: string | null; venue_name: string | null; tour_id: string; status: string; tours: { name: string } };

/** Every show for the artist, with this package's price, quantity and units sold filled in where it's already on sale. */
export async function loadFormShows(supabase: SupabaseClient, artistId: string, opts: {
  productId?: string; defaultPrice: number; defaultCapacity: number; preselectTour?: string;
}): Promise<FormShow[]> {
  const [{ data: shows }, { data: sps }, { data: sales }] = await Promise.all([
    supabase.from("shows").select("id, show_date, city, region, venue_name, tour_id, status, tours(name)").eq("artist_id", artistId)
      .neq("status", "cancelled").order("show_date").returns<ShowRow[]>(),
    opts.productId ? supabase.from("show_products").select("*").eq("product_id", opts.productId).returns<ShowProduct[]>() : Promise.resolve({ data: [] as ShowProduct[] }),
    opts.productId ? supabase.from("v_show_product_sales").select("show_product_id, units, units_refunded").eq("product_id", opts.productId)
      .returns<{ show_product_id: string; units: number; units_refunded: number }[]>() : Promise.resolve({ data: [] }),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const bySp = new Map((sps ?? []).map((sp) => [sp.show_id, sp]));
  const sold = new Map((sales ?? []).map((r) => [r.show_product_id, Number(r.units) - Number(r.units_refunded)]));
  return (shows ?? []).map((s) => {
    const sp = bySp.get(s.id);
    return {
      id: s.id, date: s.show_date, label: s.city ? `${s.city}${s.region ? `, ${s.region}` : ""}` : "City TBD", venue: s.venue_name,
      tour_id: s.tour_id, tour_name: s.tours?.name ?? "Tour", past: s.show_date < today,
      selected: sp ? sp.active : !opts.productId && (!opts.preselectTour || opts.preselectTour === s.tour_id) && s.show_date >= today,
      price: sp ? String(sp.price_cents / 100) : String(opts.defaultPrice), capacity: String(sp?.capacity ?? opts.defaultCapacity),
      sold: sp ? sold.get(sp.id) ?? 0 : 0,
    };
  });
}
