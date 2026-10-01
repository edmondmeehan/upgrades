import Link from "next/link";
import type { Blocker } from "@/lib/readiness";

/** "Fans can't buy yet because…" with a fix button for each reason. Renders nothing when selling is unblocked. */
export function SellingBlockers({ blockers }: { blockers: Blocker[] }) {
  if (!blockers.length) return null;
  return (
    <div className="alert alert-yellow flex-col items-start gap-2 !text-[14px]">
      <b>Fans can&apos;t buy yet</b>
      <ul className="grid w-full gap-1.5">
        {blockers.map((b) => (
          <li key={b.key} className="flex flex-wrap items-center justify-between gap-2"><span>{b.label}</span>
            <Link href={b.href} className="btn btn-sm">{b.cta}</Link></li>
        ))}
      </ul>
    </div>
  );
}
