"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "./Icon";

export type WalkStep = { icon: IconName; eyebrow: string; title: string; body: string; cta?: { label: string; href: string }; done?: boolean };

/** First-time tour: a short modal walkthrough. Marks itself done on finish, skip, or "take me there". */
export function Walkthrough({ steps, finish }: { steps: WalkStep[]; finish: () => Promise<void> }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [i, setI] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const s = steps[i], last = i === steps.length - 1;

  const close = useCallback(async (href?: string) => {
    setOpen(false);
    await finish();
    if (href) router.push(href); else router.replace(window.location.pathname);
  }, [finish, router]);

  useEffect(() => {
    if (!open) return;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, close, steps.length]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-[#130056]/70 p-4 backdrop-blur-[2px]">
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="walk-title"
        className="grid w-full max-w-[520px] overflow-hidden rounded-[24px] bg-white shadow-[0_24px_80px_rgba(0,0,0,.35)] outline-none">
        <div className="relative grid place-items-center bg-navy px-6 pb-8 pt-10 text-white">
          <button type="button" onClick={() => close()} className="absolute right-4 top-4 rounded-full px-3 py-1.5 text-[13px] font-bold text-[#b7b1cc] hover:bg-white/10 hover:text-white">Skip tour</button>
          <span className="grid size-20 place-items-center rounded-full bg-yellow text-ink"><Icon name={s.icon} size={36} /></span>
          <p className="mt-4 text-[12px] font-bold uppercase tracking-[0.1em] text-yellow">{s.eyebrow}</p>
        </div>
        <div className="grid gap-3 px-7 pb-6 pt-6">
          <h2 id="walk-title" className="text-[24px] leading-tight">{s.title}</h2>
          <p className="text-[16px] leading-relaxed text-[#3f3d4a]">{s.body}</p>
          {s.done && <p className="flex items-center gap-2 text-[14px] font-bold text-ok"><span aria-hidden>✓</span>Already done</p>}
          {s.cta && !last && (
            <button type="button" onClick={() => close(s.cta!.href)} className="justify-self-start text-[14px] font-bold text-violet underline underline-offset-2">{s.cta.label}</button>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line px-7 py-4">
          <div className="flex gap-1.5" aria-label={`Step ${i + 1} of ${steps.length}`}>
            {steps.map((_, n) => (
              <button key={n} type="button" onClick={() => setI(n)} aria-label={`Go to step ${n + 1}`}
                className={`h-2 rounded-full transition-all ${n === i ? "w-6 bg-violet" : "w-2 bg-[#d6d3e0] hover:bg-[#b7b1cc]"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {i > 0 && <button type="button" onClick={() => setI(i - 1)} className="btn btn-ghost btn-sm">Back</button>}
            {last
              ? <button type="button" onClick={() => close(s.cta?.href)} className="btn btn-sm">{s.cta?.label ?? "Let's go"}</button>
              : <button type="button" onClick={() => setI(i + 1)} className="btn btn-sm">{i === 0 ? "Show me" : "Next"}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
