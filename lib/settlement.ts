import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmailBatch, siteUrl } from "@/lib/email";
import { dollars } from "@/lib/packages";

export type Settlement = {
  show_id: string; artist_id: string; show_date: string; city: string | null; region: string | null; venue: string | null; status: string;
  orders: number; gross_cents: number; refunded_cents: number; stripe_fee_cents: number; dispute_cost_cents: number; net_cents: number;
  service_fee_cents: number; open_disputes: number; passes_valid: number; checked_in: number; sent_at: string | null; sent_net_cents: number | null;
  packages: { name: string; price_cents: number; sold: number; refunded: number; comps: number; gross_cents: number }[];
};

/** Emails one show's statement to the artist's owners and accountants. Marks it sent (and what it said). */
export async function sendSettlement(showId: string, opts: { onlyTo?: string } = {}) {
  const db = createAdminClient();
  if (!db) return { sent: 0, error: "not configured" };
  const { data } = await db.rpc("show_settlement", { p_show: showId });
  const s = data as Settlement | null;
  if (!s) return { sent: 0, error: "Show not found." };
  const [{ data: artist }, { data: members }, { data: taxRows }] = await Promise.all([
    db.from("artists").select("name").eq("id", s.artist_id).single<{ name: string }>(),
    db.from("artist_members").select("role, profiles(email)").eq("artist_id", s.artist_id).in("role", ["owner", "accountant"]),
    db.from("orders").select("tax_cents").eq("show_id", showId).eq("is_sample", false).eq("is_comp", false).neq("status", "refunded"),
  ]);
  const tax = (taxRows ?? []).reduce((n, r) => n + (r.tax_cents ?? 0), 0);
  const to = opts.onlyTo ? [opts.onlyTo] : [...new Set(((members ?? []) as unknown as { profiles: { email: string } | null }[]).map((m) => m.profiles?.email).filter(Boolean) as string[])];
  if (!to.length || !artist) return { sent: 0, error: "No owner or accountant to send to." };

  const revised = !!s.sent_at && s.sent_net_cents !== null && Number(s.sent_net_cents) !== Number(s.net_cents);
  const date = new Date(`${s.show_date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const where = `${s.city ?? "Show"}${s.region ? `, ${s.region}` : ""}`;
  const sold = s.packages.reduce((n, p) => n + p.sold, 0), comps = s.packages.reduce((n, p) => n + p.comps, 0);
  const deductions: [string, string][] = [
    ["Artist sales", dollars(Number(s.gross_cents))],
    ...(Number(s.refunded_cents) ? [["Refunds", `-${dollars(Number(s.refunded_cents))}`] as [string, string]] : []),
    ["Card processing (Stripe)", `-${dollars(Number(s.stripe_fee_cents))}`],
    ...(Number(s.dispute_cost_cents) ? [["Disputes", `-${dollars(Number(s.dispute_cost_cents))}`] as [string, string]] : []),
    ["Your net", dollars(Number(s.net_cents))],
    ...(tax ? [["Sales tax collected (yours to file and pay)", dollars(tax)] as [string, string]] : []),
  ];
  const link = `${siteUrl()}/a/${s.artist_id}/financials/shows/${s.show_id}`;
  const content = {
    eyebrow: revised ? "Revised settlement" : "Show settlement",
    title: `${where}: ${dollars(Number(s.net_cents))} net`,
    preheader: `${sold} upgrades sold at ${where}, ${date}`,
    body: [
      revised ? `The numbers for this show changed since your last statement (usually a late refund), so here's an updated one.` : `Here's how VIP did at ${s.venue ?? where} on ${date}.`,
      `Fans paid P&T's service fee on top of your prices (${dollars(Number(s.service_fee_cents))}), so it isn't taken out of your money. Stripe pays your net to your bank on your normal payout schedule.`,
      ...(Number(s.open_disputes) ? [`${s.open_disputes} order${Number(s.open_disputes) === 1 ? " is" : "s are"} disputed, so this may change. Respond in your Stripe dashboard.`] : []),
    ],
    stats: [
      { label: "Your net", value: dollars(Number(s.net_cents)) },
      { label: "Upgrades sold", value: String(sold), note: comps ? `plus ${comps} comp${comps === 1 ? "" : "s"}` : undefined },
      { label: "Orders", value: String(s.orders) },
      { label: "Checked in", value: `${s.checked_in}/${s.passes_valid}` },
    ],
    tables: [
      { title: "By package", head: ["Package", "Price", "Sold", "Refunded", "Comps", "Sales"], numeric: [1, 2, 3, 4, 5],
        rows: s.packages.map((p) => [p.name, dollars(p.price_cents), String(p.sold), String(p.refunded), String(p.comps), dollars(Number(p.gross_cents))]) },
      { title: "Your money", head: ["", "Amount"], numeric: [1], rows: deductions },
    ],
    button: { label: "Open the show settlement", url: link },
    footnote: "Download this show's orders and payouts any time from Financials. Sample data is never included.",
  };
  const subject = `${revised ? "Revised settlement" : "Settlement"}: ${artist.name}, ${where}, ${new Date(`${s.show_date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
  const { sent, error } = await sendEmailBatch(to.map((email) => ({ to: email, subject, ...content })));
  if (sent && !opts.onlyTo) await db.from("shows").update({ settlement_sent_at: new Date().toISOString(), settlement_net_cents: Number(s.net_cents) }).eq("id", showId);
  return { sent, error, revised };
}
