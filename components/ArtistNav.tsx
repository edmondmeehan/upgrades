"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function ArtistNav({ base, items }: { base: string; items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Artist sections" className="-mb-[2px] flex gap-1 overflow-x-auto">
      {items.map((i) => {
        const href = `${base}${i.href}`;
        const active = i.href === "" ? path === base : path.startsWith(href);
        return (
          <Link key={i.href} href={href} aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap border-b-4 px-3 py-2.5 font-semibold !no-underline ${active ? "border-yellow text-stage" : "border-transparent text-mute hover:text-stage"}`}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
