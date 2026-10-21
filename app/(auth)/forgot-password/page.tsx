import Link from "next/link";
import { AuthShell } from "../AuthShell";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { HumanCheck } from "@/components/HumanCheck";
import { requestPasswordReset } from "../actions";

export const metadata = { title: "Forgot password" };

export default async function ForgotPassword({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { ok, err } = await searchParams;
  return (
    <AuthShell title="Forgot your password?" subtitle="We'll email you a link to choose a new one.">
      <Flash ok={ok} err={err} />
      <form className="grid gap-5" action={requestPasswordReset}>
        <label className="field"><span>Email</span><input className="input" name="email" type="email" autoComplete="email" required /></label>
        <HumanCheck />
        <SubmitButton size="lg" block pendingText="Sending…">Email me a reset link</SubmitButton>
      </form>
      <p className="help text-center"><Link href="/login">Back to sign in</Link></p>
    </AuthShell>
  );
}
