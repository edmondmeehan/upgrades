import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe, stripeMode } from "@/lib/stripe";

export type Check = { key: string; group: string; label: string; state: "ok" | "todo" | "warn" | "optional"; detail: string; manual?: boolean; confirmedAt?: string | null; link?: { label: string; href: string } };

const WEBHOOK_URL = "https://upgrades.ontour.vip/api/stripe/webhook";
const NEEDS = {
  card: ["checkout.session.completed"],
  accounts: ["v2.core.account.updated", "v2.core.account[requirements].updated", "v2.core.account[configuration.merchant].capability_status_updated"],
  fans: ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.expired", "charge.refunded", "charge.refund.updated", "charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed"],
};

async function dns(name: string, type: "TXT" | "MX") {
  try {
    const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`, { cache: "no-store" });
    const j = (await r.json()) as { Answer?: { data: string }[] };
    return (j.Answer ?? []).map((a) => a.data.replace(/"/g, ""));
  } catch { return null; }
}

export const MANUAL: { key: string; group: string; label: string; detail: string }[] = [
  { key: "backups", group: "Data and accounts", label: "Database backups are on", detail: "Supabase, Database, Backups: daily backups on (and point-in-time restore if you're on Pro)." },
  { key: "leaked_pw", group: "Data and accounts", label: "Leaked password protection is on", detail: "Supabase, Authentication, Attack Protection: switch on leaked password protection." },
  { key: "keys_rolled", group: "Data and accounts", label: "Exposed keys have been rolled", detail: "The Stripe key pasted in chat and the Resend key in the photos project's variable names." },
  { key: "connect_profile", group: "Stripe", label: "Stripe Connect platform profile is complete in live mode", detail: "Stripe (live), Connect: platform profile, branding, and support details filled in." },
  { key: "legal", group: "Business", label: "Terms, privacy and purchase policy reviewed", detail: "The footer links go to please.co's policies. Confirm they cover OnTour Upgrades and that artists are the seller." },
  { key: "sales_tax", group: "Business", label: "Sales tax approach decided", detail: "Whether to recommend artists switch on Stripe Tax (Payments page) for taxable packages like merch bundles." },
];

/** Everything P&T needs before real money moves. Automatic checks plus manual confirmations. */
export async function launchChecks(supabase: SupabaseClient): Promise<Check[]> {
  const out: Check[] = [];
  const mode = stripeMode();
  const stripe = getStripe();

  // Stripe
  out.push({ key: "stripe_mode", group: "Stripe", label: "Stripe is in live mode",
    state: mode === "live" ? "ok" : "todo",
    detail: mode === "live" ? "The live secret key is in Vercel." : mode === "test" ? "Still on the test (sandbox) key. Swap STRIPE_SECRET_KEY for the live key when you're ready, then recreate the webhooks in live mode." : "STRIPE_SECRET_KEY isn't set." });
  if (stripe) {
    try {
      const acct = await stripe.accounts.retrieveCurrent();
      out.push({ key: "stripe_account", group: "Stripe", label: "P&T's Stripe account can take payments",
        state: acct.charges_enabled && acct.details_submitted ? "ok" : "todo",
        detail: acct.charges_enabled ? `${acct.business_profile?.name ?? acct.settings?.dashboard?.display_name ?? "Account"} is active${mode === "test" ? " (test mode)" : ""}.` : "Finish activating the account in Stripe." });
    } catch (e) { out.push({ key: "stripe_account", group: "Stripe", label: "P&T's Stripe account can take payments", state: "warn", detail: `Couldn't check: ${(e as Error).message.slice(0, 120)}` }); }
    try {
      const dests: { events_from?: string[]; event_payload: string; enabled_events: string[]; status: string; webhook_endpoint?: { url?: string } }[] = [];
      for await (const d of stripe.v2.core.eventDestinations.list({ include: ["webhook_endpoint.url"], limit: 50 })) dests.push(d as never);
      const ours = dests.filter((d) => d.webhook_endpoint?.url === WEBHOOK_URL && d.status === "enabled");
      const find = (from: string, payload: string, events: string[]) => {
        const d = ours.find((x) => (x.events_from ?? ["self"]).includes(from) && x.event_payload === payload);
        if (!d) return { ok: false, missing: events };
        const missing = events.filter((e) => !d.enabled_events.includes(e) && !d.enabled_events.includes("*"));
        return { ok: missing.length === 0, missing };
      };
      const card = find("self", "snapshot", NEEDS.card), accounts = find("self", "thin", NEEDS.accounts), fans = find("other_accounts", "snapshot", NEEDS.fans);
      const say = (r: { ok: boolean; missing: string[] }, what: string) => r.ok ? `Set up${mode === "test" ? " in test mode" : ""}.` : r.missing.length === (what === "fans" ? NEEDS.fans.length : what === "accounts" ? NEEDS.accounts.length : 1)
        ? "No matching destination found. See README, Stripe step 3." : `Missing events: ${r.missing.join(", ")}`;
      out.push({ key: "wh_fans", group: "Stripe", label: "Webhook: fan payments, refunds and disputes (connected accounts, snapshot)", state: fans.ok ? "ok" : "todo", detail: say(fans, "fans") });
      out.push({ key: "wh_accounts", group: "Stripe", label: "Webhook: artist account updates (your account, thin)", state: accounts.ok ? "ok" : "todo", detail: say(accounts, "accounts") });
      out.push({ key: "wh_card", group: "Stripe", label: "Webhook: card on file (your account, snapshot)", state: card.ok ? "ok" : "todo", detail: say(card, "card") });
    } catch (e) { out.push({ key: "wh_fans", group: "Stripe", label: "Webhooks", state: "warn", detail: `Couldn't read webhook settings from Stripe: ${(e as Error).message.slice(0, 120)}` }); }
  }
  const secrets = ["STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET", "STRIPE_ACCOUNT_EVENTS_WEBHOOK_SECRET"].filter((k) => !process.env[k]);
  out.push({ key: "wh_secrets", group: "Stripe", label: "Webhook signing secrets are in Vercel", state: secrets.length ? "todo" : "ok", detail: secrets.length ? `Missing: ${secrets.join(", ")}` : "All three are set. They change when you recreate webhooks in live mode." });
  const { data: runs } = await supabase.from("system_runs").select("job, last_ok_at, last_error_at");
  const run = (job: string) => (runs ?? []).find((r) => r.job === job);
  const wh = run("stripe-webhook");
  out.push({ key: "wh_activity", group: "Stripe", label: "Stripe webhooks are arriving", state: wh?.last_ok_at && Date.now() - new Date(wh.last_ok_at).getTime() < 14 * 86400000 ? "ok" : "warn",
    detail: wh?.last_ok_at ? `Last one worked ${new Date(wh.last_ok_at).toLocaleString("en-US")}.` : "None recorded yet. Make a test purchase." });

  // Email
  const domain = (process.env.EMAIL_FROM ?? "").match(/@([^>\s]+)/)?.[1] ?? "ontour.vip";
  out.push({ key: "resend", group: "Email", label: "Resend is connected", state: process.env.RESEND_API_KEY ? "ok" : "todo", detail: process.env.RESEND_API_KEY ? `Sending as ${process.env.EMAIL_FROM ?? `upgrades@${domain}`}.` : "Add RESEND_API_KEY in Vercel." });
  const [dkim, spf, mx, dmarc] = await Promise.all([dns(`resend._domainkey.${domain}`, "TXT"), dns(`send.${domain}`, "TXT"), dns(`send.${domain}`, "MX"), dns(`_dmarc.${domain}`, "TXT")]);
  const has = (v: string[] | null, re: RegExp) => v === null ? null : v.some((x) => re.test(x));
  const dkimOk = has(dkim, /p=/), spfOk = has(spf, /v=spf1/i) && has(mx, /./), dmarcOk = has(dmarc, /v=DMARC1/i);
  out.push({ key: "dns", group: "Email", label: `Email authentication records for ${domain}`,
    state: dkimOk && spfOk && dmarcOk ? "ok" : dkimOk === null ? "warn" : "todo",
    detail: dkimOk === null ? "Couldn't look up DNS right now." : [`DKIM ${dkimOk ? "found" : "missing"}`, `SPF ${spfOk ? "found" : "missing"}`, `DMARC ${dmarcOk ? "found" : "missing"}`].join(", ") + (dkimOk && spfOk && dmarcOk ? "." : ". Add them in Vercel, Domains, DNS records, using the values in Resend, Domains."),
    link: { label: "Open Resend domains", href: "https://resend.com/domains" } });

  // Security
  const { data: mfa } = await supabase.rpc("admin_mfa_status");
  const m = (mfa ?? []) as { has_mfa: boolean }[];
  out.push({ key: "mfa", group: "Security", label: "Every P&T admin uses two-step sign-in", state: m.length && m.every((x) => x.has_mfa) ? "ok" : "todo",
    detail: m.length ? `${m.filter((x) => x.has_mfa).length} of ${m.length} admins have it set up.${m.every((x) => x.has_mfa) ? " Tell Claude to make it required everywhere." : ""}` : "No admins found.", link: { label: "Admins", href: "/admin/team" } });
  out.push({ key: "turnstile", group: "Security", label: "Human check (Cloudflare Turnstile)", state: process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? "ok" : "optional",
    detail: process.env.TURNSTILE_SECRET_KEY ? "On for checkout, sign-up and fan forms." : "Recommended for busy on-sales. Free keys from dash.cloudflare.com, Turnstile." });

  // Automation
  const ds = run("daily-sales");
  out.push({ key: "cron", group: "Automation", label: "Scheduled emails are running", state: !process.env.CRON_SECRET ? "todo" : ds?.last_ok_at ? "ok" : "warn",
    detail: !process.env.CRON_SECRET ? "Add CRON_SECRET in Vercel." : ds?.last_ok_at ? `Daily sales email last ran ${new Date(ds.last_ok_at).toLocaleString("en-US")}.` : "CRON_SECRET is set; waiting for the first morning run." });

  // Data
  const [{ count: testOrders }, { data: sampleArtists }] = await Promise.all([
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("livemode", false).eq("is_sample", false),
    supabase.from("orders").select("artist_id, artists(name)").eq("is_sample", true).limit(200),
  ]);
  const sampleNames = [...new Set(((sampleArtists ?? []) as unknown as { artists: { name: string } | null }[]).map((r) => r.artists?.name).filter(Boolean))];
  out.push({ key: "test_orders", group: "Data and accounts", label: "Test orders cleared", state: !testOrders ? "ok" : mode === "live" ? "todo" : "warn",
    detail: !testOrders ? "No test-mode orders." : `${testOrders} test-mode order${testOrders === 1 ? "" : "s"} still in the system. Clear them right after switching to the live key (button below).` });
  out.push({ key: "sample_data", group: "Data and accounts", label: "Sample data removed", state: sampleNames.length ? "warn" : "ok",
    detail: sampleNames.length ? `Sample sales on: ${sampleNames.join(", ")}. Clear them from each artist's admin page.` : "No sample data." });
  out.push({ key: "wallet", group: "Fan experience", label: "Apple Wallet passes", state: process.env.APPLE_WALLET_PASS_TYPE_ID ? "ok" : "optional", detail: process.env.APPLE_WALLET_PASS_TYPE_ID ? "On." : "Optional. Needs P&T's Apple Developer Pass Type ID certificate (README step 9)." });

  // Manual confirmations
  const { data: confirmed } = await supabase.from("platform_checks").select("key, confirmed_at");
  for (const c of MANUAL) {
    const hit = (confirmed ?? []).find((x) => x.key === c.key);
    out.push({ ...c, state: hit ? "ok" : "todo", manual: true, confirmedAt: hit?.confirmed_at ?? null });
  }
  return out;
}
