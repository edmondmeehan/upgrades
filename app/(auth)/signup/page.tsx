import Link from "next/link";
import { AuthShell } from "../AuthShell";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { signUp } from "../actions";

export const metadata = { title: "Create account" };

export default async function Signup({ searchParams }: { searchParams: Promise<{ next?: string; ok?: string; err?: string }> }) {
  const { next = "/onboarding", ok, err } = await searchParams;
  return (
    <AuthShell title="Create your account">
      <p className="mb-6 muted">For artists and their teams. If someone invited you, use the email the invite went to.</p>
      <Flash ok={ok} err={err} />
      <form className="grid gap-4" action={signUp}>
        <input type="hidden" name="next" value={next} />
        <label className="field"><span>Your name</span><input className="input" name="name" autoComplete="name" required /></label>
        <label className="field">
          <span>Email</span>
          <input className="input" name="email" type="email" autoComplete="email" required />
          <small>An email on your artist&apos;s own website domain speeds up verification.</small>
        </label>
        <label className="field"><span>Password</span><input className="input" name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
        <label className="flex items-start gap-3 text-[0.95rem]">
          <input type="checkbox" name="terms" className="mt-1 size-5 accent-stage" required />
          <span>
            I accept the artist terms, including that card processing fees aren&apos;t returned when an upgrade is refunded,
            those fees are my cost, and the card on file may be charged for any shortfall.
          </span>
        </label>
        <div><SubmitButton pendingText="Creating account…">Create account</SubmitButton></div>
      </form>
      <p className="mt-8 muted">Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></p>
    </AuthShell>
  );
}
