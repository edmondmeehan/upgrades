import { notFound } from "next/navigation";
import { requireArtist } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { Flash } from "@/components/Flash";
import { PackageForm } from "@/components/PackageForm";
import { SubmitButton } from "@/components/SubmitButton";
import type { Product, ShowProduct } from "@/lib/packages";
import { savePackage, archivePackage } from "../actions";
import { loadFormShows } from "../data";

export const metadata = { title: "VIP package" };
type P = { params: Promise<{ artistId: string; productId: string }>; searchParams: Promise<{ ok?: string; err?: string }> };

export default async function EditPackage({ params, searchParams }: P) {
  const { artistId, productId } = await params;
  const { ok, err } = await searchParams;
  const { supabase, artist } = await requireArtist(artistId, ["owner", "rep"]);
  const { data: p } = await supabase.from("products").select("*").eq("id", productId).eq("artist_id", artistId).maybeSingle<Product>();
  if (!p) notFound();
  const { data: first } = await supabase.from("show_products").select("*").eq("product_id", productId).limit(1).maybeSingle<ShowProduct>();
  const shows = await loadFormShows(supabase, artistId, { productId, defaultPrice: first ? first.price_cents / 100 : 100, defaultCapacity: first?.capacity ?? 30 });
  const onSale = shows.filter((s) => s.selected).length;

  return (
    <div className="grid max-w-4xl gap-6">
      <PageHead crumbs={[{ href: `/a/${artistId}/packages`, label: "VIP packages" }]} title={p.name}
        aside={p.archived_at ? <span className="badge b-archived">Archived</span> : <span className={`badge ${onSale ? "b-published" : "b-neutral"}`}>{onSale ? `On sale at ${onSale} show${onSale === 1 ? "" : "s"}` : "Not on sale"}</span>}>
        {artist.status === "approved" ? "Changes show on your storefront right away." : "Fans can see this once P&T approves your account."}
      </PageHead>
      <Flash ok={ok} err={err} />
      <PackageForm action={savePackage.bind(null, artistId, productId)} artistId={artistId} shows={shows} submitLabel="Save changes"
        initial={{ kind: p.kind, name: p.name, description: p.description ?? "", included: p.included ?? [], includes_photo: p.includes_photo, image_url: p.image_url,
          on_sale_at: first?.on_sale_at ?? null, off_sale_at: first?.off_sale_at ?? null, presale_code: first?.presale_code ?? null }} />
      <form action={archivePackage.bind(null, artistId, productId, !p.archived_at)} className="border-t border-line pt-6">
        {p.archived_at
          ? <SubmitButton variant="ghost">Restore package</SubmitButton>
          : <SubmitButton variant="danger" confirm="Take this package off sale at every show? Existing buyers keep their upgrades.">Archive package</SubmitButton>}
      </form>
    </div>
  );
}
