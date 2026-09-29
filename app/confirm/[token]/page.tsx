import { Wordmark } from "@/components/Wordmark";
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

  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-8 px-5 py-10">
      <Wordmark />
      {!r ? (
        <div><h1>Link not found</h1><p className="mt-3">Check that you copied the whole link from the email.</p></div>
      ) : r.confirmed || done ? (
        <div><h1>Thanks, {r.contact_name.split(" ")[0]}</h1><p className="mt-3">You confirmed {r.artist_name}. P&amp;T will finish reviewing the account shortly. Nothing else is needed from you.</p></div>
      ) : !r.open || failed ? (
        <div><h1>This request is closed</h1><p className="mt-3">It&apos;s already been reviewed or replaced by a newer request. No action is needed.</p></div>
      ) : (
        <div>
          <h1>Is this {r.artist_name}&apos;s team?</h1>
          <p className="mt-3">
            Someone is setting up VIP upgrades for <strong>{r.artist_name}</strong> ({r.website}) on OnTour Upgrades by Please &amp; Thank You,
            and listed you as their {r.relation}. Confirm only if they&apos;re authorized to sell upgrades for this artist.
          </p>
          <form action={confirmArtist.bind(null, token)} className="mt-6"><SubmitButton pendingText="Confirming…">Yes, confirm {r.artist_name}</SubmitButton></form>
          <p className="muted mt-6 text-sm">Not right? Ignore this page, or tell us at <a href="https://help.please.co">help.please.co</a>.</p>
        </div>
      )}
    </main>
  );
}
