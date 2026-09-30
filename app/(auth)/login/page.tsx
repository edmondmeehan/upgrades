import Link from "next/link";
import { AuthShell } from "../AuthShell";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { signIn, sendMagicLink } from "../actions";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; ok?: string; err?: string }> }) {
  const { next = "/dashboard", ok, err } = await searchParams;
  return (
    <AuthShell title="Sign in" subtitle="For artists, reps, and accountants.">
      <Flash ok={ok} err={err} />
      <form className="grid gap-5" action={signIn}>
        <input type="hidden" name="next" value={next} />
        <label className="field"><span>Email</span><input className="input" name="email" type="email" autoComplete="email" required /></label>
        <label className="field"><span>Password</span><input className="input" name="password" type="password" autoComplete="current-password" /></label>
        <SubmitButton size="lg" block pendingText="Signing in…">Sign in</SubmitButton>
        <SubmitButton variant="ghost" block pendingText="Sending…" formAction={sendMagicLink}>Email me a sign-in link</SubmitButton>
      </form>
      <p className="help text-center">New to OnTour Upgrades? <Link href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link></p>
    </AuthShell>
  );
}
