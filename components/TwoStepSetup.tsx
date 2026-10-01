"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Enroll an authenticator app (first time) or enter the 6-digit code (every sign-in). */
export function TwoStepSetup({ next, hasFactor }: { next: string; hasFactor: boolean }) {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = data?.totp?.find((f) => f.status === "verified");
      if (verified) { setFactorId(verified.id); return; }
      // Clear half-finished setups, then start a fresh one.
      for (const f of data?.all ?? []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data: en, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `OnTour admin ${new Date().toISOString().slice(0, 10)}` });
      if (error || !en) { setErr("Couldn't start setup. Refresh and try again."); return; }
      setFactorId(en.id); setQr(en.totp.qr_code); setSecret(en.totp.secret);
    })();
  }, []);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true); setErr(null);
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, "") });
    setBusy(false);
    if (error) { setErr("That code didn't work. Codes change every 30 seconds; try the current one."); return; }
    router.replace(next);
    router.refresh();
  }

  const enrolling = !hasFactor && !!qr;
  return (
    <form onSubmit={verify} className="card grid gap-4 p-6">
      {enrolling ? (
        <>
          <ol className="grid gap-2 text-[15px]">
            <li><b>1.</b> Open an authenticator app on your phone: Google Authenticator, Microsoft Authenticator, 1Password, or similar.</li>
            <li><b>2.</b> Add an account and scan this code.</li>
          </ol>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr!} alt="QR code to add OnTour Upgrades to your authenticator app" className="size-48 justify-self-center rounded-xl border border-line bg-white p-2" />
          {secret && <p className="help text-center">Can&apos;t scan? Enter this key: <span className="font-mono break-all">{secret}</span></p>}
          <p className="text-[15px]"><b>3.</b> Type the 6-digit code the app shows.</p>
        </>
      ) : (
        <p className="text-[15px]">Open your authenticator app and type the 6-digit code for OnTour Upgrades.</p>
      )}
      {err && <p role="alert" className="alert alert-red">{err}</p>}
      <input value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, "").slice(0, 7))} inputMode="numeric" autoComplete="one-time-code" autoFocus
        className="input text-center font-mono text-[24px] tracking-[0.3em]" placeholder="123456" aria-label="6-digit code" required />
      <button disabled={busy || !factorId || code.replace(/\s/g, "").length < 6} className="btn btn-lg">{busy ? "Checking…" : enrolling ? "Turn on two-step sign-in" : "Continue"}</button>
    </form>
  );
}
