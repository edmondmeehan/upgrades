import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Following", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ConfirmFollow({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createAdminClient();
  const { data } = db && /^[0-9a-f]{36}$/.test(token) ? await db.rpc("confirm_follow", { p_token: token }) : { data: null };
  const r = data as { artist_id: string } | null;
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
