import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCheckinEmails } from "@/lib/checkinEmail";

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
  for (const { show_id } of (data ?? []) as { show_id: string }[]) results.push({ show_id, ...(await sendCheckinEmails(show_id, "details")) });
  return NextResponse.json({ shows: results.length, results });
}
