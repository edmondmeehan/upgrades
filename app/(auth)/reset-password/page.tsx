import Link from "next/link";
import { AuthShell } from "../AuthShell";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { createClient } from "@/lib/supabase/server";
import { setNewPassword } from "../actions";

export const metadata = { title: "Choose a new password" };
export const dynamic = "force-dynamic";

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { ok, err } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <AuthShell title="Choose a new password" subtitle={user ? `For ${user.email}` : undefined}>
      <Flash ok={ok} err={err} />
      {user ? (
        <form className="grid gap-5" action={setNewPassword}>
          <label className="field"><span>New password</span><input className="input" name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
          <label className="field"><span>Type it again</span><input className="input" name="confirm" type="password" autoComplete="new-password" minLength={8} required /></label>
          <SubmitButton size="lg" block pendingText="Saving…">Save new password</SubmitButton>
        </form>
      ) : (
        <p className="alert alert-yellow">This reset link has expired or was already used. <Link href="/forgot-password">Request a new one</Link>.</p>
      )}
    </AuthShell>
  );
}
