import { Suspense } from "react";
import { requireArtist } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { FinanceNav } from "@/components/FinanceNav";
import { yearsWithData } from "@/lib/finance";

export default async function FinanceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ artistId: string }> }) {
  const { artistId } = await params;
  const { supabase, artist } = await requireArtist(artistId, ["owner", "accountant"]);
  const [years, { count: sampleCount }] = await Promise.all([
    yearsWithData(supabase, artistId),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("artist_id", artistId).eq("is_sample", true),
  ]);
  return (
    <>
      <PageHead title="Financials" eyebrow={artist.name}
        aside={sampleCount ? <span className="badge b-verified">Sample data</span> : undefined}>
        Settlements, tour totals, payouts, and year-end exports. Amounts come from Stripe once payments are live.
      </PageHead>
      <Suspense><FinanceNav base={`/a/${artistId}/financials`} years={years} /></Suspense>
      {children}
    </>
  );
}
