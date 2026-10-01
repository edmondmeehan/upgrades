import { Logo } from "@/components/Logo";
import { Icon } from "@/components/Icon";
import { SubmitButton } from "@/components/SubmitButton";
import { findOrder } from "./actions";
import { HumanCheck } from "@/components/HumanCheck";

export const metadata = { title: "Find my order", robots: { index: false } };

export default async function FindOrder({ searchParams }: { searchParams: Promise<{ err?: string; code?: string }> }) {
  const { err, code } = await searchParams;
  return (
    <div className="min-h-screen bg-paper">
      <header className="bg-navy">
        <div className="home-wrap flex items-center justify-between py-5">
          <Logo href="/" />
          <a href="https://help.please.co" className="fan-nav-btn solid"><Icon name="help" size={16} /><span>Fan Support</span></a>
        </div>
      </header>
      <main className="mx-auto grid max-w-[480px] gap-5 px-4 py-10">
        <div>
          <h1 className="text-[30px]">Find my order</h1>
          <p className="muted mt-2">Get back to your VIP passes. Your confirmation number starts with OTU- and is in your order email.</p>
        </div>
        <form action={findOrder} className="card grid gap-4 p-6">
          {err && <p role="alert" className="alert alert-red">{err.slice(0, 200)}</p>}
          <label className="field"><span>Confirmation number</span>
            <input name="code" required className="input font-mono uppercase" placeholder="OTU-7K4M9Q" defaultValue={code ?? ""} autoCapitalize="characters" autoComplete="off" /></label>
          <label className="field"><span>Last name, email, or billing ZIP</span>
            <input name="proof" required className="input" placeholder="Rivera" autoComplete="family-name" />
            <small>Use the details from checkout.</small></label>
          <HumanCheck />
          <SubmitButton size="lg" pendingText="Looking…">Find my order</SubmitButton>
        </form>
        <p className="help text-center">Can&apos;t find your confirmation number? <a href="https://help.please.co">Contact Fan Support</a> with the email you used at checkout.</p>
      </main>
    </div>
  );
}
