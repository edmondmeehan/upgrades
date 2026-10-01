/**
 * Branded email, sent through Resend. Same layout as photos.ontour.vip: a navy header with the
 * P&T logo, a white card, and a violet button. Without RESEND_API_KEY, emails print to the server log.
 */

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

const LOGO = "https://please.co/cdn/shop/files/PTY_Logo_Type_Yellow_WhiteText.png?v=1768929642&width=440";
const SUPPORT = "https://help.please.co";
const FONT = "Inter,'Helvetica Neue',Helvetica,Arial,sans-serif";

export type EmailContent = {
  eyebrow?: string;           // small uppercase label, e.g. "Team invite"
  title: string;              // headline
  body: string[];             // paragraphs (plain text; escaped)
  button?: { label: string; url: string };
  details?: [string, string][]; // label/value rows in a grey box
  footnote?: string;          // small print under the button
  images?: { src: string; alt: string; caption?: string }[]; // e.g. pass QR codes
  tables?: { title?: string; head: string[]; rows: string[][]; numeric?: number[] }[]; // simple data tables (reports)
  stats?: { label: string; value: string; note?: string }[]; // big-number tiles
  preheader?: string;         // inbox preview text
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderEmail(c: EmailContent) {
  const p = (t: string) => `<p style="margin:0 0 16px;font:400 16px/1.55 ${FONT};color:#3F3D4A">${esc(t).replace(/\n/g, "<br>")}</p>`;
  const details = c.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;background:#F7F6FA;border-radius:14px"><tr><td style="padding:14px 18px">${c.details
        .map(([k, v]) => `<p style="margin:0 0 6px;font:400 14px/1.45 ${FONT};color:#5A5866"><strong style="color:#0B0B0F">${esc(k)}:</strong> ${esc(v)}</p>`).join("")}</td></tr></table>`
    : "";
  const button = c.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="background:#260797;border-radius:24px">
<a href="${esc(c.button.url)}" style="display:inline-block;padding:14px 26px;font:700 15px/1 ${FONT};color:#ffffff;text-decoration:none;border-radius:24px">${esc(c.button.label)}</a></td></tr></table>
<p style="margin:0 0 16px;font:400 13px/1.45 ${FONT};color:#5A5866">Or paste this link into your browser:<br><a href="${esc(c.button.url)}" style="color:#260797;word-break:break-all">${esc(c.button.url)}</a></p>`
    : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(c.title)}</title></head>
