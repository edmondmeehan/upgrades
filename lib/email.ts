/**
 * The one email layout every OnTour Upgrades email uses (our own emails through Resend, and the
 * Supabase sign-in templates generated from it by scripts/build-auth-templates.mts).
 *
 * Built for email clients, not browsers: nested tables, inline styles, a bulletproof button that
 * also works in Outlook, and a dark mode for Apple Mail and Outlook (Gmail darkens colors itself,
 * so every color is chosen to still read well when it does). Without RESEND_API_KEY, emails print
 * to the server log instead of sending.
 */

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

/** The site's logo (yellow and white on navy, the same file the site's header uses). */
const LOGO = "https://please.co/cdn/shop/files/PTY_Logo_Type_Yellow_WhiteText.png?v=1768929642&width=440";
const SUPPORT = "https://help.please.co";
const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace";

/** Site colors. */
const C = {
  navy: "#130056", violet: "#260797", yellow: "#F2D64B", ink: "#0B0B0F", body: "#3F3D4A", muted: "#5A5866",
  paper: "#F7F6FA", box: "#F1EFF6", line: "#E7E5EE", white: "#FFFFFF",
};

export type EmailContent = {
  eyebrow?: string;           // small uppercase label, e.g. "Team invite"
  title: string;              // headline
  body: string[];             // paragraphs (plain text; escaped)
  button?: { label: string; url: string };
  code?: string;              // a one-time code shown large (verification emails)
  details?: [string, string][]; // label/value rows in a grey box
  footnote?: string;          // small print under the button
  images?: { src: string; alt: string; caption?: string }[]; // e.g. pass QR codes
  tables?: { title?: string; head: string[]; rows: string[][]; numeric?: number[] }[]; // simple data tables (reports)
  stats?: { label: string; value: string; note?: string }[]; // big-number tiles
  preheader?: string;         // inbox preview text
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Dark mode for Apple Mail, iOS Mail and Outlook (macOS and Outlook.com via data-ogsc/ogsb). */
const DARK_CSS = `
:root { color-scheme: light dark; supported-color-schemes: light dark; }
@media (prefers-color-scheme: dark) {
  .em-bg { background:#0D0A1F !important; }
  .em-card { background:#1B1631 !important; }
  .em-box { background:#262040 !important; }
  .em-h, .em-strong { color:#FFFFFF !important; }
  .em-p { color:#DAD6E8 !important; }
  .em-muted { color:#ABA6BF !important; }
  .em-line { border-color:#342D54 !important; }
  .em-link { color:#C9B8FF !important; }
  .em-btn { background:${C.yellow} !important; }
  .em-btn a { color:${C.navy} !important; }
}
[data-ogsc] .em-h, [data-ogsc] .em-strong { color:#FFFFFF !important; }
[data-ogsc] .em-p { color:#DAD6E8 !important; }
[data-ogsc] .em-muted { color:#ABA6BF !important; }
[data-ogsc] .em-link { color:#C9B8FF !important; }
[data-ogsb] .em-bg { background:#0D0A1F !important; }
[data-ogsb] .em-card { background:#1B1631 !important; }
[data-ogsb] .em-box { background:#262040 !important; }
@media only screen and (max-width:600px) {
  .em-pad { padding:24px 20px !important; }
  .em-stat { display:block !important; width:100% !important; padding:0 0 8px !important; }
  .em-title { font-size:24px !important; }
}`;

export function renderEmail(c: EmailContent) {
  const p = (t: string) => `<p class="em-p" style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.55;color:${C.body}">${esc(t).replace(/\n/g, "<br>")}</p>`;

  const button = c.button ? `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px"><tr><td>
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(c.button.url)}" style="height:48px;v-text-anchor:middle;width:280px" arcsize="50%" stroke="f" fillcolor="${C.violet}"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold">${esc(c.button.label)}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="em-btn" bgcolor="${C.violet}" style="background:${C.violet};border-radius:24px">
<a href="${esc(c.button.url)}" style="display:inline-block;padding:15px 28px;font-family:${FONT};font-size:15px;font-weight:700;line-height:18px;color:#ffffff;text-decoration:none;border-radius:24px">${esc(c.button.label)}</a>
</td></tr></table><!--<![endif]-->
</td></tr></table>
<p class="em-muted" style="margin:0 0 16px;font-family:${FONT};font-size:13px;line-height:1.45;color:${C.muted}">Or paste this link into your browser:<br><a class="em-link" href="${esc(c.button.url)}" style="color:${C.violet};word-break:break-all">${esc(c.button.url)}</a></p>` : "";

  const code = c.code ? `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px"><tr>
<td class="em-box" align="center" bgcolor="${C.box}" style="background:${C.box};border-radius:14px;padding:18px">
<span class="em-h" style="font-family:${MONO};font-size:30px;font-weight:700;letter-spacing:.3em;color:${C.ink}">${esc(c.code)}</span>
</td></tr></table>` : "";

  const details = c.details?.length ? `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px"><tr>
<td class="em-box" bgcolor="${C.box}" style="background:${C.box};border-radius:14px;padding:14px 18px">
${c.details.map(([k, v]) => `<p class="em-muted" style="margin:0 0 6px;font-family:${FONT};font-size:14px;line-height:1.45;color:${C.muted}"><strong class="em-strong" style="color:${C.ink}">${esc(k)}:</strong> ${esc(v)}</p>`).join("\n")}
</td></tr></table>` : "";

  const stats = c.stats?.length ? `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px"><tr>
${c.stats.map((st) => `<td class="em-stat" valign="top" width="${Math.floor(100 / c.stats!.length)}%" style="padding:0 4px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="em-box" bgcolor="${C.box}" style="background:${C.box};border-radius:14px;padding:14px 12px">
<p class="em-h" style="margin:0;font-family:${FONT};font-size:22px;font-weight:800;line-height:1.1;color:${C.ink}">${esc(st.value)}</p>
<p class="em-muted" style="margin:4px 0 0;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;line-height:1.3;color:${C.muted}">${esc(st.label)}</p>
${st.note ? `<p class="em-muted" style="margin:4px 0 0;font-family:${FONT};font-size:12px;line-height:1.3;color:${C.muted}">${esc(st.note)}</p>` : ""}
</td></tr></table></td>`).join("\n")}
</tr></table>` : "";

  const tables = (c.tables ?? []).map((tb) => `
${tb.title ? `<p class="em-h" style="margin:8px 0 8px;font-family:${FONT};font-size:15px;font-weight:800;line-height:1.3;color:${C.ink}">${esc(tb.title)}</p>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border-collapse:collapse">
<tr>${tb.head.map((h, i) => `<th class="em-muted em-line" align="${tb.numeric?.includes(i) ? "right" : "left"}" style="padding:6px 8px;border-bottom:2px solid ${C.line};font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;line-height:1.2;color:${C.muted}">${esc(h)}</th>`).join("")}</tr>
${tb.rows.map((r) => `<tr>${r.map((v, i) => `<td class="em-p em-line" align="${tb.numeric?.includes(i) ? "right" : "left"}" style="padding:7px 8px;border-bottom:1px solid ${C.line};font-family:${FONT};font-size:13px;line-height:1.4;color:${C.body}">${esc(v)}</td>`).join("")}</tr>`).join("\n")}
</table>`).join("\n");

  const images = (c.images ?? []).map((im) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px"><tr>
<td align="center" bgcolor="${C.navy}" style="background:${C.navy};border-radius:16px;padding:16px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:12px;padding:14px">
<img src="${esc(im.src)}" alt="${esc(im.alt)}" width="220" height="220" style="display:block;width:220px;height:220px;border:0;outline:none">
${im.caption ? `<p style="margin:8px 0 0;font-family:${MONO};font-size:18px;font-weight:700;letter-spacing:.12em;line-height:1.2;color:${C.ink}">${esc(im.caption)}</p>` : ""}
</td></tr></table></td></tr></table>`).join("\n");

  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<meta name="x-apple-disable-message-reformatting"><meta name="format-detection" content="telephone=no,address=no,email=no,date=no">
<title>${esc(c.title)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><style>table,td,p,a,h1,span{font-family:Arial,Helvetica,sans-serif !important}</style><![endif]-->
<!--[if !mso]><!--><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap" rel="stylesheet"><!--<![endif]-->
<style>${DARK_CSS}</style>
</head>
<body class="em-bg" style="margin:0;padding:0;width:100%;background:${C.paper};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${esc(c.preheader ?? c.title)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" class="em-bg" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.paper}" style="background:${C.paper}"><tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto">
<tr><td bgcolor="${C.navy}" style="background:${C.navy};border-radius:20px 20px 0 0;padding:22px 28px">
<a href="${siteUrl()}" style="text-decoration:none"><img src="${LOGO}" alt="Please &amp; Thank You" width="127" height="44" style="display:block;width:127px;height:44px;border:0;outline:none;font-family:${FONT};font-size:18px;font-weight:800;color:${C.yellow}"></a>
</td></tr>
<tr><td class="em-card em-pad" bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:0 0 20px 20px;padding:32px 28px 28px">
${c.eyebrow ? `<p class="em-muted" style="margin:0 0 8px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;line-height:1.2;color:${C.muted}">${esc(c.eyebrow)}</p>` : ""}
<h1 class="em-h em-title" style="margin:0 0 16px;font-family:${FONT};font-size:26px;font-weight:800;letter-spacing:-.02em;line-height:1.15;color:${C.ink}">${esc(c.title)}</h1>
${c.body.map(p).join("\n")}
${code}${stats}${tables}${details}${images}${button}
${c.footnote ? `<p class="em-muted" style="margin:0;font-family:${FONT};font-size:13px;line-height:1.45;color:${C.muted}">${esc(c.footnote)}</p>` : ""}
</td></tr>
<tr><td class="em-muted" align="center" style="padding:20px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted}">
OnTour Upgrades by Please &amp; Thank You · <a class="em-link" href="${SUPPORT}" style="color:${C.violet}">Help</a><br>
Please &amp; Thank You, Inc., 1909 H Street, Sacramento, CA 95811
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;

  const text = [
    c.title, "", ...c.body.flatMap((b) => [b, ""]),
    ...(c.code ? [`Code: ${c.code}`, ""] : []),
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

export async function sendEmail({ to, subject, replyTo, headers, ...content }: EmailContent & { to: string | string[]; subject: string; replyTo?: string; headers?: Record<string, string> }): Promise<{ sent: boolean; error?: string }> {
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
      body: JSON.stringify({ from, to, subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}), ...(headers ? { headers } : {}) }),
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
    import("@/lib/health").then((m) => m.markOk("email")).catch(() => null);
    return { sent: true };
  } catch (e) {
    console.error("[email] send failed", e);
    return { sent: false, error: "network" };
  }
}

