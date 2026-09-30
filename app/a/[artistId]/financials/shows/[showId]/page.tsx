import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArtist } from "@/lib/auth";
import { Meter } from "@/components/BarChart";
import { PrintButton } from "@/components/FinanceNav";
import { money, rate, sum } from "@/lib/money";
import { isFinal, showLabel, type ProductSales, type ShowInfo, type ShowMoney } from "@/lib/finance";
import { formatDate, formatDateTime } from "@/lib/util";

type P = { params: Promise<{ artistId: string; showId: string }> };
type Refund = { id: string; amount_cents: number; service_fee_refunded_cents: number; reason: string | null; created_at: string };
type Dispute = { id: string; amount_cents: number; fee_cents: number; status: string; reason: string | null; opened_at: string };

export default async function Settlement({ params }: P) {
  const { artistId, showId } = await params;
  const { supabase, artist } = await requireArtist(artistId, ["owner", "accountant"]);
  const { data: show } = await supabase.from("shows").select("id, show_date, city, region, venue_name, tour_id, status, tours(name)")
    .eq("id", showId).eq("artist_id", artistId).maybeSingle<ShowInfo & { tours: { name: string } }>();
  if (!show) notFound();
  const [{ data: m }, { data: products }, { data: orderIds }] = await Promise.all([
    supabase.from("v_show_money").select("*").eq("show_id", showId).maybeSingle<ShowMoney>(),
    supabase.from("v_show_product_sales").select("*").eq("show_id", showId).order("price_cents", { ascending: false }).returns<ProductSales[]>(),
    supabase.from("orders").select("id").eq("show_id", showId),
  ]);
  const ids = (orderIds ?? []).map((o: { id: string }) => o.id);
  const [{ data: refunds }, { data: disputes }] = ids.length ? await Promise.all([
    supabase.from("refunds").select("id, amount_cents, service_fee_refunded_cents, reason, created_at").in("order_id", ids).order("created_at").returns<Refund[]>(),
    supabase.from("disputes").select("id, amount_cents, fee_cents, status, reason, opened_at").in("order_id", ids).order("opened_at").returns<Dispute[]>(),
  ]) : [{ data: [] as Refund[] }, { data: [] as Dispute[] }];

  const p = products ?? [];
  const final = isFinal(show.show_date);
  const past = show.show_date < new Date().toISOString().slice(0, 10);
  const units = p.reduce((a, r) => a + r.units - r.units_refunded, 0);
  const lines: [string, number, string?][] = [
    ["Upgrade sales at your prices", m?.gross_cents ?? 0],
    ["Refunded to fans (your share)", -(m?.artist_refunded_cents ?? 0)],
    ["Stripe processing", -(m?.stripe_fee_cents ?? 0), "Charged on the full amount fans paid, including the service fee. Not returned on refunds."],
    ["Chargebacks and dispute fees", -(m?.dispute_cost_cents ?? 0)],
  ];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="crumbs no-print"><Link href={`/a/${artistId}/financials/shows`}>Show settlements</Link></p>
          <h2 className="mt-1 text-[24px]">{showLabel(show)}, {formatDate(show.show_date, { month: "short", day: "numeric", year: "numeric" })}</h2>
          <p className="muted">{artist.name}. {show.venue_name ?? "Venue TBD"}. {show.tours.name}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {final ? <span className="badge b-published">Final</span> : <span className="badge b-neutral">In progress</span>}
          <a className="btn btn-ghost no-print" href={`/a/${artistId}/financials/export?kind=settlement&show=${showId}`}>Download CSV</a>
          <PrintButton />
        </div>
      </div>
      {!final && <p className="alert alert-gray no-print">This settlement becomes final two days after the show, once late refunds and check-ins are in.</p>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card p-6">
          <h2 className="mb-3">Settlement</h2>
          <dl className="grid">
            {lines.map(([label, v, note]) => (
              <div key={label} className="flex items-start justify-between gap-4 border-t border-line py-3 first:border-t-0">
                <dt>{label}{note && <span className="help block">{note}</span>}</dt>
                <dd className="whitespace-nowrap font-semibold tabular-nums">{v < 0 ? `−${money(-v)}` : money(v)}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 border-t-2 border-ink pt-3">
              <dt className="text-[17px] font-extrabold">Net to you</dt>
              <dd className="text-[20px] font-extrabold tabular-nums text-violet">{money(m?.net_to_artist_cents)}</dd>
            </div>
          </dl>
        </section>
        <aside className="grid gap-3">
          <div className="stat"><b>{m?.orders ?? 0}</b><span>Orders</span></div>
          <div className="stat"><b>{units}</b><span>Upgrades sold</span></div>
          <div className="stat"><b>{past ? rate(sum(p, "checked_in"), units) : "After the show"}</b><span>Check-in rate</span></div>
          <div className="stat"><b>{money((m?.service_fee_cents ?? 0) - (m?.service_fee_refunded_cents ?? 0))}</b><span>P&amp;T service fees paid by fans</span></div>
        </aside>
      </div>

      <section className="card overflow-hidden">
        <h2 className="px-5 pt-5">By upgrade</h2>
        {p.length === 0 ? <p className="help px-5 py-8">No upgrades set up for this show yet.</p> : (
          <div className="overflow-x-auto">
            <table className="list mt-3 min-w-[44rem]">
              <thead><tr><th>Upgrade</th><th className="!text-right">Price</th><th>Sold of capacity</th><th className="!text-right">Refunded</th><th className="!text-right">Checked in</th><th className="!text-right">Sales</th></tr></thead>
              <tbody>
                {p.map((r) => {
                  const sold = r.units - r.units_refunded;
                  return (
                    <tr key={r.show_product_id}>
                      <td className="font-semibold">{r.product_name}{r.includes_photo && <span className="badge b-lilac ml-2">Photo</span>}</td>
                      <td className="text-right">{money(r.price_cents)}</td>
                      <td className="min-w-44"><span className="text-[13px] font-semibold">{sold} of {r.capacity}</span><Meter value={sold} max={r.capacity} /></td>
                      <td className="text-right">{r.units_refunded}</td>
                      <td className="text-right">{past ? `${r.checked_in} (${rate(r.checked_in, sold)})` : "—"}</td>
                      <td className="text-right font-bold">{money(r.net_gross_cents)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {((refunds ?? []).length > 0 || (disputes ?? []).length > 0) && (
        <section className="card overflow-hidden">
          <h2 className="px-5 pt-5">Refunds and disputes</h2>
          <table className="list mt-3">
            <thead><tr><th>Date</th><th>Type</th><th>Reason</th><th className="!text-right">Amount</th></tr></thead>
            <tbody>
              {(refunds ?? []).map((r) => <tr key={r.id}><td>{formatDateTime(r.created_at)}</td><td>Refund</td><td>{r.reason ?? "—"}</td><td className="text-right">{money(r.amount_cents)}</td></tr>)}
              {(disputes ?? []).map((d) => <tr key={d.id}><td>{formatDateTime(d.opened_at)}</td><td>Dispute <span className={`badge ml-1 ${d.status === "lost" ? "b-rejected" : d.status === "won" ? "b-published" : "b-pending"}`}>{d.status}</span></td><td>{d.reason ?? "—"}</td><td className="text-right">{money(d.amount_cents)}</td></tr>)}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
