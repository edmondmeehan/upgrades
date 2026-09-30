import { loadStore } from "@/lib/storefront";
import { ogCard, ogFallback, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "VIP upgrades for this show";

export default async function Image({ params }: { params: Promise<{ handle: string; slug: string }> }) {
  const { handle, slug } = await params;
  const s = await loadStore(handle);
  const sh = s?.shows.find((x) => x.slug === slug);
  return s && sh ? ogCard(s, sh) : ogFallback();
}
