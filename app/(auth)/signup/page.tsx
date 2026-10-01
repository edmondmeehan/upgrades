import Link from "next/link";
import { AuthShell } from "../AuthShell";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { signUp } from "../actions";
import { HumanCheck } from "@/components/HumanCheck";

export const metadata = { title: "Create account" };

export default async function Signup({ searchParams }: { searchParams: Promise<{ next?: string; ok?: string; err?: string }> }) {
  const { next = "/onboarding", ok, err } = await searchParams;
  return (
    <AuthShell title="Create your account" subtitle="If someone invited you, use the email the invite went to.">
      <Flash ok={ok} err={err} />
      <form className="grid gap-5" action={signUp}>
        <input type="hidden" name="next" value={next} />
        <label className="field"><span>Your name</span><input className="input" name="name" autoComplete="name" required /></label>
        <label className="field">
          <span>Email</span>
          <input className="input" name="email" type="email" autoComplete="email" required />
          <small>An email on your artist&apos;s own website domain speeds up verification.</small>
        </label>
        <label className="field"><span>Password</span><input className="input" name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
        <label className="flex items-start gap-3 text-[14px] leading-snug">
          <input type="checkbox" name="terms" className="check mt-0.5" required />
          <span>
            I accept the artist terms, including that card processing fees aren&apos;t returned when an upgrade is refunded,
            those fees are my cost, and refunds and chargebacks come out of my own Stripe balance.
          </span>
        </label>
        <HumanCheck />
        <SubmitButton size="lg" block pendingText="Creating account…">Create account</SubmitButton>
      </form>
      <p className="help text-center">Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></p>
    </AuthShell>
  );
}
