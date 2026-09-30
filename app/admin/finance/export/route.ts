import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MONTHS, csvResponse, moneyCsv } from "@/lib/money";
import { monthlySeries, parseYear, yearRange, type Monthly } from "@/lib/finance";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: admin } = await supabase.rpc("is_super_admin");
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const year = parseYear(req.nextUrl.searchParams.get("year") ?? undefined);
  const [from, to] = yearRange(year);
  const { data } = await supabase.from("v_artist_monthly").select("*").gte("month", from).lt("month", to).returns<Monthly[]>();
  const m = data ?? [];

  if (req.nextUrl.searchParams.get("kind") === "months") {
    const keys: [string, keyof Monthly][] = [["Orders", "orders"], ["Artist sales", "gross_cents"], ["Service fees", "service_fee_cents"], ["Fees returned", "service_fee_refunded_cents"], ["P&T net revenue", "platform_net_cents"], ["Refunded to fans", "refunded_cents"]];
    const series = keys.map(([, k]) => monthlySeries(m, k));
    return csvResponse(`ontour-platform-monthly-${year}.csv`, [
      ["Month", ...keys.map(([l]) => l)],
      ...MONTHS.map((mo, i) => [`${year}-${String(i + 1).padStart(2, "0")} ${mo}`, ...series.map((s, j) => (keys[j][1] === "orders" ? s[i] : moneyCsv(s[i])))]),
    ]);
  }

  const { data: artists } = await supabase.from("artists").select("id, name, handle, status, fee_bps").returns<{ id: string; name: string; handle: string; status: string; fee_bps: number }[]>();
  const rows = (artists ?? []).map((a) => {
    const r = m.filter((x) => x.artist_id === a.id);
    const s = (k: keyof Monthly) => r.reduce((t, x) => t + (Number(x[k]) || 0), 0);
    return [a.name, a.handle, a.status, (a.fee_bps / 100).toFixed(2), s("orders"), moneyCsv(s("gross_cents")), moneyCsv(s("service_fee_cents")), moneyCsv(s("service_fee_refunded_cents")), moneyCsv(s("platform_net_cents")), moneyCsv(s("refunded_cents")), s("refunded_orders"), moneyCsv(s("dispute_lost_cents")), s("open_disputes")];
  });
  return csvResponse(`ontour-platform-by-artist-${year}.csv`, [
    ["Artist", "Handle", "Status", "Fee %", "Orders", "Artist sales", "Service fees", "Fees returned", "P&T net revenue", "Refunded to fans", "Refunded orders", "Dispute losses", "Open disputes"],
    ...rows,
  ]);
}
