import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { StatusPill } from "@/components/Laminate";
import { AdminShell } from "./AdminShell";
import { formatDateTime, pct } from "@/lib/util";
import type { Artist, ArtistStatus } from "@/lib/types";

export const metadata = { title: "P&T admin" };
type P = { searchParams: Promise<{ status?: string; q?: string }> };
const FILTERS: { key: string; label: string }[] = [
  { key: "pending", label: "Needs review" }, { key: "approved", label: "Approved" }, { key: "draft", label: "Not submitted" },
  { key: "rejected", label: "Changes requested" }, { key: "suspended", label: "Suspended" }, { key: "all", label: "All" },
];

export default async function Admin({ searchParams }: P) {
  const { profile, supabase } = await requireSuperAdmin();
  const { status = "pending", q = "" } = await searchParams;

  let query = supabase.from("artists").select("*, verification_submissions(created_at, proof_method, third_party_confirmed_at, status)")
    .order("created_at", { ascending: false }).limit(200);
  if (status !== "all") query = query.eq("status", status as ArtistStatus);
  if (q) query = query.or(`name.ilike.%${q.replace(/[%,()]/g, "")}%,handle.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const { data } = await query.returns<(Artist & { verification_submissions: { created_at: string; proof_method: string; third_party_confirmed_at: string | null; status: string }[] })[]>();

  const { data: counts } = await supabase.from("artists").select("status").returns<{ status: ArtistStatus }[]>();
  const tally = (s: string) => (s === "all" ? counts?.length ?? 0 : counts?.filter((c) => c.status === s).length ?? 0);

  return (
    <AdminShell email={profile.email} current="artists">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <nav className="flex flex-wrap gap-2" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <Link key={f.key} href={`/admin?status=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`pill !no-underline ${status === f.key ? "bg-stage text-paper !border-stage" : "text-stage"}`}>
              {f.label} <span className="opacity-70">{tally(f.key)}</span>
            </Link>
          ))}
        </nav>
        <form className="flex gap-2" action="/admin">
          <input type="hidden" name="status" value={status} />
          <input className="input !min-h-10 w-56" name="q" defaultValue={q} placeholder="Search name or handle" aria-label="Search artists" />
          <button className="btn btn-ghost !min-h-10" type="submit">Search</button>
        </form>
      </div>

      {(data ?? []).length === 0 ? (
        <p className="muted">{status === "pending" ? "No artists waiting for review." : "No artists match."}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border-[1.5px] border-line bg-card">
          <table className="w-full min-w-[44rem] text-left">
            <thead className="border-b-[1.5px] border-line text-sm text-mute">
              <tr><th className="px-4 py-3 font-semibold">Artist</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Latest submission</th><th className="px-4 py-3 font-semibold">Fee</th><th className="px-4 py-3" /></tr>
            </thead>
            <tbody className="divide-y-[1.5px] divide-line">
              {data!.map((a) => {
                const sub = [...a.verification_submissions].sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
                return (
                  <tr key={a.id}>
                    <td className="px-4 py-3"><span className="font-semibold">{a.name}</span>{a.managed_candidate && <span className="pill ml-2 text-blue">Managed lead</span>}<br /><span className="muted text-sm">/{a.handle}</span></td>
                    <td className="px-4 py-3"><StatusPill status={a.status} /></td>
                    <td className="px-4 py-3 text-[0.95rem]">
                      {sub ? <>{formatDateTime(sub.created_at)}<br /><span className="muted text-sm">{{ code_post: "Posted code", domain_email: "Domain email", third_party: sub.third_party_confirmed_at ? "Contact confirmed" : "Awaiting contact" }[sub.proof_method]}</span></> : <span className="muted">None</span>}
                    </td>
                    <td className="px-4 py-3">{pct(a.fee_bps)}</td>
                    <td className="px-4 py-3 text-right"><Link className="btn btn-ghost !min-h-10" href={`/admin/artists/${a.id}`}>{a.status === "pending" ? "Review" : "Open"}</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
