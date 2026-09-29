import Link from "next/link";
import { requireArtist, canEditShows, isOwnerish } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { StatusPill } from "@/components/Laminate";
import type { Submission } from "@/lib/types";

type P = { params: Promise<{ artistId: string }>; searchParams: Promise<{ ok?: string; err?: string }> };

export default async function Overview({ params, searchParams }: P) {
  const { artistId } = await params;
  const { ok, err } = await searchParams;
  const { supabase, artist, role } = await requireArtist(artistId);
  const base = `/a/${artistId}`;

  const [{ count: tourCount }, { count: showCount }, { count: publishedCount }, { data: sub }] = await Promise.all([
    supabase.from("tours").select("id", { count: "exact", head: true }).eq("artist_id", artistId),
    supabase.from("shows").select("id", { count: "exact", head: true }).eq("artist_id", artistId),
    supabase.from("shows").select("id", { count: "exact", head: true }).eq("artist_id", artistId).eq("status", "published"),
    isOwnerish(role)
      ? supabase.from("verification_submissions").select("*").eq("artist_id", artistId).order("created_at", { ascending: false }).limit(1).maybeSingle<Submission>()
      : Promise.resolve({ data: null }),
  ]);

  const submitted = ["pending", "approved", "rejected", "suspended"].includes(artist.status);
  const steps = [
    { done: true, label: "Create your artist account" },
    { done: submitted, label: "Submit verification", href: isOwnerish(role) ? `${base}/verification` : undefined },
    { done: artist.status === "approved" || artist.status === "suspended", label: "Get approved by P&T" },
    { done: false, label: "Connect Stripe and add a card on file", later: true },
    { done: (tourCount ?? 0) > 0, label: "Add a tour", href: canEditShows(role) ? `${base}/tours` : undefined },
    { done: (publishedCount ?? 0) > 0, label: "Publish a show", href: canEditShows(role) ? `${base}/tours` : undefined },
  ];

  if (role === "accountant") {
    return (
      <div className="max-w-2xl">
        <Flash ok={ok} err={err} />
        <h2>Welcome</h2>
        <p className="mt-2">You have read-only access to {artist.name}&apos;s money: show settlements, tour financials, payouts, and year-end exports.</p>
        <Link href={`${base}/financials`} className="btn btn-dark mt-6">Open financials</Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div>
        <Flash ok={ok} err={err} />
        {artist.status === "rejected" && sub?.reviewer_notes && (
          <div className="mb-6 rounded-xl border-2 border-rope bg-card p-4">
            <p className="font-display text-lg font-semibold text-rope">P&amp;T needs a few changes</p>
            <p className="mt-1 whitespace-pre-line">{sub.reviewer_notes}</p>
            {isOwnerish(role) && <Link href={`${base}/verification`} className="btn btn-primary mt-4">Update and resubmit</Link>}
          </div>
        )}
        {artist.status === "suspended" && (
          <div className="mb-6 rounded-xl border-2 border-rope bg-card p-4">
            <p className="font-display text-lg font-semibold text-rope">Your storefront is offline</p>
            <p className="mt-1">Contact P&amp;T at <a href="https://help.please.co">help.please.co</a> to sort this out.</p>
          </div>
        )}
        <h2 className="mb-4">Getting to your first sale</h2>
        <ol className="grid gap-2">
          {steps.map((s, i) => (
            <li key={s.label} className="flex items-center gap-3 rounded-xl border-[1.5px] border-line bg-card px-4 py-3">
              <span aria-hidden className={`grid size-8 shrink-0 place-items-center rounded-full border-2 font-display font-bold ${s.done ? "border-stage bg-yellow" : "border-line text-mute"}`}>
                {s.done ? "✓" : i + 1}
              </span>
              <span className={`flex-1 ${s.done ? "text-mute line-through decoration-1" : "font-semibold"}`}>{s.label}</span>
              {s.later ? <span className="muted text-sm">Coming soon</span>
                : !s.done && s.href ? <Link href={s.href} className="text-[0.95rem] font-semibold">Start</Link> : null}
              <span className="sr-only">{s.done ? "Done" : "Not done"}</span>
            </li>
          ))}
        </ol>
      </div>
      <aside className="grid content-start gap-4">
        <div className="panel sm:hidden"><p className="muted text-sm">Account status</p><StatusPill status={artist.status} /></div>
        <div className="panel grid grid-cols-2 gap-4">
          <div><p className="font-display text-3xl font-bold">{tourCount ?? 0}</p><p className="muted">Tours</p></div>
          <div><p className="font-display text-3xl font-bold">{showCount ?? 0}</p><p className="muted">Shows</p></div>
        </div>
        <div className="panel">
          <p className="font-semibold">Your storefront</p>
          {artist.status === "approved"
            ? <Link href={`/${artist.handle}`}>upgrades.ontour.vip/{artist.handle}</Link>
            : <p className="muted">upgrades.ontour.vip/{artist.handle} goes live after approval. Published shows appear there automatically.</p>}
        </div>
      </aside>
    </div>
  );
}
