import { notFound } from "next/navigation";
import Link from "next/link";
import { StoreHero } from "@/components/StorefrontParts";
import { SubmitButton } from "@/components/SubmitButton";
import { loadStore, theme } from "@/lib/storefront";
import { submitSupport } from "./actions";
import { TOPICS } from "@/lib/support";

export const metadata = { title: "Fan support", robots: { index: false } };
type P = { params: Promise<{ handle: string }>; searchParams: Promise<{ order?: string; err?: string; sent?: string; topic?: string }> };

export default async function Support({ params, searchParams }: P) {
  const { handle } = await params;
  const q = await searchParams;
  const s = await loadStore(handle);
  if (!s) notFound();
  const t = theme(s);
  return (
    <div className="min-h-screen bg-paper">
      <StoreHero s={s} t={t} compact />
      <main className="mx-auto grid max-w-[560px] gap-5 px-4 py-8">
        {q.sent ? (
          <div className="card grid justify-items-start gap-3 p-6" role="status">
            <span className="badge b-published">Sent</span>
            <h1 className="text-[26px]">Message received</h1>
            <p className="muted">The {s.name} team will reply by email. We sent you a copy, so check your inbox (and spam, just in case).</p>
            <Link href={`/${s.handle}`} className="btn btn-ghost">Back to {s.name}</Link>
          </div>
        ) : (
          <>
            <div>
              <h1 className="text-[28px]">Fan support</h1>
              <p className="muted mt-2">Questions about a {s.name} VIP upgrade go straight to the {s.name} team. They&apos;ll reply by email.</p>
            </div>
            <form action={submitSupport.bind(null, s.handle)} className="card grid gap-4 p-6">
              {q.err && <p role="alert" className="alert alert-red">{q.err.slice(0, 200)}</p>}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="field"><span>Your name</span><input name="name" required maxLength={120} className="input" autoComplete="name" /></label>
                <label className="field"><span>Email</span><input name="email" type="email" required className="input" autoComplete="email" /><small>Use the email from your order.</small></label>
              </div>
              <label className="field"><span>Confirmation number (if you have one)</span>
                <input name="order" className="input font-mono uppercase" placeholder="OTU-7K4M9Q" defaultValue={q.order ?? ""} autoComplete="off" /></label>
              <label className="field"><span>What&apos;s it about?</span>
                <select name="topic" className="input" defaultValue={q.topic && TOPICS[q.topic] ? q.topic : q.order ? "order" : "other"}>
                  {Object.entries(TOPICS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select></label>
              <label className="field"><span>Message</span><textarea name="message" required maxLength={4000} className="input" placeholder="How can the team help?" /></label>
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
              <SubmitButton size="lg" pendingText="Sending…">Send message</SubmitButton>
            </form>
            <p className="help text-center">Lost your passes? <Link href="/find-order">Find your order</Link> with your confirmation number and last name.</p>
          </>
        )}
      </main>
    </div>
  );
}
