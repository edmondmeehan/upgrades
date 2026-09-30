import { requireSuperAdmin } from "@/lib/auth";
import { stage, type FunnelRow } from "@/lib/growth";

const cell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export async function GET() {
  const { supabase } = await requireSuperAdmin();
  const { data } = await supabase.rpc("artist_funnel");
  const rows = (data ?? []) as FunnelRow[];
  const head = ["Artist", "Storefront", "Owner", "Owner email", "Signed up", "Stage", "Promo code", "Orders", "Sales ($)", "First sale"];
  const lines = rows.map((r) => [r.name, `https://upgrades.ontour.vip/${r.handle}`, r.owner_name, r.owner_email, r.created_at.slice(0, 10), stage(r).label,
    r.promo_code, r.orders, (Number(r.gross_cents) / 100).toFixed(2), r.first_sale_at?.slice(0, 10)].map(cell).join(","));
  return new Response([head.join(","), ...lines].join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ontour-upgrades-artists-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
