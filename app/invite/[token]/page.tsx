import Link from "next/link";
import { getSession } from "@/lib/auth";
import { AuthShell } from "@/app/(auth)/AuthShell";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { acceptInvite } from "./actions";
import { ROLE_LABEL, type MemberRole } from "@/lib/types";

export const metadata = { title: "Team invite" };
type P = { params: Promise<{ token: string }>; searchParams: Promise<{ err?: string }> };

export default async function Invite({ params, searchParams }: P) {
  const { token } = await params;
  const { err } = await searchParams;
  const { supabase, profile } = await getSession();
  const { data } = await supabase.rpc("get_invitation", { p_token: token });
  const inv = (data as { artist_name: string; role: MemberRole; email: string; state: string }[] | null)?.[0];
  const next = `/invite/${token}`;

  if (!inv || inv.state !== "open") {
    return (
      <AuthShell title="This invite can't be used"
        subtitle={<>{inv?.state === "accepted" ? "It's already been accepted." : inv?.state === "expired" ? "It has expired." : "It was revoked, or the link is wrong."} Ask the artist to send a new one.</>}>
        {profile && <Link className="btn btn-ghost" href="/dashboard">Go to your artists</Link>}
      </AuthShell>
    );
  }
  return (
    <AuthShell title={`Join ${inv.artist_name}`} subtitle={<>You&apos;ve been invited as <strong>{ROLE_LABEL[inv.role].toLowerCase()}</strong> for {inv.email}.</>}>
      <Flash err={err} />
      {profile ? (
        profile.email === inv.email ? (
          <form action={acceptInvite.bind(null, token)}><SubmitButton size="lg" block pendingText="Joining…">Accept invite</SubmitButton></form>
        ) : (
          <p className="alert alert-yellow">You&apos;re signed in as {profile.email}. Sign out, then sign in or create an account with {inv.email} to accept.</p>
        )
      ) : (
        <div className="grid gap-3">
          <Link className="btn btn-lg w-full" href={`/signup?next=${encodeURIComponent(next)}`}>Create account</Link>
          <Link className="btn btn-ghost w-full" href={`/login?next=${encodeURIComponent(next)}`}>I have an account</Link>
        </div>
      )}
    </AuthShell>
  );
}
