import Link from "next/link";
import { requireArtist } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { Flash } from "@/components/Flash";
import { StorefrontDesigner } from "@/components/StorefrontDesigner";
import { saveStorefront } from "./actions";

export const metadata = { title: "Storefront" };
type P = { params: Promise<{ artistId: string }>; searchParams: Promise<{ ok?: string; err?: string }> };
type Design = { brand_color: string | null; accent_color: string | null; header_image_url: string | null; avatar_url: string | null; tagline: string | null; bio: string | null };

export default async function Storefront({ params, searchParams }: P) {
  const { artistId } = await params;
  const { ok, err } = await searchParams;
  const { supabase, artist } = await requireArtist(artistId, ["owner"]);
  const { data: d } = await supabase.from("artists").select("brand_color, accent_color, header_image_url, avatar_url, tagline, bio").eq("id", artistId).single<Design>();
  return (
    <>
      <PageHead title="Storefront" aside={artist.status === "approved" ? <Link href={`/${artist.handle}`} target="_blank" className="btn btn-ghost">View live page</Link> : undefined}>
        How your page at upgrades.ontour.vip/{artist.handle} looks to fans.{artist.status !== "approved" && " It goes live once P&T approves your account."}
      </PageHead>
      <Flash ok={ok} err={err} />
      <StorefrontDesigner action={saveStorefront.bind(null, artistId)} artistId={artistId} name={artist.name} handle={artist.handle}
        initial={d ?? { brand_color: null, accent_color: null, header_image_url: null, avatar_url: null, tagline: null, bio: artist.bio }} />
    </>
  );
}
