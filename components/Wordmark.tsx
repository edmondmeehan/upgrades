import Link from "next/link";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-baseline gap-2 !no-underline text-stage" aria-label="OnTour Upgrades home">
      <span className="font-display text-2xl font-bold tracking-tight">OnTour</span>
      <span className="rounded-full bg-yellow px-2 py-0.5 font-display text-sm font-semibold">Upgrades</span>
    </Link>
  );
}
