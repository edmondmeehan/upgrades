import { requireSuperAdmin } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { Flash, type Msg } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { inviteAdmin, revokeAdminInvite, removeAdmin, sendTestEmail } from "../actions";
import { emailConfigured } from "@/lib/email";
import { siteUrl } from "@/lib/email";
import { formatDateTime } from "@/lib/util";

export const metadata = { title: "Admins" };

export default async function AdminTeam({ searchParams }: { searchParams: Msg }) {
  const { supabase, user } = await requireSuperAdmin();
  const { ok, err } = await searchParams;
  const [{ data: admins }, { data: invites }] = await Promise.all([
    supabase.from("profiles").select("id, name, email, created_at").eq("is_super_admin", true).order("created_at")
      .returns<{ id: string; name: string | null; email: string; created_at: string }[]>(),
    supabase.from("admin_invitations").select("id, email, token, expires_at").is("accepted_at", null).is("revoked_at", null)
      .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false })
      .returns<{ id: string; email: string; token: string; expires_at: string }[]>(),
  ]);

  return (
    <>
      <PageHead title="Admins" eyebrow="P&T admin">
        Admins can approve and suspend artists, change fees, open any artist&apos;s account, and see platform finance. Access is by invitation only.
      </PageHead>
      <Flash ok={ok} err={err} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-6">
          <ul className="card divide-y divide-line overflow-hidden">
            {(admins ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <span>
                  <span className="font-semibold">{a.name ?? a.email}</span>{a.id === user.id && <span className="muted"> (you)</span>}
                  <span className="muted block text-[13px]">{a.email}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="badge b-verified">Admin</span>
                  {a.id !== user.id && (
                    <form action={removeAdmin.bind(null, a.id)}>
                      <SubmitButton variant="ghost" size="sm" confirm={`Remove admin access for ${a.email}? They keep any artist accounts they're on.`}>Remove</SubmitButton>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {(invites ?? []).length > 0 && (
            <section className="grid gap-3">
              <h2>Waiting to accept</h2>
              {invites!.map((i) => (
                <div key={i.id} className="card grid gap-2 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{i.email}</span>
                    <form action={revokeAdminInvite.bind(null, i.id)}><SubmitButton variant="ghost" size="sm">Revoke</SubmitButton></form>
                  </div>
                  <label className="field"><span className="help !font-medium">Invite link, expires {formatDateTime(i.expires_at)}</span>
                    <input className="input input-sm" readOnly value={`${siteUrl()}/admin-invite/${i.token}`} />
                  </label>
                </div>
              ))}
            </section>
          )}
        </div>

        <form action={inviteAdmin} className="panel grid gap-4">
          <h2>Invite an admin</h2>
          <label className="field"><span>Email</span><input className="input" type="email" name="email" required placeholder="name@please.co" /></label>
          <p className="help">They&apos;ll sign in or create an account with this email, then accept. The link works for 7 days.</p>
          <div><SubmitButton pendingText="Sending…">Send invite</SubmitButton></div>
        </form>
        <form action={sendTestEmail} className="panel grid gap-3 lg:col-start-2">
          <h2>Email</h2>
          <p className="help">{emailConfigured() ? "Resend is connected. Send yourself a test to check delivery." : "RESEND_API_KEY isn't set in Vercel, so emails aren't sending."}</p>
          <div><SubmitButton variant="ghost" pendingText="Sending…">Send test email</SubmitButton></div>
        </form>
      </div>
    </>
  );
}
