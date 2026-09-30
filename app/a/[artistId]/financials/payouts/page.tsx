import { requireArtist } from "@/lib/auth";
import { money, sum } from "@/lib/money";
import { parseYear, showLabel, yearRange, type OrderMoney, type ShowInfo } from "@/lib/finance";
import { formatDate } from "@/lib/util";

type P = { params: Promise<{ artistId: string }>; searchParams: Promise<{ year?: string }> };
type Payout = { id: string; stripe_payout_id: string | null; amount_cents: number; arrival_date: string; status: string };

export default async function Payouts({ params, searchParams }: P) {
  const { artistId } = await params;
  const year = parseYear((await searchParams).year);
  const [from, to] = yearRange(year);
  const { supabase } = await requireArtist(artistId, ["owner", "accountant"]);
  const [{ data: payouts }, { data: orders }, { data: unpaid }, { data: shows }] = await Promise.all([
    supabase.from("payouts").select("id, stripe_payout_id, amount_cents, arrival_date, status").eq("artist_id", artistId).gte("arrival_date", from).lt("arrival_date", to).order("arrival_date", { ascending: false }).returns<Payout[]>(),
    supabase.from("v_order_money").select("order_id, show_id, payout_id, net_to_artist_cents").eq("artist_id", artistId).not("payout_id", "is", null).returns<Pick<OrderMoney, "order_id" | "show_id" | "payout_id" | "net_to_artist_cents">[]>(),
    supabase.from("v_order_money").select("order_id, net_to_artist_cents").eq("artist_id", artistId).is("payout_id", null).returns<Pick<OrderMoney, "order_id" | "net_to_artist_cents">[]>(),
    supabase.from("shows").select("id, show_date, city, region, venue_name, tour_id, status").eq("artist_id", artistId).returns<ShowInfo[]>(),
  ]);
  const showMap = new Map((shows ?? []).map((s) => [s.id, s]));
  const byPayout = new Map<string, { net: number; count: number; shows: Set<string> }>();
  (orders ?? []).forEach((o) => {
    const cur = byPayout.get(o.payout_id!) ?? { net: 0, count: 0, shows: new Set<string>() };
    cur.net += o.net_to_artist_cents; cur.count += 1; cur.shows.add(o.show_id);
    byPayout.set(o.payout_id!, cur);
  });
  const p = payouts ?? [];
  const mismatched = p.filter((x) => Math.abs((byPayout.get(x.id)?.net ?? 0) - x.amount_cents) > 1).length;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="stat"><b>{money(sum(p, "amount_cents"))}</b><span>Paid out in {year}</span></div>
        <div className="stat"><b>{p.length}</b><span>Payouts</span></div>
        <div className="stat"><b>{money(sum(unpaid ?? [], "net_to_artist_cents"))}</b><span>Not yet paid out</span></div>
        <div className="stat"><b className={mismatched ? "text-rope" : "text-ok"}>{mismatched ? `${mismatched} to check` : "All matched"}</b><span>Reconciliation</span></div>
      </div>
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
          <h2>Payouts matched to shows</h2>
          <a className="btn btn-ghost btn-sm no-print" href={`/a/${artistId}/financials/export?kind=payouts&year=${year}`}>Download CSV</a>
        </div>
        <p className="help px-5 pt-1">Stripe pays you on your schedule. Each payout is matched to the orders it covers, so you can see which shows it came from.</p>
        {p.length === 0 ? <p className="help px-5 py-10 text-center">No payouts in {year}.</p> : (
          <div className="overflow-x-auto">
            <table className="list mt-3 min-w-[48rem]">
              <thead><tr><th>Arrived</th><th>Shows</th><th className="!text-right">Orders</th><th className="!text-right">Payout</th><th className="!text-right">Orders total</th><th>Match</th></tr></thead>
              <tbody>
                {p.map((x) => {
                  const m = byPayout.get(x.id);
                  const ok = Math.abs((m?.net ?? 0) - x.amount_cents) <= 1;
                  const names = [...(m?.shows ?? [])].map((id) => showLabel(showMap.get(id)));
                  return (
                    <tr key={x.id}>
                      <td className="whitespace-nowrap">{formatDate(x.arrival_date, { month: "short", day: "numeric", year: "numeric" })}<span className="help block font-mono !text-[11px]">{x.stripe_payout_id}</span></td>
                      <td className="max-w-[20rem] text-[14px]">{names.slice(0, 4).join("; ")}{names.length > 4 ? `; +${names.length - 4} more` : ""}</td>
                      <td className="text-right">{m?.count ?? 0}</td>
                      <td className="text-right font-bold">{money(x.amount_cents)}</td>
                      <td className="text-right">{money(m?.net)}</td>
                      <td>{ok ? <span className="badge b-published">Matched</span> : <span className="badge b-rejected">Off by {money(Math.abs((m?.net ?? 0) - x.amount_cents))}</span>}</td>
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
