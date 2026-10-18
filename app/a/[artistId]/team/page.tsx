import { PageHead } from "@/components/Shell";
import { requireArtist } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { inviteMember, revokeInvite, removeMember, setMemberRole, restoreMember, forgetRemoved } from "../actions";
import { siteUrl } from "@/lib/email";
import { formatDateTime } from "@/lib/util";
import { ROLE_LABEL, type MemberRole } from "@/lib/types";

type P = { params: Promise<{ artistId: string }>; searchParams: Promise<{ ok?: string; err?: string }> };
type MemberRow = { user_id: string; role: MemberRole; created_at: string; profiles: { name: string | null; email: string } };
type InviteRow = { id: string; email: string; role: MemberRole; token: string; expires_at: string };
type RemovedRow = { email: string; name: string | null; role: MemberRole; removed_at: string; user_id: string | null };
const ROLES: MemberRole[] = ["owner", "rep", "accountant", "door"];
const RoleSelect = ({ value, name = "role" }: { value: MemberRole; name?: string }) => (
  <select name={name} defaultValue={value} className="input input-sm !w-auto" aria-label="Role">
    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
  </select>
);

export default async function Team({ params, searchParams }: P) {
  const { artistId } = await params;
  const { ok, err } = await searchParams;
  const { supabase, user } = await requireArtist(artistId, ["owner"]);
  const [{ data: members }, { data: invites }, { data: removed }] = await Promise.all([
    supabase.from("artist_members").select("user_id, role, created_at, profiles!artist_members_user_id_fkey(name, email)")
      .eq("artist_id", artistId).order("created_at").returns<MemberRow[]>(),
    supabase.from("invitations").select("id, email, role, token, expires_at").eq("artist_id", artistId)
      .is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }).returns<InviteRow[]>(),
    supabase.from("removed_members").select("email, name, role, removed_at, user_id").eq("artist_id", artistId).order("removed_at", { ascending: false }).returns<RemovedRow[]>(),
  ]);
  const owners = (members ?? []).filter((m) => m.role === "owner").length;

  return (
    <>
    <PageHead title="Team">People who help run this artist account.</PageHead>
    <Flash ok={ok} err={err} />
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        <ul className="card divide-y divide-line overflow-hidden">
          {(members ?? []).map((m) => (
            <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <span>
                <span className="font-semibold">{m.profiles.name ?? m.profiles.email}</span>
                {m.user_id === user.id && <span className="muted"> (you)</span>}
                <span className="muted block text-sm">{m.profiles.email}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {m.role === "owner" && owners <= 1 ? (
                  <span className="badge b-neutral" title="Make someone else an owner before changing this">{ROLE_LABEL[m.role]}</span>
                ) : (
                  <form action={setMemberRole.bind(null, artistId, m.user_id)} className="flex items-center gap-2">
                    <RoleSelect value={m.role} />
                    <SubmitButton variant="ghost" size="sm" pendingText="Saving…">Change</SubmitButton>
                  </form>
                )}
                {m.user_id !== user.id && !(m.role === "owner" && owners <= 1) && (
                  <form action={removeMember.bind(null, artistId, m.user_id)}>
                    <SubmitButton variant="ghost" size="sm" confirm={`Remove ${m.profiles.email} from the team? You can add them back later.`}>Remove</SubmitButton>
                  </form>
                )}
              </span>
            </li>
          ))}
        </ul>

        <p className="help mt-2">Owners manage everything. Reps run shows, packages and fans. Accountants see money only. Door staff only check fans in.</p>

        {(removed ?? []).length > 0 && (
          <>
            <h2 className="mb-3 mt-8">Removed</h2>
            <ul className="card divide-y divide-line overflow-hidden">
              {removed!.map((r) => (
                <li key={r.email} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <span>
                    <span className="font-semibold">{r.name ?? r.email}</span>
                    <span className="muted block text-sm">{r.email}, was {ROLE_LABEL[r.role]}, removed {formatDateTime(r.removed_at)}{!r.user_id ? ". Their account was deleted, so adding them back sends a new invite." : ""}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <form action={restoreMember.bind(null, artistId, r.email)} className="flex items-center gap-2">
                      <RoleSelect value={r.role} />
                      <SubmitButton size="sm" pendingText="Adding…">{r.user_id ? "Add back" : "Send new invite"}</SubmitButton>
                    </form>
                    <form action={forgetRemoved.bind(null, artistId, r.email)}><SubmitButton variant="ghost" size="sm">Clear</SubmitButton></form>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {(invites ?? []).length > 0 && (
          <>
            <h2 className="mb-3 mt-8">Waiting to accept</h2>
            <ul className="grid gap-3">
              {invites!.map((i) => (
                <li key={i.id} className="panel grid gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><span className="font-semibold">{i.email}</span> <span className="badge b-neutral ml-1">{ROLE_LABEL[i.role]}</span></span>
                    <form action={revokeInvite.bind(null, artistId, i.id)}><SubmitButton variant="ghost" size="sm">Revoke</SubmitButton></form>
                  </div>
                  <label className="field"><span className="!font-normal muted text-sm">Invite link, expires {formatDateTime(i.expires_at)}</span>
                    <input className="input input-sm" readOnly value={`${siteUrl()}/invite/${i.token}`} />
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <form action={inviteMember.bind(null, artistId)} className="panel grid content-start gap-4">
        <h2>Invite someone</h2>
        <label className="field"><span>Email</span><input className="input" type="email" name="email" required /></label>
        <fieldset className="grid gap-3">
          <legend className="mb-1 font-semibold">Role</legend>
          <label className="flex items-start gap-3"><input type="radio" name="role" value="rep" defaultChecked className="check mt-0.5" />
            <span><span className="font-semibold">Artist rep</span><br /><span className="muted text-sm">Manager, tour manager, or photographer. Sets up shows, check-in details, scanning, and photos. Can&apos;t change payouts.</span></span></label>
          <label className="flex items-start gap-3"><input type="radio" name="role" value="accountant" className="check mt-0.5" />
            <span><span className="font-semibold">Accountant</span><br /><span className="muted text-sm">Read-only settlements, payouts, and year-end exports. No fan data.</span></span></label>
          <label className="flex items-start gap-3"><input type="radio" name="role" value="door" className="check mt-0.5" />
            <span><span className="font-semibold">Door staff</span><br /><span className="muted text-sm">Venue or crew checking fans in. Only sees Check-in: guest names and packages, no emails, orders or money.</span></span></label>
        </fieldset>
        <div><SubmitButton pendingText="Sending…">Send invite</SubmitButton></div>
      </form>
    </div>
    </>
  );
}
