"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}
const two = (n: number) => String(n).padStart(2, "0");

/** Live countdown to an ISO time. Refreshes the page when it hits zero so the on-sale state appears. */
export function Countdown({ to, variant = "blocks", onDark = false }: { to: string; variant?: "blocks" | "inline"; onDark?: boolean }) {
  const target = new Date(to).getTime();
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= target) { clearInterval(t); router.refresh(); }
    }, 1000);
    return () => clearInterval(t);
  }, [target, router]);

  const when = new Date(to).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  if (now === null) return <span className="text-[13px] font-semibold">On sale {when}</span>; // server render
  const { d, h, m, s } = parts(target - now);
  const label = `On sale in ${d ? `${d} day${d === 1 ? "" : "s"}, ` : ""}${h} hours, ${m} minutes`;

  if (variant === "inline") {
    return <span aria-label={label} className="font-mono tabular-nums">{d > 0 && `${d}d `}{two(h)}:{two(m)}:{two(s)}</span>;
  }
  return (
    <div className="grid gap-1.5" role="timer" aria-label={label}>
      <div className="grid grid-cols-4 gap-1.5" aria-hidden>
        {([[d, "days"], [h, "hrs"], [m, "min"], [s, "sec"]] as const).map(([v, l]) => (
          <span key={l} className={`grid justify-items-center rounded-xl py-1.5 ${onDark ? "bg-white/15" : "bg-paper"}`}>
            <span className="font-mono text-[20px] font-extrabold tabular-nums leading-none">{l === "days" ? v : two(v)}</span>
            <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] opacity-70">{l}</span>
          </span>
        ))}
      </div>
      <span className="text-center text-[12px] font-medium opacity-80">On sale {when}</span>
    </div>
  );
}
