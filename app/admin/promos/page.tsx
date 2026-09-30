import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { Flash, type Msg } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { ShareButtons } from "@/components/ShareButtons";
import { siteUrl } from "@/lib/email";
import { createPromo, setPromoActive } from "../actions";
import { promoSummary } from "@/lib/promos";

export const metadata = { title: "Promo codes" };
type Code = { id: string; code: string; description: string | null; fee_bps: number; months: number | null; show_limit: number | null;
  max_redemptions: number | null; expires_at: string | null; active: boolean; created_at: string };
type Perf = { promo_id: string; artist_id: string; artist_name: string; handle: string; status: string; redeemed_at: string; ends_at: string | null;
  payments_ready: boolean; packages: number; orders: number; gross_cents: number; fees_cents: number; fees_waived_cents: number };
const $ = (c: number) => `$${(Number(c) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const d = (x: string) => new Date(x).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });


export default async function Promos({ searchParams }: { searchParams: Msg }) {
  const { supabase } = await requireSuperAdmin();
  const { ok, err } = await searchParams;
  const [{ data: codes }, { data: perf }] = await Promise.all([
    supabase.from("promo_codes").select("*").order("created_at", { ascending: false }).returns<Code[]>(),
    supabase.rpc("promo_performance").returns<Perf[]>(),
  ]);
  const byCode = (id: string) => ((perf ?? []) as Perf[]).filter((r) => r.promo_id === id).sort((a, b) => b.redeemed_at.localeCompare(a.redeemed_at));
  const all = (perf ?? []) as Perf[];
  const tot = (k: keyof Perf) => all.reduce((n, r) => n + Number(r[k] ?? 0), 0);

  return (
    <div className="grid max-w-5xl gap-6">
      <PageHead title="Promo codes">Lower or waive the service fee to bring artists on board. Each code gets a sign-up link to share.</PageHead>
      <Flash ok={ok} err={err} />

      {all.length > 0 && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {([["Artists signed up with a code", String(all.length)], ["Approved", String(all.filter((r) => r.status === "approved").length)],
             ["Selling", String(all.filter((r) => r.orders > 0).length)], ["Their sales since", $(tot("gross_cents"))], ["Fees given up", $(tot("fees_waived_cents"))]] as const)
            .map(([l, v]) => <div key={l} className="stat"><b>{v}</b><span>{l}</span></div>)}
        </section>
      )}

      <form action={createPromo} className="panel grid gap-4">
        <h2>New promo code</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field"><span>Code</span><input name="code" className="input font-mono uppercase" placeholder="Leave blank to generate one" maxLength={30} /></label>
          <label className="field"><span>Description (for you)</span><input name="description" className="input" placeholder="Nashville showcase, spring 2027" /></label>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="field"><span>Service fee during the promo</span>
            <span className="relative"><input name="fee_percent" className="input !pr-10" inputMode="decimal" defaultValue="5" required /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-mute">%</span></span>
            <small>0 means no service fee. The normal fee is 10%.</small></label>
          <label className="field"><span>Lasts for (months)</span><input name="months" className="input" inputMode="numeric" placeholder="3" /><small>From the day it&apos;s redeemed.</small></label>
          <label className="field"><span>Or covers (show dates)</span><input name="show_limit" className="input" inputMode="numeric" placeholder="10" /><small>Their next show dates.</small></label>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="field"><span>Max artists (optional)</span><input name="max_redemptions" className="input" inputMode="numeric" placeholder="Unlimited" /></label>
          <label className="field"><span>Redeem by (optional)</span><input name="expires_at" type="date" className="input" /></label>
        </div>
        <p className="help">Use months, show dates or both (whichever runs out first). The deal is locked once created, so artists always get what was offered; you can still turn a code off.</p>
        <div><SubmitButton pendingText="Creating…">Create promo code</SubmitButton></div>
      </form>

      {(codes ?? []).length === 0 ? <p className="card px-4 py-10 text-center muted">No promo codes yet.</p> : (
        <ul className="grid gap-4">
          {codes!.map((c) => {
            const used = byCode(c.id), link = `${siteUrl()}/for-artists?promo=${c.code}`;
            const expired = c.expires_at && new Date(c.expires_at) < new Date(), full = c.max_redemptions != null && used.length >= c.max_redemptions;
            return (
              <li key={c.id} className="panel grid gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[20px] font-extrabold tracking-[0.06em]">{c.code}</p>
                    <p className="font-semibold">{promoSummary(c)}</p>
                    {c.description && <p className="help">{c.description}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge ${!c.active || expired ? "b-neutral" : full ? "b-pending" : "b-published"}`}>{!c.active ? "Off" : expired ? "Expired" : full ? "Fully claimed" : "Active"}</span>
                    <form action={setPromoActive.bind(null, c.id, c.code, !c.active)}><SubmitButton size="sm" variant="ghost">{c.active ? "Turn off" : "Turn on"}</SubmitButton></form>
                  </div>
                </div>
                <p className="text-[14px]">{used.length}{c.max_redemptions ? ` of ${c.max_redemptions}` : ""} artist{used.length === 1 ? "" : "s"} redeemed{c.expires_at ? `, redeem by ${d(c.expires_at)}` : ""}
                  {used.length > 0 && <>. {used.filter((r) => r.status === "approved").length} approved, {used.filter((r) => r.orders > 0).length} selling, {$(used.reduce((n, r) => n + Number(r.gross_cents), 0))} in sales, {$(used.reduce((n, r) => n + Number(r.fees_cents), 0))} P&amp;T fees earned, {$(used.reduce((n, r) => n + Number(r.fees_waived_cents), 0))} given up.</>}
                </p>
                <div className="grid gap-2 rounded-2xl bg-paper p-3">
                  <p className="text-[13px]"><span className="font-bold">Sign-up link:</span> <span className="font-mono break-all">{link}</span></p>
                  <ShareButtons url={link} title="Sell VIP upgrades on OnTour" text={`${promoSummary(c)} when you sell VIP upgrades on OnTour Upgrades. Code ${c.code}:`} />
                </div>
                {used.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-[14px]">
                      <thead><tr className="th">{["Artist", "Redeemed", "Setup", "Orders", "Sales", "Fees given up"].map((h, i) => <th key={h} className={`px-2 py-2 ${i > 2 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-line">
                        {used.map((r) => (
                          <tr key={r.artist_id}>
                            <td className="px-2 py-2"><Link href={`/admin/artists/${r.artist_id}`} className="font-semibold">{r.artist_name}</Link></td>
                            <td className="px-2 py-2 text-mute">{d(r.redeemed_at)}{r.ends_at ? <span className="block text-[12px]">ends {d(r.ends_at)}</span> : null}</td>
                            <td className="px-2 py-2">
                              <span className={`badge ${r.orders > 0 ? "b-published" : r.status === "approved" && r.payments_ready ? "b-approved" : r.status === "approved" ? "b-pending" : "b-neutral"}`}>
                                {r.orders > 0 ? "Selling" : r.status === "approved" && r.payments_ready ? (r.packages ? "Ready, no sales yet" : "Needs packages") : r.status === "approved" ? "Needs Stripe" : r.status === "pending" ? "In review" : "Signed up"}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">{r.orders}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{$(r.gross_cents)}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{$(r.fees_waived_cents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
