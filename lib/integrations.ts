import { createAdminClient } from "@/lib/supabase/admin";
import { tzForRegion } from "@/lib/timezones";

type Provider = "bandsintown" | "laylo";

async function getIntegration(artistId: string, provider: Provider) {
  const db = createAdminClient();
  if (!db) return null;
  const { data } = await db.from("artist_integrations").select("settings, secret").eq("artist_id", artistId).eq("provider", provider).maybeSingle();
  return data as { settings: Record<string, string>; secret: string | null } | null;
}

export async function recordIntegration(artistId: string, provider: Provider, ok: boolean, error?: string, add = 0) {
  const db = createAdminClient();
  if (!db) return;
  const now = new Date().toISOString();
  if (ok) {
    const { data } = await db.from("artist_integrations").select("synced_count").eq("artist_id", artistId).eq("provider", provider).maybeSingle();
    await db.from("artist_integrations").update({ last_ok_at: now, last_error: null, synced_count: (data?.synced_count ?? 0) + add }).eq("artist_id", artistId).eq("provider", provider);
  } else {
    await db.from("artist_integrations").update({ last_error: (error ?? "failed").slice(0, 300), last_error_at: now }).eq("artist_id", artistId).eq("provider", provider);
  }
}

// ── Laylo ─────────────────────────────────────────────────────
/** Raw call: subscribe one email to an artist's Laylo (optionally to a specific Drop). */
async function layloCall(key: string, email: string, dropId?: string, ip?: string) {
  const res = await fetch("https://laylo.com/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      query: "mutation($email: String, $productId: String, $ipAddress: String) { subscribeToUser(email: $email, productId: $productId, ipAddress: $ipAddress) }",
      variables: { email, ...(dropId ? { productId: dropId } : {}), ...(ip ? { ipAddress: ip } : {}) },
    }),
  });
  const j = (await res.json().catch(() => ({}))) as { data?: { subscribeToUser?: boolean }; errors?: { message: string }[] };
  if (!res.ok || j.errors?.length || j.data?.subscribeToUser === false) throw new Error(j.errors?.[0]?.message ?? `Laylo said ${res.status}`);
}

/** Adds a fan who agreed to news to the artist's Laylo, if Laylo is connected. Never throws. */
export async function syncFanToLaylo(artistId: string, email: string, ip?: string) {
  const i = await getIntegration(artistId, "laylo");
  if (!i?.secret || !email) return;
  try { await layloCall(i.secret, email, i.settings.drop_id || undefined, ip); await recordIntegration(artistId, "laylo", true, undefined, 1); }
  catch (e) { await recordIntegration(artistId, "laylo", false, (e as Error).message); }
}

/** One-time backfill: every confirmed follower and opted-in buyer. Returns how many went through. */
export async function backfillLaylo(artistId: string) {
  const db = createAdminClient();
  const i = await getIntegration(artistId, "laylo");
  if (!db || !i?.secret) return { sent: 0, failed: 0, error: "Laylo isn't connected." };
  const [{ data: follows }, { data: fans }] = await Promise.all([
    db.from("follows").select("email").eq("artist_id", artistId).not("confirmed_at", "is", null).is("unsubscribed_at", null),
    db.from("fans").select("email").eq("artist_id", artistId).not("marketing_opt_in_at", "is", null),
  ]);
  const emails = [...new Set([...(follows ?? []), ...(fans ?? [])].map((r) => r.email.toLowerCase()))].slice(0, 2000);
  let sent = 0, failed = 0, last = "";
  for (const e of emails) {
    try { await layloCall(i.secret, e, i.settings.drop_id || undefined); sent++; } catch (err) { failed++; last = (err as Error).message; }
  }
  await recordIntegration(artistId, "laylo", sent > 0 || failed === 0, failed ? last : undefined, sent);
  return { sent, failed, error: failed ? last : undefined };
}

// ── Bandsintown ───────────────────────────────────────────────
export type BitEvent = {
  id: string; datetime: string; title?: string; url?: string;
  venue: { name?: string; city?: string; region?: string; country?: string; latitude?: string; longitude?: string; street_address?: string; postal_code?: string };
};

const COUNTRY: Record<string, string> = {
  "united states": "US", usa: "US", "united kingdom": "GB", uk: "GB", "great britain": "GB", england: "GB", scotland: "GB", wales: "GB", "northern ireland": "GB",
  ireland: "IE", canada: "CA", australia: "AU", "new zealand": "NZ", germany: "DE", france: "FR", spain: "ES", italy: "IT", netherlands: "NL", belgium: "BE",
  austria: "AT", portugal: "PT", finland: "FI", greece: "GR", luxembourg: "LU", sweden: "SE", norway: "NO", denmark: "DK", switzerland: "CH", poland: "PL",
  "czech republic": "CZ", czechia: "CZ", japan: "JP", mexico: "MX", brazil: "BR",
};
const COUNTRY_TZ: Record<string, string> = {
  GB: "Europe/London", IE: "Europe/Dublin", DE: "Europe/Berlin", FR: "Europe/Paris", ES: "Europe/Madrid", IT: "Europe/Rome", NL: "Europe/Amsterdam", BE: "Europe/Brussels",
  AT: "Europe/Vienna", PT: "Europe/Lisbon", FI: "Europe/Helsinki", GR: "Europe/Athens", LU: "Europe/Luxembourg", SE: "Europe/Stockholm", NO: "Europe/Oslo",
  DK: "Europe/Copenhagen", CH: "Europe/Zurich", PL: "Europe/Warsaw", CZ: "Europe/Prague", JP: "Asia/Tokyo", NZ: "Pacific/Auckland", AU: "Australia/Sydney",
};
export const countryCode = (c?: string) => (c ? (c.length === 2 ? c.toUpperCase() : COUNTRY[c.trim().toLowerCase()] ?? "US") : "US");
export const tzFor = (region: string | undefined, country: string) => (region && tzForRegion(region, country)) || COUNTRY_TZ[country] || "America/New_York";

/** Upcoming events from Bandsintown for one artist, using the artist's own API key (app_id). */
export async function fetchBandsintown(artistName: string, key: string): Promise<BitEvent[]> {
  const res = await fetch(`https://rest.bandsintown.com/artists/${encodeURIComponent(artistName)}/events?app_id=${encodeURIComponent(key)}&date=upcoming`, { cache: "no-store" });
  if (res.status === 403 || res.status === 401) throw new Error("Bandsintown didn't accept that API key.");
  if (res.status === 404) throw new Error("Bandsintown doesn't know that artist name. Use the exact name from your Bandsintown profile.");
  if (!res.ok) throw new Error(`Bandsintown said ${res.status}.`);
  const j = await res.json();
  if (!Array.isArray(j)) throw new Error(typeof j?.errorMessage === "string" ? j.errorMessage : "Bandsintown didn't return a list of events.");
  return j as BitEvent[];
}

export { getIntegration };
