import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Left the waitlist", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function LeaveWaitlist({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createAdminClient();
  const { data } = db && /^[0-9a-f]{36}$/.test(token) ? await db.rpc("leave_waitlist", { p_token: token }) : { data: null };
  return (
    <main className="mx-auto grid min-h-[60vh] max-w-[480px] content-center gap-3 px-4 py-16 text-center">
      <h1 className="text-[28px]">{data ? "You've left the waitlist" : "This link has expired"}</h1>
      <p className="muted">{data ? "You won't get any more emails about spots for this package." : "You may have already left the waitlist."}</p>
    </main>
  );
}
