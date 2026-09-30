import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { getStripe, stripeMode, stripeState, STRIPE_STATE_LABEL, type ArtistStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/email";
import type { ArtistStatus } from "@/lib/types";

export const metadata = { title: "Stripe" };

type Row = { id: string; name: string; handle: string; status: ArtistStatus; artist_stripe: ArtistStripe | null };

function Check({ ok, label, detail }: { ok: boolean; label: string; detail: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 border-t border-line py-3 first:border-t-0">
      <span aria-hidden className={`grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-extrabold ${ok ? "bg-yellow text-ink" : "bg-paper text-mute"}`}>{ok ? "✓" : "!"}</span>
      <span className="grid gap-0.5"><span className="font-semibold">{label}</span><span className="help">{detail}</span></span>
      <span className="sr-only">{ok ? "Done" : "Not done"}</span>
    </li>
  );
}

export default async function StripeAdmin() {
  const { supabase } = await requireSuperAdmin();
  const stripe = getStripe();
  const mode = stripeMode();
  let platform: { id: string; name: string | null; charges: boolean } | null = null;
  let platformError: string | null = null;
  if (stripe) {
    try {
      const a = await stripe.accounts.retrieveCurrent();
      platform = { id: a.id, name: a.settings?.dashboard?.display_name ?? a.business_profile?.name ?? null, charges: !!a.charges_enabled };
    } catch (e) { platformError = e instanceof Error ? e.message : "Couldn't reach Stripe"; }
  }
  const serviceKey = !!createAdminClient();
  const hooks = !!process.env.STRIPE_WEBHOOK_SECRET, connectHooks = !!process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

  const { data } = await supabase.from("artists").select("id, name, handle, status, artist_stripe(*)").order("name").returns<Row[]>();
  const rows = (data ?? []).map((r) => ({ ...r, s: Array.isArray(r.artist_stripe) ? r.artist_stripe[0] ?? null : r.artist_stripe }));
  const ready = rows.filter((r) => stripeState(r.s) === "ready").length;

  return (
    <>
      <PageHead title="Stripe" eyebrow="P&T admin"
        aside={mode && <span className={`badge ${mode === "live" ? "b-approved" : "b-pending"}`}>{mode === "live" ? "Live mode" : "Test mode"}</span>}>
        P&amp;T&apos;s Stripe account is the platform. Each artist connects their own Stripe account to get paid.
      </PageHead>

      <section className="card p-6">
        <h2 className="mb-2">Platform setup</h2>
        <ul>
          <Check ok={!!platform} label="P&T Stripe account connected"
            detail={platform ? <>{platform.name ?? "Stripe account"} ({platform.id})</> : platformError ?? <>Add <code>STRIPE_SECRET_KEY</code> in Vercel (Stripe, then Developers, then API keys). Start with the test key.</>} />
          <Check ok={serviceKey} label="Secure server key added"
            detail={serviceKey ? "Artists' Stripe records can be saved." : <>Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel (Supabase, then Project Settings, then API keys).</>} />
          <Check ok={hooks} label="Webhook for your account"
            detail={hooks ? "Receiving card-on-file events." : <>In Stripe, add an endpoint at <code>{siteUrl()}/api/stripe/webhook</code> listening to events on your account, with <code>checkout.session.completed</code>. Put its signing secret in <code>STRIPE_WEBHOOK_SECRET</code>.</>} />
          <Check ok={connectHooks} label="Webhook for connected accounts"
            detail={connectHooks ? "Receiving artist account updates." : <>Add a second endpoint at the same URL listening to events on connected accounts, with <code>account.updated</code>. Put its signing secret in <code>STRIPE_CONNECT_WEBHOOK_SECRET</code>.</>} />
        </ul>
        <p className="help mt-3">Connect must be turned on for the platform account (Stripe, then Connect, then Get started) with Express accounts, and your platform profile and branding filled in.</p>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="stat"><b>{rows.length}</b><span>Artists</span></div>
        <div className="stat"><b>{ready}</b><span>Ready to get paid</span></div>
        <div className="stat"><b>{rows.filter((r) => ["in_progress", "restricted"].includes(stripeState(r.s))).length}</b><span>In progress</span></div>
        <div className="stat"><b>{rows.filter((r) => r.s?.card_last4).length}</b><span>Card on file</span></div>
      </div>

      <section className="card overflow-x-auto">
        <table className="list min-w-[40rem]">
          <thead><tr><th className="!pt-4">Artist</th><th className="!pt-4">Payouts</th><th className="!pt-4">Card on file</th><th className="!pt-4">Stripe account</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const [label, cls] = STRIPE_STATE_LABEL[stripeState(r.s)];
              return (
                <tr key={r.id}>
                  <td><Link href={`/admin/artists/${r.id}`} className="text-ink">{r.name}</Link><br /><span className="muted text-[13px]">/{r.handle}</span></td>
                  <td><span className={`badge ${cls}`}>{label}</span></td>
                  <td className="text-[14px]">{r.s?.card_last4 ? <span className="capitalize">{r.s.card_brand} {r.s.card_last4}</span> : <span className="muted">None</span>}</td>
                  <td className="font-mono text-[12px] text-mute">{r.s?.stripe_account_id ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
