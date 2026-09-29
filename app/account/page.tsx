import { requireUser } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import { Flash, type Msg } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { updateName, updatePassword } from "../(auth)/actions";

export const metadata = { title: "Your account" };

export default async function Account({ searchParams }: { searchParams: Msg }) {
  const { profile } = await requireUser();
  const { ok, err } = await searchParams;
  return (
    <>
      <TopBar email={profile.email} isAdmin={profile.is_super_admin} />
      <main className="mx-auto grid max-w-xl gap-6 px-4 py-10">
        <h1>Your account</h1>
        <Flash ok={ok} err={err} />
        <form action={updateName} className="panel grid gap-4">
          <label className="field"><span>Name</span><input className="input" name="name" defaultValue={profile.name ?? ""} /></label>
          <p className="muted text-sm">Signed in as {profile.email}</p>
          <div><SubmitButton>Save name</SubmitButton></div>
        </form>
        <form action={updatePassword} className="panel grid gap-4">
          <label className="field"><span>New password</span><input className="input" type="password" name="password" minLength={8} autoComplete="new-password" required /></label>
          <div><SubmitButton variant="dark">Update password</SubmitButton></div>
        </form>
      </main>
    </>
  );
}
