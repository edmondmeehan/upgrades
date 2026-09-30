import { createClient } from "@supabase/supabase-js";

/**
 * Server-only client with the service role key. Bypasses row-level security, so it's used only
 * for writes that must not come from the browser: Stripe account and card records, webhooks.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
