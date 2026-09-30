import { requireUser } from "@/lib/auth";
import { Shell, PageHead } from "@/components/Shell";
import { Flash, type Msg } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { updateName, updatePassword } from "../(auth)/actions";
import { deleteMyAccount } from "./actions";

export const metadata = { title: "Your account" };

export default async function Account({ searchParams }: { searchParams: Msg }) {
  const { profile, supabase } = await requireUser();
  const { data: check } = await supabase.rpc("account_deletion_check");
  const c = (check ?? { delete_artists: [], blocked_artists: [], last_admin: false }) as { delete_artists: { name: string }[]; blocked_artists: { name: string }[]; last_admin: boolean };
  const blocked = c.blocked_artists.length > 0 || c.last_admin;
  const { ok, err } = await searchParams;
  return (
    <Shell email={profile.email} isAdmin={profile.is_super_admin}>
      <div className="grid max-w-xl gap-6">
        <PageHead title="Your account">Signed in as {profile.email}</PageHead>
        <Flash ok={ok} err={err} />
        <form action={updateName} className="panel grid gap-4">
          <h2>Name</h2>
          <label className="field"><span>Name</span><input className="input" name="name" defaultValue={profile.name ?? ""} /></label>
          <div><SubmitButton>Save name</SubmitButton></div>
        </form>
        <form action={updatePassword} className="panel grid gap-4">
          <h2>Password</h2>
          <label className="field"><span>New password</span><input className="input" type="password" name="password" minLength={8} autoComplete="new-password" required /></label>
          <div><SubmitButton variant="dark">Update password</SubmitButton></div>
        </form>
        <section className="panel grid gap-4 !border-[#f3c9bd]">
          <h2>Delete account</h2>
          <p className="muted">This removes your login, name and email. Sales, payouts and check-in history stay in the records for the artists involved, without your name on them.</p>
          {c.delete_artists.length > 0 && (
            <p className="alert alert-yellow">You&apos;re the only owner of {c.delete_artists.map((a) => a.name).join(", ")}, which {c.delete_artists.length === 1 ? "has" : "have"} no sales yet, so {c.delete_artists.length === 1 ? "it" : "they"} will be deleted too, including tours, shows, packages and the storefront.</p>
          )}
          {c.blocked_artists.length > 0 && (
            <p className="alert alert-red">You&apos;re the only owner of {c.blocked_artists.map((a) => a.name).join(", ")}, which {c.blocked_artists.length === 1 ? "has" : "have"} fan orders. Those records have to be kept for payouts, refunds and taxes, so P&amp;T needs to close {c.blocked_artists.length === 1 ? "that artist" : "those artists"} first. Contact help.please.co.</p>
          )}
          {c.last_admin && <p className="alert alert-red">You&apos;re the only P&amp;T admin. Invite another admin before deleting your account.</p>}
          {!blocked && (
            <form action={deleteMyAccount} className="grid gap-3">
              <label className="field"><span>Type DELETE to confirm</span><input className="input max-w-xs uppercase" name="confirm" required autoComplete="off" /></label>
              <div><SubmitButton variant="danger" pendingText="Deleting…" confirm="Delete your account permanently? This can't be undone.">Delete my account</SubmitButton></div>
            </form>
          )}
        </section>
      </div>
    </Shell>
  );
}