type Outgoing = EmailContent & { to: string; subject: string; replyTo?: string; headers?: Record<string, string> };

/** Sends many emails through Resend's batch endpoint (100 per request). Returns how many were accepted. */
export async function sendEmailBatch(messages: Outgoing[]): Promise<{ sent: number; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Please & Thank You <upgrades@ontour.vip>";
  if (!key) { messages.forEach((m) => console.log(`[email:dev] to=${m.to} subject: ${m.subject}`)); return { sent: 0, error: "email isn't connected" }; }
  let sent = 0, error: string | undefined;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100).map(({ to, subject, replyTo, headers, ...content }) => {
      const { html, text } = renderEmail(content);
      return { from, to, subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}), ...(headers ? { headers } : {}) };
    });
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(chunk),
      });
      if (res.ok) {
        sent += chunk.length;
        const j = (await res.json().catch(() => ({}))) as { data?: { id: string }[] };
        console.log(`[email] batch sent ${chunk.length}: "${chunk[0]?.subject}"${j.data?.length ? ` (Resend ids ${j.data.map((d) => d.id).join(", ")})` : ""}`);
      } else {
        error = `Resend ${res.status}: ${(await res.text()).slice(0, 200)}`;
        console.error("[email batch]", error);
        import("@/lib/health").then((m) => m.markError("email", error)).catch(() => null);
      }
    } catch (e) { error = "network"; console.error("[email batch]", e); import("@/lib/health").then((m) => m.markError("email", e)).catch(() => null); }
  }
  return { sent, error };
}
