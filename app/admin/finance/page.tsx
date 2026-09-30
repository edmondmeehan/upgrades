import { Suspense } from "react";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { BarChart } from "@/components/BarChart";
import { YearPicker } from "@/components/FinanceNav";
import { StatusPill } from "@/components/StatusPill";
import { money, rate, sum } from "@/lib/money";
import { monthlySeries, parseYear, yearRange, yearsWithData, type Monthly } from "@/lib/finance";
import type { ArtistStatus } from "@/lib/types";

export const metadata = { title: "Platform finance" };
type P = { searchParams: Promise<{ year?: string }> };
type ArtistRow = { id: string; name: string; handle: string; status: ArtistStatus; fee_bps: number };

export default async function PlatformFinance({ searchParams }: P) {
  const year = parseYear((await searchParams).year);
  const [from, to] = yearRange(year);
  const { supabase } = await requireSuperAdmin();
  const [years, { data: monthly }, { data: artists }] = await Promise.all([
    yearsWithData(supabase),
    supabase.from("v_artist_monthly").select("*").gte("month", from).lt("month", to).returns<Monthly[]>(),
    supabase.from("artists").select("id, name, handle, status, fee_bps").returns<ArtistRow[]>(),
  ]);
  const m = monthly ?? [];
  const a = artists ?? [];
  const byArtist = new Map<string, Monthly[]>();
  m.forEach((r) => byArtist.set(r.artist_id, [...(byArtist.get(r.artist_id) ?? []), r]));
  const ranked = a.map((x) => ({ ...x, rows: byArtist.get(x.id) ?? [] }))
    .filter((x) => x.rows.length > 0).sort((p, q) => sum(q.rows, "platform_net_cents") - sum(p.rows, "platform_net_cents"));

  const fees = sum(m, "service_fee_cents"), feesBack = sum(m, "service_fee_refunded_cents");
  const reversed = fees - feesBack - sum(m, "platform_net_cents");
  const gmv = sum(m, "gross_cents") + fees;
  const orders = sum(m, "orders");
  const hasSample = m.some((r) => r.has_sample);
  const nowMonth = new Date().getFullYear() === year ? new Date().getMonth() : undefined;

  return (
    <>
      <PageHead title="Platform finance" eyebrow="P&T admin"
        aside={<>{hasSample && <span className="badge b-verified">Includes sample data</span>}<a className="btn btn-ghost" href={`/admin/finance/export?kind=artists&year=${year}`}>Download CSV</a></>}>
        P&amp;T service fee revenue and sales across every artist. Stripe platform reconciliation turns on with payments.
      </PageHead>
      <Suspense><YearPicker years={years} /></Suspense>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="stat !border-violet"><b className="text-violet">{money(sum(m, "platform_net_cents"))}</b><span>P&amp;T fee revenue (net)</span></div>
        <div className="stat"><b>{money(gmv)}</b><span>Total platform sales (fans paid)</span></div>
        <div className="stat"><b>{orders.toLocaleString()}</b><span>Orders</span></div>
        <div className="stat"><b>{money(sum(m, "refunded_cents"))}</b><span>Refunded to fans ({rate(sum(m, "refunded_orders"), orders)} of orders)</span></div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="stat"><b>{a.filter((x) => x.status === "approved").length}</b><span>Active artists</span></div>
        <div className="stat"><b>{a.filter((x) => x.status === "pending").length}</b><span>Waiting for review</span></div>
        <div className="stat"><b>{ranked.length}</b><span>Artists with sales in {year}</span></div>
        <div className="stat"><b className={sum(m, "open_disputes") ? "text-rope" : ""}>{sum(m, "open_disputes")}</b><span>Open disputes</span></div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card grid gap-4 p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h2>P&amp;T fee revenue by month</h2><span className="help">Net of refunds, {year}</span></div>
          <BarChart values={monthlySeries(m, "platform_net_cents")} label={`Platform fee revenue by month, ${year}`} highlight={nowMonth} />
          <a className="text-[14px]" href={`/admin/finance/export?kind=months&year=${year}`}>Download monthly CSV</a>
        </section>
        <section className="card p-6">
          <h2 className="mb-3">Reconciliation</h2>
          <dl className="grid text-[14px]">
            {([["Service fees collected", fees], ["Returned with refunds", -feesBack], ["Reversed on lost disputes", -reversed]] as [string, number][]).map(([l, v]) => (
              <div key={l} className="flex justify-between gap-3 border-t border-line py-2.5 first:border-t-0"><dt>{l}</dt><dd className="font-semibold tabular-nums">{v < 0 ? `−${money(-v)}` : money(v)}</dd></div>
            ))}
            <div className="flex justify-between gap-3 border-t-2 border-ink pt-2.5"><dt className="font-extrabold">Net fee revenue</dt><dd className="font-extrabold tabular-nums text-violet">{money(sum(m, "platform_net_cents"))}</dd></div>
          </dl>
          <p className="alert alert-gray mt-4 !text-[13px]">Once Stripe is connected, this compares against application fees in the P&amp;T Stripe platform account and flags any gap.</p>
        </section>
      </div>

      <section className="card overflow-hidden">
        <h2 className="px-5 pt-5">By artist</h2>
        {ranked.length === 0 ? <p className="help px-5 py-10 text-center">No sales in {year} yet.</p> : (
          <div className="overflow-x-auto">
            <table className="list mt-3 min-w-[60rem]">
              <thead><tr><th>Artist</th><th className="!text-right">Fee</th><th className="!text-right">Orders</th><th className="!text-right">Artist sales</th><th className="!text-right">P&amp;T revenue</th><th className="!text-right">Refunds</th><th className="!text-right">Refund rate</th><th className="!text-right">Disputes</th><th /></tr></thead>
              <tbody>
                {ranked.map((x) => {
                  const o = sum(x.rows, "orders");
                  const openD = sum(x.rows, "open_disputes");
                  return (
                    <tr key={x.id} className="hover:bg-paper">
                      <td><Link href={`/admin/artists/${x.id}`} className="text-ink">{x.name}</Link><span className="ml-2"><StatusPill status={x.status} /></span></td>
                      <td className="text-right">{(x.fee_bps / 100).toFixed(x.fee_bps % 100 ? 2 : 0)}%</td>
                      <td className="text-right">{o}</td>
                      <td className="text-right">{money(sum(x.rows, "gross_cents"))}</td>
                      <td className="text-right font-bold">{money(sum(x.rows, "platform_net_cents"))}</td>
                      <td className="text-right">{money(sum(x.rows, "refunded_cents"))}</td>
                      <td className={`text-right ${sum(x.rows, "refunded_orders") / (o || 1) > 0.08 ? "font-bold text-rope" : ""}`}>{rate(sum(x.rows, "refunded_orders"), o)}</td>
                      <td className="text-right">{openD ? <span className="badge b-rejected">{openD} open</span> : money(sum(x.rows, "dispute_lost_cents"))}</td>
                      <td className="text-right"><Link className="btn btn-ghost btn-sm" href={`/a/${x.id}/financials?year=${year}`}>Their financials</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
