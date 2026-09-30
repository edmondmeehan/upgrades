import { AuthShell } from "@/app/(auth)/AuthShell";
import { SubmitButton } from "@/components/SubmitButton";
import { createClient } from "@/lib/supabase/server";
import { confirmArtist } from "./actions";

export const metadata = { title: "Confirm artist", robots: { index: false } };
type P = { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string; failed?: string }> };
type Req = { artist_name: string; artist_handle: string; website: string; contact_name: string; relation: string; confirmed: boolean; open: boolean };

export default async function Confirm({ params, searchParams }: P) {
  const { token } = await params;
  const { done, failed } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_third_party_request", { p_token: token });
  const r = (data as Req[] | null)?.[0];

  if (!r) return <AuthShell title="Link not found" subtitle="Check that you copied the whole link from the email.">{null}</AuthShell>;
  if (r.confirmed || done) return (
    <AuthShell title={`Thanks, ${r.contact_name.split(" ")[0]}`}
      subtitle={`You confirmed ${r.artist_name}. P&T will finish reviewing the account shortly. Nothing else is needed from you.`}>{null}</AuthShell>
  );
  if (!r.open || failed) return (
    <AuthShell title="This request is closed" subtitle="It's already been reviewed or replaced by a newer request. No action is needed.">{null}</AuthShell>
  );
  return (
    <AuthShell title={`Is this ${r.artist_name}'s team?`}>
      <p className="text-[15px]">
        Someone is setting up VIP upgrades for <strong>{r.artist_name}</strong> ({r.website}) on OnTour Upgrades by Please &amp; Thank You,
        and listed you as their {r.relation}. Confirm only if they&apos;re authorized to sell upgrades for this artist.
      </p>
      <form action={confirmArtist.bind(null, token)}><SubmitButton size="lg" block pendingText="Confirming…">Yes, confirm {r.artist_name}</SubmitButton></form>
      <p className="help text-center">Not right? Ignore this page, or tell us at <a href="https://help.please.co">help.please.co</a>.</p>
    </AuthShell>
  );
}
