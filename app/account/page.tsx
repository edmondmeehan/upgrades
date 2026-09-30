import { requireUser } from "@/lib/auth";
import { Shell, PageHead } from "@/components/Shell";
import { Flash, type Msg } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { updateName, updatePassword } from "../(auth)/actions";

export const metadata = { title: "Your account" };

export default async function Account({ searchParams }: { searchParams: Msg }) {
  const { profile } = await requireUser();
  const { ok, err } = await searchParams;
  return (
    <Shell email={profile.email} isAdmin={profile.is_super_admin}>
      <div className="grid max-w-xl gap-6">
        <PageHead title="Your account">Signed in as {profile.email}</PageHead>
        <Flash ok={ok} err={err} />
        <form action={updateName} className="panel grid gap-4">
          <h2>Name</h2>
          <label className="field"><span>Name</span><input className="input" name="name" defaultValue={profile.name ?? ""} /></label>
          <div><SubmitButton>Save name</SubmitButton></div>
        </form>
        <form action={updatePassword} className="panel grid gap-4">
          <h2>Password</h2>
          <label className="field"><span>New password</span><input className="input" type="password" name="password" minLength={8} autoComplete="new-password" required /></label>
          <div><SubmitButton variant="dark">Update password</SubmitButton></div>
        </form>
      </div>
    </Shell>
  );
}
