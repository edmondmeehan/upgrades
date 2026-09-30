"use client";
import { useFormStatus } from "react-dom";

type Variant = "primary" | "yellow" | "dark" | "ghost" | "danger" | "text";

export function SubmitButton({
  children, pendingText, variant = "primary", size, name, value, confirm, formAction, block,
}: {
  children: React.ReactNode; pendingText?: string; variant?: Variant; size?: "sm" | "lg";
  name?: string; value?: string; confirm?: string; formAction?: (fd: FormData) => void | Promise<void>; block?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit" name={name} value={value} formAction={formAction} disabled={pending}
      className={`btn btn-${variant}${size ? ` btn-${size}` : ""}${block ? " w-full" : ""}`}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
    >
      {pending ? pendingText ?? "Saving…" : children}
    </button>
  );
}
