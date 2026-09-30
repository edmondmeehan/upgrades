import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { StatusPill } from "@/components/StatusPill";
import { PageHead } from "@/components/Shell";
import { formatDateTime, pct } from "@/lib/util";
import type { Artist, ArtistStatus } from "@/lib/types";

export const metadata = { title: "P&T admin" };
type P = { searchParams: Promise<{ status?: string; q?: string }> };
const FILTERS: { key: string; label: string }[] = [
  { key: "pending", label: "Needs review" }, { key: "approved", label: "Approved" }, { key: "draft", label: "Not submitted" },
  { key: "rejected", label: "Changes requested" }, { key: "suspended", label: "Suspended" }, { key: "all", label: "All" },
];

export default async function Admin({ searchParams }: P) {
  const { supabase } = await requireSuperAdmin();
  const { status = "pending", q = "" } = await searchParams;

  let query = supabase.from("artists").select("*, verification_submissions(created_at, proof_method, third_party_confirmed_at, status)")
    .order("created_at", { ascending: false }).limit(200);
  if (status !== "all") query = query.eq("status", status as ArtistStatus);
  if (q) query = query.or(`name.ilike.%${q.replace(/[%,()]/g, "")}%,handle.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const { data } = await query.returns<(Artist & { verification_submissions: { created_at: string; proof_method: string; third_party_confirmed_at: string | null; status: string }[] })[]>();

  const { data: counts } = await supabase.from("artists").select("status").returns<{ status: ArtistStatus }[]>();
  const tally = (s: string) => (s === "all" ? counts?.length ?? 0 : counts?.filter((c) => c.status === s).length ?? 0);

  return (
    <>
      <PageHead title="Artists" eyebrow="P&T admin" />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav className="pill-nav" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <Link key={f.key} href={`/admin?status=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              aria-current={status === f.key ? "page" : undefined} className="gap-1.5 !no-underline">
              {f.label} <span className="opacity-60">{tally(f.key)}</span>
            </Link>
          ))}
        </nav>
        <form className="flex gap-2" action="/admin">
          <input type="hidden" name="status" value={status} />
          <input className="input input-sm w-56" name="q" defaultValue={q} placeholder="Search name or handle" aria-label="Search artists" />
          <button className="btn btn-ghost btn-sm !h-10" type="submit">Search</button>
        </form>
      </div>

      {(data ?? []).length === 0 ? (
        <p className="card px-4 py-12 text-center muted">{status === "pending" ? "No artists waiting for review." : "No artists match."}</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="list min-w-[44rem]">
            <thead>
              <tr><th className="!pt-4">Artist</th><th className="!pt-4">Status</th><th className="!pt-4">Latest submission</th><th className="!pt-4">Fee</th><th className="!pt-4"><span className="sr-only">Open</span></th></tr>
            </thead>
            <tbody>
              {data!.map((a) => {
                const sub = [...a.verification_submissions].sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
                return (
                  <tr key={a.id}>
                    <td><span className="font-bold">{a.name}</span>{a.managed_candidate && <span className="badge b-lilac ml-2">Managed lead</span>}<br /><span className="muted text-[13px]">/{a.handle}</span></td>
                    <td><StatusPill status={a.status} /></td>
                    <td className="text-[14px]">
                      {sub ? <>{formatDateTime(sub.created_at)}<br /><span className="muted text-[13px]">{{ code_post: "Posted code", domain_email: "Domain email", third_party: sub.third_party_confirmed_at ? "Contact confirmed" : "Awaiting contact" }[sub.proof_method]}</span></> : <span className="muted">None</span>}
                    </td>
                    <td>{pct(a.fee_bps)}</td>
                    <td className="text-right"><Link className="btn btn-ghost btn-sm" href={`/admin/artists/${a.id}`}>{a.status === "pending" ? "Review" : "Open"}</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
