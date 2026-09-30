"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CheckInResult } from "@/app/a/[artistId]/check-in/actions";

export type Guest = { pass_id: string; code: string; name: string | null; email: string | null; pkg: string; guest: number; of: number; checked_in_at: string | null; void: boolean };

export function GuestList({ guests, check, undo }: { guests: Guest[]; check: (code: string) => Promise<CheckInResult>; undo: (passId: string) => Promise<{ ok: boolean }> }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "waiting" | "in">("all");
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return guests.filter((g) => !g.void)
      .filter((g) => filter === "all" || (filter === "in" ? !!g.checked_in_at : !g.checked_in_at))
      .filter((g) => !t || [g.name, g.email, g.code, g.pkg].some((v) => v?.toLowerCase().includes(t)));
  }, [guests, q, filter]);

  const act = (g: Guest) => {
    setBusyId(g.pass_id);
    start(async () => {
      if (g.checked_in_at) await undo(g.pass_id); else await check(g.code);
      router.refresh();
      setBusyId(null);
    });
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input input-sm min-w-[200px] flex-1" placeholder="Search name, email or code" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search guests" />
        <div role="tablist" className="pill-nav">
          {([["all", "All"], ["waiting", "Not in yet"], ["in", "Checked in"]] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      </div>
      {list.length === 0 ? <p className="help px-1 py-6 text-center">No guests match.</p> : (
        <ul className="card divide-y divide-line overflow-hidden">
          {list.map((g) => (
            <li key={g.pass_id} className="flex items-center gap-3 px-4 py-3">
              <span className={`grid size-9 shrink-0 place-items-center rounded-full text-[15px] font-extrabold ${g.checked_in_at ? "bg-[#d6f1ec] text-ok" : "bg-paper text-mute"}`} aria-hidden>{g.checked_in_at ? "✓" : (g.name ?? "?").charAt(0).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{g.name ?? g.email ?? "Guest"}{g.of > 1 && <span className="font-medium text-mute">, guest {g.guest} of {g.of}</span>}</span>
                <span className="block truncate text-[13px] text-mute">{g.pkg}, <span className="font-mono">{g.code}</span>{g.checked_in_at ? `, in at ${new Date(g.checked_in_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}</span>
              </span>
              <button type="button" disabled={pending && busyId === g.pass_id} onClick={() => act(g)}
                className={`btn btn-sm shrink-0 ${g.checked_in_at ? "btn-ghost" : ""}`}>{pending && busyId === g.pass_id ? "…" : g.checked_in_at ? "Undo" : "Check in"}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
