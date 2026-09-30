"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function FinanceNav({ base, years }: { base: string; years: number[] }) {
  const path = usePathname();
  const sp = useSearchParams();
  const year = sp.get("year") ?? String(years[0] ?? new Date().getFullYear());
  const tabs = [
    { href: base, label: "Overview", exact: true },
    { href: `${base}/shows`, label: "Show settlements" },
    { href: `${base}/tours`, label: "Tours" },
    { href: `${base}/payouts`, label: "Payouts" },
    { href: `${base}/year-end`, label: "Year-end" },
  ];
  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-3">
      <nav className="pill-nav" aria-label="Financials">
        {tabs.map((t) => {
          const on = t.exact ? path === t.href : path.startsWith(t.href);
          return <Link key={t.href} href={`${t.href}?year=${year}`} aria-current={on ? "page" : undefined}>{t.label}</Link>;
        })}
      </nav>
      <YearPicker years={years} />
    </div>
  );
}

export function YearPicker({ years }: { years: number[] }) {
  const path = usePathname();
  const sp = useSearchParams();
  const year = sp.get("year") ?? String(years[0] ?? new Date().getFullYear());
  return (
    <div className="pill-nav" aria-label="Year">
      {years.map((y) => <Link key={y} href={`${path}?year=${y}`} aria-current={String(y) === year ? "page" : undefined}>{y}</Link>)}
    </div>
  );
}

export function PrintButton() {
  return <button type="button" className="btn btn-ghost no-print" onClick={() => window.print()}>Print or save as PDF</button>;
}
