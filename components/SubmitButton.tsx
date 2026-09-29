"use client";
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children, pendingText, variant = "primary", name, value, confirm, formAction,
}: {
  children: React.ReactNode; pendingText?: string; variant?: "primary" | "dark" | "ghost" | "danger";
  name?: string; value?: string; confirm?: string; formAction?: (fd: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit" name={name} value={value} formAction={formAction} disabled={pending} className={`btn btn-${variant}`}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
    >
      {pending ? pendingText ?? "Saving…" : children}
    </button>
  );
}
