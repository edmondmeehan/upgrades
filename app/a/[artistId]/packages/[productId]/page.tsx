import { notFound } from "next/navigation";
import { requireArtist } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { Flash } from "@/components/Flash";
import { PackageForm } from "@/components/PackageForm";
import { SubmitButton } from "@/components/SubmitButton";
import type { Product, ShowProduct } from "@/lib/packages";
import { savePackage, archivePackage, putOnSaleNow } from "../actions";
import { Countdown } from "@/components/Countdown";
import { ShareButtons } from "@/components/ShareButtons";
import { siteUrl } from "@/lib/email";
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
  const shows = await loadFormShows(supabase, artistId, { productId });
  const onSale = shows.filter((s) => s.selected).length;
  const scheduled = first?.on_sale_at && new Date(first.on_sale_at) > new Date() ? first.on_sale_at : null;
  const live = artist.status === "approved" && onSale > 0 && !p.archived_at;

  return (
    <div className="grid max-w-4xl gap-6">
      <PageHead crumbs={[{ href: `/a/${artistId}/packages`, label: "VIP packages" }]} title={p.name}
        aside={p.archived_at ? <span className="badge b-archived">Archived</span> : <span className={`badge ${onSale ? "b-published" : "b-neutral"}`}>{onSale ? `On sale at ${onSale} show${onSale === 1 ? "" : "s"}` : "Not on sale"}</span>}>
        {artist.status === "approved" ? "Changes show on your storefront right away." : "Fans can see this once P&T approves your account."}
      </PageHead>
      <Flash ok={ok} err={err} />
      {scheduled && !p.archived_at && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] bg-navy p-5 text-white">
          <div className="grid gap-2">
            <p className="eyebrow !text-[#b7b1cc]">Goes on sale in</p>
            <div className="w-[280px]"><Countdown to={scheduled} onDark /></div>
          </div>
          <form action={putOnSaleNow.bind(null, artistId, productId)}>
            <SubmitButton variant="yellow" pendingText="Opening…" confirm="Put this package on sale at every show right now?">Put on sale now</SubmitButton>
          </form>
        </section>
      )}
      {live && (
        <section className="panel grid gap-3">
          <h2>Share it</h2>
          <p className="muted">Post your storefront link so fans can find this package. Each show also has its own link on your storefront.</p>
          <ShareButtons url={`${siteUrl()}/${artist.handle}`} title={`${artist.name} VIP upgrades`} text={`${p.name} is available for ${artist.name} shows`} />
        </section>
      )}
      <PackageForm action={savePackage.bind(null, artistId, productId)} artistId={artistId} shows={shows} submitLabel="Save changes"
        initial={{ kind: p.kind, name: p.name, description: p.description ?? "", included: p.included ?? [], includes_photo: p.includes_photo, image_url: p.image_url,
          on_sale_at: first?.on_sale_at ?? null, off_sale_at: first?.off_sale_at ?? null, presale_code: first?.presale_code ?? null,
          default_price: p.default_price_cents != null ? String(p.default_price_cents / 100) : first ? String(first.price_cents / 100) : "100",
          default_capacity: String(p.default_capacity ?? first?.capacity ?? 30) }} />
      <form action={archivePackage.bind(null, artistId, productId, !p.archived_at)} className="border-t border-line pt-6">
        {p.archived_at
          ? <SubmitButton variant="ghost">Restore package</SubmitButton>
          : <SubmitButton variant="danger" confirm="Take this package off sale at every show? Existing buyers keep their upgrades.">Archive package</SubmitButton>}
      </form>
    </div>
  );
}
