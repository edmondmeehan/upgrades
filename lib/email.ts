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
${details}
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
      const body = (await res.text()).slice(0, 300);
      let hint = "";
      if (res.status === 401 || res.status === 403) hint = /domain/i.test(body) ? " (the sending domain isn't verified in Resend)" : " (Resend rejected the API key or from-address)";
      if (res.status === 422) hint = " (check the from-address is on your verified domain, e.g. Please & Thank You <upgrades@ontour.vip>)";
      console.error(`[email] Resend ${res.status}${hint} ${body}`);
      return { sent: false, error: `Resend ${res.status}${hint}` };
    }
    return { sent: true };
  } catch (e) {
    console.error("[email] send failed", e);
    return { sent: false, error: "network" };
  }
}
