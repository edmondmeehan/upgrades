import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { AdminShell } from "../AdminShell";
import { formatDateTime } from "@/lib/util";

export const metadata = { title: "Audit log" };
type Row = { id: number; action: string; created_at: string; artist_id: string | null; details: Record<string, unknown>;
  profiles: { email: string } | null; artists: { name: string } | null };

export default async function Audit() {
  const { profile, supabase } = await requireSuperAdmin();
  const { data } = await supabase.from("audit_log").select("id, action, created_at, artist_id, details, profiles(email), artists(name)")
    .order("created_at", { ascending: false }).limit(200).returns<Row[]>();
  return (
    <AdminShell email={profile.email} current="audit">
      <p className="muted mb-4">The latest 200 events across every account.</p>
      <div className="overflow-x-auto rounded-xl border-[1.5px] border-line bg-card">
        <table className="w-full min-w-[44rem] text-left text-[0.95rem]">
          <thead className="border-b-[1.5px] border-line text-sm text-mute">
            <tr><th className="px-4 py-3 font-semibold">When</th><th className="px-4 py-3 font-semibold">Artist</th><th className="px-4 py-3 font-semibold">Event</th><th className="px-4 py-3 font-semibold">By</th><th className="px-4 py-3 font-semibold">Details</th></tr>
          </thead>
          <tbody className="divide-y-[1.5px] divide-line">
            {(data ?? []).map((e) => (
              <tr key={e.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-2.5">{formatDateTime(e.created_at)}</td>
                <td className="px-4 py-2.5">{e.artist_id ? <Link href={`/admin/artists/${e.artist_id}`}>{e.artists?.name ?? "Deleted"}</Link> : "—"}</td>
                <td className="px-4 py-2.5 font-semibold">{e.action}</td>
                <td className="px-4 py-2.5">{e.profiles?.email ?? <span className="muted">External link</span>}</td>
                <td className="max-w-[20rem] px-4 py-2.5 text-sm muted break-words">{Object.keys(e.details).length ? JSON.stringify(e.details) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
