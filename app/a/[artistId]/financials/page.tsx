import Link from "next/link";
import { requireArtist } from "@/lib/auth";
import { BarChart, Meter } from "@/components/BarChart";
import { money, rate, sum } from "@/lib/money";
import { byProduct, monthlySeries, parseYear, showLabel, yearRange, type Monthly, type ProductSales, type ShowInfo, type ShowMoney } from "@/lib/finance";
import { formatDate } from "@/lib/util";

type P = { params: Promise<{ artistId: string }>; searchParams: Promise<{ year?: string }> };

export default async function FinanceOverview({ params, searchParams }: P) {
  const { artistId } = await params;
  const year = parseYear((await searchParams).year);
  const [from, to] = yearRange(year);
  const { supabase } = await requireArtist(artistId, ["owner", "accountant"]);

  const [{ data: monthly }, { data: shows }, { data: showMoney }] = await Promise.all([
    supabase.from("v_artist_monthly").select("*").eq("artist_id", artistId).gte("month", from).lt("month", to).returns<Monthly[]>(),
    supabase.from("shows").select("id, show_date, city, region, venue_name, tour_id, status").eq("artist_id", artistId).gte("show_date", from).lt("show_date", to).returns<ShowInfo[]>(),
    supabase.from("v_show_money").select("*").eq("artist_id", artistId).gte("show_date", from).lt("show_date", to).returns<ShowMoney[]>(),
  ]);
  const m = monthly ?? [];
  const showIds = (shows ?? []).map((s) => s.id);
  const { data: products } = showIds.length
    ? await supabase.from("v_show_product_sales").select("*").in("show_id", showIds).returns<ProductSales[]>()
    : { data: [] as ProductSales[] };

  if (m.length === 0 && (showMoney ?? []).length === 0) {
    return (
      <div className="card grid justify-items-center gap-2 px-4 py-14 text-center">
        <h2 className="text-[16px]">No sales in {year}</h2>
        <p className="help max-w-md">Once upgrades are on sale, each order, refund, and payout shows up here automatically, with a settlement for every show.</p>
      </div>
    );
  }

  const gross = sum(m, "gross_cents"), fees = sum(m, "service_fee_cents"), stripe = sum(m, "stripe_fee_cents");
  const refunded = sum(m, "refunded_cents"), feeRefunded = sum(m, "service_fee_refunded_cents");
  const net = sum(m, "net_to_artist_cents"), orders = sum(m, "orders");
  const disputeCost = sum(m, "dispute_lost_cents") + sum(m, "dispute_fee_cents");
  const p = products ?? [];
  const units = p.reduce((a, r) => a + r.units - r.units_refunded, 0);
  const pastIds = new Set((shows ?? []).filter((s) => s.show_date < new Date().toISOString().slice(0, 10)).map((s) => s.id));
  const pastUnits = p.filter((r) => pastIds.has(r.show_id)).reduce((a, r) => a + r.units - r.units_refunded, 0);
  const checkedIn = p.filter((r) => pastIds.has(r.show_id)).reduce((a, r) => a + r.checked_in, 0);
  const photoUnits = p.filter((r) => r.includes_photo).reduce((a, r) => a + r.units - r.units_refunded, 0);
  const showMap = new Map((shows ?? []).map((s) => [s.id, s]));
  const top = [...(showMoney ?? [])].sort((a, b) => b.gross_cents - a.gross_cents).slice(0, 6);
  const nowMonth = new Date().getFullYear() === year ? new Date().getMonth() : undefined;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="stat"><b>{money(gross)}</b><span>Upgrade sales (your prices)</span></div>
        <div className="stat"><b>{money(refunded - feeRefunded)}</b><span>Refunded (your share)</span></div>
        <div className="stat"><b>{money(stripe)}</b><span>Stripe processing</span></div>
        <div className="stat !border-violet"><b className="text-violet">{money(net)}</b><span>Net to you</span></div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="stat"><b>{orders.toLocaleString()}</b><span>Orders</span></div>
        <div className="stat"><b>{units.toLocaleString()}</b><span>Upgrades sold</span></div>
        <div className="stat"><b>{rate(checkedIn, pastUnits)}</b><span>Check-in rate (past shows)</span></div>
        <div className="stat"><b>{photoUnits.toLocaleString()}</b><span>Photo upgrades sold</span></div>
      </div>

      <section className="card grid gap-4 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2>Net to you by month</h2>
          <span className="help">By order date, {year}</span>
        </div>
        <BarChart values={monthlySeries(m, "net_to_artist_cents")} label={`Net to artist by month, ${year}`} highlight={nowMonth} />
        <p className="help">
          Fans paid {money(gross + fees)} in total. {money(fees)} of that was the P&amp;T service fee, which fans pay on top of your price
          {feeRefunded ? ` (${money(feeRefunded)} of it was returned with refunds)` : ""}.
          {disputeCost ? ` Chargebacks cost ${money(disputeCost)}.` : ""}
        </p>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5"><h2>Top shows</h2><Link href={`/a/${artistId}/financials/shows?year=${year}`} className="text-[14px]">All settlements</Link></div>
          <table className="list mt-3">
            <thead><tr><th>Show</th><th className="!text-right">Sales</th><th className="!text-right">Net</th></tr></thead>
            <tbody>
              {top.map((s) => (
                <tr key={s.show_id}>
                  <td><Link href={`/a/${artistId}/financials/shows/${s.show_id}`} className="text-ink">{showLabel(showMap.get(s.show_id))}</Link><span className="help block">{formatDate(s.show_date, { month: "short", day: "numeric" })}</span></td>
                  <td className="text-right">{money(s.gross_cents)}</td>
                  <td className="text-right font-bold">{money(s.net_to_artist_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card overflow-hidden">
          <div className="px-5 pt-5"><h2>Best-selling upgrades</h2></div>
          <table className="list mt-3">
            <thead><tr><th>Upgrade</th><th>Sold</th><th className="!text-right">Sales</th></tr></thead>
            <tbody>
              {byProduct(p).map((r) => (
                <tr key={r.name}>
                  <td className="font-semibold">{r.name}</td>
                  <td className="min-w-40"><span className="text-[13px] font-semibold">{(r.units - r.refunded).toLocaleString()} of {r.capacity.toLocaleString()}</span><Meter value={r.units - r.refunded} max={r.capacity} /></td>
                  <td className="text-right font-bold">{money(r.gross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
