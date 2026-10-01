import Link from "next/link";
import { requireArtist } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { dollars } from "@/lib/packages";

export const metadata = { title: "Orders" };
/** Totals per currency, never added across currencies: "$1,250 + £360". */
const priceTotals = (rows: { total_cents: number; currency: string }[]) => {
  const by = new Map<string, number>(); rows.forEach((r) => by.set(r.currency, (by.get(r.currency) ?? 0) + r.total_cents));
  return [...by.entries()].map(([c, n]) => dollars(n, c)).join(" + ") || dollars(0);
};
export const dynamic = "force-dynamic";
type P = { params: Promise<{ artistId: string }>; searchParams: Promise<{ q?: string; show?: string; status?: string }> };
type Row = {
  id: string; status: string; is_comp: boolean; currency: string; total_cents: number; created_at: string; confirmation_code: string; show_id: string;
  fans: { name: string | null; email: string } | null;
  shows: { show_date: string; city: string | null; region: string | null } | null;
  order_items: { quantity: number; show_products: { products: { name: string } } | null; passes: { attendee_name: string | null }[] }[];
};
const BADGE: Record<string, [string, string]> = { paid: ["Paid", "b-published"], partially_refunded: ["Partly refunded", "b-pending"], refunded: ["Refunded", "b-neutral"], disputed: ["Disputed", "b-rejected"] };

export default async function AllOrders({ params, searchParams }: P) {
  const { artistId } = await params;
  const { q, show, status } = await searchParams;
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const [{ data: shows }, { data, error: loadErr }] = await Promise.all([
    supabase.from("shows").select("id, show_date, city, region").eq("artist_id", artistId).neq("status", "draft").order("show_date", { ascending: false }).limit(200),
    (() => {
      let qy = supabase.from("orders").select("id, status, is_comp, currency, total_cents, created_at, confirmation_code, show_id, fans(name, email), shows!orders_show_id_fkey(show_date, city, region), order_items(quantity, show_products(products(name)), passes(attendee_name))")
        .eq("artist_id", artistId).eq("is_sample", false).order("created_at", { ascending: false }).limit(500);
      if (show) qy = qy.eq("show_id", show);
      if (status === "comp") qy = qy.eq("is_comp", true);
      else if (status) qy = qy.eq("status", status);
      return qy.returns<Row[]>();
    })(),
  ]);
  const term = (q ?? "").trim().toLowerCase();
  const rows = (data ?? []).filter((o) => !term || [o.fans?.name, o.fans?.email, o.confirmation_code, o.shows?.city, ...o.order_items.flatMap((i) => i.passes.map((p) => p.attendee_name))]
    .some((v) => v?.toLowerCase().includes(term)));
  const paid = rows.filter((o) => !o.is_comp && o.status !== "refunded");

  return (
    <div className="grid max-w-6xl gap-5">
      <PageHead title="Orders">Every order across all your shows. Open one to refund it, resend the confirmation, or add guest names.</PageHead>
      <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px_170px_auto]" role="search">
        <input name="q" defaultValue={q ?? ""} className="input" placeholder="Search name, email, guest, city or confirmation number" aria-label="Search" />
        <select name="show" defaultValue={show ?? ""} className="input" aria-label="Show">
          <option value="">All shows</option>
          {(shows ?? []).map((s) => <option key={s.id} value={s.id}>{new Date(`${s.show_date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} {s.city ?? ""}</option>)}
        </select>
        <select name="status" defaultValue={status ?? ""} className="input" aria-label="Status">
          <option value="">Any status</option><option value="paid">Paid</option><option value="partially_refunded">Partly refunded</option>
          <option value="refunded">Refunded</option><option value="disputed">Disputed</option><option value="comp">Comps</option>
        </select>
        <button className="btn btn-ghost">Filter</button>
      </form>
      <p className="help">{rows.length} order{rows.length === 1 ? "" : "s"}{rows.length ? `, ${priceTotals(paid)} in active paid orders` : ""}{(data ?? []).length === 500 ? ". Showing the latest 500; filter by show to see older ones." : ""}</p>
      {loadErr && <p className="alert alert-red">Orders couldn&apos;t load ({loadErr.message}). Try refreshing; if it keeps happening, contact P&amp;T.</p>}
      {rows.length === 0 ? <p className="card px-4 py-12 text-center muted">{loadErr ? "" : "No orders match."}</p> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[14px]">
            <thead className="bg-paper"><tr className="th">{["Fan", "Show", "Package", "Placed", "Total", "Status"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((o) => {
                const [label, cls] = o.is_comp ? (o.status === "refunded" ? ["Cancelled", "b-neutral"] : ["Comp", "b-lilac"]) : BADGE[o.status] ?? [o.status, "b-neutral"];
                return (
                  <tr key={o.id} className="hover:bg-paper">
                    <td className="px-4 py-3">
                      <Link href={`/a/${artistId}/shows/${o.show_id}/orders?q=${encodeURIComponent(o.confirmation_code)}`} className="font-bold">{o.fans?.name ?? o.fans?.email ?? "Guest"}</Link>
                      <span className="block text-[12px] text-mute">{o.fans?.email}, <span className="font-mono">{o.confirmation_code}</span></span>
                    </td>
                    <td className="px-4 py-3">{o.shows ? `${new Date(`${o.shows.show_date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}, ${o.shows.city ?? ""}` : ""}</td>
                    <td className="px-4 py-3">{o.order_items.map((i) => `${i.show_products?.products.name ?? "VIP"} x ${i.quantity}`).join(", ")}</td>
                    <td className="px-4 py-3 text-mute">{new Date(o.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                    <td className="px-4 py-3 tabular-nums">{o.is_comp ? "Free" : dollars(o.total_cents, o.currency)}</td>
                    <td className="px-4 py-3"><span className={`badge ${cls}`}>{label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
