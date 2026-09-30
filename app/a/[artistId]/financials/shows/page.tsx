import Link from "next/link";
import { requireArtist } from "@/lib/auth";
import { money, sum } from "@/lib/money";
import { isFinal, parseYear, showLabel, yearRange, type ShowInfo, type ShowMoney } from "@/lib/finance";
import { formatDate } from "@/lib/util";

type P = { params: Promise<{ artistId: string }>; searchParams: Promise<{ year?: string }> };

export default async function Settlements({ params, searchParams }: P) {
  const { artistId } = await params;
  const year = parseYear((await searchParams).year);
  const [from, to] = yearRange(year);
  const { supabase } = await requireArtist(artistId, ["owner", "accountant"]);
  const [{ data: shows }, { data: money_ }] = await Promise.all([
    supabase.from("shows").select("id, show_date, city, region, venue_name, tour_id, status").eq("artist_id", artistId).gte("show_date", from).lt("show_date", to).order("show_date").returns<ShowInfo[]>(),
    supabase.from("v_show_money").select("*").eq("artist_id", artistId).gte("show_date", from).lt("show_date", to).returns<ShowMoney[]>(),
  ]);
  const byShow = new Map((money_ ?? []).map((r) => [r.show_id, r]));
  const rows = (shows ?? []).filter((s) => s.status !== "draft" || byShow.has(s.id));
  const all = money_ ?? [];

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
        <h2>Show settlements, {year}</h2>
        <a className="btn btn-ghost btn-sm no-print" href={`/a/${artistId}/financials/export?kind=shows&year=${year}`}>Download CSV</a>
      </div>
      {rows.length === 0 ? <p className="help px-5 py-10 text-center">No shows in {year}.</p> : (
        <div className="overflow-x-auto">
          <table className="list mt-3 min-w-[52rem]">
            <thead><tr><th>Show</th><th>Status</th><th className="!text-right">Orders</th><th className="!text-right">Sales</th><th className="!text-right">Refunds</th><th className="!text-right">Processing</th><th className="!text-right">Net to you</th></tr></thead>
            <tbody>
              {rows.map((s) => {
                const r = byShow.get(s.id);
                return (
                  <tr key={s.id} className="hover:bg-paper">
                    <td><Link href={`/a/${artistId}/financials/shows/${s.id}`} className="text-ink">{showLabel(s)}</Link><span className="help block">{formatDate(s.show_date, { weekday: "short", month: "short", day: "numeric" })}{s.venue_name ? `, ${s.venue_name}` : ""}</span></td>
                    <td>{s.status === "cancelled" ? <span className="badge b-cancelled">Cancelled</span> : isFinal(s.show_date) ? <span className="badge b-published">Final</span> : <span className="badge b-neutral">In progress</span>}</td>
                    <td className="text-right">{r?.orders ?? 0}</td>
                    <td className="text-right">{money(r?.gross_cents)}</td>
                    <td className="text-right">{money(r?.artist_refunded_cents)}</td>
                    <td className="text-right">{money(r?.stripe_fee_cents)}</td>
                    <td className="text-right font-bold">{money(r?.net_to_artist_cents)}</td>
                  </tr>
                );
              })}
              <tr className="bg-paper font-bold">
                <td>Total</td><td /><td className="text-right">{sum(all, "orders")}</td><td className="text-right">{money(sum(all, "gross_cents"))}</td>
                <td className="text-right">{money(sum(all, "artist_refunded_cents"))}</td><td className="text-right">{money(sum(all, "stripe_fee_cents"))}</td>
                <td className="text-right">{money(sum(all, "net_to_artist_cents"))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
