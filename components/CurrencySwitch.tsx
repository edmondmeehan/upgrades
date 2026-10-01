import Link from "next/link";
import { CURRENCIES, type Currency } from "@/lib/money";

/** Shown only when there's more than one currency: money is never added across currencies. */
export function CurrencySwitch({ list, cur, base, keep = {} }: { list: Currency[]; cur: Currency; base: string; keep?: Record<string, string | undefined> }) {
  if (list.length < 2) return null;
  const qs = (c: string) => { const p = new URLSearchParams(); Object.entries(keep).forEach(([k, v]) => v && p.set(k, v)); p.set("cur", c); return `${base}?${p}`; };
  return (
    <nav className="no-print flex flex-wrap items-center gap-2" aria-label="Currency">
      <span className="text-[13px] font-semibold text-mute">Currency:</span>
      <span className="pill-nav">
        {list.map((c) => <Link key={c} href={qs(c)} aria-current={c === cur ? "page" : undefined}>{c.toUpperCase()}</Link>)}
      </span>
      <span className="help">Totals are shown per currency, in {CURRENCIES[cur]}.</span>
    </nav>
  );
}
