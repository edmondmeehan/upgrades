import { requireUser } from "@/lib/auth";
import { Shell, PageHead } from "@/components/Shell";
import { Flash, type Msg } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { createArtist } from "./actions";

export const metadata = { title: "Set up your artist" };

export default async function Onboarding({ searchParams }: { searchParams: Msg }) {
  const { profile } = await requireUser();
  const { ok, err } = await searchParams;
  return (
    <Shell email={profile.email} isAdmin={profile.is_super_admin}>
      <div className="grid max-w-xl gap-6">
        <PageHead title="Set up your artist">
          You can build tours and shows right away. Your storefront goes live once P&amp;T verifies you.
          Joining someone else&apos;s team? Open the invite link from your email instead.
        </PageHead>
        <Flash ok={ok} err={err} />
        <form action={createArtist} className="panel grid gap-5">
          <label className="field"><span>Artist or band name</span><input className="input" name="name" required maxLength={120} /></label>
          <label className="field">
            <span>Storefront handle</span>
            <div className="flex items-center overflow-hidden rounded-[14px] border-[1.5px] border-edge bg-white focus-within:border-violet focus-within:shadow-[0_0_0_3px_#dcd5fa]">
              <span className="whitespace-nowrap pl-4 font-medium text-mute">upgrades.ontour.vip/</span>
              <input className="input !border-0 !pl-0.5 !shadow-none" name="handle" required pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" placeholder="yourband" />
            </div>
            <small>Lowercase letters, numbers, and dashes. This is the link you&apos;ll share with fans.</small>
          </label>
          <label className="field"><span>Official website</span><input className="input" name="website" type="text" inputMode="url" placeholder="yourband.com" /></label>
          <div><SubmitButton pendingText="Setting up…">Create artist</SubmitButton></div>
        </form>
      </div>
    </Shell>
  );
}
