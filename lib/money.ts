const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const money = (cents: number | null | undefined) => usd.format((Number(cents) || 0) / 100);
export const money0 = (cents: number | null | undefined) => usd0.format((Number(cents) || 0) / 100);
export const moneyCsv = (cents: number | null | undefined) => ((Number(cents) || 0) / 100).toFixed(2);
export const rate = (num: number, den: number) => (den > 0 ? `${Math.round((num / den) * 100)}%` : "—");

export function sum<T>(rows: T[], key: keyof T) {
  return rows.reduce((a, r) => a + (Number(r[key]) || 0), 0);
}

export function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows.map((r) => r.map((v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n") + "\n";
}

export function csvResponse(filename: string, rows: (string | number | null | undefined)[][]) {
  return new Response(toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
