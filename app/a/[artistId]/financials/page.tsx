import { PageHead } from "@/components/Shell";
import { requireArtist } from "@/lib/auth";

type P = { params: Promise<{ artistId: string }> };

export default async function Financials({ params }: P) {
  const { artistId } = await params;
  const { artist } = await requireArtist(artistId, ["owner", "accountant"]);
  return (
    <>
      <PageHead title="Financials">Show settlements, tour financials, payout reconciliation, and year-end exports for {artist.name}.</PageHead>
      <div className="card grid max-w-2xl justify-items-center gap-2 px-4 py-12 text-center">
        <h2 className="text-[16px]">Nothing to settle yet</h2>
        <p className="help">A settlement is generated automatically after each show once upgrades are on sale.</p>
      </div>
    </>
  );
}
