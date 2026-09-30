import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Shell, PageHead } from "@/components/Shell";
import { StatusPill } from "@/components/StatusPill";
import { Icon } from "@/components/Icon";
import { ROLE_LABEL, type ArtistStatus, type MemberRole } from "@/lib/types";

export const metadata = { title: "Your artists" };

type Row = { role: MemberRole; artists: { id: string; name: string; handle: string; status: ArtistStatus } };

export default async function Dashboard() {
  const { supabase, user, profile } = await requireUser();
  const { data } = await supabase.from("artist_members").select("role, artists!inner(id, name, handle, status)")
    .eq("user_id", user.id).order("created_at").returns<Row[]>();
  const rows = data ?? [];

  if (rows.length === 1 && !profile.is_super_admin) redirect(`/a/${rows[0].artists.id}`);
  if (rows.length === 0 && !profile.is_super_admin) redirect("/onboarding");

  return (
    <Shell email={profile.email} isAdmin={profile.is_super_admin}>
      <PageHead title={profile.name ? `Hi, ${profile.name.split(" ")[0]}` : "Your artists"}
        aside={<Link href="/onboarding" className="btn btn-ghost"><Icon name="plus" />Add an artist</Link>} />
      {profile.is_super_admin && (
        <Link href="/admin" className="card flex flex-wrap items-center justify-between gap-4 p-5 !no-underline text-ink hover:shadow-[0_12px_32px_rgba(19,0,86,.12)]">
          <span className="flex items-center gap-4">
            <span className="grid size-11 place-items-center rounded-full bg-navy text-yellow"><Icon name="shield" /></span>
            <span><span className="block text-[17px] font-extrabold">P&amp;T admin</span><span className="muted text-[14px] font-medium">Approvals, all artists, fees, and the audit log</span></span>
          </span>
          <span className="btn btn-dark btn-sm">Open admin</span>
        </Link>
      )}
      {rows.length === 0 ? <p className="muted">You&apos;re not on any artist teams yet.</p> : (
        <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          {rows.map(({ role, artists: a }) => (
            <li key={a.id}>
              <Link href={`/a/${a.id}`} className="card grid h-full gap-3 p-5 !no-underline text-ink transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(19,0,86,.12)]">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[18px] font-extrabold leading-tight">{a.name}</span>
                  <StatusPill status={a.status} />
                </div>
                <span className="muted text-[13px] font-medium">{ROLE_LABEL[role]}<br />upgrades.ontour.vip/{a.handle}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
