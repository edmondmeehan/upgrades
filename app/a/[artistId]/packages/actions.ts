"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireArtist } from "@/lib/auth";
import { cleanError, withMsg } from "@/lib/util";
import { parseCents as cents, type ShowProduct } from "@/lib/packages";

type ShowRow = { show_id: string; price: string | null; capacity: string | null }; // null = package default

const KINDS = new Set(["meet_greet", "soundcheck", "early_entry", "merch_bundle", "qa_acoustic", "custom"]);

const iso = (v: FormDataEntryValue | null) => { const s = String(v ?? ""); return s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : null; };

export async function savePackage(artistId: string, productId: string | null, fd: FormData) {
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const back = productId ? `/a/${artistId}/packages/${productId}` : `/a/${artistId}/packages/new`;
  const name = String(fd.get("name") ?? "").trim();
  if (!name) redirect(withMsg(back, "err", "Give the package a name."));

  const included = String(fd.get("included") ?? "").split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean).slice(0, 20);
  const product = {
    artist_id: artistId,
    name: name.slice(0, 120),
    description: String(fd.get("description") ?? "").trim() || null,
    kind: KINDS.has(String(fd.get("kind"))) ? String(fd.get("kind")) : "custom",
    includes_photo: fd.get("includes_photo") === "on",
    included,
    image_url: String(fd.get("image_url") ?? "").trim() || null,
    default_price_cents: cents(String(fd.get("default_price") ?? "")),
    default_capacity: Math.floor(Number(fd.get("default_capacity"))),
  };
  if (!Number.isFinite(product.default_price_cents) || product.default_price_cents < 100) redirect(withMsg(back, "err", "Set a default price of at least $1."));
  if (!Number.isFinite(product.default_capacity) || product.default_capacity < 1) redirect(withMsg(back, "err", "Set a default quantity of at least 1."));

  let rows: ShowRow[] = [];
  try { rows = JSON.parse(String(fd.get("shows") ?? "[]")); } catch { /* handled below */ }
  const onSale = iso(fd.get("on_sale_at")), offSale = iso(fd.get("off_sale_at"));
  if (onSale && offSale && offSale <= onSale) redirect(withMsg(back, "err", "Off-sale time has to be after the on-sale time."));
  const presale = String(fd.get("presale_code") ?? "").trim().toUpperCase().replace(/\s+/g, "") || null;

  const clean: { show_id: string; price_cents: number; capacity: number; uses_default_price: boolean; uses_default_capacity: boolean }[] = [];
  for (const r of rows) {
    const p = r.price ? cents(r.price) : product.default_price_cents;
    const c = r.capacity ? Math.floor(Number(r.capacity)) : product.default_capacity;
    if (!Number.isFinite(p) || p < 100) redirect(withMsg(back, "err", "Every show needs a price of at least $1."));
    if (!Number.isFinite(c) || c < 1) redirect(withMsg(back, "err", "Every show needs a quantity of at least 1."));
    clean.push({ show_id: r.show_id, price_cents: p, capacity: c, uses_default_price: !r.price, uses_default_capacity: !r.capacity });
  }

  // Check sold counts before changing anything, so a quantity can't drop below what's already sold.
  if (productId) {
    const { data: sales } = await supabase.from("v_show_product_sales").select("show_id, units, units_refunded").eq("product_id", productId)
      .returns<{ show_id: string; units: number; units_refunded: number }[]>();
    const soldAt = new Map((sales ?? []).map((r) => [r.show_id, Number(r.units) - Number(r.units_refunded)]));
    const short = clean.find((c) => c.capacity < (soldAt.get(c.show_id) ?? 0));
    if (short) redirect(withMsg(back, "err", `One show has already sold ${soldAt.get(short.show_id)}, so its quantity can't go below that.`));
  }

  let id = productId;
  if (id) {
    const { error } = await supabase.from("products").update(product).eq("id", id).eq("artist_id", artistId);
    if (error) redirect(withMsg(back, "err", cleanError(error)));
  } else {
    const { data, error } = await supabase.from("products").insert(product).select("id").single();
    if (error || !data) redirect(withMsg(back, "err", cleanError(error)));
    id = data.id;
  }

  const { data: existing } = await supabase.from("show_products").select("*").eq("product_id", id).returns<ShowProduct[]>();
  const keep = new Set(clean.map((c) => c.show_id));
  const window = { on_sale_at: onSale, off_sale_at: offSale, presale_code: presale, active: true };

  const upserts = clean.map((c) => ({ artist_id: artistId, product_id: id, ...c, ...window })); // matched on (show_id, product_id)
  if (upserts.length) {
    const { error } = await supabase.from("show_products").upsert(upserts, { onConflict: "show_id,product_id" });
    if (error) redirect(withMsg(`/a/${artistId}/packages/${id}`, "err", cleanError(error)));
  }
  let paused = 0;
  for (const e of existing ?? []) {
    if (keep.has(e.show_id)) continue;
    const { error } = await supabase.from("show_products").delete().eq("id", e.id);
    if (error) { await supabase.from("show_products").update({ active: false }).eq("id", e.id); paused++; } // has orders: stop selling instead
  }

  revalidatePath(`/a/${artistId}/packages`);
  const msg = `Saved. On sale at ${clean.length} show${clean.length === 1 ? "" : "s"}.${paused ? ` ${paused} show${paused === 1 ? " has" : "s have"} sales already, so ${paused === 1 ? "it's" : "they're"} paused rather than removed.` : ""}`;
  redirect(withMsg(`/a/${artistId}/packages/${id}`, "ok", msg));
}

export async function archivePackage(artistId: string, productId: string, archive: boolean) {
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const { error } = await supabase.from("products").update({ archived_at: archive ? new Date().toISOString() : null }).eq("id", productId).eq("artist_id", artistId);
  if (error) redirect(withMsg(`/a/${artistId}/packages/${productId}`, "err", cleanError(error)));
  redirect(withMsg(`/a/${artistId}/packages`, "ok", archive ? "Package archived. It's off sale everywhere." : "Package restored."));
}
