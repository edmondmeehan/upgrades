import Link from "next/link";
import { AuthShell } from "../AuthShell";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { signIn, sendMagicLink } from "../actions";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; ok?: string; err?: string }> }) {
  const { next = "/dashboard", ok, err } = await searchParams;
  return (
    <AuthShell title="Sign in">
      <Flash ok={ok} err={err} />
      <form className="grid gap-4" action={signIn}>
        <input type="hidden" name="next" value={next} />
        <label className="field"><span>Email</span><input className="input" name="email" type="email" autoComplete="email" required /></label>
        <label className="field"><span>Password</span><input className="input" name="password" type="password" autoComplete="current-password" /></label>
        <div className="flex flex-wrap gap-3">
          <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
          <SubmitButton variant="ghost" pendingText="Sending…" formAction={sendMagicLink}>Email me a sign-in link</SubmitButton>
        </div>
      </form>
      <p className="mt-8 muted">New to OnTour Upgrades? <Link href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link></p>
    </AuthShell>
  );
}
