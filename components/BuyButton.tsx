"use client";
import { useFormStatus } from "react-dom";

export function BuyButton({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-lg w-full" style={{ background: bg, color: fg }}>
      {pending ? "Opening secure checkout…" : label}
    </button>
  );
}
