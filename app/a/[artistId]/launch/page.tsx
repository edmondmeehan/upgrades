import { requireArtist } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { Flash } from "@/components/Flash";
import { LaunchWizard } from "@/components/LaunchWizard";
import { sellingBlockers } from "@/lib/readiness";
import { launchTour, previewBandsintown } from "./actions";

export const metadata = { title: "Set up a tour" };
export const dynamic = "force-dynamic";

export default async function Launch({ params, searchParams }: { params: Promise<{ artistId: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { artistId } = await params;
  const { ok, err } = await searchParams;
  const { supabase, artist } = await requireArtist(artistId, ["owner", "rep"]);
  const [{ data: st }, blockers] = await Promise.all([
    supabase.rpc("integration_status", { p_artist: artistId }),
    sellingBlockers(supabase, artistId, artist.status),
  ]);
  return (
    <div className="grid max-w-4xl gap-5">
      <PageHead title="Set up a tour">Dates, VIP packages and prices in five quick steps. Everything can be changed afterwards.</PageHead>
      <Flash ok={ok} err={err} />
      <LaunchWizard artistName={artist.name} hasBandsintown={((st ?? []) as { provider: string }[]).some((s) => s.provider === "bandsintown")}
        blockers={blockers.map((b) => b.label)} importBit={previewBandsintown.bind(null, artistId)} submit={launchTour.bind(null, artistId)} />
    </div>
  );
}
