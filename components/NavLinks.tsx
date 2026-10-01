"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "./Icon";

export type NavItem = { href: string; label: string; icon: IconName; exact?: boolean; children?: NavItem[] };

const isActive = (i: NavItem, path: string) => (i.exact ? path === i.href : path === i.href || path.startsWith(`${i.href}/`));
const KEY = "ontour-nav-open";

/** Sidebar links. Items with children are collapsible groups; the group holding the current page opens itself. */
export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  // A group with one visible page is just a link.
  const flat = items.flatMap((i) => (i.children && i.children.length === 1 ? i.children : [i]));
  const [open, setOpen] = useState<string[]>([]);
  useEffect(() => { try { setOpen(JSON.parse(localStorage.getItem(KEY) ?? "[]")); } catch { /* ignore */ } }, []);
  const toggle = (label: string) => setOpen((cur) => {
    const next = cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label];
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  const closeDrawer = (e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");

  return (
    <div className="nav flex flex-col gap-1">
      {flat.map((i) => {
        if (!i.children?.length) {
          const active = isActive(i, path);
          return (
            <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} onClick={closeDrawer}>
              <Icon name={i.icon} />{i.label}
            </Link>
          );
        }
        const here = i.children.some((c) => isActive(c, path));
        const expanded = here || open.includes(i.label);
        const id = `nav-${i.label.replace(/\W+/g, "-").toLowerCase()}`;
        return (
          <div key={i.label} className="grid gap-1">
            <button type="button" onClick={() => !here && toggle(i.label)} aria-expanded={expanded} aria-controls={id}
              className={`nav-group ${here ? "nav-group-here" : ""}`}>
              <Icon name={i.icon} />
              <span className="flex-1 text-left">{i.label}</span>
              <span aria-hidden className={`text-[12px] transition-transform ${expanded ? "rotate-90" : ""}`}>›</span>
            </button>
            {expanded && (
              <div id={id} className="nav-children grid gap-0.5">
                {i.children.map((c) => (
                  <Link key={c.href} href={c.href} aria-current={isActive(c, path) ? "page" : undefined} onClick={closeDrawer}>{c.label}</Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
