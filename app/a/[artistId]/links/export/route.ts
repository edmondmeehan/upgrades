import { requireArtist } from "@/lib/auth";
import { exportCsv, isPlatform } from "@/lib/linkExport";
import { exportShows } from "../data";

/** CSV of VIP links for one platform (or everything), for the person who runs that platform. */
export async function GET(req: Request, { params }: { params: Promise<{ artistId: string }> }) {
  const { artistId } = await params;
  const { supabase, artist } = await requireArtist(artistId, ["owner", "rep"]);
  const u = new URL(req.url);
  const p = u.searchParams.get("p");
  const platform = isPlatform(p) ? p : "all";
  const shows = await exportShows(supabase, artistId, u.searchParams.get("tour"));
  return new Response(exportCsv(platform, artist, shows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${artist.handle}-vip-links-${platform}.csv"`, "Cache-Control": "no-store" },
  });
}
