import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="grid max-w-[420px] justify-items-start gap-4">
        <Logo size={40} chip />
        <h1>We can&apos;t find that page.</h1>
        <p className="help text-[15px]">The link may be incomplete, or you may not have access to it.</p>
        <Link href="/dashboard" className="btn">Go to your artists</Link>
      </div>
    </main>
  );
}
