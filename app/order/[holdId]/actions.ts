"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadOrder, sendOrderConfirmation, sendPassToGuest } from "@/lib/checkout";

/** The fan names a guest on one of their passes (and can email that guest the pass). Allowed until show day ends. */
export async function fanSetGuest(holdId: string, passId: string, fd: FormData) {
  const back = `/order/${holdId}`;
  const v = await loadOrder(holdId);
  const p = v?.passes.find((x) => x.id === passId);
  if (!v?.order || !p || p.checked_in_at) redirect(back);
  if (v.show.show_date < new Date().toISOString().slice(0, 10)) redirect(`${back}?msg=${encodeURIComponent("This show has passed.")}`);
  const name = String(fd.get("name") ?? "").trim().slice(0, 120) || null;
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 200) || null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect(`${back}?msg=${encodeURIComponent("That email doesn't look right.")}#guests`);
  const db = createAdminClient()!;
  await db.from("passes").update({ attendee_name: name, attendee_email: email }).eq("id", passId);
  let msg = "Saved.";
  if (email && fd.get("send") === "on") {
    const r = await sendPassToGuest(holdId, passId);
    msg = r.sent ? `Saved, and we emailed the pass to ${email}.` : "Saved, but the pass email didn't send. Try again in a minute.";
  }
  revalidatePath(back);
  redirect(`${back}?msg=${encodeURIComponent(msg)}#guests`);
}

export async function fanResend(holdId: string) {
  await sendOrderConfirmation(holdId);
  redirect(`/order/${holdId}?msg=${encodeURIComponent("We've emailed your order again.")}`);
}
