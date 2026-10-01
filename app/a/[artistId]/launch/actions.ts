"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireArtist } from "@/lib/auth";
import { fetchBandsintown, getIntegration, countryCode, tzFor } from "@/lib/integrations";
import { isValidTimeZone } from "@/lib/timezones";
import { slugify, withMsg } from "@/lib/util";

export type WizardShow = { show_date: string; city: string; region: string; venue_name: string; country: string; timezone: string; doors_time: string; show_time: string; address?: string; postal_code?: string; bit_event_id?: string; lat?: number | null; lng?: number | null };
export type WizardPackage = { kind: string; name: string; description: string; included: string[]; includes_photo: boolean; price: string; capacity: string; currency_prices: Record<string, string> };
export type WizardPayload = { tour_name: string; shows: WizardShow[]; packages: WizardPackage[]; on_sale: "now" | "later"; on_sale_at: string; publish: boolean };

const D = /^\d{4}-\d{2}-\d{2}$/, T = /^\d{2}:\d{2}$/;
const cents = (v: string) => Math.round(Number(String(v).replace(/[$£€,\s]/g, "")) * 100);
const clean = (v: unknown, max = 160) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Wizard step 1: Bandsintown dates as wizard rows (nothing saved yet). */
export async function previewBandsintown(artistId: string): Promise<{ rows: WizardShow[]; error?: string }> {
  await requireArtist(artistId, ["owner", "rep"]);
  const i = await getIntegration(artistId, "bandsintown");
  if (!i?.secret) return { rows: [], error: "Connect Bandsintown on the Integrations page first." };
  try {
    const events = await fetchBandsintown(i.settings.artist_name, i.secret);
    return { rows: events.filter((e) => D.test((e.datetime ?? "").slice(0, 10))).map((e) => {
      const country = countryCode(e.venue?.country), region = e.venue?.region?.trim() ?? "";
      const t = (e.datetime ?? "").slice(11, 16);
      return { show_date: e.datetime.slice(0, 10), city: e.venue?.city ?? "", region, venue_name: e.venue?.name ?? "", country, timezone: tzFor(region || undefined, country),
        doors_time: "", show_time: T.test(t) && t !== "00:00" ? t : "", address: e.venue?.street_address ?? "", postal_code: e.venue?.postal_code ?? "",
        bit_event_id: String(e.id), lat: e.venue?.latitude ? Number(e.venue.latitude) : null, lng: e.venue?.longitude ? Number(e.venue.longitude) : null };
    }) };
  } catch (e) { return { rows: [], error: (e as Error).message }; }
}

