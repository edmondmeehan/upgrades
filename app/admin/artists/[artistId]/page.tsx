import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { StatusPill } from "@/components/StatusPill";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHead } from "@/components/Shell";
import { reviewArtist, setFee, toggleManaged, openAsAdmin, loadSampleSales, clearSampleSales } from "../../actions";
import { formatDateTime, pct } from "@/lib/util";
import { ROLE_LABEL, type Artist, type MemberRole, type Submission } from "@/lib/types";

type P = { params: Promise<{ artistId: string }>; searchParams: Promise<{ ok?: string; err?: string }> };
type Audit = { id: number; action: string; created_at: string; details: Record<string, unknown>; profiles: { email: string } | null };

const linkify = (v: string) => (/^https?:\/\//.test(v) ? v : v.includes(".") ? `https://${v}` : null);
const METHOD = { code_post: "Posted or DM'd a code", domain_email: "Signed up with a domain email", third_party: "Manager, agent, or label confirmation" };

export default async function ReviewArtist({ params, searchParams }: P) {
  const { artistId } = await params;
  const { ok, err } = await searchParams;
  const { supabase } = await requireSuperAdmin();
  const { data: artist } = await supabase.from("artists").select("*").eq("id", artistId).maybeSingle<Artist>();
  if (!artist) notFound();

  const [{ data: subs }, { data: team }, { data: audit }, { count: showCount }, { count: sampleCount }] = await Promise.all([
    supabase.from("verification_submissions").select("*").eq("artist_id", artistId).order("created_at", { ascending: false }).returns<Submission[]>(),
    supabase.from("artist_members").select("role, profiles!artist_members_user_id_fkey(name, email)").eq("artist_id", artistId)
      .returns<{ role: MemberRole; profiles: { name: string | null; email: string } }[]>(),
    supabase.from("audit_log").select("id, action, created_at, details, profiles(email)").eq("artist_id", artistId)
      .order("created_at", { ascending: false }).limit(30).returns<Audit[]>(),
    supabase.from("shows").select("id", { count: "exact", head: true }).eq("artist_id", artistId),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("artist_id", artistId).eq("is_sample", true),
  ]);
  const sub = subs?.[0];
  const act = reviewArtist.bind(null, artistId);

  return (
    <>
      <PageHead crumbs={[{ href: "/admin", label: "Artists" }]} title={artist.name}
        aside={<><StatusPill status={artist.status} /><form action={openAsAdmin.bind(null, artistId)}><SubmitButton variant="ghost">Open their account</SubmitButton></form></>}>
        upgrades.ontour.vip/{artist.handle}
      </PageHead>
      <Flash ok={ok} err={err} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-6">
          <section className="panel grid gap-3">
            <h2>Verification</h2>
            {!sub ? <p className="muted">They haven&apos;t submitted verification yet.</p> : (
              <dl className="grid gap-3 sm:grid-cols-[11rem_1fr]">
                <dt className="th pt-0.5">Submitted</dt><dd>{formatDateTime(sub.created_at)} by {sub.submitter_email}</dd>
                <dt className="th pt-0.5">Website</dt><dd>{linkify(sub.website) ? <a href={linkify(sub.website)!} target="_blank" rel="noreferrer">{sub.website}</a> : sub.website}</dd>
                <dt className="th pt-0.5">Socials</dt>
                <dd className="grid gap-1">{Object.entries(sub.socials).map(([k, v]) => <span key={k}><span className="capitalize">{k}</span>: {v}</span>)}</dd>
                <dt className="th pt-0.5">Proof</dt>
                <dd>
                  {METHOD[sub.proof_method]}
                  {sub.proof_method === "code_post" && <><br />Code <strong>{sub.proof_code}</strong>{sub.proof_post_url && <> at {linkify(sub.proof_post_url) ? <a href={linkify(sub.proof_post_url)!} target="_blank" rel="noreferrer">{sub.proof_post_url}</a> : sub.proof_post_url}</>}</>}
                  {sub.proof_method === "domain_email" && <><br />{sub.submitter_email} {sub.domain_email_match ? "matches" : "does not match"} the website domain</>}
                  {sub.proof_method === "third_party" && <><br />{sub.third_party_name} ({sub.third_party_relation}), {sub.third_party_email}<br />
                    <span className={`badge mt-1 ${sub.third_party_confirmed_at ? "b-published" : "b-neutral"}`}>{sub.third_party_confirmed_at ? `Confirmed ${formatDateTime(sub.third_party_confirmed_at)}` : "Not confirmed yet"}</span></>}
                </dd>
                <dt className="th pt-0.5">Stripe identity</dt><dd className="muted">Checked by Stripe once payouts are connected (next phase)</dd>
                {sub.notes && <><dt className="th pt-0.5">Their notes</dt><dd className="whitespace-pre-line">{sub.notes}</dd></>}
                {sub.reviewer_notes && <><dt className="th pt-0.5">Review notes</dt><dd className="whitespace-pre-line">{sub.reviewer_notes}</dd></>}
              </dl>
            )}
          </section>

          {(artist.status === "pending" || artist.status === "rejected") && sub && (
            <form action={act} className="panel grid gap-4 !border-violet shadow-[0_0_0_3px_#dcd5fa]">
              <h2>Decision</h2>
              <fieldset className="grid gap-2">
                <legend className="mb-1 font-semibold">Checklist</legend>
                {[["website", "Website is real and belongs to this artist"], ["socials", "Socials are official and link to each other"],
                  ["proof", "Proof checks out"], ["stripe", "Stripe identity verified (next phase)"]].map(([k, label]) => (
                  <label key={k} className="flex items-center gap-3"><input type="checkbox" name={`check_${k}`} defaultChecked={!!sub.checklist?.[k]} className="check" disabled={k === "stripe"} />{label}</label>
                ))}
              </fieldset>
              <label className="field"><span>Notes</span><textarea className="input" name="notes" /><small>Required when requesting changes. The artist sees this.</small></label>
              <div className="flex flex-wrap gap-3">
                <SubmitButton name="decision" value="approve" variant="yellow" pendingText="Approving…">Approve and verify</SubmitButton>
                {artist.status === "pending" && <SubmitButton name="decision" value="reject" variant="danger">Request changes</SubmitButton>}
              </div>
            </form>
          )}
          {artist.status === "approved" && (
            <form action={act} className="panel flex flex-wrap items-center gap-3">
              <p className="flex-1">Verified {artist.verified_at ? formatDateTime(artist.verified_at) : ""}. Suspending takes their storefront offline.</p>
              <input type="hidden" name="notes" value="" />
              <SubmitButton name="decision" value="suspend" variant="danger" confirm={`Suspend ${artist.name}? Their storefront goes offline.`}>Suspend</SubmitButton>
            </form>
          )}
          {artist.status === "suspended" && (
            <form action={act} className="panel flex flex-wrap items-center gap-3">
              <p className="flex-1">This account is suspended.</p>
              <SubmitButton name="decision" value="reinstate" variant="dark">Reinstate</SubmitButton>
            </form>
          )}

          <section className="panel">
            <h2 className="mb-3">Activity</h2>
            {(audit ?? []).length === 0 ? <p className="muted">No activity yet.</p> : (
              <ul className="grid gap-2 text-[0.95rem]">
                {audit!.map((e) => (
                  <li key={e.id} className="grid grid-cols-[9.5rem_1fr] gap-3">
                    <span className="muted">{formatDateTime(e.created_at)}</span>
                    <span><span className="font-semibold">{e.action}</span> <span className="muted">{e.profiles?.email ?? "external link"}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="grid content-start gap-6">
          <section className="panel grid gap-2">
            <h2>Account</h2>
            <p>Storefront: {artist.status === "approved" ? <Link href={`/${artist.handle}`}>/{artist.handle}</Link> : `/${artist.handle}`}</p>
            <p>Created {formatDateTime(artist.created_at)}</p>
            <p>{showCount ?? 0} shows</p>
          </section>
          <section className="panel grid gap-2">
            <h2>Team</h2>
            {(team ?? []).map((m) => <p key={m.profiles.email}>{m.profiles.name ?? m.profiles.email}<br /><span className="help">{ROLE_LABEL[m.role]}, {m.profiles.email}</span></p>)}
          </section>
          <form action={setFee.bind(null, artistId)} className="panel grid gap-3">
            <h2>Service fee</h2>
            <p className="help">Currently {pct(artist.fee_bps)}, added on top of the artist&apos;s price.</p>
            <label className="field"><span>New fee (%)</span><input className="input" name="fee_percent" inputMode="decimal" defaultValue={artist.fee_bps / 100} /></label>
            <label className="field"><span>Reason</span><input className="input" name="note" placeholder="Launch partner rate" /></label>
            <div><SubmitButton variant="dark">Save fee</SubmitButton></div>
          </form>
          <section className="panel grid gap-3">
            <h2>Finance</h2>
            <p className="help">{sampleCount ? `${sampleCount} sample orders loaded for testing.` : "Fill this artist with realistic fake sales, refunds, disputes, and payouts to test reporting. Sample rows are labeled everywhere and can be removed."}</p>
            <div className="flex flex-wrap gap-2">
              <Link href={`/a/${artistId}/financials`} className="btn btn-dark btn-sm">Open financials</Link>
              <form action={loadSampleSales.bind(null, artistId)}><SubmitButton variant="ghost" size="sm" pendingText="Loading…">{sampleCount ? "Reload sample sales" : "Load sample sales"}</SubmitButton></form>
              {!!sampleCount && <form action={clearSampleSales.bind(null, artistId)}><SubmitButton variant="danger" size="sm" confirm="Remove all sample sales for this artist?">Remove sample</SubmitButton></form>}
            </div>
          </section>
          <form action={toggleManaged.bind(null, artistId, !artist.managed_candidate)} className="panel grid gap-3">
            <h2>Managed program</h2>
            <p className="help">{artist.managed_candidate ? "Flagged as a lead for a full-service P&T program." : "Flag artists who've outgrown self-serve."}</p>
            <div><SubmitButton variant="ghost">{artist.managed_candidate ? "Remove flag" : "Flag as managed lead"}</SubmitButton></div>
          </form>
        </aside>
      </div>
    </>
  );
}
