import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { stage, STEPS, type FunnelRow } from "@/lib/growth";

export const metadata = { title: "Growth" };
const $ = (c: number) => `$${(Number(c) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const days = (x: string) => Math.floor((Date.now() - new Date(x).getTime()) / 86400000);

export default async function Growth() {
  const { supabase } = await requireSuperAdmin();
  const { data } = await supabase.rpc("artist_funnel");
  const rows = (data ?? []) as FunnelRow[];
  // Cumulative: an artist counts at a step only if they've done every step before it too.
  const reachedAt = (i: number) => rows.filter((r) => STEPS.slice(1, i + 1).every(([k]) => !!r[k as keyof FunnelRow])).length;
  const top = rows.length || 1;

  // Sign-ups per week, last 12 weeks, split by promo code vs. none.
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const end = new Date(); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() - end.getDay() + 7 - 7 * i);
    const start = new Date(end); start.setDate(start.getDate() - 7);
    const inWeek = rows.filter((r) => { const t = new Date(r.created_at); return t >= start && t < end; });
    return { label: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }), promo: inWeek.filter((r) => r.promo_code).length, organic: inWeek.filter((r) => !r.promo_code).length };
  }).reverse();
  const maxWeek = Math.max(1, ...weeks.map((w) => w.promo + w.organic));

  const stuck = rows.map((r) => ({ r, s: stage(r) })).filter((x) => x.s.key !== "selling" && x.s.key !== "review" && days(x.r.created_at) >= 2);
  const groups = ["verify", "stripe", "shows", "packages", "sales"].map((k) => ({ k, items: stuck.filter((x) => x.s.key === k) })).filter((g) => g.items.length);
  const bySource = [["With a promo code", rows.filter((r) => r.promo_code)], ["No code", rows.filter((r) => !r.promo_code)]] as const;

  return (
    <div className="grid max-w-6xl gap-6">
      <PageHead title="Growth" aside={<a href="/admin/growth/export" className="btn btn-ghost">Download artist list (CSV)</a>}>
        How artists move from sign-up to their first sale, where they get stuck, and how promo codes are doing.
      </PageHead>

      <section className="card grid gap-3 p-6">
        <h2>Artist funnel</h2>
        <ul className="grid gap-2">
          {STEPS.map(([k, label], i) => {
            const n = reachedAt(i), prev = i === 0 ? n : reachedAt(i - 1); void k;
            return (
              <li key={label} className="grid grid-cols-[170px_minmax(0,1fr)_110px] items-center gap-3 text-[14px]">
                <span className="font-semibold">{label}</span>
                <span className="h-7 overflow-hidden rounded-lg bg-paper"><i className="block h-full rounded-lg bg-violet" style={{ width: `${(n / top) * 100}%` }} /></span>
                <span className="tabular-nums"><b>{n}</b>{i > 0 && prev > 0 ? <span className="text-mute"> ({Math.round((n / prev) * 100)}%)</span> : null}</span>
              </li>
            );
          })}
        </ul>
        <p className="help">Percentages are how many made it from the step before.</p>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="card grid gap-3 p-6">
          <div className="flex items-baseline justify-between"><h2>Sign-ups by week</h2><span className="help">Last 12 weeks</span></div>
          <div className="flex h-40 items-end gap-1.5" role="img" aria-label="Weekly artist sign-ups">
            {weeks.map((w) => (
              <div key={w.label} className="flex flex-1 flex-col justify-end" title={`${w.label}: ${w.organic} no code, ${w.promo} with a code`}>
                <i className="block rounded-t bg-yellow" style={{ height: `${(w.promo / maxWeek) * 150}px` }} />
                <i className="block bg-violet" style={{ height: `${(w.organic / maxWeek) * 150}px` }} />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[11px] text-mute"><span>{weeks[0].label}</span><span>{weeks[11].label}</span></div>
          <p className="flex gap-4 text-[13px]"><span className="flex items-center gap-1.5"><i className="size-3 rounded bg-violet" />No code</span><span className="flex items-center gap-1.5"><i className="size-3 rounded bg-yellow" />Promo code</span></p>
        </section>

        <section className="card grid gap-3 p-6">
          <h2>Promo codes vs. no code</h2>
          <table className="w-full text-[14px]">
            <thead><tr className="th"><th className="py-2 text-left">Source</th><th className="text-right">Artists</th><th className="text-right">Approved</th><th className="text-right">Selling</th><th className="text-right">Sales</th></tr></thead>
            <tbody className="divide-y divide-line">
              {bySource.map(([l, list]) => (
                <tr key={l}><td className="py-2 font-semibold">{l}</td><td className="text-right tabular-nums">{list.length}</td>
                  <td className="text-right tabular-nums">{list.filter((r) => r.approved).length}</td><td className="text-right tabular-nums">{list.filter((r) => r.orders > 0).length}</td>
                  <td className="text-right tabular-nums">{$(list.reduce((n, r) => n + Number(r.gross_cents), 0))}</td></tr>
              ))}
            </tbody>
          </table>
          <Link href="/admin/promos" className="text-[14px]">See each promo code&apos;s results</Link>
        </section>
      </div>

      <section className="grid gap-3">
        <h2>Needs a nudge</h2>
        <p className="muted -mt-1">Artists who signed up at least 2 days ago and stalled. The email button opens a message with the next step filled in.</p>
        {groups.length === 0 ? <p className="card px-4 py-10 text-center muted">Nobody&apos;s stuck right now.</p> : groups.map((g) => (
          <div key={g.k} className="card overflow-hidden">
            <p className="border-b border-line bg-paper px-5 py-3 font-extrabold">{g.items[0].s.label} <span className="font-medium text-mute">({g.items.length})</span></p>
            <ul className="divide-y divide-line">
              {g.items.map(({ r, s }) => {
                const first = r.owner_name?.split(" ")[0] ?? "there";
                const mail = `mailto:${r.owner_email}?subject=${encodeURIComponent(`${r.name} on OnTour Upgrades`)}&body=${encodeURIComponent(`Hi ${first},\n\n${s.nudge} and you'll be ready to sell VIP upgrades: https://upgrades.ontour.vip/a/${r.artist_id}\n\nAnything I can help with?\n\n`)}`;
                return (
                  <li key={r.artist_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <span><Link href={`/admin/artists/${r.artist_id}`} className="font-bold">{r.name}</Link>
                      <span className="block text-[13px] text-mute">{r.owner_email ?? "no owner"}, signed up {days(r.created_at)} days ago{r.promo_code ? `, code ${r.promo_code}` : ""}</span></span>
                    {r.owner_email && <a href={mail} className="btn btn-ghost btn-sm">Email {first}</a>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
