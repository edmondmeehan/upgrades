import { loadStore } from "@/lib/storefront";
import { ogCard, ogFallback, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "VIP upgrades";

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const s = await loadStore((await params).handle);
  return s ? ogCard(s) : ogFallback();
}
