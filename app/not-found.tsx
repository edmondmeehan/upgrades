import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-6 px-5">
      <Wordmark />
      <h1>Page not found</h1>
      <p>This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link href="/dashboard" className="btn btn-primary w-fit">Go to your artists</Link>
    </main>
  );
}
