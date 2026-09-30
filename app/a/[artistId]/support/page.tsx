import Link from "next/link";
import { requireArtist } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { SubmitButton } from "@/components/SubmitButton";
import { TOPICS } from "@/lib/support";
import { setSupportStatus } from "./actions";

export const metadata = { title: "Fan support" };
type P = { params: Promise<{ artistId: string }>; searchParams: Promise<{ view?: string }> };
type R = { id: string; name: string; email: string; topic: string; message: string; status: string; created_at: string; confirmation_code: string | null; order_id: string | null };

export default async function SupportInbox({ params, searchParams }: P) {
  const { artistId } = await params;
  const { view } = await searchParams;
  const { supabase, artist } = await requireArtist(artistId, ["owner", "rep"]);
  const resolved = view === "resolved";
  const [{ data }, { count: openCount }, { data: a }] = await Promise.all([
    supabase.from("support_requests").select("*").eq("artist_id", artistId).eq("status", resolved ? "resolved" : "open")
      .order("created_at", { ascending: resolved ? false : true }).limit(100).returns<R[]>(),
    supabase.from("support_requests").select("id", { count: "exact", head: true }).eq("artist_id", artistId).eq("status", "open"),
    supabase.from("artists").select("support_email").eq("id", artistId).single<{ support_email: string | null }>(),
  ]);
  const when = (d: string) => new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <>
      <PageHead title="Fan support">
        Messages from fans through your storefront and order pages. Each one is also emailed to {a?.support_email ?? "your account email"}.{" "}
        <Link href={`/a/${artistId}/settings`}>Change where they go</Link>.
      </PageHead>
      <nav className="pill-nav" aria-label="Filter">
        <Link href={`/a/${artistId}/support`} aria-current={!resolved ? "page" : undefined}>Open{openCount ? ` (${openCount})` : ""}</Link>
        <Link href={`/a/${artistId}/support?view=resolved`} aria-current={resolved ? "page" : undefined}>Resolved</Link>
      </nav>
      {(data ?? []).length === 0 ? (
        <div className="card grid justify-items-center gap-2 px-4 py-12 text-center">
          <h2 className="text-[16px]">{resolved ? "Nothing resolved yet" : "No open messages"}</h2>
          <p className="help">Fans reach you from the Fan Support button on <Link href={`/${artist.handle}`}>your storefront</Link>.</p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {data!.map((r) => {
            const subject = encodeURIComponent(`Re: ${TOPICS[r.topic] ?? "Your message"}${r.confirmation_code ? ` (${r.confirmation_code})` : ""}`);
            return (
              <li key={r.id} className="card grid gap-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold">{r.name} <span className="font-medium text-mute">{r.email}</span></p>
                    <p className="help">{TOPICS[r.topic] ?? r.topic}, {when(r.created_at)}{r.confirmation_code ? `, ${r.confirmation_code}` : ""}{r.confirmation_code && !r.order_id ? " (not found)" : ""}</p>
                  </div>
                  {r.status === "open" ? <span className="badge b-pending">Open</span> : <span className="badge b-neutral">Resolved</span>}
                </div>
                <p className="whitespace-pre-wrap text-[15px]">{r.message}</p>
                <div className="flex flex-wrap gap-2">
                  <a href={`mailto:${r.email}?subject=${subject}`} className="btn btn-sm">Reply by email</a>
                  <form action={setSupportStatus.bind(null, artistId, r.id, r.status === "open")}>
                    <SubmitButton size="sm" variant="ghost">{r.status === "open" ? "Mark resolved" : "Reopen"}</SubmitButton>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
