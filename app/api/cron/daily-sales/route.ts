import { NextResponse, type NextRequest } from "next/server";
import { sendDailyReport, yesterdayNY } from "@/lib/dailyReport";
import { markError, markOk } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel Cron calls this every morning (see vercel.json) with "Authorization: Bearer <CRON_SECRET>".
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await sendDailyReport(yesterdayNY());
    if ("skipped" in result && result.skipped === "report failed") await markError("daily-sales", "The sales report query failed.");
    else await markOk("daily-sales");
    return NextResponse.json(result);
  } catch (e) {
    await markError("daily-sales", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
