import { notFound } from "next/navigation";
import { requireArtist } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { CheckInScanner } from "@/components/CheckInScanner";
import { GuestList, type Guest } from "@/components/GuestList";
import { formatDate } from "@/lib/util";
import { checkInCode, undoCheckIn } from "../actions";

export const metadata = { title: "Check-in" };
export const dynamic = "force-dynamic";
type P = { params: Promise<{ artistId: string; showId: string }> };

type Row = { id: string; code: string; checked_in_at: string | null; voided_at: string | null;
  order_items: { id: string; quantity: number; show_products: { products: { name: string } } | null; orders: { status: string; fans: { name: string | null; email: string } | null } | null } | null };

export default async function CheckIn({ params }: P) {
  const { artistId, showId } = await params;
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const { data: show } = await supabase.from("shows").select("id, show_date, city, region, venue_name").eq("id", showId).eq("artist_id", artistId).maybeSingle();
  if (!show) notFound();
  const { data } = await supabase.from("passes")
    .select("id, code, checked_in_at, voided_at, order_items(id, quantity, show_products(products(name)), orders(status, fans(name, email)))")
    .eq("show_id", showId).order("code").returns<Row[]>();

  const byItem = new Map<string, number>();
  const guests: Guest[] = (data ?? []).map((r) => {
    const n = (byItem.get(r.order_items?.id ?? "") ?? 0) + 1;
    byItem.set(r.order_items?.id ?? "", n);
    const fan = r.order_items?.orders?.fans;
    return { pass_id: r.id, code: r.code, name: fan?.name ?? null, email: fan?.email ?? null, pkg: r.order_items?.show_products?.products.name ?? "VIP",
      guest: n, of: r.order_items?.quantity ?? 1, checked_in_at: r.checked_in_at, void: !!r.voided_at || r.order_items?.orders?.status === "refunded" };
  }).sort((a, b) => (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""));

  const valid = guests.filter((g) => !g.void), inCount = valid.filter((g) => g.checked_in_at).length;
  const pkgs = new Map<string, { total: number; in: number }>();
  valid.forEach((g) => { const c = pkgs.get(g.pkg) ?? { total: 0, in: 0 }; c.total++; if (g.checked_in_at) c.in++; pkgs.set(g.pkg, c); });
  const pct = valid.length ? Math.round((inCount / valid.length) * 100) : 0;

  return (
    <div className="grid max-w-3xl gap-5">
      <PageHead crumbs={[{ href: `/a/${artistId}/check-in`, label: "Check-in" }]}
        title={`${show.city ?? "Show"}${show.region ? `, ${show.region}` : ""}`}>
        {formatDate(show.show_date)}{show.venue_name ? `, ${show.venue_name}` : ""}
      </PageHead>

      <section className="card grid gap-3 p-5">
        <div className="flex items-end justify-between gap-3">
          <p><span className="text-[34px] font-extrabold leading-none">{inCount}</span><span className="text-[18px] font-bold text-mute"> / {valid.length} checked in</span></p>
          <span className="text-[15px] font-bold text-mute">{pct}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-[#eceaf2]"><i className="block h-full rounded-full bg-violet" style={{ width: `${pct}%` }} /></div>
        {pkgs.size > 1 && (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {[...pkgs.entries()].map(([name, c]) => <li key={name} className="stat flex items-center justify-between !py-2"><span className="!text-[13px] !text-ink">{name}</span><b className="!text-[16px]">{c.in}/{c.total}</b></li>)}
          </ul>
        )}
      </section>

      <CheckInScanner check={checkInCode.bind(null, artistId, showId)} undo={undoCheckIn.bind(null, artistId, showId)} />

      <section className="grid gap-3">
        <h2>Guest list</h2>
        <GuestList guests={guests} check={checkInCode.bind(null, artistId, showId)} undo={undoCheckIn.bind(null, artistId, showId)} />
      </section>
    </div>
  );
}