/** Wizard finish: creates the tour, its dates, the packages, and puts every package on every date. */
export async function launchTour(artistId: string, fd: FormData) {
  const { supabase, user } = await requireArtist(artistId, ["owner", "rep"]);
  const back = `/a/${artistId}/launch`;
  let p: WizardPayload;
  try { p = JSON.parse(String(fd.get("payload") ?? "")); } catch { redirect(withMsg(back, "err", "Something went wrong reading the form. Try again.")); }
  const shows = (p.shows ?? []).filter((s) => D.test(s.show_date)).slice(0, 250);
  const pkgs = (p.packages ?? []).filter((k) => k.name?.trim()).slice(0, 8);
  if (!shows.length) redirect(withMsg(back, "err", "Add at least one date."));
  if (!pkgs.length) redirect(withMsg(back, "err", "Pick at least one VIP package."));
  for (const k of pkgs) {
    if (!(cents(k.price) >= 100)) redirect(withMsg(back, "err", `Give "${k.name}" a price of at least 1.`));
    if (!(Math.floor(Number(k.capacity)) >= 1)) redirect(withMsg(back, "err", `Give "${k.name}" a quantity of at least 1.`));
  }
  const onSaleAt = p.on_sale === "later" && p.on_sale_at ? new Date(p.on_sale_at).toISOString() : null;
  if (p.on_sale === "later" && (!onSaleAt || Number.isNaN(new Date(onSaleAt).getTime()))) redirect(withMsg(back, "err", "Pick when VIP goes on sale."));

  const { data: tour, error: tErr } = await supabase.from("tours").insert({ artist_id: artistId, name: clean(p.tour_name, 160) ?? "Tour", created_by: user.id }).select("id").single();
  if (tErr || !tour) redirect(withMsg(back, "err", "Couldn't create the tour."));

  const { data: taken } = await supabase.from("shows").select("slug").eq("artist_id", artistId);
  const used = new Set((taken ?? []).map((r) => r.slug));
  const showRows = shows.map((s) => {
    const city = clean(s.city, 120), venue = clean(s.venue_name, 160);
    let slug = `${s.show_date}-${slugify(city ?? "") || "tbd"}`;
    for (let n = 2; used.has(slug); n++) slug = `${s.show_date}-${slugify(city ?? "") || "tbd"}-${n}`;
    used.add(slug);
    const country = (clean(s.country, 2) ?? "US").toUpperCase();
    return {
      artist_id: artistId, tour_id: tour.id, created_by: user.id, slug, show_date: s.show_date, city, region: clean(s.region, 60), venue_name: venue, country,
      status: p.publish && city && venue ? "published" : "draft",
      timezone: isValidTimeZone(s.timezone) ? s.timezone : tzFor(s.region || undefined, country),
      doors_time: T.test(s.doors_time) ? s.doors_time : null, show_time: T.test(s.show_time) ? s.show_time : null,
      address: clean(s.address, 200), postal_code: clean(s.postal_code, 20), bit_event_id: clean(s.bit_event_id, 40),
      latitude: typeof s.lat === "number" ? s.lat : null, longitude: typeof s.lng === "number" ? s.lng : null,
    };
  });
  const { data: savedShows, error: sErr } = await supabase.from("shows").insert(showRows).select("id, status");
  if (sErr || !savedShows) redirect(withMsg(`/a/${artistId}/tours/${tour.id}`, "err", `The tour was created, but the dates didn't save: ${sErr?.message ?? "unknown error"}`));

  const productRows = pkgs.map((k) => ({
    artist_id: artistId, name: k.name.trim().slice(0, 120), kind: k.kind || "custom", description: clean(k.description, 1000),
    included: (k.included ?? []).map((x) => String(x).trim()).filter(Boolean).slice(0, 20), includes_photo: !!k.includes_photo,
    default_price_cents: cents(k.price), default_capacity: Math.floor(Number(k.capacity)),
    currency_prices: Object.fromEntries(Object.entries(k.currency_prices ?? {}).map(([c, v]) => [c, cents(v)]).filter(([c, v]) => ["gbp", "eur", "cad", "aud"].includes(c as string) && (v as number) >= 100)),
  }));
  const { data: products, error: pErr } = await supabase.from("products").insert(productRows).select("id, default_capacity, default_price_cents");
  if (pErr || !products) redirect(withMsg(`/a/${artistId}/tours/${tour.id}`, "err", `Dates saved, but the packages didn't: ${pErr?.message ?? "unknown error"}`));

  // Every package at every date, on the package defaults (the database fills each show's price in its currency).
  const sp = savedShows.flatMap((s) => products.map((pr) => ({
    artist_id: artistId, show_id: s.id, product_id: pr.id, price_cents: pr.default_price_cents, capacity: pr.default_capacity,
    uses_default_price: true, uses_default_capacity: true, active: true, on_sale_at: onSaleAt,
  })));
  const { error: spErr } = await supabase.from("show_products").insert(sp);
  if (spErr) redirect(withMsg(`/a/${artistId}/tours/${tour.id}`, "err", `Dates and packages saved, but linking them failed: ${spErr.message}`));

  revalidatePath(`/a/${artistId}`);
  const published = savedShows.filter((s) => s.status === "published").length, drafts = savedShows.length - published;
  redirect(withMsg(`/a/${artistId}/tours/${tour.id}`, "ok",
    `Your tour is set up: ${savedShows.length} date${savedShows.length === 1 ? "" : "s"} and ${products.length} VIP package${products.length === 1 ? "" : "s"}.${published ? ` ${published} published.` : ""}${drafts ? ` ${drafts} saved as draft${drafts === 1 ? "" : "s"} (add a city and venue to publish).` : ""}`));
}
