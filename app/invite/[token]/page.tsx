import Link from "next/link";
import { getSession } from "@/lib/auth";
import { Wordmark } from "@/components/Wordmark";
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

  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-8 px-5 py-10">
      <Wordmark />
      {!inv || inv.state !== "open" ? (
        <div>
          <h1>This invite can&apos;t be used</h1>
          <p className="mt-3">
            {inv?.state === "accepted" ? "It's already been accepted." : inv?.state === "expired" ? "It has expired." : "It was revoked or the link is wrong."}{" "}
            Ask the artist to send a new one.
          </p>
          {profile && <Link className="btn btn-ghost mt-6" href="/dashboard">Go to your artists</Link>}
        </div>
      ) : (
        <div>
          <h1>Join {inv.artist_name}</h1>
          <p className="mt-3">You&apos;ve been invited as <strong>{ROLE_LABEL[inv.role].toLowerCase()}</strong> for {inv.email}.</p>
          <div className="mt-6"><Flash err={err} /></div>
          {profile ? (
            profile.email === inv.email ? (
              <form action={acceptInvite.bind(null, token)} className="mt-2"><SubmitButton pendingText="Joining…">Accept invite</SubmitButton></form>
            ) : (
              <p className="panel mt-2">You&apos;re signed in as {profile.email}. Sign out, then sign in or create an account with {inv.email} to accept.</p>
            )
          ) : (
            <div className="mt-2 flex flex-wrap gap-3">
              <Link className="btn btn-primary" href={`/signup?next=${encodeURIComponent(next)}`}>Create account</Link>
              <Link className="btn btn-ghost" href={`/login?next=${encodeURIComponent(next)}`}>I have an account</Link>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
