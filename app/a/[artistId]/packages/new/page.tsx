import { requireArtist } from "@/lib/auth";
import { PageHead } from "@/components/Shell";
import { Flash } from "@/components/Flash";
import { PackageForm } from "@/components/PackageForm";
import { TEMPLATES } from "@/lib/packages";
import { savePackage } from "../actions";
import { loadFormShows } from "../data";

export const metadata = { title: "New VIP package" };
type P = { params: Promise<{ artistId: string }>; searchParams: Promise<{ template?: string; tour?: string; err?: string }> };

export default async function NewPackage({ params, searchParams }: P) {
  const { artistId } = await params;
  const { template, tour, err } = await searchParams;
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const t = TEMPLATES.find((x) => x.kind === template) ?? TEMPLATES[TEMPLATES.length - 1];
  const shows = await loadFormShows(supabase, artistId, { defaultPrice: t.price, defaultCapacity: t.capacity, preselectTour: tour });

  return (
    <div className="grid max-w-4xl gap-6">
      <PageHead crumbs={[{ href: `/a/${artistId}/packages`, label: "VIP packages" }]} title={t.kind === "custom" ? "New package" : t.name}>
        Everything here can be changed later.
      </PageHead>
      <Flash err={err} />
      <PackageForm action={savePackage.bind(null, artistId, null)} artistId={artistId} shows={shows} submitLabel="Save package"
        initial={{ kind: t.kind, name: t.name, description: t.description, included: t.included, includes_photo: t.includes_photo, image_url: null, on_sale_at: null, off_sale_at: null, presale_code: null }} />
    </div>
  );
}
