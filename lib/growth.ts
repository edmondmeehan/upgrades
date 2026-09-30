export type FunnelRow = {
  artist_id: string; name: string; handle: string; status: string; created_at: string; owner_email: string | null; owner_name: string | null;
  promo_code: string | null; submitted: boolean; approved: boolean; payments_ready: boolean; has_published_show: boolean; has_package: boolean;
  first_sale_at: string | null; orders: number; gross_cents: number;
};

/** Where an artist is stuck, in setup order. */
export function stage(r: FunnelRow): { key: string; label: string; nudge: string } {
  if (!r.submitted) return { key: "verify", label: "Hasn't submitted verification", nudge: "Finish verification so we can approve your storefront" };
  if (!r.approved) return { key: "review", label: "Waiting on P&T review", nudge: "" };
  if (!r.payments_ready) return { key: "stripe", label: "Approved, Stripe not set up", nudge: "Connect Stripe so fans can pay you" };
  if (!r.has_published_show) return { key: "shows", label: "No published shows", nudge: "Add and publish your tour dates" };
  if (!r.has_package) return { key: "packages", label: "No packages on sale", nudge: "Put a VIP package on sale" };
  if (!r.orders) return { key: "sales", label: "Ready, no sales yet", nudge: "Share your storefront link with fans" };
  return { key: "selling", label: "Selling", nudge: "" };
}

export const STEPS: [keyof FunnelRow | "all", string][] = [
  ["all", "Signed up"], ["submitted", "Submitted verification"], ["approved", "Approved"], ["payments_ready", "Stripe ready"],
  ["has_published_show", "Published a show"], ["has_package", "Package on sale"], ["first_sale_at", "Made a sale"],
];
