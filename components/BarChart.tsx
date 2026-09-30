import { MONTHS, money0 } from "@/lib/money";

/** Simple monthly bar chart with an accessible table behind it. */
export function BarChart({ values, label, highlight }: { values: number[]; label: string; highlight?: number }) {
  const max = Math.max(...values, 1);
  return (
    <figure className="grid gap-2">
      <figcaption className="sr-only">{label}</figcaption>
      <div className="grid h-44 grid-cols-12 items-end gap-1.5 sm:gap-3" aria-hidden>
        {values.map((v, i) => (
          <div key={i} className="group relative flex h-full flex-col justify-end">
            <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-bold text-white group-hover:block">{money0(v)}</span>
            <div className={`rounded-t-md ${i === highlight ? "bg-yellow" : "bg-violet"} ${v === 0 ? "opacity-20" : ""}`} style={{ height: `${Math.max((v / max) * 100, v ? 3 : 1.5)}%` }} />
          </div>
        ))}
      </div>
      <div className="th grid grid-cols-12 gap-1.5 text-center !text-[10px] sm:gap-3" aria-hidden>{MONTHS.map((m) => <span key={m}>{m}</span>)}</div>
      <table className="sr-only"><caption>{label}</caption><tbody>{values.map((v, i) => <tr key={i}><th>{MONTHS[i]}</th><td>{money0(v)}</td></tr>)}</tbody></table>
    </figure>
  );
}

export function Meter({ value, max }: { value: number; max: number }) {
  const pctv = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return <div className="h-2 w-full min-w-16 overflow-hidden rounded bg-[#eceaf2]" aria-hidden><i className="block h-full rounded bg-violet" style={{ width: `${pctv}%` }} /></div>;
}
