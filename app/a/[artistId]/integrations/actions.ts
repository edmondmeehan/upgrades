"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireArtist } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { backfillLaylo, countryCode, fetchBandsintown, getIntegration, recordIntegration, tzFor } from "@/lib/integrations";
import { slugify, withMsg } from "@/lib/util";

const back = (id: string) => `/a/${id}/integrations`;

export async function connectBandsintown(artistId: string, fd: FormData) {
  const { user } = await requireArtist(artistId, ["owner", "rep"]);
  const name = String(fd.get("artist_name") ?? "").trim().slice(0, 120), key = String(fd.get("api_key") ?? "").trim().slice(0, 200);
  if (!name || !key) redirect(withMsg(back(artistId), "err", "Add your Bandsintown artist name and API key."));
  let count = 0;
  try { count = (await fetchBandsintown(name, key)).length; }
  catch (e) { redirect(withMsg(back(artistId), "err", (e as Error).message)); }
  const db = createAdminClient()!;
  await db.from("artist_integrations").upsert({ artist_id: artistId, provider: "bandsintown", settings: { artist_name: name }, secret: key, connected_by: user.id, connected_at: new Date().toISOString(), last_error: null });
  revalidatePath(back(artistId));
  redirect(withMsg(back(artistId), "ok", `Connected. Bandsintown has ${count} upcoming date${count === 1 ? "" : "s"} for ${name}.`));
}

/** Pulls upcoming Bandsintown dates in as draft shows on a tour. Skips dates already here. */
export async function importBandsintown(artistId: string, fd: FormData) {
  const { supabase, user } = await requireArtist(artistId, ["owner", "rep"]);
  const i = await getIntegration(artistId, "bandsintown");
  if (!i?.secret) redirect(withMsg(back(artistId), "err", "Connect Bandsintown first."));
  let tourId = String(fd.get("tour_id") ?? "");
  if (tourId === "new") {
    const name = String(fd.get("new_tour") ?? "").trim().slice(0, 120) || "Tour";
    const { data: t, error } = await supabase.from("tours").insert({ artist_id: artistId, name, created_by: user.id }).select("id").single();
    if (error || !t) redirect(withMsg(back(artistId), "err", "Couldn't create the tour."));
    tourId = t.id;
  }
  let events;
  try { events = await fetchBandsintown(i.settings.artist_name, i.secret); }
  catch (e) { await recordIntegration(artistId, "bandsintown", false, (e as Error).message); redirect(withMsg(back(artistId), "err", (e as Error).message)); }

  const { data: existing } = await supabase.from("shows").select("id, slug, show_date, city, bit_event_id").eq("artist_id", artistId);
  const have = existing ?? [];
  const taken = new Set(have.map((s) => s.slug));
  const rows = [];
  let linked = 0;
  for (const e of events) {
    const date = (e.datetime ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (have.some((s) => s.bit_event_id === String(e.id))) continue;
    const city = e.venue?.city?.trim() || null;
    // Same date and city already here (added by hand): link it instead of adding a duplicate.
    const match = have.find((s) => !s.bit_event_id && s.show_date === date && (s.city ?? "").toLowerCase() === (city ?? "").toLowerCase());
    if (match) { await supabase.from("shows").update({ bit_event_id: String(e.id) }).eq("id", match.id); linked++; continue; }
    const country = countryCode(e.venue?.country);
    const region = e.venue?.region?.trim() || null;
    let slug = `${date}-${slugify(city ?? "") || "tbd"}`;
    for (let n = 2; taken.has(slug); n++) slug = `${date}-${slugify(city ?? "") || "tbd"}-${n}`;
    taken.add(slug);
    const time = (e.datetime ?? "").slice(11, 16);
    rows.push({
      artist_id: artistId, tour_id: tourId, created_by: user.id, status: "draft", show_date: date, slug, city, region,
      venue_name: e.venue?.name?.trim() || null, country, timezone: tzFor(region ?? undefined, country),
      show_time: /^\d{2}:\d{2}$/.test(time) && time !== "00:00" ? time : null,
      address: e.venue?.street_address ?? null, postal_code: e.venue?.postal_code ?? null,
      latitude: e.venue?.latitude ? Number(e.venue.latitude) : null, longitude: e.venue?.longitude ? Number(e.venue.longitude) : null,
      bit_event_id: String(e.id),
    });
  }
  if (rows.length) {
    const { error } = await supabase.from("shows").insert(rows);
    if (error) { await recordIntegration(artistId, "bandsintown", false, error.message); redirect(withMsg(back(artistId), "err", `Couldn't save the dates: ${error.message}`)); }
  }
  await recordIntegration(artistId, "bandsintown", true, undefined, rows.length);
  revalidatePath(back(artistId));
  const parts = [`${rows.length} new date${rows.length === 1 ? "" : "s"} added as drafts`, ...(linked ? [`${linked} matched to shows you already had`] : [])];
  redirect(withMsg(rows.length ? `/a/${artistId}/tours/${tourId}` : back(artistId), "ok", `${parts.join(", ")}.${rows.length ? " Review them, then publish." : ""}`));
}

export async function connectLaylo(artistId: string, fd: FormData) {
  const { user } = await requireArtist(artistId, ["owner"]);
  const key = String(fd.get("api_key") ?? "").trim().slice(0, 300), drop = String(fd.get("drop_id") ?? "").trim().slice(0, 100);
  const db = createAdminClient()!;
  const cur = await getIntegration(artistId, "laylo");
  if (!key && !cur?.secret) redirect(withMsg(back(artistId), "err", "Paste your Laylo API key."));
  await db.from("artist_integrations").upsert({ artist_id: artistId, provider: "laylo", settings: drop ? { drop_id: drop } : {}, secret: key || cur!.secret, connected_by: user.id, connected_at: new Date().toISOString() });
  revalidatePath(back(artistId));
  redirect(withMsg(back(artistId), "ok", "Laylo connected. New opt-ins will sync automatically."));
}

export async function syncLaylo(artistId: string) {
  await requireArtist(artistId, ["owner"]);
  const r = await backfillLaylo(artistId);
  revalidatePath(back(artistId));
  redirect(withMsg(back(artistId), r.failed && !r.sent ? "err" : "ok", r.failed && !r.sent ? `Laylo didn't accept them: ${r.error}` : `Sent ${r.sent} fan${r.sent === 1 ? "" : "s"} to Laylo.${r.failed ? ` ${r.failed} failed (${r.error}).` : ""}`));
}

export async function disconnect(artistId: string, provider: "bandsintown" | "laylo") {
  await requireArtist(artistId, provider === "laylo" ? ["owner"] : ["owner", "rep"]);
  await createAdminClient()!.from("artist_integrations").delete().eq("artist_id", artistId).eq("provider", provider);
  revalidatePath(back(artistId));
  redirect(withMsg(back(artistId), "ok", `${provider === "laylo" ? "Laylo" : "Bandsintown"} disconnected and the key deleted.`));
}
