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

  // "Launch your VIP": the steps from sign-up to first sale, each linking to where it's done.
  const [{ count: liveVip }, { count: orderCount }] = await Promise.all([
    supabase.from("show_products").select("id, shows!inner(status, show_date)", { count: "exact", head: true }).eq("artist_id", artistId).eq("active", true).eq("is_sample", false)
      .eq("shows.status", "published").gte("shows.show_date", new Date().toISOString().slice(0, 10)),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("artist_id", artistId).eq("is_sample", false).eq("is_comp", false),
  ]);
  const approved = artist.status === "approved" || artist.status === "suspended";
  const owner = isOwnerish(role), editor = canEditShows(role);
  const steps = [
    { done: approved, label: "Get verified", note: artist.status === "pending" ? "P&T is reviewing it, usually within a business day." : "Prove you're really " + artist.name + " so your storefront can go live.", href: owner ? `${base}/verification` : undefined, cta: artist.status === "pending" ? "See status" : "Get verified", minutes: 3 },
    { done: !!(pay?.charges_enabled && pay?.payouts_enabled), label: "Set up payouts", note: "Connect Stripe so fan payments land in your bank.", href: owner ? `${base}/payments` : undefined, cta: "Set up payouts", minutes: 5 },
    { done: (showCount ?? 0) > 0 && (pkgCount ?? 0) > 0, label: "Add your tour and VIP packages", note: "Dates, packages and prices in one guided setup.", href: editor ? `${base}/launch` : undefined, cta: "Set up a tour", minutes: 5 },
    { done: !!(design?.brand_color || design?.header_image_url), label: "Make your storefront yours", note: "Your colors, a header photo and genres.", href: owner ? `${base}/storefront` : undefined, cta: "Design it", minutes: 2 },
    { done: (liveVip ?? 0) > 0, label: "Publish a show with VIP on sale", note: "Shows need a city and venue to publish.", href: editor ? `${base}/tours` : undefined, cta: "Publish", minutes: 1 },
    { done: (orderCount ?? 0) > 0, label: "Share your link and make your first sale", note: `upgrades.ontour.vip/${artist.handle}`, href: approved ? `/${artist.handle}` : undefined, cta: "Open storefront", minutes: 1 },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  const next = steps.find((x) => !x.done && x.href);
  const allDone = doneCount === steps.length;

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
        {allDone ? (
          <section className="card grid gap-3 p-6">
            <p className="eyebrow">You&apos;re live</p>
            <h2 className="text-[24px]">VIP is on sale at {liveVip} show{liveVip === 1 ? "" : "s"}</h2>
            <p className="muted">Keep sharing your link, and check Orders and Fans as sales come in.</p>
            <div className="flex flex-wrap gap-2">
              <Link href={`/${artist.handle}`} className="btn">Open storefront</Link>
              {editor && <Link href={`${base}/orders`} className="btn btn-ghost">Orders</Link>}
              {editor && <Link href={`${base}/launch`} className="btn btn-ghost">Set up another tour</Link>}
            </div>
          </section>
        ) : (
          <section className="card grid gap-5 p-6">
            <div className="flex items-center justify-between gap-3">
              <h2>Launch your VIP</h2>
              <span className="muted text-[13px] font-semibold">{doneCount} of {steps.length} done</span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-[#eceaf2]"><i className="block h-full rounded bg-violet" style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
            {next && (
              <div className="grid gap-2 rounded-2xl bg-navy p-5 text-white">
                <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-yellow">Next step, about {next.minutes} min</p>
                <p className="text-[20px] font-extrabold">{next.label}</p>
                <p className="text-[14px] text-[#d9d5e6]">{next.note}</p>
                <Link href={next.href!} className="btn btn-yellow mt-1 justify-self-start">{next.cta}</Link>
              </div>
            )}
            <ol className="grid">
              {steps.map((x, i) => (
                <li key={x.label} className="flex items-center gap-3 border-t border-line py-3 first:border-t-0">
                  <span aria-hidden className={`grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-extrabold ${x.done ? "bg-yellow text-ink" : "bg-paper text-mute"}`}>{x.done ? "✓" : i + 1}</span>
                  <span className="min-w-0 flex-1"><span className={`block ${x.done ? "text-mute" : "font-semibold"}`}>{x.label}</span>
                    {!x.done && <span className="block truncate text-[13px] text-mute">{x.note}</span>}</span>
                  {!x.done && x.href && x !== next ? <Link href={x.href} className="btn btn-ghost btn-sm">{x.cta}</Link> : null}
                  <span className="sr-only">{x.done ? "Done" : "Not done"}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
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
