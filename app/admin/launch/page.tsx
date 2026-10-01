import { requireSuperAdmin } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { Flash, type Msg } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { launchChecks, type Check } from "@/lib/launch";
import { stripeMode } from "@/lib/stripe";
import { setManualCheck, clearTestData } from "./actions";

export const metadata = { title: "Go live" };
export const dynamic = "force-dynamic";
const ICON: Record<Check["state"], [string, string]> = { ok: ["✓", "bg-[#d6f1ec] text-ok"], todo: ["!", "bg-[#fde4dc] text-rope"], warn: ["?", "bg-[#fff1c2] text-[#7a5a00]"], optional: ["–", "bg-paper text-mute"] };

export default async function GoLive({ searchParams }: { searchParams: Msg }) {
  const { supabase } = await requireSuperAdmin("/admin/launch");
  const { ok, err } = await searchParams;
  const checks = await launchChecks(supabase);
  const required = checks.filter((c) => c.state !== "optional");
  const done = required.filter((c) => c.state === "ok").length;
  const groups = [...new Set(checks.map((c) => c.group))];
  const mode = stripeMode();
  const testOrders = checks.find((c) => c.key === "test_orders");

  return (
    <div className="grid max-w-4xl gap-6">
      <PageHead title="Go live" eyebrow="P&T admin">Everything that needs to be in place before real fans pay real money. Checks run each time you open this page.</PageHead>
      <Flash ok={ok} err={err} />
      <section className="card grid gap-3 p-6">
        <div className="flex items-end justify-between gap-3">
          <p><span className="text-[34px] font-extrabold leading-none">{done}</span><span className="text-[18px] font-bold text-mute"> / {required.length} ready</span></p>
          <span className={`badge ${done === required.length ? "b-published" : "b-pending"}`}>{done === required.length ? "Ready to launch" : mode === "live" ? "Live, with items left" : "In test mode"}</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-[#eceaf2]"><i className="block h-full rounded-full bg-violet" style={{ width: `${(done / Math.max(required.length, 1)) * 100}%` }} /></div>
      </section>

      {groups.map((g) => (
        <section key={g} className="grid gap-2">
          <h2>{g}</h2>
          <ul className="card divide-y divide-line overflow-hidden">
            {checks.filter((c) => c.group === g).map((c) => (
              <li key={c.key} className="flex items-start gap-3 px-5 py-4">
                <span aria-hidden className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-[14px] font-extrabold ${ICON[c.state][1]}`}>{ICON[c.state][0]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{c.label}{c.state === "optional" && <span className="ml-2 text-[12px] font-semibold text-mute">optional</span>}</span>
                  <span className="block text-[14px] text-mute">{c.detail}{c.manual && c.confirmedAt ? ` Confirmed ${new Date(c.confirmedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.` : ""}</span>
                  {c.link && <a href={c.link.href} className="text-[13px] font-semibold" {...(c.link.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{c.link.label}</a>}
                </span>
                {c.manual && (
                  <form action={setManualCheck.bind(null, c.key, c.state !== "ok")}>
                    <SubmitButton size="sm" variant="ghost">{c.state === "ok" ? "Undo" : "Mark done"}</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="panel grid gap-3">
        <h2>Switching Stripe to live</h2>
        <ol className="grid list-decimal gap-1.5 pl-5 text-[15px]">
          <li>In Stripe, turn off the sandbox and finish activating P&amp;T&apos;s live account, including the Connect platform profile.</li>
          <li>In live mode, recreate the three webhook destinations exactly as in the sandbox (same URL, same events).</li>
          <li>In Vercel, replace <code>STRIPE_SECRET_KEY</code> with the live key and the three webhook secrets with the live ones, then redeploy.</li>
          <li>Come back here and clear test data (below). Artists then set up payouts again in live mode from their Payments page.</li>
          <li>Make one real purchase on a test package and refund it, to prove the live path end to end.</li>
        </ol>
      </section>

      {testOrders && testOrders.state !== "ok" && (
        <section className="panel grid gap-3 !border-[#f3c9bd]">
          <h2>Clear test data</h2>
          <p className="muted">Deletes every test-mode order with its passes, refunds and disputes, and disconnects test Stripe accounts so artists reconnect in live mode. Sample data and real orders aren&apos;t touched.{mode !== "live" ? " Available once the live Stripe key is in." : ""}</p>
          {mode === "live" && (
            <form action={clearTestData} className="flex flex-wrap items-end gap-2">
              <label className="field"><span>Type CLEAR to confirm</span><input name="confirm" className="input input-sm uppercase" autoComplete="off" required /></label>
              <SubmitButton variant="danger" pendingText="Clearing…" confirm="Delete all test-mode orders? This can't be undone.">Clear test data</SubmitButton>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
