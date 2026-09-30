import { requireArtist } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, requirementLabel, stripeState, STRIPE_STATE_LABEL, type ArtistStripe } from "@/lib/stripe";
import { pct } from "@/lib/util";
import { startPayoutSetup, refreshStripe, startCardSetup } from "./actions";

export const metadata = { title: "Payments" };
type P = { params: Promise<{ artistId: string }>; searchParams: Promise<{ ok?: string; err?: string }> };

const COUNTRIES = [["US", "United States"], ["CA", "Canada"], ["GB", "United Kingdom"], ["IE", "Ireland"], ["AU", "Australia"], ["NZ", "New Zealand"],
  ["DE", "Germany"], ["FR", "France"], ["NL", "Netherlands"], ["ES", "Spain"], ["IT", "Italy"], ["SE", "Sweden"]];
const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function Payments({ params, searchParams }: P) {
  const { artistId } = await params;
  const { ok, err } = await searchParams;
  const { supabase, artist, role } = await requireArtist(artistId, ["owner", "accountant"]);
  const canAct = role === "owner";
  const { data: row } = await supabase.from("artist_stripe").select("*").eq("artist_id", artistId).maybeSingle<ArtistStripe>();
  const live = !!getStripe() && !!createAdminClient();
  const state = stripeState(row);
  const [label, cls] = STRIPE_STATE_LABEL[state];

  const price = 20000, fee = Math.round(price * artist.fee_bps / 10000), total = price + fee, stripeFee = Math.round(total * 0.029) + 30;

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHead title="Payments">How {artist.name} gets paid, through a Stripe account in the artist&apos;s own name.</PageHead>
      <Flash ok={ok} err={err} />
      {!live && <div className="alert alert-gray">Payments switch on once P&amp;T finishes connecting Stripe. You can come back to this page any time.</div>}
      {!canAct && <div className="alert alert-gray">Only the account owner can change payout and card settings.</div>}

      <section className="panel grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2>Payouts</h2>
          <span className={`badge ${cls}`}>{label}</span>
        </div>
        <p className="text-[15px]">
          Fans pay you directly through your own Stripe account, so you&apos;re the seller of record and Stripe pays out to your bank on its normal schedule.
          Stripe will ask for your legal name or business details, a bank account, and ID to confirm who you are. You can sign in to your Stripe dashboard any time
          to see payments, payouts, and disputes.
        </p>

        {state === "restricted" && row?.requirements_due?.length ? (
          <div className="alert alert-red flex-col gap-1">
            <span className="font-extrabold">Stripe needs a few more details</span>
            <ul className="list-disc pl-5 font-medium">{row.requirements_due.slice(0, 8).map((r) => <li key={r}>{requirementLabel(r)}</li>)}</ul>
          </div>
        ) : null}
        {state === "ready" && <div className="alert alert-green">Your Stripe account is ready. Payouts go to the bank account you added in Stripe.</div>}

        {canAct && live && (
          <div className="flex flex-wrap items-end gap-3">
            {state === "not_started" ? (
              <form action={startPayoutSetup.bind(null, artistId)} className="flex flex-wrap items-end gap-3">
                <label className="field"><span>Country of your bank account</span>
                  <select name="country" className="input w-64" defaultValue="US">{COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
                </label>
                <SubmitButton pendingText="Opening Stripe…">Set up payouts with Stripe</SubmitButton>
              </form>
            ) : (
              <>
                {state !== "ready" && <form action={startPayoutSetup.bind(null, artistId)}><SubmitButton pendingText="Opening Stripe…">Continue setup</SubmitButton></form>}
                {row?.details_submitted && <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer" className="btn btn-ghost">Open your Stripe dashboard</a>}
                <form action={refreshStripe.bind(null, artistId)}><SubmitButton variant="text" pendingText="Checking…">Refresh status</SubmitButton></form>
              </>
            )}
          </div>
        )}
      </section>

      <section className="panel grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2>Card on file</h2>
          <span className={`badge ${row?.card_last4 ? "b-approved" : "b-neutral"}`}>{row?.card_last4 ? "Added" : "Optional"}</span>
        </div>
        <p className="text-[15px]">
          Optional. Refunds and chargebacks come out of your Stripe balance, and Stripe handles any shortfall with you directly.
          A card on file lets P&amp;T settle anything else owed without chasing you.
        </p>
        {row?.card_last4 && (
          <div className="stat w-fit"><b className="capitalize">{row.card_brand} ending {row.card_last4}</b><span>Expires {row.card_exp}</span></div>
        )}
        {canAct && live && (
          <form action={startCardSetup.bind(null, artistId)}>
            <SubmitButton variant={row?.card_last4 ? "ghost" : "primary"} pendingText="Opening Stripe…">{row?.card_last4 ? "Replace card" : "Add a card"}</SubmitButton>
          </form>
        )}
      </section>

      <section className="panel grid gap-3">
        <h2>How the money works</h2>
        <p className="text-[15px]">
          You set the price. Fans see a {pct(artist.fee_bps)} service fee added on top, which goes to P&amp;T. Stripe&apos;s processing fee on the full charge comes out of your share.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="stat"><b>{usd(price)}</b><span>Your price</span></div>
          <div className="stat"><b>{usd(total)}</b><span>Fan pays</span></div>
          <div className="stat"><b>{usd(stripeFee)}</b><span>Stripe fee (about)</span></div>
          <div className="stat"><b>{usd(price - stripeFee)}</b><span>You get</span></div>
        </div>
        <p className="help">If you refund a fan, P&amp;T&apos;s fee is returned to them automatically. Stripe keeps its processing fee on refunds, and that&apos;s your cost.</p>
      </section>
    </div>
  );
}
