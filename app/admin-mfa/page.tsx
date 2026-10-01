import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { TwoStepSetup } from "@/components/TwoStepSetup";

export const metadata = { title: "Two-step sign-in", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminTwoStep({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const { supabase, profile } = await requireUser();
  if (!profile.is_super_admin) notFound();
  const { data } = await supabase.auth.mfa.listFactors();
  const hasFactor = !!data?.totp?.some((f) => f.status === "verified");
  const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
  return (
    <div className="min-h-screen bg-paper">
      <header className="bg-navy"><div className="home-wrap py-5"><Logo /></div></header>
      <main className="mx-auto grid max-w-[460px] gap-5 px-4 py-10">
        <div>
          <p className="eyebrow">P&amp;T admin</p>
          <h1 className="mt-1 text-[28px]">{hasFactor ? "Enter your code" : "Set up two-step sign-in"}</h1>
          <p className="muted mt-2">{hasFactor
            ? "Admin access needs the code from your authenticator app each time you sign in."
            : "Admins can open any artist's account and change fees, so admin access needs a code from your phone as well as your password. It takes a minute."}</p>
        </div>
        <TwoStepSetup next={dest} hasFactor={hasFactor} />
        <p className="help text-center">Lost your phone? Another P&amp;T admin can reset it in Supabase, under Authentication, then Users.</p>
      </main>
    </div>
  );
}
