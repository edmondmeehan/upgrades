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
  const { artist } = await requireArtist(artistId, ["owner"]);
  return (
    <div className="grid max-w-3xl gap-6">
      <PageHead title="Settings" />
      <Flash ok={ok} err={err} />
      <form action={updateArtist.bind(null, artistId)} className="panel grid gap-4">
        <h2>Artist profile</h2>
        <label className="field"><span>Artist name</span><input className="input" name="name" required defaultValue={artist.name} /></label>
        <label className="field"><span>Website</span><input className="input" name="website" defaultValue={artist.website ?? ""} /></label>
        <label className="field"><span>Short bio for your storefront</span><textarea className="input" name="bio" maxLength={600} defaultValue={artist.bio ?? ""} /></label>
        <p className="help">Your handle, upgrades.ontour.vip/{artist.handle}, can only be changed by P&amp;T.</p>
        <div><SubmitButton variant="dark">Save settings</SubmitButton></div>
      </form>
      <section className="panel grid gap-2">
        <h2>Payments</h2>
        <p>Fans pay your price plus a {pct(artist.fee_bps)} service fee. Nothing comes out of your price except card processing.</p>
        <p className="muted">Connecting Stripe and adding a card on file arrive in the next phase.</p>
      </section>
    </div>
  );
}
