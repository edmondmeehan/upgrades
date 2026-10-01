import Link from "next/link";
import { requireArtist } from "@/lib/auth";
import { SellingBlockers } from "@/components/SellingBlockers";
import { sellingBlockers } from "@/lib/readiness";
import { PageHead } from "@/components/Shell";
import { Flash } from "@/components/Flash";
import { TEMPLATES, KIND_LABEL, dollars, priceRange, type Product, type ShowProduct } from "@/lib/packages";

export const metadata = { title: "VIP packages" };
type P = { params: Promise<{ artistId: string }>; searchParams: Promise<{ ok?: string; err?: string; tour?: string }> };

export default async function Packages({ params, searchParams }: P) {
  const { artistId } = await params;
  const { ok, err, tour } = await searchParams;
  const { supabase, artist } = await requireArtist(artistId, ["owner", "rep"]);
  const blockers = await sellingBlockers(supabase, artistId, artist.status);
  const [{ data: products }, { data: sps }] = await Promise.all([
    supabase.from("products").select("*").eq("artist_id", artistId).eq("is_sample", false).order("created_at").returns<Product[]>(),
    supabase.from("show_products").select("*, shows(currency)").eq("artist_id", artistId).eq("is_sample", false).returns<(ShowProduct & { shows: { currency: string } | null })[]>(),
  ]);
  const live = (products ?? []).filter((p) => !p.archived_at), archived = (products ?? []).filter((p) => p.archived_at);
  const q = tour ? `&tour=${tour}` : "";

  return (
    <>
      <PageHead title="VIP packages">The upgrades fans can buy. Build a package once, then choose which shows it&apos;s sold at and for how much.</PageHead>
      <Flash ok={ok} err={err} />
      <SellingBlockers blockers={blockers} />

      {live.length > 0 && (
        <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
          {live.map((p) => {
            const at = (sps ?? []).filter((sp) => sp.product_id === p.id && sp.active);
            const prices = at.map((sp) => sp.price_cents);
            const starts = at.map((sp) => sp.on_sale_at).filter((d): d is string => !!d && new Date(d) > new Date()).sort()[0];
            const range = prices.length === 0 ? "Not on sale yet" : priceRange(at.map((sp) => ({ price_cents: sp.price_cents, currency: sp.shows?.currency })));
            return (
              <li key={p.id}>
                <Link href={`/a/${artistId}/packages/${p.id}`} className="card grid h-full overflow-hidden !no-underline text-ink transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(19,0,86,.12)]">
                  {p.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt="" className="aspect-[16/9] w-full object-cover" />
                  )}
                  <div className="grid gap-2 p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="badge b-neutral">{KIND_LABEL[p.kind] ?? "Custom"}</span>
                      {p.includes_photo && <span className="badge b-lilac">Includes photo</span>}
                      {at.length > 0 && (starts
                        ? <span className="badge b-pending">On sale {new Date(starts).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                        : <span className="badge b-published">On sale</span>)}
                    </div>
                    <span className="text-[18px] font-extrabold leading-tight">{p.name}</span>
                    <span className="muted text-[14px] font-medium">{range}{at.length ? `, ${at.length} show${at.length === 1 ? "" : "s"}` : ""}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {live.length === 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
          <span><span className="block font-extrabold">New here? Set up your tour and packages together</span>
            <span className="help">Dates, packages and prices in one guided flow.</span></span>
          <Link href={`/a/${artistId}/launch`} className="btn">Start guided setup</Link>
        </div>
      )}
      <section className="grid gap-3">
        <h2>{live.length ? "Add another package" : "Or start with a template"}</h2>
        <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
          {TEMPLATES.map((t) => (
            <li key={t.kind}>
              <Link href={`/a/${artistId}/packages/new?template=${t.kind}${q}`} className="card grid h-full gap-1.5 p-5 !no-underline text-ink hover:border-violet">
                <span className="text-[16px] font-extrabold">{t.kind === "custom" ? "Start from scratch" : t.name}</span>
                <span className="help">{t.kind === "custom" ? "Build any experience you offer." : `Suggested ${dollars(t.price * 100)}, ${t.capacity} per show`}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {archived.length > 0 && (
        <section className="grid gap-2">
          <h2>Archived</h2>
          <ul className="card divide-y divide-line">
            {archived.map((p) => <li key={p.id} className="px-5 py-3"><Link href={`/a/${artistId}/packages/${p.id}`}>{p.name}</Link></li>)}
          </ul>
        </section>
      )}
    </>
  );
}
