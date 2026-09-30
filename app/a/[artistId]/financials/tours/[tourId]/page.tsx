import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArtist } from "@/lib/auth";
import { Meter } from "@/components/BarChart";
import { PrintButton } from "@/components/FinanceNav";
import { money, rate, sum } from "@/lib/money";
import { byProduct, isFinal, showLabel, type ProductSales, type ShowInfo, type ShowMoney } from "@/lib/finance";
import { formatDate } from "@/lib/util";

type P = { params: Promise<{ artistId: string; tourId: string }> };

export default async function TourFinance({ params }: P) {
  const { artistId, tourId } = await params;
  const { supabase } = await requireArtist(artistId, ["owner", "accountant"]);
  const { data: tour } = await supabase.from("tours").select("id, name").eq("id", tourId).eq("artist_id", artistId).maybeSingle<{ id: string; name: string }>();
  if (!tour) notFound();
  const [{ data: shows }, { data: sm }, { data: products }] = await Promise.all([
    supabase.from("shows").select("id, show_date, city, region, venue_name, tour_id, status").eq("tour_id", tourId).order("show_date").returns<ShowInfo[]>(),
    supabase.from("v_show_money").select("*").eq("tour_id", tourId).returns<ShowMoney[]>(),
    supabase.from("v_show_product_sales").select("*").eq("tour_id", tourId).returns<ProductSales[]>(),
  ]);
  const rows = sm ?? [];
  const byShow = new Map(rows.map((r) => [r.show_id, r]));
  const p = products ?? [];
  const n = rows.length || 1;
  const net = sum(rows, "net_to_artist_cents");
  const today = new Date().toISOString().slice(0, 10);
  const pastIds = new Set((shows ?? []).filter((s) => s.show_date < today).map((s) => s.id));
  const pastSold = p.filter((r) => pastIds.has(r.show_id)).reduce((a, r) => a + r.units - r.units_refunded, 0);
  const sold = p.reduce((a, r) => a + r.units - r.units_refunded, 0);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="crumbs no-print"><Link href={`/a/${artistId}/financials/tours`}>Tours</Link></p>
          <h2 className="mt-1 text-[24px]">{tour.name}</h2>
        </div>
        <div className="flex gap-2">
          <a className="btn btn-ghost no-print" href={`/a/${artistId}/financials/export?kind=tour&tour=${tourId}`}>Download CSV</a>
          <PrintButton />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="stat"><b>{money(sum(rows, "gross_cents"))}</b><span>Upgrade sales</span></div>
        <div className="stat"><b>{money(sum(rows, "stripe_fee_cents") + sum(rows, "artist_refunded_cents") + sum(rows, "dispute_cost_cents"))}</b><span>Refunds, processing, disputes</span></div>
        <div className="stat !border-violet"><b className="text-violet">{money(net)}</b><span>Net to you</span></div>
        <div className="stat"><b>{rate(sum(p.filter((r) => pastIds.has(r.show_id)), "checked_in"), pastSold)}</b><span>Check-in rate</span></div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="stat"><b>{money(net / n)}</b><span>Average net per show</span></div>
        <div className="stat"><b>{Math.round(sold / n)}</b><span>Average upgrades per show</span></div>
        <div className="stat"><b>{sum(rows, "orders")}</b><span>Orders</span></div>
        <div className="stat"><b>{(shows ?? []).length}</b><span>Shows</span></div>
      </div>

      <section className="card overflow-hidden">
        <h2 className="px-5 pt-5">Best-selling upgrades</h2>
        <table className="list mt-3">
          <thead><tr><th>Upgrade</th><th>Sold of capacity</th><th className="!text-right">Sales</th></tr></thead>
          <tbody>
            {byProduct(p).map((r) => (
              <tr key={r.name}><td className="font-semibold">{r.name}</td>
                <td className="min-w-44"><span className="text-[13px] font-semibold">{r.units - r.refunded} of {r.capacity} ({rate(r.units - r.refunded, r.capacity)})</span><Meter value={r.units - r.refunded} max={r.capacity} /></td>
                <td className="text-right font-bold">{money(r.gross)}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card overflow-hidden">
        <h2 className="px-5 pt-5">Shows</h2>
        <div className="overflow-x-auto">
          <table className="list mt-3 min-w-[40rem]">
            <thead><tr><th>Show</th><th>Status</th><th className="!text-right">Sales</th><th className="!text-right">Net to you</th></tr></thead>
            <tbody>
              {(shows ?? []).map((s) => {
                const r = byShow.get(s.id);
                return (
                  <tr key={s.id} className="hover:bg-paper">
                    <td><Link href={`/a/${artistId}/financials/shows/${s.id}`} className="text-ink">{showLabel(s)}</Link><span className="help block">{formatDate(s.show_date, { month: "short", day: "numeric", year: "numeric" })}</span></td>
                    <td>{isFinal(s.show_date) ? <span className="badge b-published">Final</span> : <span className="badge b-neutral">In progress</span>}</td>
                    <td className="text-right">{money(r?.gross_cents)}</td>
                    <td className="text-right font-bold">{money(r?.net_to_artist_cents)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
