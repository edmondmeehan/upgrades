import { requireArtist } from "@/lib/auth";
import { storeUrl } from "@/lib/storefront";

const cell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Every upcoming published date in Seated's bulk-upload format, with a "VIP" promoted-onsale button. */
export async function GET(_req: Request, { params }: { params: Promise<{ artistId: string }> }) {
  const { artistId } = await params;
  const { supabase, artist } = await requireArtist(artistId, ["owner", "rep"]);
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase.from("shows").select("slug, show_date, city, region, country, venue_name, tours(name)")
    .eq("artist_id", artistId).eq("status", "published").gte("show_date", today).order("show_date");
  const head = ["Event Start Date", "Event End Date", "Additional Info", "Venue Name", "Venue City", "Button label", "Link Url", "Promoted Onsale Name", "Promoted Onsale Link Url"];
  const rows = ((data ?? []) as unknown as { slug: string; show_date: string; city: string | null; region: string | null; country: string; venue_name: string | null; tours: { name: string } | null }[])
    .map((s) => [s.show_date, s.show_date, s.tours?.name ?? "", s.venue_name ?? "", [s.city, s.region ?? (s.country !== "US" ? s.country : null)].filter(Boolean).join(", "), "", "", "VIP", storeUrl(artist.handle, s.slug)].map(cell).join(","));
  return new Response([head.map(cell).join(","), ...rows].join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${artist.handle}-seated-vip.csv"` },
  });
}
