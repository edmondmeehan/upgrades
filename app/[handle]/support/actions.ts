"use server";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, siteUrl } from "@/lib/email";
import { TOPICS } from "@/lib/support";
import { isHuman, HUMAN_FAIL } from "@/lib/human";


export async function submitSupport(handle: string, fd: FormData) {
  const back = (q: string) => `/${handle}/support?${q}`;
  if (String(fd.get("website") ?? "")) redirect(back("sent=1")); // honeypot: bots fill every field
  const name = String(fd.get("name") ?? "").trim(), email = String(fd.get("email") ?? "").trim();
  const topic = String(fd.get("topic") ?? "other"), message = String(fd.get("message") ?? "").trim(), code = String(fd.get("order") ?? "").trim();
  const keep = `order=${encodeURIComponent(code)}`;
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !message) redirect(back(`${keep}&err=${encodeURIComponent("Add your name, a valid email, and your message.")}`));

  if (!(await isHuman(fd))) redirect(back(`${keep}&err=${encodeURIComponent(HUMAN_FAIL)}`));
  const db = createAdminClient();
  if (!db) redirect(back(`${keep}&err=${encodeURIComponent("Support isn't available right now.")}`));
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ipHash = createHash("sha256").update(`support:${ip}:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`).digest("hex").slice(0, 32);
  const { data, error } = await db.rpc("submit_support_request", {
    p_handle: handle, p_name: name.slice(0, 120), p_email: email.slice(0, 200), p_topic: TOPICS[topic] ? topic : "other",
    p_message: message.slice(0, 4000), p_code: code || null, p_ip_hash: ipHash,
  });
  const r = data as { result: string; id?: string; artist_id?: string; artist_name?: string; to?: string; order_id?: string | null } | null;
  if (error || !r) redirect(back(`${keep}&err=${encodeURIComponent("Your message didn't send. Try again.")}`));
  if (r.result === "throttled") redirect(back(`${keep}&err=${encodeURIComponent("You've sent several messages already. Give the artist a little time to reply.")}`));
  if (r.result !== "ok") redirect(`/${handle}`);

  // Order details for the artist, when the confirmation number matched one of their orders.
  const details: [string, string][] = [["From", `${name} <${email}>`], ["Topic", TOPICS[topic] ?? "Something else"]];
  if (code) details.push(["Confirmation number", code.toUpperCase()]);
  if (r.order_id) {
    const { data: o } = await db.from("orders").select("total_cents, created_at, shows!orders_show_id_fkey(show_date, city, region), order_items(quantity, show_products(products(name)))").eq("id", r.order_id).single();
    const oo = o as unknown as { total_cents: number; shows: { show_date: string; city: string | null; region: string | null }; order_items: { quantity: number; show_products: { products: { name: string } } }[] } | null;
    if (oo) {
      details.push(["Order", oo.order_items.map((i) => `${i.show_products.products.name} x ${i.quantity}`).join(", ")]);
      details.push(["Show", `${oo.shows.show_date}, ${oo.shows.city ?? ""}${oo.shows.region ? `, ${oo.shows.region}` : ""}`]);
      details.push(["Paid", `$${(oo.total_cents / 100).toFixed(2)}`]);
    }
  } else if (code) details.push(["Note", "This confirmation number didn't match one of your orders."]);

  if (r.to) {
    await sendEmail({
      to: r.to, replyTo: email,
      subject: `[Fan support] ${TOPICS[topic] ?? "Question"}: ${name}`,
      eyebrow: `${r.artist_name} fan support`, title: TOPICS[topic] ?? "New message",
      body: [message],
      details,
      button: { label: "Open fan support inbox", url: `${siteUrl()}/a/${r.artist_id}/support` },
      footnote: `Reply to this email to answer ${name.split(" ")[0]} directly.`,
    });
  }
  await sendEmail({
    to: email, replyTo: r.to ?? undefined,
    subject: `We got your message for ${r.artist_name}`,
    eyebrow: "Fan support", title: "Message received",
    body: [`Thanks, ${name.split(" ")[0]}. Your message went to the ${r.artist_name} team, and they'll reply to this email address.`, `Your message: "${message.slice(0, 500)}${message.length > 500 ? "…" : ""}"`],
    button: { label: `Back to ${r.artist_name}`, url: `${siteUrl()}/${handle}` },
  });
  redirect(back("sent=1"));
}
