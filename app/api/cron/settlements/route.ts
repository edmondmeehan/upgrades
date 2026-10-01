import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSettlement } from "@/lib/settlement";
import { markError, markOk } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily (see vercel.json): statements for shows that ended yesterday (in their own time zone) or earlier this week.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "not configured" }, { status: 503 });
  try {
    const { data } = await db.rpc("due_settlements");
    const results = [];
    for (const { show_id } of (data ?? []) as { show_id: string }[]) results.push({ show_id, ...(await sendSettlement(show_id)) });
    const failed = results.filter((r) => !r.sent && r.error && r.error !== "No owner or accountant to send to.");
    if (failed.length) await markError("settlements", `${failed.length} statement(s) didn't send: ${failed.map((f) => f.error).join("; ")}`);
    else await markOk("settlements");
    return NextResponse.json({ shows: results.length, results });
  } catch (e) {
    await markError("settlements", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
