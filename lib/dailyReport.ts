import { dollars } from "@/lib/packages";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, siteUrl, type EmailContent } from "@/lib/email";

type Report = {
  day: string; orders: number; units: number; gross_cents: number; fees_cents: number; fan_paid_cents: number; refunds_cents: number;
  prev_gross_cents: number; week_avg_gross_cents: number; mtd_orders: number; mtd_gross_cents: number; mtd_fees_cents: number;
  by_artist: { name: string; orders: number; units: number; gross_cents: number; fees_cents: number }[];
  top_packages: { artist: string; package: string; city: string | null; date: string; units: number; left: number }[];
  new_artists: number; pending_review: number; open_disputes: number; shows_today: number;
  other_currencies?: { currency: string; orders: number; gross_cents: number; fees_cents: number }[];
};

const $ = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const pctChange = (now: number, then: number) => (then === 0 ? (now === 0 ? "same as" : "up from $0") : `${now >= then ? "up" : "down"} ${Math.abs(Math.round(((now - then) / then) * 100))}% vs`);

/** Yesterday's date in New York, as YYYY-MM-DD. */
export function yesterdayNY(now = new Date()) {
  const ny = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  ny.setDate(ny.getDate() - 1);
  return `${ny.getFullYear()}-${String(ny.getMonth() + 1).padStart(2, "0")}-${String(ny.getDate()).padStart(2, "0")}`;
}

export async function buildDailyReport(day: string): Promise<{ subject: string; content: EmailContent } | null> {
  const db = createAdminClient();
  if (!db) return null;
  const { data, error } = await db.rpc("platform_daily_report", { p_day: day });
  if (error || !data) { console.error("[daily report]", error); return null; }
  const r = data as Report;
  const label = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const month = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });

  const body = r.orders === 0
    ? [`No VIP sales on ${label}.`]
    : [`${r.orders} order${r.orders === 1 ? "" : "s"} and ${r.units} upgrade${r.units === 1 ? "" : "s"} sold on ${label}, ${$(r.gross_cents)} in artist sales, ${pctChange(r.gross_cents, r.prev_gross_cents)} the day before.`];
  const attention: string[] = [];
  if (r.pending_review) attention.push(`${r.pending_review} artist${r.pending_review === 1 ? "" : "s"} waiting for approval`);
  if (r.open_disputes) attention.push(`${r.open_disputes} open dispute${r.open_disputes === 1 ? "" : "s"}`);
  if (attention.length) body.push(`Needs attention: ${attention.join(", ")}.`);

  return {
    subject: `OnTour Upgrades daily sales: ${$(r.gross_cents)} on ${new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`,
    content: {
      eyebrow: "Daily sales", title: label, preheader: body[0],
      body,
      stats: [
        { label: "Artist sales", value: $(r.gross_cents), note: `7-day avg ${$(r.week_avg_gross_cents)}` },
        { label: "P&T fees", value: $(r.fees_cents) },
        { label: "Orders", value: String(r.orders), note: `${r.units} upgrades` },
        { label: `${month} to date`, value: $(r.mtd_gross_cents), note: `${$(r.mtd_fees_cents)} fees, ${r.mtd_orders} orders` },
      ],
      tables: [
        ...(r.by_artist.length ? [{ title: "By artist", head: ["Artist", "Orders", "Upgrades", "Sales", "Fees"], numeric: [1, 2, 3, 4],
          rows: r.by_artist.map((a) => [a.name, String(a.orders), String(a.units), $(a.gross_cents), $(a.fees_cents)]) }] : []),
        ...(r.top_packages.length ? [{ title: "Top packages", head: ["Package", "Show", "Sold", "Left"], numeric: [2, 3],
          rows: r.top_packages.map((p) => [`${p.artist}: ${p.package}`, `${p.city ?? ""} ${new Date(`${p.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`, String(p.units), String(p.left)]) }] : []),
      ],
      details: [
        ["Refunds", $(r.refunds_cents)],
        ...(r.other_currencies ?? []).map((c) => [`Also sold in ${c.currency.toUpperCase()}`, `${dollars(c.gross_cents, c.currency)} from ${c.orders} order${c.orders === 1 ? "" : "s"} (P&T fees ${dollars(c.fees_cents, c.currency)})`] as [string, string]),
        ["New artist sign-ups", String(r.new_artists)],
        ["Shows with VIP today", String(r.shows_today)],
      ],
      button: { label: "Open platform finance", url: `${siteUrl()}/admin/finance` },
      footnote: "Sent every morning to P&T admins. Totals are in US dollars; other currencies are listed separately. Real sales only; sample data is left out. Turn this off under P&T admin, Admins.",
    },
  };
}

/** Sends the report for `day` to every admin who has it switched on. Once per day unless forced. */
export async function sendDailyReport(day: string, opts: { force?: boolean; onlyTo?: string } = {}) {
  const db = createAdminClient();
  if (!db) return { sent: 0, skipped: "not configured" };
  if (!opts.force && !opts.onlyTo) {
    const { data: ran } = await db.from("report_runs").select("day").eq("report", "daily_sales").eq("day", day).maybeSingle();
    if (ran) return { sent: 0, skipped: "already sent" };
  }
  const built = await buildDailyReport(day);
  if (!built) return { sent: 0, skipped: "report failed" };
  let to: string[];
  if (opts.onlyTo) to = [opts.onlyTo];
  else {
    const { data } = await db.from("profiles").select("email").eq("is_super_admin", true).eq("daily_report", true);
    to = (data ?? []).map((p) => p.email);
  }
  let sent = 0;
  for (const email of to) { const r = await sendEmail({ to: email, subject: built.subject, ...built.content }); if (r.sent) sent++; }
  if (!opts.onlyTo) await db.from("report_runs").upsert({ report: "daily_sales", day, recipients: sent });
  return { sent, recipients: to.length };
}
