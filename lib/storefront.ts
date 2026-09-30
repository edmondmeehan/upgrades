import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_ACCENT, DEFAULT_BRAND, isHex, safeAccent, textOn } from "@/lib/color";
import { siteUrl } from "@/lib/email";

export type StorePackage = {
  id: string; name: string; description: string | null; included: string[]; image_url: string | null; includes_photo: boolean;
  price_cents: number; presale: boolean; on_sale_at: string | null; off_sale_at: string | null; remaining: number;
};
export type StoreShow = { slug: string; date: string; venue: string; city: string; region: string | null; country: string; tour: string; packages: StorePackage[] };
export type Store = {
  name: string; handle: string; website: string | null; bio: string | null; tagline: string | null; verified: boolean;
  brand_color: string | null; accent_color: string | null; header_image_url: string | null; avatar_url: string | null;
  shows: StoreShow[];
};

/** One storefront read per request (page and metadata share it). */
export const loadStore = cache(async (handle: string) => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_storefront", { p_handle: handle });
  return data as Store | null;
});

export function theme(s: Pick<Store, "brand_color" | "accent_color">) {
  const brand = isHex(s.brand_color) ? s.brand_color : DEFAULT_BRAND;
  const accent = safeAccent(brand, isHex(s.accent_color) ? s.accent_color : DEFAULT_ACCENT);
  return { brand, fg: textOn(brand), accent, accentFg: textOn(accent) };
}

export const storeUrl = (handle: string, slug?: string) => `${siteUrl()}/${handle}${slug ? `/${slug}` : ""}`;
export const cityOf = (sh: Pick<StoreShow, "city" | "region">) => `${sh.city}${sh.region ? `, ${sh.region}` : ""}`;
