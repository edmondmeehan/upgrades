import Link from "next/link";
import { getSession } from "@/lib/auth";
import { AuthShell } from "@/app/(auth)/AuthShell";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { acceptAdminInvite } from "./actions";

export const metadata = { title: "Admin invite", robots: { index: false } };
type P = { params: Promise<{ token: string }>; searchParams: Promise<{ err?: string }> };

export default async function AdminInvite({ params, searchParams }: P) {
  const { token } = await params;
  const { err } = await searchParams;
  const { supabase, profile } = await getSession();
  const { data } = await supabase.rpc("get_admin_invitation", { p_token: token });
  const inv = (data as { email: string; invited_by_name: string; state: string }[] | null)?.[0];
  const next = `/admin-invite/${token}`;

  if (!inv || inv.state !== "open") {
    return (
      <AuthShell title="This invite can't be used"
        subtitle={inv?.state === "accepted" ? "It's already been accepted." : inv?.state === "expired" ? "It has expired. Ask an admin for a new one." : "It was revoked, or the link is wrong."}>
        {profile && <Link className="btn btn-ghost" href="/dashboard">Go to your artists</Link>}
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Become a P&T admin" subtitle={<>{inv.invited_by_name} invited <strong>{inv.email}</strong> to help run OnTour Upgrades.</>}>
      <Flash err={err} />
      {profile ? (
        profile.email === inv.email ? (
          <form action={acceptAdminInvite.bind(null, token)}><SubmitButton size="lg" block pendingText="Accepting…">Accept admin invite</SubmitButton></form>
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
