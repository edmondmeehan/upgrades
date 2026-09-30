import type { SupabaseClient } from "@supabase/supabase-js";

export type Monthly = {
  artist_id: string; month: string; orders: number; gross_cents: number; service_fee_cents: number; stripe_fee_cents: number;
  refunded_cents: number; service_fee_refunded_cents: number; dispute_lost_cents: number; dispute_fee_cents: number;
  net_to_artist_cents: number; platform_net_cents: number; refunded_orders: number; open_disputes: number; has_sample: boolean;
};

export type ShowMoney = {
  artist_id: string; show_id: string; tour_id: string; show_date: string; orders: number; gross_cents: number;
  service_fee_cents: number; stripe_fee_cents: number; refunded_cents: number; service_fee_refunded_cents: number;
  artist_refunded_cents: number; dispute_cost_cents: number; net_to_artist_cents: number; platform_net_cents: number; has_sample: boolean;
};

export type ProductSales = {
  show_product_id: string; artist_id: string; show_id: string; tour_id: string; product_id: string; product_name: string;
  includes_photo: boolean; price_cents: number; capacity: number; units: number; units_refunded: number;
  net_gross_cents: number; gross_cents: number; checked_in: number;
};

export type OrderMoney = {
  order_id: string; artist_id: string; show_id: string; tour_id: string; show_date: string; created_at: string; status: string;
  payout_id: string | null; is_sample: boolean; gross_cents: number; service_fee_cents: number; total_cents: number;
  stripe_fee_cents: number; refunded_cents: number; service_fee_refunded_cents: number; artist_refunded_cents: number;
  dispute_lost_cents: number; dispute_fee_cents: number; dispute_platform_reversed_cents: number; open_disputes: number;
  net_to_artist_cents: number; platform_net_cents: number;
};

export type ShowInfo = { id: string; show_date: string; city: string | null; region: string | null; venue_name: string | null; tour_id: string; status: string };

export const yearRange = (year: number) => [`${year}-01-01`, `${year + 1}-01-01`] as const;

export function parseYear(v: string | undefined) {
  const y = Number(v);
  const now = new Date().getFullYear();
  return Number.isInteger(y) && y >= 2020 && y <= now + 2 ? y : now;
}

/** Years that have any orders for this scope, plus the current year. */
export async function yearsWithData(supabase: SupabaseClient, artistId?: string) {
  let q = supabase.from("v_artist_monthly").select("month");
  if (artistId) q = q.eq("artist_id", artistId);
  const { data } = await q;
  const ys = new Set<number>([new Date().getFullYear()]);
  (data ?? []).forEach((r: { month: string }) => ys.add(Number(r.month.slice(0, 4))));
  return [...ys].sort((a, b) => b - a);
}

export function monthlySeries(rows: Monthly[], key: keyof Monthly) {
  const out = Array.from({ length: 12 }, () => 0);
  rows.forEach((r) => { out[Number(r.month.slice(5, 7)) - 1] += Number(r[key]) || 0; });
  return out;
}

export const showLabel = (s: ShowInfo | undefined) =>
  s ? `${s.city ?? "City TBD"}${s.region ? `, ${s.region}` : ""}` : "Show";

export function isFinal(showDate: string) {
  const d = new Date(`${showDate}T00:00:00Z`).getTime();
  return Date.now() > d + 2 * 86400000;
}

/** Combine per-show product rows into totals per product name (for tours and dashboards). */
export function byProduct(rows: ProductSales[]) {
  const m = new Map<string, { name: string; units: number; refunded: number; capacity: number; gross: number; checkedIn: number; shows: number }>();
  rows.forEach((r) => {
    const cur = m.get(r.product_name) ?? { name: r.product_name, units: 0, refunded: 0, capacity: 0, gross: 0, checkedIn: 0, shows: 0 };
    cur.units += r.units; cur.refunded += r.units_refunded; cur.capacity += r.capacity; cur.gross += Number(r.net_gross_cents);
    cur.checkedIn += r.checked_in; cur.shows += 1;
    m.set(r.product_name, cur);
  });
  return [...m.values()].sort((a, b) => b.gross - a.gross);
}
