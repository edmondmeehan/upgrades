import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// One-click unsubscribe (RFC 8058): mail apps POST here from their "Unsubscribe" button.
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createAdminClient();
  if (db && /^[0-9a-f]{36}$/.test(token)) await db.rpc("unsubscribe_follow", { p_token: token });
  return NextResponse.json({ ok: true });
}
