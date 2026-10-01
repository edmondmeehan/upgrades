import { notFound } from "next/navigation";
import { requireArtist } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { CheckInApp } from "@/components/CheckInApp";
import { formatDate } from "@/lib/util";
import { checkInCode, undoCheckIn, getGuestList, syncCheckIns } from "../actions";

export const metadata = { title: "Check-in" };
export const dynamic = "force-dynamic";
type P = { params: Promise<{ artistId: string; showId: string }> };

export default async function CheckIn({ params }: P) {
  const { artistId, showId } = await params;
  const { supabase } = await requireArtist(artistId, ["owner", "rep", "door"]);
  const { data: show } = await supabase.from("shows").select("id, show_date, city, region, venue_name").eq("id", showId).eq("artist_id", artistId).maybeSingle();
  if (!show) notFound();
  const guests = await getGuestList(artistId, showId);
  return (
    <div className="grid max-w-3xl gap-5">
      <PageHead crumbs={[{ href: `/a/${artistId}/check-in`, label: "Check-in" }]} title={`${show.city ?? "Show"}${show.region ? `, ${show.region}` : ""}`}>
        {formatDate(show.show_date)}{show.venue_name ? `, ${show.venue_name}` : ""}. Keep this page open: if the signal drops, scanning keeps working and syncs later.
      </PageHead>
      <CheckInApp showId={showId} initial={guests}
        checkOnline={checkInCode.bind(null, artistId, showId)} undoOnline={undoCheckIn.bind(null, artistId, showId)}
        fetchList={getGuestList.bind(null, artistId, showId)} sync={syncCheckIns.bind(null, artistId, showId)} />
    </div>
  );
}
