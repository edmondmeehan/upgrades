import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Following", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ConfirmFollow({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createAdminClient();
  const valid = !!db && /^[0-9a-f]{36}$/.test(token);
  const { data: before } = valid ? await db!.from("follows").select("confirmed_at, unsubscribed_at").eq("token", token).maybeSingle() : { data: null };
  const { data } = valid ? await db!.rpc("confirm_follow", { p_token: token }) : { data: null };
  const r = data as { artist_id: string; email: string } | null;
  // Newly confirmed (not a re-opened link): add them to the artist's Laylo too.
  if (r && before && (!before.confirmed_at || before.unsubscribed_at)) { const { syncFanToLaylo } = await import("@/lib/integrations"); await syncFanToLaylo(r.artist_id, r.email); }
  const { data: a } = r && db ? await db.from("artists").select("name, handle").eq("id", r.artist_id).single() : { data: null };
  return (
    <main className="mx-auto grid min-h-[60vh] max-w-[480px] content-center gap-3 px-4 py-16 text-center">
      {a ? (
        <>
          <h1 className="text-[28px]">You&apos;re following {a.name}</h1>
          <p className="muted">We&apos;ll email you when {a.name} announces new shows and VIP upgrades. Every email has a one-click unsubscribe.</p>
          <Link href={`/${a.handle}`} className="btn justify-self-center">See {a.name} VIP</Link>
        </>
      ) : (
        <><h1 className="text-[26px]">This link has expired</h1><p className="muted">Try following again from the artist&apos;s page.</p></>
      )}
    </main>
  );
}
