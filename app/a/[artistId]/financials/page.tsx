import { requireArtist } from "@/lib/auth";

type P = { params: Promise<{ artistId: string }> };

export default async function Financials({ params }: P) {
  const { artistId } = await params;
  const { artist } = await requireArtist(artistId, ["owner", "accountant"]);
  return (
    <div className="max-w-2xl">
      <h2>Financials</h2>
      <p className="mt-2">Show settlements, tour financials, payout reconciliation, and year-end exports for {artist.name} will live here.</p>
      <div className="panel mt-6 border-dashed">
        <p className="font-semibold">Nothing to settle yet</p>
        <p className="muted">A settlement is generated automatically after each show once upgrades are on sale.</p>
      </div>
    </div>
  );
}
