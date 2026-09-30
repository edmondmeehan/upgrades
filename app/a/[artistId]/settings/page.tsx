import Link from "next/link";
import { PageHead } from "@/components/Shell";
import { requireArtist } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { updateArtist } from "../actions";
import { pct } from "@/lib/util";

type P = { params: Promise<{ artistId: string }>; searchParams: Promise<{ ok?: string; err?: string }> };

export default async function Settings({ params, searchParams }: P) {
  const { artistId } = await params;
  const { ok, err } = await searchParams;
  const { artist, supabase } = await requireArtist(artistId, ["owner"]);
  const { data: extra } = await supabase.from("artists").select("support_email").eq("id", artistId).single<{ support_email: string | null }>();
  return (
    <div className="grid max-w-3xl gap-6">
      <PageHead title="Settings" />
      <Flash ok={ok} err={err} />
      <form action={updateArtist.bind(null, artistId)} className="panel grid gap-4">
        <h2>Artist profile</h2>
        <label className="field"><span>Artist name</span><input className="input" name="name" required defaultValue={artist.name} /></label>
        <label className="field"><span>Website</span><input className="input" name="website" defaultValue={artist.website ?? ""} /></label>
        <label className="field"><span>Fan support email</span>
          <input className="input" type="email" name="support_email" defaultValue={extra?.support_email ?? ""} placeholder="support@yourband.com" />
          <small>Where fan questions go when they use Fan Support on your storefront or order pages. Fans never see this address; your replies go straight to them. Leave blank to use your account email.</small>
        </label>
        <p className="help">Colors, images and your storefront bio are under <Link href={`/a/${artistId}/storefront`}>Storefront</Link>. Your handle, upgrades.ontour.vip/{artist.handle}, can only be changed by P&amp;T.</p>
        <div><SubmitButton variant="dark">Save settings</SubmitButton></div>
      </form>
      <section className="panel grid gap-2">
        <h2>Payments</h2>
        <p>Fans pay your price plus a {pct(artist.fee_bps)} service fee. Nothing comes out of your price except card processing.</p>
        <p><Link href={`/a/${artistId}/payments`}>Set up payouts and your card on file</Link></p>
      </section>
    </div>
  );
}
