"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import type { CheckInResult } from "@/app/a/[artistId]/check-in/actions";

type Props = { check: (code: string) => Promise<CheckInResult>; undo: (passId: string) => Promise<{ ok: boolean }> };

const TONE: Record<string, [string, string, string]> = { // bg, fg, title
  ok: ["#0a5146", "#ffffff", "Checked in"],
  already: ["#f2d64b", "#0b0b0f", "Already checked in"],
  wrong_show: ["#c8391a", "#ffffff", "Wrong show"],
  void: ["#c8391a", "#ffffff", "Pass not valid"],
  not_found: ["#c8391a", "#ffffff", "Pass not found"],
  error: ["#3f3d4a", "#ffffff", "Something went wrong"],
};

function beep(ok: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = ok ? 880 : 220; o.type = "sine"; g.gain.value = 0.15;
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + (ok ? 0.12 : 0.35));
  } catch { /* no audio */ }
  navigator.vibrate?.(ok ? 80 : [80, 60, 80]);
}

export function CheckInScanner({ check, undo }: Props) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const busy = useRef(false);
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const [on, setOn] = useState(false);
  const [camErr, setCamErr] = useState<string | null>(null);
  const [res, setRes] = useState<CheckInResult | null>(null);
  const [manual, setManual] = useState("");

  const submit = useCallback(async (code: string) => {
    if (busy.current) return;
    busy.current = true;
    const r = await check(code);
    setRes(r);
    beep(r.result === "ok");
    router.refresh();
    setTimeout(() => { busy.current = false; }, 1200);
  }, [check, router]);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setOn(false);
  }, []);

  const start = async () => {
    setCamErr(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      stream.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play(); }
      setOn(true);
    } catch {
      setCamErr("Couldn't open the camera. Allow camera access for this site in your browser settings, or type the code below.");
    }
  };

  useEffect(() => {
    if (!on) return;
    let raf = 0, lastScan = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - lastScan < 180 || busy.current) return;
      lastScan = t;
      const v = video.current, c = canvas.current;
      if (!v || !c || v.readyState < 2) return;
      const w = 640, h = Math.round((v.videoHeight / v.videoWidth) * w) || 480;
      c.width = w; c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(v, 0, 0, w, h);
      const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
      if (found?.data) {
        const now = Date.now();
        if (found.data === last.current.code && now - last.current.at < 4000) return; // same pass still in frame
        last.current = { code: found.data, at: now };
        submit(found.data);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, submit]);

  useEffect(() => () => stop(), [stop]);

  const tone = res ? TONE[res.result] ?? TONE.error : null;
  return (
    <div className="grid gap-4">
      <div className="relative overflow-hidden rounded-[20px] bg-ink">
        <video ref={video} playsInline muted className={`aspect-[4/3] w-full object-cover ${on ? "" : "hidden"}`} />
        <canvas ref={canvas} className="hidden" />
        {!on && (
          <div className="grid aspect-[4/3] w-full place-items-center p-6 text-center text-white">
            <div className="grid justify-items-center gap-3">
              <p className="text-[18px] font-extrabold">Scan VIP passes</p>
              <p className="max-w-xs text-[14px] text-[#b7b1cc]">Point your phone&apos;s camera at the QR code on the fan&apos;s pass.</p>
              <button type="button" onClick={start} className="btn btn-yellow btn-lg">Start scanning</button>
              {camErr && <p className="max-w-xs text-[13px] font-semibold text-yellow">{camErr}</p>}
            </div>
          </div>
        )}
        {on && <div aria-hidden className="pointer-events-none absolute inset-[18%] rounded-3xl border-4 border-white/80" />}
      </div>
      <div className={on ? "-mt-4 relative" : ""}>
        {tone && res && (
          <div role="status" aria-live="assertive" className={`grid gap-1 rounded-2xl p-4 shadow-xl ${on ? "absolute inset-x-3 bottom-7" : ""}`} style={{ background: tone[0], color: tone[1] }}>
            <p className="text-[22px] font-extrabold leading-tight">{tone[2]}</p>
            {res.name && <p className="text-[18px] font-bold">{res.name}{res.of && res.of > 1 ? `, guest ${res.guest} of ${res.of}` : ""}</p>}
            {res.package && <p className="text-[15px] font-semibold opacity-90">{res.package}</p>}
            {res.answersText && <p className="text-[15px] font-bold">{res.answersText}</p>}
            {res.result === "already" && res.at && <p className="text-[14px] opacity-90">At {new Date(res.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}{res.by ? ` by ${res.by}` : ""}</p>}
            {res.result === "wrong_show" && <p className="text-[14px] opacity-90">This pass is for {res.other_city}{res.other_date ? `, ${new Date(`${res.other_date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : ""}.</p>}
            {res.result === "not_found" && <p className="text-[14px] opacity-90">Code {res.code || "(blank)"} isn&apos;t a pass for this artist. Try searching their name below.</p>}
            {res.result === "void" && <p className="text-[14px] opacity-90">This order was refunded or the pass was cancelled.</p>}
            {res.message && <p className="text-[14px] opacity-90">{res.message}</p>}
            <div className="mt-1 flex gap-2">
              {res.result === "ok" && res.pass_id && (
                <button type="button" className="rounded-full bg-white/20 px-3 py-1.5 text-[13px] font-bold" onClick={async () => { await undo(res.pass_id!); setRes(null); router.refresh(); }}>Undo</button>
              )}
              <button type="button" className="rounded-full bg-white/20 px-3 py-1.5 text-[13px] font-bold" onClick={() => setRes(null)}>Dismiss</button>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {on && <button type="button" onClick={stop} className="btn btn-ghost btn-sm">Stop camera</button>}
        <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { submit(manual); setManual(""); } }}>
          <input className="input input-sm flex-1 font-mono uppercase" placeholder="Type a pass code" value={manual} onChange={(e) => setManual(e.target.value)} aria-label="Pass code" autoCapitalize="characters" autoComplete="off" />
          <button type="submit" className="btn btn-sm">Check in</button>
        </form>
      </div>
    </div>
  );
}
