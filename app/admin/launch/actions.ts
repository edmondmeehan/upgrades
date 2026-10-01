"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { MANUAL } from "@/lib/launch";
import { stripeMode } from "@/lib/stripe";
import { withMsg } from "@/lib/util";

export async function setManualCheck(key: string, done: boolean) {
  const { supabase, user } = await requireSuperAdmin("/admin/launch");
  if (!MANUAL.some((m) => m.key === key)) redirect("/admin/launch");
  if (done) await supabase.from("platform_checks").upsert({ key, confirmed_by: user.id, confirmed_at: new Date().toISOString() });
  else await supabase.from("platform_checks").delete().eq("key", key);
  revalidatePath("/admin/launch");
}

/** Removes test-mode orders and test Stripe connections. Only once the live key is in. */
export async function clearTestData(fd: FormData) {
  const { supabase } = await requireSuperAdmin("/admin/launch");
  if (stripeMode() !== "live") redirect(withMsg("/admin/launch", "err", "Switch to the live Stripe key first, so nobody keeps testing on the old data."));
  if (String(fd.get("confirm") ?? "").trim().toUpperCase() !== "CLEAR") redirect(withMsg("/admin/launch", "err", "Type CLEAR to confirm."));
  const { data, error } = await supabase.rpc("clear_test_data");
  if (error) redirect(withMsg("/admin/launch", "err", "Couldn't clear test data."));
  const r = data as { orders: number; stripe_accounts: number };
  revalidatePath("/admin/launch");
  redirect(withMsg("/admin/launch", "ok", `Cleared ${r.orders} test order${r.orders === 1 ? "" : "s"} and reset ${r.stripe_accounts} test Stripe connection${r.stripe_accounts === 1 ? "" : "s"}. Artists now set up payouts again for real.`));
}
