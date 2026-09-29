type Mail = { to: string; subject: string; text: string };

/** Sends through Resend when RESEND_API_KEY is set; otherwise prints to the server log (dev). */
export async function sendEmail({ to, subject, text }: Mail): Promise<{ sent: boolean }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "OnTour Upgrades <upgrades@ontour.vip>";
  const body = `${text}\n\n—\nOnTour Upgrades by Please & Thank You\nHelp: https://help.please.co`;
  if (!key) {
    console.log(`\n[email:dev] to=${to}\nsubject: ${subject}\n${body}\n`);
    return { sent: false };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text: body }),
  });
  if (!res.ok) console.error("[email] send failed", res.status, await res.text());
  return { sent: res.ok };
}

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
