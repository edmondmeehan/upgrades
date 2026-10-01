import { requireArtist } from "@/lib/auth";

const cell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export async function GET(req: Request, { params }: { params: Promise<{ artistId: string }> }) {
  const { artistId } = await params;
  const { supabase, artist } = await requireArtist(artistId, ["owner", "rep"]);
  const list = new URL(req.url).searchParams.get("list") === "followers" ? "followers" : "superfans";
  let head: string[], lines: string[];
  if (list === "followers") {
    const { data } = await supabase.from("follows").select("email, name, region, source, created_at, confirmed_at").eq("artist_id", artistId).not("confirmed_at", "is", null).is("unsubscribed_at", null).order("created_at");
    head = ["Email", "Name", "State", "Joined from", "Followed on"];
    lines = (data ?? []).map((f) => [f.email, f.name, f.region, f.source === "checkout" ? "Checkout opt-in" : "Storefront", f.created_at.slice(0, 10)].map(cell).join(","));
  } else {
    const { data } = await supabase.rpc("superfans", { p_artist: artistId });
    head = ["Email", "Name", "Spent ($)", "Orders", "Passes", "Shows attended", "First order", "Last order", "Last city", "Opted in to news", "Follows you"];
    lines = ((data ?? []) as Record<string, unknown>[]).map((f) => [f.email, f.name, (Number(f.spent_cents) / 100).toFixed(2), f.orders, f.passes, f.shows_attended,
      String(f.first_order_at).slice(0, 10), String(f.last_order_at).slice(0, 10), f.last_city, f.opted_in ? "Yes" : "No", f.following ? "Yes" : "No"].map(cell).join(","));
  }
  const name = `${artist.handle}-${list}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response([head.map(cell).join(","), ...lines].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
}
