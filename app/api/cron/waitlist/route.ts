import { NextResponse, type NextRequest } from "next/server";
import { sweepWaitlists } from "@/lib/waitlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily (see vercel.json): catch spots that opened without a refund or edit, e.g. checkouts that timed out.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ emailed: await sweepWaitlists() });
}
