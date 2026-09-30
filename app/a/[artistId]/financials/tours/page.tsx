import Link from "next/link";
import { requireArtist } from "@/lib/auth";
import { money, sum } from "@/lib/money";
import type { ShowMoney } from "@/lib/finance";

type P = { params: Promise<{ artistId: string }> };

export default async function TourFinancials({ params }: P) {
  const { artistId } = await params;
  const { supabase } = await requireArtist(artistId, ["owner", "accountant"]);
  const [{ data: tours }, { data: sm }] = await Promise.all([
    supabase.from("tours").select("id, name, status, shows(id)").eq("artist_id", artistId).order("created_at", { ascending: false }).returns<{ id: string; name: string; status: string; shows: { id: string }[] }[]>(),
    supabase.from("v_show_money").select("*").eq("artist_id", artistId).returns<ShowMoney[]>(),
  ]);
  const byTour = new Map<string, ShowMoney[]>();
  (sm ?? []).forEach((r) => byTour.set(r.tour_id, [...(byTour.get(r.tour_id) ?? []), r]));

  return (
    <section className="card overflow-hidden">
      <h2 className="px-5 pt-5">Tours</h2>
      <div className="overflow-x-auto">
        <table className="list mt-3 min-w-[44rem]">
          <thead><tr><th>Tour</th><th className="!text-right">Shows</th><th className="!text-right">Orders</th><th className="!text-right">Sales</th><th className="!text-right">Net to you</th><th className="!text-right">Net per show</th></tr></thead>
          <tbody>
            {(tours ?? []).map((t) => {
              const rows = byTour.get(t.id) ?? [];
              const net = sum(rows, "net_to_artist_cents");
              return (
                <tr key={t.id} className="hover:bg-paper">
                  <td><Link href={`/a/${artistId}/financials/tours/${t.id}`} className="text-ink">{t.name}</Link>{t.status === "archived" && <span className="badge b-archived ml-2">Archived</span>}</td>
                  <td className="text-right">{t.shows.length}</td>
                  <td className="text-right">{sum(rows, "orders")}</td>
                  <td className="text-right">{money(sum(rows, "gross_cents"))}</td>
                  <td className="text-right font-bold">{money(net)}</td>
                  <td className="text-right">{rows.length ? money(net / rows.length) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
