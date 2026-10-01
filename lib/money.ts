export const CURRENCIES = { usd: "US dollars", gbp: "British pounds", eur: "Euros", cad: "Canadian dollars", aud: "Australian dollars" } as const;
export type Currency = keyof typeof CURRENCIES;
export const isCurrency = (c: unknown): c is Currency => typeof c === "string" && c in CURRENCIES;

const cache = new Map<string, Intl.NumberFormat>();
const fmt = (cur: string, whole: boolean) => {
  const k = `${cur}:${whole}`;
  if (!cache.has(k)) cache.set(k, new Intl.NumberFormat(cur === "gbp" ? "en-GB" : cur === "eur" ? "en-IE" : cur === "cad" ? "en-CA" : cur === "aud" ? "en-AU" : "en-US",
    { style: "currency", currency: cur.toUpperCase(), ...(whole ? { maximumFractionDigits: 0 } : {}) }));
  return cache.get(k)!;
};

export const money = (cents: number | null | undefined, cur: string = "usd") => fmt(isCurrency(cur) ? cur : "usd", false).format((Number(cents) || 0) / 100);
export const money0 = (cents: number | null | undefined, cur: string = "usd") => fmt(isCurrency(cur) ? cur : "usd", true).format((Number(cents) || 0) / 100);
export const currencySymbol = (cur: string = "usd") => ({ usd: "$", gbp: "£", eur: "€", cad: "C$", aud: "A$" } as Record<string, string>)[cur] ?? "$";
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

/** Same rule as the database: which currency a show in this country sells in. */
export function currencyForCountry(country?: string | null): Currency {
  const c = (country ?? "US").toUpperCase();
  if (c === "GB" || c === "UK") return "gbp";
  if (c === "CA") return "cad";
  if (c === "AU") return "aud";
  if (["IE", "FR", "DE", "ES", "IT", "NL", "BE", "AT", "PT", "FI", "GR", "LU"].includes(c)) return "eur";
  return "usd";
}
