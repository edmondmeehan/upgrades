"use server";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export async function findOrder(fd: FormData) {
  const code = String(fd.get("code") ?? "").trim(), proof = String(fd.get("proof") ?? "").trim();
  const back = (err: string) => `/find-order?err=${encodeURIComponent(err)}&code=${encodeURIComponent(code)}`;
  if (!code || !proof) redirect(back("Enter your confirmation number and your last name, email, or billing ZIP."));
  const db = createAdminClient();
  if (!db) redirect(back("Order lookup isn't available right now."));
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ipHash = createHash("sha256").update(`${ip}:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`).digest("hex").slice(0, 32);
  const { data, error } = await db.rpc("lookup_order", { p_code: code, p_proof: proof, p_ip_hash: ipHash });
  const r = data as { result: string; hold_id?: string } | null;
  if (error || !r) redirect(back("Something went wrong. Try again."));
  if (r.result === "throttled") redirect(back("Too many tries. Wait 15 minutes and try again, or contact Fan Support."));
  if (r.result !== "ok" || !r.hold_id) redirect(back("We couldn't find an order with those details. Check the confirmation number (it starts with OTU-) and try your email instead."));
  redirect(`/order/${r.hold_id}`);
}
