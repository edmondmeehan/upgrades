"use client";
import { currencySymbol } from "@/lib/money";
import { useMemo, useState } from "react";
import { SubmitButton } from "./SubmitButton";

export type GridPackage = { id: string; name: string; default_price: number | null; default_capacity: number | null; currency_prices?: Record<string, number> };
export type GridShow = { id: string; date: string; label: string; venue: string | null; past: boolean; currency?: string };
export type GridCell = { applied: boolean; price: string; capacity: string; sold: number }; // "" = default

const k = (s: string, p: string) => `${s}:${p}`;
const money = (d: number | null) => (d == null ? "" : `$${(d / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export function InventoryGrid({ action, packages, shows, initial }: {
  action: (fd: FormData) => void | Promise<void>; packages: GridPackage[]; shows: GridShow[]; initial: Record<string, GridCell>;
}) {
  const [cells, setCells] = useState(initial);
  const [mode, setMode] = useState<"capacity" | "price">("capacity");
  const get = (s: string, p: string) => cells[k(s, p)] ?? { applied: false, price: "", capacity: "", sold: 0 };
  const set = (s: string, p: string, patch: Partial<GridCell>) => setCells((c) => ({ ...c, [k(s, p)]: { ...get(s, p), ...patch } }));
  const setColumn = (p: string, applied: boolean) => setCells((c) => {
    const n = { ...c };
    shows.forEach((s) => { if (!s.past || !applied) { const cur = n[k(s.id, p)] ?? { applied: false, price: "", capacity: "", sold: 0 }; n[k(s.id, p)] = { ...cur, applied }; } });
    return n;
  });
  const setRow = (s: string, applied: boolean) => setCells((c) => {
    const n = { ...c };
    packages.forEach((p) => { const cur = n[k(s, p.id)] ?? { applied: false, price: "", capacity: "", sold: 0 }; n[k(s, p.id)] = { ...cur, applied }; });
    return n;
  });

  const totals = useMemo(() => packages.map((p) => {
    let cap = 0, sold = 0, on = 0;
    shows.forEach((s) => { const c = cells[k(s.id, p.id)]; if (c?.applied) { on++; cap += Number(c.capacity || p.default_capacity || 0); sold += c.sold; } });
    return { cap, sold, on };
  }), [cells, packages, shows]);

  const payload = JSON.stringify(shows.flatMap((s) => packages.map((p) => { const c = get(s.id, p.id); return { show_id: s.id, product_id: p.id, applied: c.applied, price: c.price || null, capacity: c.capacity || null }; })));

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="cells" value={payload} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Edit" className="pill-nav">
          <button type="button" role="tab" aria-selected={mode === "capacity"} onClick={() => setMode("capacity")}>Quantities</button>
          <button type="button" role="tab" aria-selected={mode === "price"} onClick={() => setMode("price")}>Prices</button>
        </div>
        <p className="help">Blank boxes use the package default. Type a number to change just that show.</p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-[14px]" style={{ minWidth: `${16 + packages.length * 13}rem` }}>
          <thead className="bg-paper align-top">
            <tr>
              <th className="sticky left-0 z-10 bg-paper px-4 py-3"><span className="th">Show</span></th>
              {packages.map((p, i) => {
                const all = shows.filter((s) => !s.past).every((s) => get(s.id, p.id).applied);
                return (
                  <th key={p.id} className="px-3 py-3">
                    <span className="block text-[14px] font-extrabold leading-tight">{p.name}</span>
                    <span className="help block">Default {mode === "price" ? money(p.default_price) : `${p.default_capacity ?? "?"} per show`}</span>
                    <span className="help block">{totals[i].sold} sold of {totals[i].cap}, {totals[i].on} show{totals[i].on === 1 ? "" : "s"}</span>
                    <button type="button" className="mt-1 text-[12px] font-semibold text-violet underline" onClick={() => setColumn(p.id, !all)}>{all ? "Remove from all" : "Add to every show"}</button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shows.map((s) => {
              const rowAll = packages.every((p) => get(s.id, p.id).applied);
              return (
                <tr key={s.id} className={s.past ? "opacity-60" : ""}>
                  <td className="sticky left-0 z-10 bg-white px-4 py-3">
                    <span className="block font-bold">{s.label}</span>
                    <span className="block text-[13px] text-mute">{fmt(s.date)}{s.past ? " (past)" : ""}</span>
                    <button type="button" className="text-[12px] font-semibold text-violet underline" onClick={() => setRow(s.id, !rowAll)}>{rowAll ? "None" : "All packages"}</button>
                  </td>
                  {packages.map((p) => {
                    const c = get(s.id, p.id);
                    const cap = Number(c.capacity || p.default_capacity || 0);
                    const val = mode === "price" ? c.price : c.capacity;
                    const custom = !!val;
                    return (
                      <td key={p.id} className={`px-3 py-3 align-top ${c.applied ? "" : "bg-paper/60"}`}>
                        <label className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold">
                          <input type="checkbox" className="check" checked={c.applied} onChange={(e) => set(s.id, p.id, { applied: e.target.checked })}
                            aria-label={`Sell ${p.name} at ${s.label}`} />
                          {c.applied ? "On sale" : "Off"}
                        </label>
                        {c.applied && (
                          <>
                            <span className="relative block">
                              {mode === "price" && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mute">{currencySymbol(s.currency)}</span>}
                              <input className={`input input-sm w-28 ${mode === "price" ? "!pl-6" : ""} ${custom ? "!border-violet" : ""}`} inputMode={mode === "price" ? "decimal" : "numeric"}
                                aria-label={`${mode === "price" ? "Price" : "Quantity"} for ${p.name} at ${s.label}`}
                                placeholder={mode === "price" ? String(((s.currency && s.currency !== "usd" ? p.currency_prices?.[s.currency] : undefined) ?? p.default_price ?? 0) / 100) : String(p.default_capacity ?? "")}
                                value={val} onChange={(e) => set(s.id, p.id, mode === "price" ? { price: e.target.value } : { capacity: e.target.value.replace(/\D/g, "") })} />
                            </span>
                            <span className="mt-1 block text-[12px] text-mute">{c.sold} sold, {Math.max(0, cap - c.sold)} left</span>
                            {custom && <button type="button" className="text-[12px] font-semibold text-violet underline" onClick={() => set(s.id, p.id, mode === "price" ? { price: "" } : { capacity: "" })}>Use default</button>}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div><SubmitButton size="lg" pendingText="Saving…">Save inventory</SubmitButton></div>
    </form>
  );
}
