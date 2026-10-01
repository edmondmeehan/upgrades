import { requireArtist } from "@/lib/auth";
import { pickCurrency } from "@/lib/currencyFilter";
import { CurrencySwitch } from "@/components/CurrencySwitch";
import { money as fmtMoney, money0 as fmtMoney0 } from "@/lib/money";
import { MONTHS, money, sum } from "@/lib/money";
import { parseYear, yearRange, type Monthly } from "@/lib/finance";

type P = { params: Promise<{ artistId: string }>; searchParams: Promise<{ year?: string; cur?: string }> };

export default async function YearEnd({ params, searchParams }: P) {
  const { artistId } = await params;
  const sp = await searchParams;
  const year = parseYear(sp.year);
  const [from, to] = yearRange(year);
  const { supabase, artist } = await requireArtist(artistId, ["owner", "accountant"]);
  const { cur, list: curList } = await pickCurrency(supabase, artistId, sp.cur);
  const cm = (c: number | null | undefined) => fmtMoney(c, cur), cm0 = (c: number | null | undefined) => fmtMoney0(c, cur);
  const { data } = await supabase.from("v_artist_monthly").select("*").eq("currency", cur).eq("artist_id", artistId).gte("month", from).lt("month", to).order("month").returns<Monthly[]>();
  const m = data ?? [];
  const byMonth = new Map(m.map((r) => [Number(r.month.slice(5, 7)) - 1, r]));
  const base = `/a/${artistId}/financials/export`;
  const cols: [string, keyof Monthly][] = [["Sales", "gross_cents"], ["Refunds", "refunded_cents"], ["Processing", "stripe_fee_cents"], ["Net to you", "net_to_artist_cents"]];

  return (
    <>
      <CurrencySwitch list={curList} cur={cur} base={`/a/${artistId}/financials/year-end`} keep={{ year: String(year) }} />
      <section className="card grid gap-4 p-6">
        <div>
          <h2>{year} year-end package</h2>
          <p className="help mt-1">For {artist.name}&apos;s accountant or tax preparer. The transaction file has one line per order, refund, and dispute, without fan names or emails.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn" href={`${base}?kind=transactions&year=${year}`}>Transactions CSV</a>
          <a className="btn btn-ghost" href={`${base}?kind=monthly&year=${year}`}>Monthly summary CSV</a>
          <a className="btn btn-ghost" href={`${base}?kind=payouts&year=${year}`}>Payouts CSV</a>
          <a className="btn btn-ghost" href={`${base}?kind=shows&year=${year}`}>Show settlements CSV</a>
        </div>
      </section>
      <section className="card overflow-hidden">
        <h2 className="px-5 pt-5">Monthly summary</h2>
        <div className="overflow-x-auto">
          <table className="list mt-3 min-w-[40rem]">
            <thead><tr><th>Month</th><th className="!text-right">Orders</th>{cols.map(([l]) => <th key={l} className="!text-right">{l}</th>)}</tr></thead>
            <tbody>
              {MONTHS.map((name, i) => {
                const r = byMonth.get(i);
                return <tr key={name}><td>{name}</td><td className="text-right">{r?.orders ?? 0}</td>{cols.map(([l, k]) => <td key={l} className={`text-right ${k === "net_to_artist_cents" ? "font-bold" : ""}`}>{cm(Number(r?.[k] ?? 0))}</td>)}</tr>;
              })}
              <tr className="bg-paper font-bold"><td>Total</td><td className="text-right">{sum(m, "orders")}</td>{cols.map(([l, k]) => <td key={l} className="text-right">{cm(sum(m, k))}</td>)}</tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
