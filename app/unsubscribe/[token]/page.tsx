import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Unsubscribed", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Unsubscribe({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createAdminClient();
  const { data } = db && /^[0-9a-f]{36}$/.test(token) ? await db.rpc("unsubscribe_follow", { p_token: token }) : { data: null };
  const r = data as { artist_id: string; email: string } | null;
  const { data: a } = r && db ? await db.from("artists").select("name, handle").eq("id", r.artist_id).single() : { data: null };
  return (
    <main className="mx-auto grid min-h-[60vh] max-w-[480px] content-center gap-3 px-4 py-16 text-center">
      <h1 className="text-[28px]">You&apos;re unsubscribed</h1>
      <p className="muted">{a ? `${r!.email} won't get any more announcements from ${a.name}.` : "You won't get any more announcements."} Order confirmations and check-in details for anything you buy will still arrive.</p>
      {a && <Link href={`/${a.handle}#follow`} className="btn btn-ghost justify-self-center">Changed your mind? Follow again</Link>}
    </main>
  );
}
