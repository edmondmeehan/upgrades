"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckInScanner } from "./CheckInScanner";
import type { CheckInResult, DoorGuest } from "@/app/a/[artistId]/check-in/actions";

type Props = {
  showId: string; initial: DoorGuest[];
  checkOnline: (code: string) => Promise<CheckInResult>;
  undoOnline: (passId: string) => Promise<{ ok: boolean }>;
  fetchList: () => Promise<DoorGuest[]>;
  sync: (codes: string[]) => Promise<{ code: string; result: string }[]>;
};

const norm = (c: string) => c.replace(/^.*[:/]/, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
const answersText = (a: Record<string, string> | null) => (a && Object.keys(a).length ? Object.values(a).join(", ") : undefined);
const load = <T,>(k: string, fallback: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

/**
 * Door check-in that keeps working without signal: the guest list is saved on the phone,
 * offline scans are checked against it and queued, and the queue syncs when the phone is back online.
 */
export function CheckInApp({ showId, initial, checkOnline, undoOnline, fetchList, sync }: Props) {
  const LK = `ontour-door-list-${showId}`, QK = `ontour-door-queue-${showId}`;
  const [guests, setGuests] = useState<DoorGuest[]>(initial);
  const [queue, setQueue] = useState<string[]>([]);
  const [online, setOnline] = useState(true);
  const [updated, setUpdated] = useState<number>(Date.now());
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "waiting" | "in">("all");
  const queueRef = useRef<string[]>([]);

  // Start from the server list, keep anything this phone checked in offline.
  useEffect(() => {
    const queued = load<string[]>(QK, []);
    queueRef.current = queued; setQueue(queued);
    setGuests(initial.map((g) => (queued.includes(g.code) && !g.checked_in_at ? { ...g, checked_in_at: new Date().toISOString() } : g)));
    save(LK, initial);
    setOnline(navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [initial, LK, QK]);

  const setQ2 = (next: string[]) => { queueRef.current = next; setQueue(next); save(QK, next); };
  const markLocal = (code: string, at: string | null) => setGuests((cur) => { const n = cur.map((g) => (g.code === code ? { ...g, checked_in_at: at } : g)); save(LK, n); return n; });

  const refresh = useCallback(async () => {
    try {
      const list = await fetchList();
      const queued = queueRef.current;
      const merged = list.map((g) => (queued.includes(g.code) && !g.checked_in_at ? { ...g, checked_in_at: new Date().toISOString() } : g));
      setGuests(merged); save(LK, merged); setUpdated(Date.now()); setOnline(true);
    } catch { setOnline(false); }
  }, [fetchList, LK]);

  const flush = useCallback(async () => {
    const codes = queueRef.current;
    if (!codes.length) return;
    try {
      const res = await sync(codes);
      const done = new Set(res.filter((r) => r.result !== "error").map((r) => r.code));
      setQ2(queueRef.current.filter((c) => !done.has(c)));
      setOnline(true);
    } catch { setOnline(false); }
  }, [sync]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t1 = setInterval(() => { if (navigator.onLine) flush(); }, 10000);
    const t2 = setInterval(() => { if (navigator.onLine) refresh(); }, 45000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [flush, refresh]);
  useEffect(() => { if (online) { flush(); refresh(); } }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  const offlineCheck = (code: string): CheckInResult => {
    const g = guests.find((x) => x.code === code);
    if (!g) return { result: "not_found", code, message: "Not on this phone's saved list. If someone just bought, check again once you have signal." };
    const base = { code, pass_id: g.pass_id, name: g.buyer ? `${g.name} (via ${g.buyer})` : g.name, package: g.pkg + (g.is_comp ? ", comp" : ""), guest: g.guest, of: g.of_qty, answersText: answersText(g.answers) };
    if (g.is_void) return { ...base, result: "void" };
    if (g.checked_in_at) return { ...base, result: "already", at: g.checked_in_at };
    markLocal(code, new Date().toISOString());
    setQ2([...queueRef.current, code]);
    return { ...base, result: "ok", message: "Saved on this phone. It syncs automatically when you're back online." };
  };

  const check = async (raw: string): Promise<CheckInResult> => {
    const code = norm(raw);
    if (navigator.onLine) {
      try {
        const r = await checkOnline(code);
        if (r.result === "ok" || r.result === "already") markLocal(code, r.at ?? new Date().toISOString());
        setOnline(true);
        return r;
      } catch { setOnline(false); }
    }
    return offlineCheck(code);
  };
  const undo = async (passId: string) => {
    const g = guests.find((x) => x.pass_id === passId);
    if (g && queueRef.current.includes(g.code)) { setQ2(queueRef.current.filter((c) => c !== g.code)); markLocal(g.code, null); return { ok: true }; }
    try { const r = await undoOnline(passId); if (g) markLocal(g.code, null); return r; } catch { return { ok: false }; }
  };

  const valid = guests.filter((g) => !g.is_void), inCount = valid.filter((g) => g.checked_in_at).length;
  const pct = valid.length ? Math.round((inCount / valid.length) * 100) : 0;
  const pkgs = useMemo(() => {
    const m = new Map<string, { total: number; in: number }>();
    valid.forEach((g) => { const c = m.get(g.pkg) ?? { total: 0, in: 0 }; c.total++; if (g.checked_in_at) c.in++; m.set(g.pkg, c); });
    return [...m.entries()];
  }, [valid]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return valid.filter((g) => filter === "all" || (filter === "in" ? !!g.checked_in_at : !g.checked_in_at))
      .filter((g) => !t || [g.name, g.buyer, g.email, g.code, g.pkg].some((v) => v?.toLowerCase().includes(t)));
  }, [valid, q, filter]);
  const ago = Math.max(0, Math.round((Date.now() - updated) / 60000));

  return (
    <div className="grid gap-5">
      <div role="status" className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 text-[14px] font-semibold ${online ? "bg-[#d6f1ec] text-ok" : "bg-[#fff1c2] text-[#7a5a00]"}`}>
        <span>{online ? "Online" : "Offline: still checking people in from the saved list"}</span>
        <span className="font-medium">{queue.length ? `${queue.length} check-in${queue.length === 1 ? "" : "s"} waiting to sync` : online ? `List updated ${ago ? `${ago} min ago` : "just now"}` : `${guests.length} guests saved on this phone`}</span>
      </div>

      <section className="card grid gap-3 p-5">
        <div className="flex items-end justify-between gap-3">
          <p><span className="text-[34px] font-extrabold leading-none">{inCount}</span><span className="text-[18px] font-bold text-mute"> / {valid.length} checked in</span></p>
          <span className="text-[15px] font-bold text-mute">{pct}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-[#eceaf2]"><i className="block h-full rounded-full bg-violet" style={{ width: `${pct}%` }} /></div>
        {pkgs.length > 1 && (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {pkgs.map(([name, c]) => <li key={name} className="stat flex items-center justify-between !py-2"><span className="!text-[13px] !text-ink">{name}</span><b className="!text-[16px]">{c.in}/{c.total}</b></li>)}
          </ul>
        )}
      </section>

      <CheckInScanner check={check} undo={undo} managed />

      <section className="grid gap-3">
        <h2>Guest list</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input input-sm min-w-[200px] flex-1" placeholder="Search name or code" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search guests" />
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
                <span className={`grid size-9 shrink-0 place-items-center rounded-full text-[15px] font-extrabold ${g.checked_in_at ? "bg-[#d6f1ec] text-ok" : "bg-paper text-mute"}`} aria-hidden>{g.checked_in_at ? "✓" : g.name.charAt(0).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{g.name}{g.of_qty > 1 && <span className="font-medium text-mute">, guest {g.guest} of {g.of_qty}</span>}</span>
                  <span className="block truncate text-[13px] text-mute">
                    {g.pkg}{g.is_comp ? " (comp)" : ""}{g.buyer ? `, via ${g.buyer}` : ""}{answersText(g.answers) ? `, ${answersText(g.answers)}` : ""}, <span className="font-mono">{g.code}</span>
                    {queue.includes(g.code) ? ", saved offline" : g.checked_in_at ? `, in at ${new Date(g.checked_in_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}
                  </span>
                </span>
                <button type="button" onClick={async () => { if (g.checked_in_at) await undo(g.pass_id); else await check(g.code); }}
                  className={`btn btn-sm shrink-0 ${g.checked_in_at ? "btn-ghost" : ""}`}>{g.checked_in_at ? "Undo" : "Check in"}</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
