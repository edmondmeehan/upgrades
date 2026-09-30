import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { formatDateTime } from "@/lib/util";

export const metadata = { title: "Audit log" };
type Row = { id: number; action: string; created_at: string; artist_id: string | null; details: Record<string, unknown>;
  profiles: { email: string } | null; artists: { name: string } | null };

export default async function Audit() {
  const { supabase } = await requireSuperAdmin();
  const { data } = await supabase.from("audit_log").select("id, action, created_at, artist_id, details, profiles(email), artists(name)")
    .order("created_at", { ascending: false }).limit(200).returns<Row[]>();
  return (
    <>
      <PageHead title="Audit log" eyebrow="P&T admin">The latest 200 events across every account.</PageHead>
      <div className="card overflow-x-auto">
        <table className="list min-w-[44rem] text-[14px]">
          <thead>
            <tr><th className="!pt-4">When</th><th className="!pt-4">Artist</th><th className="!pt-4">Event</th><th className="!pt-4">By</th><th className="!pt-4">Details</th></tr>
          </thead>
          <tbody>
            {(data ?? []).map((e) => (
              <tr key={e.id} className="align-top">
                <td className="whitespace-nowrap">{formatDateTime(e.created_at)}</td>
                <td>{e.artist_id ? <Link href={`/admin/artists/${e.artist_id}`}>{e.artists?.name ?? "Deleted"}</Link> : "—"}</td>
                <td className="font-semibold">{e.action}</td>
                <td>{e.profiles?.email ?? <span className="muted">External link</span>}</td>
                <td className="muted max-w-[20rem] break-words text-[13px]">{Object.keys(e.details).length ? JSON.stringify(e.details) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
