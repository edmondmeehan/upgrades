import Link from "next/link";
import { requireArtist, canEditShows, isOwnerish } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { PageHead } from "@/components/Shell";
import { StatusPill } from "@/components/StatusPill";
import type { Submission } from "@/lib/types";
import { Walkthrough } from "@/components/Walkthrough";
import { walkthroughSteps } from "@/lib/walkthrough";
import { finishWalkthrough } from "./actions";

type P = { params: Promise<{ artistId: string }>; searchParams: Promise<{ ok?: string; err?: string; tour?: string }> };

export default async function Overview({ params, searchParams }: P) {
  const { artistId } = await params;
  const { ok, err, tour } = await searchParams;
  const { supabase, artist, role, profile, user } = await requireArtist(artistId);
  const base = `/a/${artistId}`;

  const [{ count: tourCount }, { count: showCount }, { count: publishedCount }, { data: sub }, { data: pay }] = await Promise.all([
    supabase.from("tours").select("id", { count: "exact", head: true }).eq("artist_id", artistId),
    supabase.from("shows").select("id", { count: "exact", head: true }).eq("artist_id", artistId),
    supabase.from("shows").select("id", { count: "exact", head: true }).eq("artist_id", artistId).eq("status", "published"),
    isOwnerish(role)
      ? supabase.from("verification_submissions").select("*").eq("artist_id", artistId).order("created_at", { ascending: false }).limit(1).maybeSingle<Submission>()
      : Promise.resolve({ data: null }),
    supabase.from("artist_stripe").select("charges_enabled, payouts_enabled, card_last4").eq("artist_id", artistId)
      .maybeSingle<{ charges_enabled: boolean; payouts_enabled: boolean; card_last4: string | null }>(),
  ]);

  // First-time walkthrough (or replay with ?tour=1).
  const [{ data: me }, { count: pkgCount }, { data: design }] = await Promise.all([
    supabase.from("profiles").select("walkthrough_done_at").eq("id", user.id).single<{ walkthrough_done_at: string | null }>(),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("artist_id", artistId).eq("is_sample", false),
    supabase.from("artists").select("brand_color, header_image_url").eq("id", artistId).single<{ brand_color: string | null; header_image_url: string | null }>(),
  ]);
  const walkthrough = (tour || !me?.walkthrough_done_at) ? (
    <Walkthrough finish={finishWalkthrough} steps={walkthroughSteps({
      base, artistName: artist.name, firstName: profile.name?.split(" ")[0] ?? null, role, approved: artist.status === "approved",
      hasShows: (showCount ?? 0) > 0, hasPackages: (pkgCount ?? 0) > 0, paymentsReady: !!(pay?.charges_enabled && pay?.payouts_enabled),
      hasDesign: !!(design?.brand_color || design?.header_image_url),
    })} />
  ) : null;

  const head = (
    <>
      {walkthrough}
      <PageHead title={artist.name} eyebrow="Overview"
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`${base}?tour=1`} className="btn btn-text btn-sm">Take the tour</Link>
            {artist.status === "approved" ? <Link href={`/${artist.handle}`} className="btn btn-ghost">View storefront</Link> : <StatusPill status={artist.status} />}
          </div>
        } />
    </>
  );

  if (role === "accountant") {
    return (
      <>
        {head}
        <Flash ok={ok} err={err} />
        <div className="panel grid max-w-2xl gap-4">
          <p>You have read-only access to {artist.name}&apos;s money: show settlements, tour financials, payouts, and year-end exports.</p>
          <div><Link href={`${base}/financials`} className="btn btn-dark">Open financials</Link></div>
        </div>
      </>
    );
  }

  const submitted = ["pending", "approved", "rejected", "suspended"].includes(artist.status);
  const steps = [
    { done: true, label: "Create your artist account" },
    { done: submitted, label: "Submit verification", href: isOwnerish(role) ? `${base}/verification` : undefined },
    { done: artist.status === "approved" || artist.status === "suspended", label: "Get approved by P&T" },
    { done: !!(pay?.charges_enabled && pay?.payouts_enabled), label: "Connect Stripe to get paid", href: isOwnerish(role) ? `${base}/payments` : undefined },
    { done: (tourCount ?? 0) > 0, label: "Add a tour", href: canEditShows(role) ? `${base}/tours` : undefined },
    { done: (publishedCount ?? 0) > 0, label: "Publish a show", href: canEditShows(role) ? `${base}/tours` : undefined },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <>
      {head}
      <Flash ok={ok} err={err} />
      {artist.status === "rejected" && sub?.reviewer_notes && (
        <div className="alert alert-red flex-col">
          <span className="font-extrabold">P&amp;T needs a few changes</span>
          <span className="whitespace-pre-line font-medium">{sub.reviewer_notes}</span>
          {isOwnerish(role) && <Link href={`${base}/verification`} className="btn btn-sm mt-1">Update and resubmit</Link>}
        </div>
      )}
      {artist.status === "suspended" && (
        <div className="alert alert-red">Your storefront is offline. Contact P&amp;T at help.please.co to sort this out.</div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2>Getting to your first sale</h2>
            <span className="muted text-[13px] font-semibold">{doneCount} of {steps.length} done</span>
          </div>
          <div className="mb-5 h-2 overflow-hidden rounded bg-[#eceaf2]"><i className="block h-full rounded bg-violet" style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
          <ol className="grid">
            {steps.map((s, i) => (
              <li key={s.label} className="flex items-center gap-3 border-t border-line py-3 first:border-t-0">
                <span aria-hidden className={`grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-extrabold ${s.done ? "bg-yellow text-ink" : "bg-paper text-mute"}`}>
                  {s.done ? "✓" : i + 1}
                </span>
                <span className={`flex-1 ${s.done ? "text-mute" : "font-semibold"}`}>{s.label}</span>
                {!s.done && s.href ? <Link href={s.href} className="btn btn-sm">Start</Link> : null}
                <span className="sr-only">{s.done ? "Done" : "Not done"}</span>
              </li>
            ))}
          </ol>
        </section>
        <aside className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="stat"><b>{tourCount ?? 0}</b><span>Tours</span></div>
            <div className="stat"><b>{showCount ?? 0}</b><span>Shows</span></div>
          </div>
          <div className="card p-5">
            <p className="eyebrow">Storefront</p>
            {artist.status === "approved"
              ? <Link href={`/${artist.handle}`} className="mt-1 block break-all">upgrades.ontour.vip/{artist.handle}</Link>
              : <p className="mt-1 text-[14px]"><span className="font-semibold">upgrades.ontour.vip/{artist.handle}</span><span className="muted block">Goes live after approval. Published shows appear there automatically.</span></p>}
          </div>
        </aside>
      </div>
    </>
  );
}
