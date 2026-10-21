import { storeUrl } from "@/lib/storefront";

/** Where a link will be posted. Each gets its own tracking tag so sales can be traced to it later. */
export const PLATFORMS = {
  bandsintown: {
    label: "Bandsintown", source: "bandsintown",
    steps: ["In Bandsintown for Artists, open each event and add a ticket link.", "Set the link type to VIP and paste that date's link below.", "Keep the regular Tickets link on the event as well; Bandsintown needs one."],
  },
  seated: {
    label: "Seated", source: "seated",
    steps: ["Send the Seated CSV to Seated support (or your Seated contact) for a bulk upload.", "Each date gets a \"VIP\" promoted onsale button pointing to its link.", "For one or two dates, add the link as a promoted onsale on the date instead."],
  },
  laylo: {
    label: "Laylo", source: "laylo",
    steps: ["Create a Drop per show (or one for the tour) and use the link as the Drop's destination.", "Use the storefront link for a tour-wide Drop.", "Fans who RSVP get the link straight to that show's VIP."],
  },
  linkinbio: {
    label: "Link in bio", source: "linkinbio",
    steps: ["Add the storefront link to Linktree, Instagram, TikTok or your website.", "For a featured show, add that date's link as its own button."],
  },
} as const;
export type Platform = keyof typeof PLATFORMS;
export const isPlatform = (p: unknown): p is Platform => typeof p === "string" && p in PLATFORMS;

export type ExportShow = { slug: string; show_date: string; show_time: string | null; city: string | null; region: string | null; country: string; venue_name: string | null; tours: { name: string } | null };

const tag = (url: string, source: string) => `${url}${url.includes("?") ? "&" : "?"}utm_source=${source}&utm_medium=referral&utm_campaign=vip`;
export const showLink = (handle: string, slug: string, p: Platform) => tag(storeUrl(handle, slug), PLATFORMS[p].source);
export const storeLink = (handle: string, p: Platform) => tag(storeUrl(handle), PLATFORMS[p].source);
export const place = (s: ExportShow) => [s.city, s.region ?? (s.country !== "US" ? (s.country === "GB" ? "UK" : s.country) : null)].filter(Boolean).join(", ");
export const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const cell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";

/** CSV in the shape each platform's team works with. */
export function exportCsv(p: Platform | "all", artist: { name: string; handle: string }, shows: ExportShow[]) {
  if (p === "seated") return csv([
    ["Event Start Date", "Event End Date", "Additional Info", "Venue Name", "Venue City", "Button label", "Link Url", "Promoted Onsale Name", "Promoted Onsale Link Url"],
    ...shows.map((s) => [s.show_date, s.show_date, s.tours?.name ?? "", s.venue_name ?? "", place(s), "", "", "VIP", showLink(artist.handle, s.slug, "seated")]),
  ]);
  if (p === "bandsintown") return csv([
    ["Date", "Time", "Venue", "City", "Region", "Country", "Link type", "VIP link"],
    ...shows.map((s) => [s.show_date, s.show_time?.slice(0, 5) ?? "", s.venue_name ?? "", s.city ?? "", s.region ?? "", s.country, "VIP", showLink(artist.handle, s.slug, "bandsintown")]),
  ]);
  if (p === "laylo") return csv([
    ["Drop name", "Date", "City", "Venue", "Link"],
    [`${artist.name} VIP: all dates`, "", "", "", storeLink(artist.handle, "laylo")],
    ...shows.map((s) => [`${artist.name} VIP: ${place(s)}, ${shortDate(s.show_date)}`, s.show_date, place(s), s.venue_name ?? "", showLink(artist.handle, s.slug, "laylo")]),
  ]);
  if (p === "linkinbio") return csv([
    ["Button title", "Link"],
    [`${artist.name} VIP upgrades`, storeLink(artist.handle, "linkinbio")],
    ...shows.map((s) => [`VIP: ${place(s)}, ${shortDate(s.show_date)}`, showLink(artist.handle, s.slug, "linkinbio")]),
  ]);
  return csv([
    ["Date", "City", "Region", "Country", "Venue", "Tour", "Link (no tracking)", ...Object.values(PLATFORMS).map((x) => `${x.label} link`)],
    ...shows.map((s) => [s.show_date, s.city ?? "", s.region ?? "", s.country, s.venue_name ?? "", s.tours?.name ?? "", storeUrl(artist.handle, s.slug),
      ...(Object.keys(PLATFORMS) as Platform[]).map((k) => showLink(artist.handle, s.slug, k))]),
  ]);
}
