"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireArtist } from "@/lib/auth";
import { cleanError, withMsg } from "@/lib/util";
import { parseCents, type Product, type ShowProduct } from "@/lib/packages";

type Cell = { show_id: string; product_id: string; applied: boolean; price: string | null; capacity: string | null };

/** Saves the whole tour grid: which packages are sold at which shows, and any per-show price or quantity. */
export async function saveInventory(artistId: string, tourId: string, fd: FormData) {
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const back = `/a/${artistId}/tours/${tourId}/inventory`;
  let cells: Cell[] = [];
  try { cells = JSON.parse(String(fd.get("cells") ?? "[]")); } catch { redirect(withMsg(back, "err", "Couldn't read your changes. Try again.")); }

  const [{ data: shows }, { data: products }] = await Promise.all([
    supabase.from("shows").select("id").eq("tour_id", tourId).eq("artist_id", artistId).returns<{ id: string }[]>(),
    supabase.from("products").select("*").eq("artist_id", artistId).is("archived_at", null).eq("is_sample", false).returns<Product[]>(),
  ]);
  const showIds = new Set((shows ?? []).map((s) => s.id));
  const prod = new Map((products ?? []).map((p) => [p.id, p]));
  cells = cells.filter((c) => showIds.has(c.show_id) && prod.has(c.product_id));
  if (cells.length === 0) redirect(back);

  const productIds = [...new Set(cells.map((c) => c.product_id))];
  const [{ data: existing }, { data: sales }, { data: any }] = await Promise.all([
    supabase.from("show_products").select("*").in("show_id", [...showIds]).in("product_id", productIds).returns<ShowProduct[]>(),
    supabase.from("v_show_product_sales").select("show_product_id, units, units_refunded").in("show_id", [...showIds])
      .returns<{ show_product_id: string; units: number; units_refunded: number }[]>(),
    // a package's sale window and presale code carry over to shows it's newly added to
    supabase.from("show_products").select("product_id, on_sale_at, off_sale_at, presale_code").in("product_id", productIds)
      .returns<{ product_id: string; on_sale_at: string | null; off_sale_at: string | null; presale_code: string | null }[]>(),
  ]);
  const key = (s: string, p: string) => `${s}:${p}`;
  const ex = new Map((existing ?? []).map((e) => [key(e.show_id, e.product_id), e]));
  const sold = new Map((sales ?? []).map((r) => [r.show_product_id, Number(r.units) - Number(r.units_refunded)]));
  const windowOf = new Map((any ?? []).map((r) => [r.product_id, r]));

  const upserts = [];
  for (const c of cells.filter((c) => c.applied)) {
    const p = prod.get(c.product_id)!;
    const price = c.price ? parseCents(c.price) : p.default_price_cents ?? NaN;
    const capacity = c.capacity ? Math.floor(Number(c.capacity)) : p.default_capacity ?? NaN;
    if (!Number.isFinite(price) || price < 100) redirect(withMsg(back, "err", `${p.name} needs a price of at least $1 at every show it's on.`));
    if (!Number.isFinite(capacity) || capacity < 1) redirect(withMsg(back, "err", `${p.name} needs a quantity of at least 1 at every show it's on.`));
    const e = ex.get(key(c.show_id, c.product_id));
    const already = e ? sold.get(e.id) ?? 0 : 0;
    if (capacity < already) redirect(withMsg(back, "err", `${p.name} has already sold ${already} at one show, so its quantity there can't go below that.`));
    const w = e ?? windowOf.get(c.product_id);
    upserts.push({
      artist_id: artistId, show_id: c.show_id, product_id: c.product_id, price_cents: price, capacity, active: true,
      uses_default_price: !c.price, uses_default_capacity: !c.capacity,
      on_sale_at: w?.on_sale_at ?? null, off_sale_at: w?.off_sale_at ?? null, presale_code: w?.presale_code ?? null,
    });
  }
  if (upserts.length) {
    const { error } = await supabase.from("show_products").upsert(upserts, { onConflict: "show_id,product_id" });
    if (error) redirect(withMsg(back, "err", cleanError(error)));
  }

  let paused = 0;
  for (const c of cells.filter((c) => !c.applied)) {
    const e = ex.get(key(c.show_id, c.product_id));
    if (!e || !e.active) continue;
    const { error } = await supabase.from("show_products").delete().eq("id", e.id);
    if (error) { await supabase.from("show_products").update({ active: false }).eq("id", e.id); paused++; }
  }

  revalidatePath(back);
  redirect(withMsg(back, "ok", `Inventory saved.${paused ? ` ${paused} package${paused === 1 ? " was" : "s were"} paused instead of removed because ${paused === 1 ? "it has" : "they have"} sales.` : ""}`));
}
