import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCheckinEmails } from "@/lib/checkinEmail";
import { markError, markOk } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily (see vercel.json): sends check-in details for every show that's within its "days before" window.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const { data } = await db.rpc("due_checkin_shows");
  const results = [];
  try {
    for (const { show_id } of (data ?? []) as { show_id: string }[]) results.push({ show_id, ...(await sendCheckinEmails(show_id, "details")) });
  } catch (e) {
    await markError("checkin-emails", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  const failed = results.filter((r) => r.error && r.sent === 0 && r.total > 0);
  if (failed.length) await markError("checkin-emails", `${failed.length} show(s) didn't send: ${failed.map((f) => f.error).join("; ")}`);
  else await markOk("checkin-emails");
  return NextResponse.json({ shows: results.length, results });
}
