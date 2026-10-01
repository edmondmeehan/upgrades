import { createHash } from "node:crypto";
import { headers } from "next/headers";

/** Visitor's IP, hashed (never stored raw). Used for per-person limits. */
export async function clientKey(scope: string) {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${scope}:${ip}:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`).digest("hex").slice(0, 32);
}

/**
 * Cloudflare Turnstile check. Off (always passes) until TURNSTILE_SECRET_KEY and
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY are set in Vercel.
 */
export async function isHuman(fd: FormData) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return true;
  const token = String(fd.get("cf-turnstile-response") ?? "");
  if (!token) return false;
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim();
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
    });
    const j = (await res.json()) as { success?: boolean };
    return !!j.success;
  } catch {
    return true; // don't block real fans if Cloudflare is unreachable
  }
}

export const HUMAN_FAIL = "Please confirm you're not a robot, then try again.";
