import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArtist } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { Flash } from "@/components/Flash";
import { InventoryGrid, type GridCell } from "@/components/InventoryGrid";
import type { Product, ShowProduct } from "@/lib/packages";
import type { Tour } from "@/lib/types";
import { saveInventory } from "./actions";

export const metadata = { title: "Tour inventory" };
type P = { params: Promise<{ artistId: string; tourId: string }>; searchParams: Promise<{ ok?: string; err?: string }> };
type S = { id: string; show_date: string; city: string | null; region: string | null; venue_name: string | null; currency: string };

export default async function Inventory({ params, searchParams }: P) {
  const { artistId, tourId } = await params;
  const { ok, err } = await searchParams;
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const { data: tour } = await supabase.from("tours").select("*").eq("id", tourId).eq("artist_id", artistId).maybeSingle<Tour>();
  if (!tour) notFound();
  const [{ data: shows }, { data: products }] = await Promise.all([
    supabase.from("shows").select("id, show_date, city, region, venue_name, currency").eq("tour_id", tourId).neq("status", "cancelled").order("show_date").returns<S[]>(),
    supabase.from("products").select("*").eq("artist_id", artistId).is("archived_at", null).eq("is_sample", false).order("created_at").returns<Product[]>(),
  ]);
  const ids = (shows ?? []).map((s) => s.id);
  const [{ data: sps }, { data: sales }] = ids.length
    ? await Promise.all([
        supabase.from("show_products").select("*").in("show_id", ids).returns<ShowProduct[]>(),
        supabase.from("v_show_product_sales").select("show_product_id, units, units_refunded").in("show_id", ids).returns<{ show_product_id: string; units: number; units_refunded: number }[]>(),
      ])
    : [{ data: [] as ShowProduct[] }, { data: [] }];
  const sold = new Map((sales ?? []).map((r) => [r.show_product_id, Number(r.units) - Number(r.units_refunded)]));
  const initial: Record<string, GridCell> = {};
  (sps ?? []).forEach((sp) => {
    initial[`${sp.show_id}:${sp.product_id}`] = {
      applied: sp.active, sold: sold.get(sp.id) ?? 0,
      price: sp.uses_default_price ? "" : String(sp.price_cents / 100),
      capacity: sp.uses_default_capacity ? "" : String(sp.capacity),
    };
  });
  const today = new Date().toISOString().slice(0, 10);
  const crumbs = [{ href: `/a/${artistId}/tours`, label: "Tours & shows" }, { href: `/a/${artistId}/tours/${tourId}`, label: tour.name }];

  return (
    <>
      <PageHead crumbs={crumbs} title="Inventory" aside={<Link href={`/a/${artistId}/packages?tour=${tourId}`} className="btn btn-ghost">New package</Link>}>
        Which VIP packages are sold at each show on {tour.name}, and how many.
      </PageHead>
      <Flash ok={ok} err={err} />
      {(products ?? []).length === 0 ? (
        <div className="card grid justify-items-center gap-3 px-4 py-12 text-center">
          <h2 className="text-[16px]">No packages yet</h2>
          <p className="help">Build a package once, then apply it to any show here.</p>
          <Link href={`/a/${artistId}/packages?tour=${tourId}`} className="btn">Build a package</Link>
        </div>
      ) : (shows ?? []).length === 0 ? (
        <p className="alert alert-yellow">Add shows to this tour first.</p>
      ) : (
        <InventoryGrid action={saveInventory.bind(null, artistId, tourId)} initial={initial}
          packages={products!.map((p) => ({ id: p.id, name: p.name, default_price: p.default_price_cents, default_capacity: p.default_capacity, currency_prices: (p as unknown as { currency_prices?: Record<string, number> }).currency_prices }))}
          shows={shows!.map((s) => ({ id: s.id, date: s.show_date, label: s.city ? `${s.city}${s.region ? `, ${s.region}` : ""}` : "City TBD", venue: s.venue_name, past: s.show_date < today, currency: s.currency }))} />
      )}
    </>
  );
}
