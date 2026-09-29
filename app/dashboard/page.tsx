import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import { StatusPill } from "@/components/Laminate";
import { ROLE_LABEL, type ArtistStatus, type MemberRole } from "@/lib/types";

export const metadata = { title: "Your artists" };

type Row = { role: MemberRole; artists: { id: string; name: string; handle: string; status: ArtistStatus } };

export default async function Dashboard() {
  const { supabase, user, profile } = await requireUser();
  const { data } = await supabase
    .from("artist_members")
    .select("role, artists!inner(id, name, handle, status)")
    .eq("user_id", user.id)
    .order("created_at")
    .returns<Row[]>();
  const rows = data ?? [];

  if (rows.length === 1 && !profile.is_super_admin) redirect(`/a/${rows[0].artists.id}`);
  if (rows.length === 0 && !profile.is_super_admin) redirect("/onboarding");

  return (
    <>
      <TopBar email={profile.email} isAdmin={profile.is_super_admin} />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <h1>{profile.name ? `Hi, ${profile.name.split(" ")[0]}` : "Your artists"}</h1>
          <Link href="/onboarding" className="btn btn-ghost">Add an artist</Link>
        </div>
        {profile.is_super_admin && (
          <Link href="/admin" className="panel mb-6 flex items-center justify-between !no-underline text-stage hover:border-stage">
            <span><span className="font-display text-xl font-semibold">P&amp;T admin</span><br /><span className="muted">Approvals, all artists, fees, audit log</span></span>
            <span className="btn btn-dark">Open admin</span>
          </Link>
        )}
        {rows.length === 0 ? (
          <p className="muted">You&apos;re not on any artist teams yet.</p>
        ) : (
          <ul className="grid gap-3">
            {rows.map(({ role, artists: a }) => (
              <li key={a.id}>
                <Link href={`/a/${a.id}`} className="panel flex flex-wrap items-center justify-between gap-3 !no-underline text-stage hover:border-stage">
                  <span>
                    <span className="font-display text-xl font-semibold">{a.name}</span>
                    <span className="muted block text-sm">{ROLE_LABEL[role]}</span><span className="muted block text-sm">upgrades.ontour.vip/{a.handle}</span>
                  </span>
                  <StatusPill status={a.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
