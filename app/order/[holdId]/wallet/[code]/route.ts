import { loadOrder } from "@/lib/checkout";
import { buildWalletPass, walletEnabled } from "@/lib/wallet";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/email";

export const runtime = "nodejs";

/** "Add to Apple Wallet": a signed pass for one VIP pass on this order. */
export async function GET(_req: Request, { params }: { params: Promise<{ holdId: string; code: string }> }) {
  const { holdId, code } = await params;
  if (!walletEnabled()) return new Response("Apple Wallet isn't set up yet.", { status: 404 });
  const v = await loadOrder(holdId);
  const idx = v?.passes.findIndex((p) => p.code === code.toUpperCase()) ?? -1;
  if (!v?.order || idx < 0 || v.order.status === "refunded") return new Response("Not found", { status: 404 });
  const p = v.passes[idx];
  const db = createAdminClient();
  const { data: a } = db ? await db.from("artists").select("brand_color, accent_color, support_email").eq("handle", v.artist.handle).single() : { data: null };
  try {
    const buf = buildWalletPass({
      code: p.code, confirmation: v.order.confirmation_code, packageName: v.product.name,
      guestLabel: p.attendee_name ?? (v.passes.length > 1 ? `Guest ${idx + 1} of ${v.passes.length}` : v.order.fans?.name ?? "VIP guest"),
      pkgCheckinTime: v.pkgCheckin.time, pkgNotes: v.pkgCheckin.notes,
      artist: { name: v.artist.name, brand_color: a?.brand_color, accent_color: a?.accent_color, support_email: a?.support_email },
      show: v.show, orderUrl: `${siteUrl()}/order/${holdId}`,
    });
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": "application/vnd.apple.pkpass", "Content-Disposition": `attachment; filename="vip-pass-${p.code}.pkpass"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    console.error("[wallet]", e);
    return new Response("Couldn't create the Wallet pass.", { status: 500 });
  }
}
