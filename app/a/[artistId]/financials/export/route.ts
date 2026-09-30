import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { csvResponse, moneyCsv } from "@/lib/money";
import { parseYear, showLabel, yearRange, type Monthly, type OrderMoney, type ProductSales, type ShowInfo, type ShowMoney } from "@/lib/finance";

export async function GET(req: NextRequest, { params }: { params: Promise<{ artistId: string }> }) {
  const { artistId } = await params;
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("is_finance", { p_artist: artistId });
  if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: artist } = await supabase.from("artists").select("handle").eq("id", artistId).single<{ handle: string }>();
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind");
  const year = parseYear(sp.get("year") ?? undefined);
  const [from, to] = yearRange(year);
  const slug = artist?.handle ?? "artist";
  const { data: shows } = await supabase.from("shows").select("id, show_date, city, region, venue_name, tour_id, status").eq("artist_id", artistId).returns<ShowInfo[]>();
  const showMap = new Map((shows ?? []).map((s) => [s.id, s]));
  const showCols = (id: string) => { const s = showMap.get(id); return [s?.show_date ?? "", showLabel(s), s?.venue_name ?? ""]; };

  if (kind === "transactions") {
    const [{ data: orders }, { data: refunds }, { data: disputes }] = await Promise.all([
      supabase.from("v_order_money").select("*").eq("artist_id", artistId).gte("created_at", from).lt("created_at", to).order("created_at").returns<OrderMoney[]>(),
      supabase.from("refunds").select("id, order_id, amount_cents, service_fee_refunded_cents, reason, created_at, orders!inner(show_id)").eq("artist_id", artistId).gte("created_at", from).lt("created_at", to).returns<{ id: string; order_id: string; amount_cents: number; service_fee_refunded_cents: number; reason: string | null; created_at: string; orders: { show_id: string } }[]>(),
      supabase.from("disputes").select("id, order_id, amount_cents, fee_cents, platform_fee_reversed_cents, status, opened_at, orders!inner(show_id)").eq("artist_id", artistId).gte("opened_at", from).lt("opened_at", to).returns<{ id: string; order_id: string; amount_cents: number; fee_cents: number; platform_fee_reversed_cents: number; status: string; opened_at: string; orders: { show_id: string } }[]>(),
    ]);
    const rows: (string | number)[][] = [["Date", "Type", "Order ID", "Show date", "Show", "Venue", "Artist price", "Service fee (paid by fan)", "Fan paid", "Stripe processing", "Refund to fan", "Service fee returned", "Dispute amount", "Dispute fee", "Net to artist"]];
    (orders ?? []).forEach((o) => rows.push([o.created_at.slice(0, 10), "Order", o.order_id, ...showCols(o.show_id), moneyCsv(o.gross_cents), moneyCsv(o.service_fee_cents), moneyCsv(o.total_cents), moneyCsv(-o.stripe_fee_cents), "", "", "", "", moneyCsv(o.gross_cents - o.stripe_fee_cents)]));
    (refunds ?? []).forEach((r) => rows.push([r.created_at.slice(0, 10), "Refund", r.order_id, ...showCols(r.orders.show_id), "", "", "", "", moneyCsv(-r.amount_cents), moneyCsv(r.service_fee_refunded_cents), "", "", moneyCsv(-(r.amount_cents - r.service_fee_refunded_cents))]));
    (disputes ?? []).forEach((d) => {
      const lost = d.status === "lost" ? d.amount_cents - d.platform_fee_reversed_cents : 0;
      rows.push([d.opened_at.slice(0, 10), `Dispute (${d.status})`, d.order_id, ...showCols(d.orders.show_id), "", "", "", "", "", "", moneyCsv(d.status === "lost" ? -d.amount_cents : 0), moneyCsv(-d.fee_cents), moneyCsv(-(lost + d.fee_cents))]);
    });
    rows.splice(1, rows.length - 1, ...rows.slice(1).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
    return csvResponse(`${slug}-transactions-${year}.csv`, rows);
  }

  if (kind === "monthly") {
    const { data } = await supabase.from("v_artist_monthly").select("*").eq("artist_id", artistId).gte("month", from).lt("month", to).order("month").returns<Monthly[]>();
    return csvResponse(`${slug}-monthly-${year}.csv`, [
      ["Month", "Orders", "Artist sales", "Service fees (paid by fans)", "Service fees returned", "Refunded to fans", "Stripe processing", "Dispute losses", "Dispute fees", "Net to artist"],
      ...(data ?? []).map((m) => [m.month.slice(0, 7), m.orders, moneyCsv(m.gross_cents), moneyCsv(m.service_fee_cents), moneyCsv(m.service_fee_refunded_cents), moneyCsv(m.refunded_cents), moneyCsv(m.stripe_fee_cents), moneyCsv(m.dispute_lost_cents), moneyCsv(m.dispute_fee_cents), moneyCsv(m.net_to_artist_cents)]),
    ]);
  }

  if (kind === "payouts") {
    const { data } = await supabase.from("payouts").select("stripe_payout_id, amount_cents, arrival_date, status").eq("artist_id", artistId).gte("arrival_date", from).lt("arrival_date", to).order("arrival_date").returns<{ stripe_payout_id: string | null; amount_cents: number; arrival_date: string; status: string }[]>();
    return csvResponse(`${slug}-payouts-${year}.csv`, [["Arrival date", "Stripe payout ID", "Status", "Amount"], ...(data ?? []).map((p) => [p.arrival_date, p.stripe_payout_id ?? "", p.status, moneyCsv(p.amount_cents)])]);
  }

  const settlementHeader = ["Show date", "Show", "Venue", "Orders", "Artist sales", "Refunded (artist share)", "Stripe processing", "Dispute costs", "Net to artist", "Service fees (paid by fans)"];
  const settlementRow = (s: ShowMoney) => [...showCols(s.show_id), s.orders, moneyCsv(s.gross_cents), moneyCsv(s.artist_refunded_cents), moneyCsv(s.stripe_fee_cents), moneyCsv(s.dispute_cost_cents), moneyCsv(s.net_to_artist_cents), moneyCsv(s.service_fee_cents - s.service_fee_refunded_cents)];

  if (kind === "shows") {
    const { data } = await supabase.from("v_show_money").select("*").eq("artist_id", artistId).gte("show_date", from).lt("show_date", to).order("show_date").returns<ShowMoney[]>();
    return csvResponse(`${slug}-settlements-${year}.csv`, [settlementHeader, ...(data ?? []).map(settlementRow)]);
  }

  if (kind === "tour") {
    const tour = sp.get("tour") ?? "";
    const { data } = await supabase.from("v_show_money").select("*").eq("artist_id", artistId).eq("tour_id", tour).order("show_date").returns<ShowMoney[]>();
    return csvResponse(`${slug}-tour.csv`, [settlementHeader, ...(data ?? []).map(settlementRow)]);
  }

  if (kind === "settlement") {
    const show = sp.get("show") ?? "";
    const [{ data: m }, { data: p }] = await Promise.all([
      supabase.from("v_show_money").select("*").eq("artist_id", artistId).eq("show_id", show).maybeSingle<ShowMoney>(),
      supabase.from("v_show_product_sales").select("*").eq("artist_id", artistId).eq("show_id", show).returns<ProductSales[]>(),
    ]);
    const s = showMap.get(show);
    const rows: (string | number)[][] = [
      ["Settlement", `${showLabel(s)} ${s?.show_date ?? ""}`], ["Venue", s?.venue_name ?? ""], [],
      ["Line", "Amount"],
      ["Artist sales", moneyCsv(m?.gross_cents)], ["Refunded (artist share)", moneyCsv(-(m?.artist_refunded_cents ?? 0))],
      ["Stripe processing", moneyCsv(-(m?.stripe_fee_cents ?? 0))], ["Dispute costs", moneyCsv(-(m?.dispute_cost_cents ?? 0))],
      ["Net to artist", moneyCsv(m?.net_to_artist_cents)], ["Service fees paid by fans (P&T)", moneyCsv((m?.service_fee_cents ?? 0) - (m?.service_fee_refunded_cents ?? 0))], [],
      ["Upgrade", "Price", "Capacity", "Sold", "Refunded", "Checked in", "Sales"],
      ...(p ?? []).map((r) => [r.product_name, moneyCsv(r.price_cents), r.capacity, r.units - r.units_refunded, r.units_refunded, r.checked_in, moneyCsv(r.net_gross_cents)]),
    ];
    return csvResponse(`${slug}-settlement-${s?.show_date ?? "show"}.csv`, rows);
  }

  return NextResponse.json({ error: "Unknown export" }, { status: 400 });
}