<body style="margin:0;padding:0;background:#F7F6FA">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(c.preheader ?? c.title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6FA"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="background:#130056;border-radius:20px 20px 0 0;padding:24px 28px">
<img src="${LOGO}" alt="Please &amp; Thank You" width="127" height="44" style="height:44px;width:127px;display:block;border:0">
</td></tr>
<tr><td style="background:#ffffff;border-radius:0 0 20px 20px;padding:32px 28px 28px">
${c.eyebrow ? `<p style="margin:0 0 8px;font:700 12px/1.2 ${FONT};letter-spacing:.08em;text-transform:uppercase;color:#5A5866">${esc(c.eyebrow)}</p>` : ""}
<h1 style="margin:0 0 16px;font:800 26px/1.15 ${FONT};letter-spacing:-.02em;color:#0B0B0F">${esc(c.title)}</h1>
${c.body.map(p).join("\n")}
${c.stats?.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr>${c.stats.map((st) =>
  `<td valign="top" style="width:${Math.floor(100 / c.stats!.length)}%;padding:0 4px"><div style="background:#F7F6FA;border-radius:14px;padding:14px 12px">
<p style="margin:0;font:800 22px/1.1 ${FONT};color:#0B0B0F">${esc(st.value)}</p>
<p style="margin:4px 0 0;font:700 11px/1.3 ${FONT};letter-spacing:.06em;text-transform:uppercase;color:#5A5866">${esc(st.label)}</p>
${st.note ? `<p style="margin:4px 0 0;font:400 12px/1.3 ${FONT};color:#5A5866">${esc(st.note)}</p>` : ""}</div></td>`).join("")}</tr></table>` : ""}
${(c.tables ?? []).map((tb) => `${tb.title ? `<p style="margin:8px 0 8px;font:800 15px/1.3 ${FONT};color:#0B0B0F">${esc(tb.title)}</p>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse;font:400 13px/1.4 ${FONT};color:#3F3D4A">
<tr>${tb.head.map((h, i) => `<th align="${tb.numeric?.includes(i) ? "right" : "left"}" style="padding:6px 8px;border-bottom:1.5px solid #E7E5EE;font:700 11px/1.2 ${FONT};letter-spacing:.06em;text-transform:uppercase;color:#5A5866">${esc(h)}</th>`).join("")}</tr>
${tb.rows.map((r) => `<tr>${r.map((v, i) => `<td align="${tb.numeric?.includes(i) ? "right" : "left"}" style="padding:7px 8px;border-bottom:1px solid #F0EEF5">${esc(v)}</td>`).join("")}</tr>`).join("")}
</table>`).join("\n")}
${details}
${(c.images ?? []).map((im) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr><td align="center" style="background:#130056;border-radius:16px;padding:16px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" style="background:#ffffff;border-radius:12px;padding:14px">
<img src="${esc(im.src)}" alt="${esc(im.alt)}" width="220" height="220" style="display:block;width:220px;height:220px;border:0">
${im.caption ? `<p style="margin:8px 0 0;font:700 18px/1.2 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:#0B0B0F">${esc(im.caption)}</p>` : ""}
</td></tr></table></td></tr></table>`).join("\n")}
${button}
${c.footnote ? `<p style="margin:0;font:400 13px/1.45 ${FONT};color:#5A5866">${esc(c.footnote)}</p>` : ""}
</td></tr>
<tr><td style="padding:20px 8px 0;text-align:center;font:400 12px/1.6 ${FONT};color:#5A5866">
OnTour Upgrades by Please &amp; Thank You · <a href="${SUPPORT}" style="color:#260797">Help</a><br>
Please &amp; Thank You, Inc., 1909 H Street, Sacramento, CA 95811
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    c.title, "", ...c.body.flatMap((b) => [b, ""]),
    ...(c.stats ?? []).map((st) => `${st.label}: ${st.value}${st.note ? ` (${st.note})` : ""}`), ...(c.stats?.length ? [""] : []),
    ...(c.tables ?? []).flatMap((tb) => [...(tb.title ? [tb.title] : []), tb.head.join(" | "), ...tb.rows.map((r) => r.join(" | ")), ""]),
    ...(c.details ?? []).map(([k, v]) => `${k}: ${v}`), ...(c.details?.length ? [""] : []),
    ...(c.button ? [`${c.button.label}: ${c.button.url}`, ""] : []),
    ...(c.footnote ? [c.footnote, ""] : []),
    "—", "OnTour Upgrades by Please & Thank You", `Help: ${SUPPORT}`,
  ].join("\n");
  return { html, text };
}

export const emailConfigured = () => !!process.env.RESEND_API_KEY;

export async function sendEmail({ to, subject, replyTo, ...content }: EmailContent & { to: string | string[]; subject: string; replyTo?: string }): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Please & Thank You <upgrades@ontour.vip>";
  const { html, text } = renderEmail(content);
  if (!key) {
    console.log(`\n[email:dev] to=${to}\nsubject: ${subject}\n${text}\n`);
    return { sent: false, error: "not configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!res.ok) {
      const raw = (await res.text()).slice(0, 300);
      let body = raw;
      try { body = (JSON.parse(raw) as { message?: string }).message ?? raw; } catch { /* keep raw */ }
      let hint = "";
      if (res.status === 401 || res.status === 403) hint = /domain/i.test(body) ? " (the sending domain isn't verified in Resend)" : " (Resend rejected the API key or from-address)";
      if (res.status === 422) hint = " (check the from-address is on your verified domain, e.g. Please & Thank You <upgrades@ontour.vip>)";
      console.error(`[email] Resend ${res.status}${hint} ${body}`);
      import("@/lib/health").then((m) => m.markError("email", `Resend ${res.status}: ${body}`)).catch(() => null);
      return { sent: false, error: `Resend said: ${body}${hint}` };
    }
    const { id } = (await res.json().catch(() => ({}))) as { id?: string };
    console.log(`[email] sent "${subject}" to ${to}${id ? ` (Resend id ${id})` : ""}`);
    return { sent: true };
  } catch (e) {
    console.error("[email] send failed", e);
    return { sent: false, error: "network" };
  }
}

type Outgoing = EmailContent & { to: string; subject: string; replyTo?: string };

/** Sends many emails through Resend's batch endpoint (100 per request). Returns how many were accepted. */
export async function sendEmailBatch(messages: Outgoing[]): Promise<{ sent: number; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Please & Thank You <upgrades@ontour.vip>";
  if (!key) { messages.forEach((m) => console.log(`[email:dev] to=${m.to} subject: ${m.subject}`)); return { sent: 0, error: "email isn't connected" }; }
  let sent = 0, error: string | undefined;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100).map(({ to, subject, replyTo, ...content }) => {
      const { html, text } = renderEmail(content);
      return { from, to, subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) };
    });
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(chunk),
      });
      if (res.ok) sent += chunk.length;
      else { error = `Resend ${res.status}: ${(await res.text()).slice(0, 200)}`; console.error("[email batch]", error); }
    } catch (e) { error = "network"; console.error("[email batch]", e); }
  }
  return { sent, error };
}
