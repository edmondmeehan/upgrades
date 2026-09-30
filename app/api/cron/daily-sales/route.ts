import { NextResponse, type NextRequest } from "next/server";
import { sendDailyReport, yesterdayNY } from "@/lib/dailyReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel Cron calls this every morning (see vercel.json) with "Authorization: Bearer <CRON_SECRET>".
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await sendDailyReport(yesterdayNY());
  return NextResponse.json(result);
}
