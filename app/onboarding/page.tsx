import { requireUser } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import { Flash, type Msg } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { createArtist } from "./actions";

export const metadata = { title: "Set up your artist" };

export default async function Onboarding({ searchParams }: { searchParams: Msg }) {
  const { profile } = await requireUser();
  const { ok, err } = await searchParams;
  return (
    <>
      <TopBar email={profile.email} isAdmin={profile.is_super_admin} />
      <main className="mx-auto max-w-xl px-4 py-10">
        <h1>Set up your artist</h1>
        <p className="mt-2 muted">
          You can build tours and shows right away. Your storefront goes live once P&amp;T verifies you.
          Joining someone else&apos;s team? Open the invite link from your email instead.
        </p>
        <div className="mt-6"><Flash ok={ok} err={err} /></div>
        <form action={createArtist} className="panel mt-2 grid gap-5">
          <label className="field"><span>Artist or band name</span><input className="input" name="name" required maxLength={120} /></label>
          <label className="field">
            <span>Storefront handle</span>
            <div className="flex items-center overflow-hidden rounded-lg border-[1.5px] border-line bg-white focus-within:border-stage">
              <span className="whitespace-nowrap pl-3 text-mute">upgrades.ontour.vip/</span>
              <input className="input !border-0 !shadow-none !pl-0.5" name="handle" required pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" placeholder="yourband" />
            </div>
            <small>Lowercase letters, numbers, and dashes. This is the link you&apos;ll share with fans.</small>
          </label>
          <label className="field"><span>Official website</span><input className="input" name="website" type="text" inputMode="url" placeholder="yourband.com" /></label>
          <div><SubmitButton pendingText="Setting up…">Create artist</SubmitButton></div>
        </form>
      </main>
    </>
  );
}
