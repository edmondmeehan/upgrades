import { requireArtist } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { submitVerification } from "../actions";
import { formatDateTime } from "@/lib/util";
import type { Submission } from "@/lib/types";

type P = { params: Promise<{ artistId: string }>; searchParams: Promise<{ ok?: string; err?: string }> };

const SOCIALS = [
  ["instagram", "Instagram", "@yourband"], ["tiktok", "TikTok", "@yourband"], ["x", "X", "@yourband"],
  ["facebook", "Facebook", "facebook.com/yourband"], ["youtube", "YouTube", "youtube.com/@yourband"], ["spotify", "Spotify", "Artist link"],
] as const;

const host = (u: string | null) => (u ?? "").toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[/:?#].*$/, "").replace(/^www\./, "");

export default async function Verification({ params, searchParams }: P) {
  const { artistId } = await params;
  const { ok, err } = await searchParams;
  const { supabase, artist, profile } = await requireArtist(artistId, ["owner"]);
  const { data: last } = await supabase.from("verification_submissions").select("*").eq("artist_id", artistId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle<Submission>();

  const locked = artist.status === "approved" || artist.status === "suspended";
  const emailDomain = profile.email.split("@")[1] ?? "";
  const site = host(last?.website ?? artist.website);
  const domainMatch = !!site && (emailDomain === site || emailDomain.endsWith(`.${site}`));
  const prev = last ?? null;

  return (
    <div className="max-w-3xl">
      <Flash ok={ok} err={err} />
      <h2>Verification</h2>
      <p className="mt-2">
        Before your storefront goes live, we confirm you&apos;re really {artist.name}. This protects your fans from fake upgrade pages.
        There&apos;s no size minimum. Verified artists get a badge on their storefront.
      </p>

      {prev && (
        <div className="panel mt-6">
          <p className="font-semibold">
            {{ pending: "In review", approved: "Approved", rejected: "Changes requested", superseded: "Replaced" }[prev.status]}
            <span className="muted font-normal"> since {formatDateTime(prev.decided_at ?? prev.created_at)}</span>
          </p>
          {prev.status === "pending" && prev.proof_method === "third_party" && (
            <p className="mt-1">{prev.third_party_confirmed_at ? `${prev.third_party_name} confirmed.` : `Waiting for ${prev.third_party_name} (${prev.third_party_email}) to confirm from the email we sent.`}</p>
          )}
          {prev.reviewer_notes && prev.status !== "approved" && <p className="mt-2 whitespace-pre-line"><span className="font-semibold">P&amp;T notes: </span>{prev.reviewer_notes}</p>}
        </div>
      )}

      {locked ? (
        <p className="panel mt-6">Your account is verified. To change your official website or socials, contact P&amp;T at <a href="https://help.please.co">help.please.co</a>.</p>
      ) : (
        <form action={submitVerification.bind(null, artistId)} className="mt-6 grid gap-6">
          <fieldset className="panel grid gap-4">
            <legend className="font-display text-xl font-semibold">Official links</legend>
            <label className="field"><span>Official website</span><input className="input" name="website" required defaultValue={prev?.website ?? artist.website ?? ""} placeholder="yourband.com" /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              {SOCIALS.map(([k, label, ph]) => (
                <label key={k} className="field"><span>{label}</span><input className="input" name={k} placeholder={ph} defaultValue={prev?.socials?.[k] ?? ""} /></label>
              ))}
            </div>
            <p className="muted text-sm">Add at least one. We check that these link to each other.</p>
          </fieldset>

          <fieldset className="grid gap-3">
            <legend className="mb-2 font-display text-xl font-semibold">Proof it&apos;s you</legend>
            <p className="muted -mt-1 mb-1">Pick one. Stripe will also check your identity when you connect payouts.</p>

            <label className="group panel grid cursor-pointer gap-3 has-[:checked]:border-stage">
              <span className="flex items-start gap-3">
                <input type="radio" name="proof_method" value="code_post" required defaultChecked={!prev || prev.proof_method === "code_post"} className="mt-1 size-5 accent-stage" />
                <span><span className="font-semibold">Post or DM a code from your official account</span><br /><span className="muted">Fastest for most artists.</span></span>
              </span>
              <span className="hidden gap-3 pl-8 group-has-[:checked]:grid">
                <span>Post this code as a story or post, or DM it to <strong>@pleaseandthankyou</strong> on Instagram:</span>
                <span className="w-fit rounded-lg border-2 border-dashed border-stage bg-yellow px-4 py-2 font-display text-2xl font-bold tracking-wider">{artist.verification_code}</span>
                <span className="field"><span>Link to the post, or the account you DM&apos;d from</span><input className="input" name="proof_post_url" defaultValue={prev?.proof_post_url ?? ""} /></span>
              </span>
            </label>

            <label className={`group panel grid gap-3 has-[:checked]:border-stage ${domainMatch ? "cursor-pointer" : "opacity-60"}`}>
              <span className="flex items-start gap-3">
                <input type="radio" name="proof_method" value="domain_email" disabled={!domainMatch} defaultChecked={domainMatch && prev?.proof_method === "domain_email"} className="mt-1 size-5 accent-stage" />
                <span>
                  <span className="font-semibold">I signed up with an email on our website&apos;s domain</span><br />
                  <span className="muted">
                    {domainMatch ? `${profile.email} matches ${site}.` : `You're signed in as ${profile.email}${site ? `, which isn't on ${site}` : ""}. Save your website first, or pick another option.`}
                  </span>
                </span>
              </span>
            </label>

            <label className="group panel grid cursor-pointer gap-3 has-[:checked]:border-stage">
              <span className="flex items-start gap-3">
                <input type="radio" name="proof_method" value="third_party" defaultChecked={prev?.proof_method === "third_party"} className="mt-1 size-5 accent-stage" />
                <span><span className="font-semibold">Have my manager, agent, or label confirm</span><br /><span className="muted">We email them a link to confirm with one click.</span></span>
              </span>
              <span className="hidden gap-4 pl-8 group-has-[:checked]:grid sm:grid-cols-2">
                <span className="field"><span>Their name</span><input className="input" name="third_party_name" defaultValue={prev?.third_party_name ?? ""} /></span>
                <span className="field"><span>Their work email</span><input className="input" type="email" name="third_party_email" defaultValue={prev?.third_party_email ?? ""} /></span>
                <span className="field sm:col-span-2"><span>Relationship</span>
                  <select className="input" name="third_party_relation" defaultValue={prev?.third_party_relation ?? "manager"}>
                    <option value="manager">Manager</option><option value="agent">Agent</option><option value="label">Label</option>
                  </select>
                </span>
              </span>
            </label>
          </fieldset>

          <label className="field"><span>Anything we should know?</span><textarea className="input" name="notes" defaultValue={prev?.notes ?? ""} /></label>
          <div><SubmitButton pendingText="Submitting…">{prev ? "Resubmit for review" : "Submit for review"}</SubmitButton></div>
        </form>
      )}
    </div>
  );
}
