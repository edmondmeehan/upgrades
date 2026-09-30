import Link from "next/link";
import { notFound } from "next/navigation";
import { StoreHero, ShowCard } from "@/components/StorefrontParts";
import { cityOf, loadStore, storeUrl, theme } from "@/lib/storefront";
import { formatDate } from "@/lib/util";

type P = { params: Promise<{ handle: string; slug: string }> };

async function load(params: P["params"]) {
  const { handle, slug } = await params;
  const s = await loadStore(handle);
  const sh = s?.shows.find((x) => x.slug === slug);
  return s && sh ? { s, sh } : null;
}

export async function generateMetadata({ params }: P) {
  const r = await load(params);
  if (!r) return { title: "Not found" };
  const { s, sh } = r;
  const title = `${s.name} VIP: ${cityOf(sh)}, ${formatDate(sh.date, { month: "short", day: "numeric" })}`;
  const description = sh.packages.length ? `VIP upgrades at ${sh.venue}: ${sh.packages.map((p) => p.name).join(", ")}.` : `VIP upgrades for ${s.name} at ${sh.venue}.`;
  return {
    title, description, alternates: { canonical: storeUrl(s.handle, sh.slug) },
    openGraph: { title, description, url: storeUrl(s.handle, sh.slug), type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ShowStore({ params }: P) {
  const r = await load(params);
  if (!r) notFound();
  const { s, sh } = r;
  const t = theme(s);
  const others = s.shows.filter((x) => x.slug !== sh.slug).length;
  return (
    <div className="min-h-screen bg-white">
      <StoreHero s={s} t={t} compact />
      <main className="home-wrap grid gap-6 py-8">
        <ul className="grid gap-5"><ShowCard sh={sh} s={s} t={t} linkTitle={false} /></ul>
        {others > 0 && <Link href={`/${s.handle}`} className="btn btn-ghost justify-self-start">See all {others + 1} {s.name} shows</Link>}
      </main>
    </div>
  );
}
