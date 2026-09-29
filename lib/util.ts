export function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export function formatDate(d: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric" }) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

export function formatTime(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  const d = new Date(Date.UTC(2000, 0, 1, h, m));
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

export function formatDateTime(ts: string) {
  return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Turns Postgres/RPC errors into a message safe to show. */
export function cleanError(e: { message?: string } | null | undefined, fallback = "Something went wrong. Try again.") {
  const msg = e?.message ?? "";
  if (!msg) return fallback;
  if (msg.includes("duplicate key")) return "That already exists.";
  if (msg.includes("row-level security") || msg.includes("permission denied")) return "You don't have permission to do that.";
  return msg;
}

export function withMsg(path: string, key: "ok" | "err", msg: string) {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${key}=${encodeURIComponent(msg)}`;
}

export const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
