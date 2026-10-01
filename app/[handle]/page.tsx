import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { StoreHero, TourDates, ArtistDisclaimer } from "@/components/StorefrontParts";
import { loadStore, storeUrl, theme } from "@/lib/storefront";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const s = await loadStore((await params).handle);
  if (!s) return { title: "Not found" };
  const description = s.tagline ?? `VIP upgrades for ${s.name} shows.`;
  return {
    title: `${s.name} VIP upgrades`, description,
    alternates: { canonical: storeUrl(s.handle) },
    openGraph: { title: `${s.name} VIP upgrades`, description, url: storeUrl(s.handle), type: "website" },
    twitter: { card: "summary_large_image", title: `${s.name} VIP upgrades`, description },
  };
}

export default async function Storefront({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: Promise<{ followed?: string; follow_err?: string }> }) {
  const s = await loadStore((await params).handle);
  const sp = await searchParams;
  if (!s) notFound();
  const t = theme(s);
  const withPkgs = s.shows.filter((sh) => sh.packages.length > 0).length;
  return (
    <div className="min-h-screen bg-white">
      <StoreHero s={s} t={t} follow={{ state: sp.followed, err: sp.follow_err }} />
      <main className="home-wrap py-8">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[22px]">Tour dates</h2>
          <p className="help" aria-live="polite">{s.shows.length} upcoming show{s.shows.length === 1 ? "" : "s"}{withPkgs ? `, ${withPkgs} with VIP` : ""}</p>
        </div>
        {s.shows.length === 0 ? (
          <div className="grid justify-items-center gap-2 px-4 py-12 text-center">
            <span className="grid size-13 place-items-center rounded-full bg-paper"><Icon name="calendar" size={24} /></span>
            <h2 className="text-[16px]">No upcoming shows yet</h2>
            <p className="help">Check back soon.</p>
          </div>
        ) : (
          <TourDates s={s} t={t} />
        )}
      </main>
      <ArtistDisclaimer name={s.name} handle={s.handle} />
    </div>
  );
}
