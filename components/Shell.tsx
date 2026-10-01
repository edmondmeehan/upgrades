import Link from "next/link";
import { Logo } from "./Logo";
import { Icon } from "./Icon";
import { NavLinks, type NavItem } from "./NavLinks";
import { StatusPill } from "./StatusPill";
import { signOut } from "@/app/(auth)/actions";
import type { ArtistStatus } from "@/lib/types";

export type ShellArtist = { id: string; name: string; status: ArtistStatus; roleLabel: string };

export function artistNav(id: string, role: string): NavItem[] {
  const base = `/a/${id}`;
  if (role === "door") return [{ href: `${base}/check-in`, label: "Check-in", icon: "scan" }];
  const canEdit = role === "owner" || role === "rep" || role === "admin";
  const owner = role === "owner" || role === "admin";
  const money = role !== "rep";
  const group = (label: string, icon: NavItem["icon"], children: (NavItem | false)[]): NavItem[] => {
    const kids = children.filter(Boolean) as NavItem[];
    return kids.length ? [{ href: kids[0].href, label, icon, children: kids }] : [];
  };
  const link = (path: string, label: string, icon: NavItem["icon"]): NavItem => ({ href: `${base}${path}`, label, icon });
  return [
    { href: base, label: "Overview", icon: "home", exact: true },
    ...group("Shows & VIP", "calendar", [canEdit && link("/tours", "Tours & shows", "calendar"), canEdit && link("/packages", "VIP packages", "star"), owner && link("/storefront", "Storefront", "palette"), canEdit && link("/integrations", "Integrations", "grid")]),
    ...group("Orders & fans", "users", [canEdit && link("/orders", "Orders", "list"), canEdit && link("/fans", "Fans", "users"), canEdit && link("/support", "Fan support", "help")]),
    ...group("Show day", "scan", [canEdit && link("/check-in", "Check-in", "scan"), canEdit && link("/photos", "Photos", "camera")]),
    ...group("Money", "dollar", [money && link("/financials", "Financials", "dollar"), money && link("/payments", "Payments", "card")]),
    ...group("Account", "settings", [owner && link("/team", "Team", "users"), owner && link("/verification", "Verification", "badge"), owner && link("/settings", "Settings", "settings")]),
  ];
}

/** Artist-side account links. Admins get one way into the admin area, nothing more. */
export function globalNav(isAdmin: boolean): NavItem[] {
  return [
    { href: "/dashboard", label: "Your artists", icon: "grid", exact: true },
    { href: "/account", label: "Account", icon: "user" },
    ...(isAdmin ? [{ href: "/admin", label: "P&T admin", icon: "shield" as const }] : []),
  ];
}

/** Everything in the admin area. No artist-side links. */
export function adminNav(): NavItem[] {
  return [
    { href: "/admin", label: "Artists", icon: "grid", exact: true },
    { href: "/admin/growth", label: "Growth", icon: "trend", children: [
      { href: "/admin/growth", label: "Growth", icon: "trend" }, { href: "/admin/promos", label: "Promo codes", icon: "tag" }] },
    { href: "/admin/finance", label: "Money", icon: "dollar", children: [
      { href: "/admin/finance", label: "Platform finance", icon: "dollar" }, { href: "/admin/payments", label: "Stripe", icon: "card" }] },
    { href: "/admin/launch", label: "Platform", icon: "shield", children: [
      { href: "/admin/launch", label: "Go live", icon: "ok" }, { href: "/admin/team", label: "Admins", icon: "users" }, { href: "/admin/audit", label: "Audit log", icon: "list" }] },
  ];
}

type SideProps = { email: string; isAdmin: boolean; artist?: ShellArtist; items?: NavItem[]; mode?: "app" | "admin" };

function SideContent({ email, isAdmin, artist, items, mode = "app" }: SideProps) {
  const admin = mode === "admin";
  return (
    <>
      {admin ? (
        <NavLinks items={adminNav()} />
      ) : (
        <>
          {artist && (
            <div className="grid gap-3">
              <div className="rounded-2xl bg-paper px-3.5 py-3">
                <p className="eyebrow">{artist.roleLabel}</p>
                <p className="mt-1 break-words text-[17px] font-extrabold leading-tight">{artist.name}</p>
                <div className="mt-2"><StatusPill status={artist.status} /></div>
              </div>
              {items && <NavLinks items={items} />}
            </div>
          )}
          <div className="grid gap-2">
            {artist && <p className="eyebrow px-3.5">Account</p>}
            <NavLinks items={globalNav(isAdmin)} />
          </div>
        </>
      )}
      <div className="mt-auto grid gap-1 border-t border-line pt-4">
        {admin && (
          <div className="nav">
            <Link href="/dashboard"><Icon name="back" />Artist view</Link>
          </div>
        )}
        <p className="truncate px-3.5 pt-1 text-[13px] text-mute" title={email}>{email}</p>
        <form action={signOut} className="nav">
          <button type="submit" className="flex h-11 w-full items-center gap-3 rounded-[22px] px-3.5 text-left text-[15px] font-semibold hover:bg-paper">
            <Icon name="out" />Sign out
          </button>
        </form>
      </div>
    </>
  );
}

export function Shell(props: SideProps & { banner?: React.ReactNode; children: React.ReactNode }) {
  const { children, banner, ...side } = props;
  const admin = side.mode === "admin";
  const home = admin ? "/admin" : "/dashboard";
  const label = admin ? "Admin" : "Upgrades";
  return (
    <div className="shell">
      <aside className={`shell-side ${admin ? "!bg-navy !border-navy onDark" : ""}`} aria-label={admin ? "Admin" : "Main"}>
        <div className="flex items-center gap-2.5">
          <Logo href={home} size={34} chip={!admin} label={admin ? "P&T admin home" : "OnTour Upgrades home"} />
          <span className={`text-[15px] font-extrabold ${admin ? "text-yellow" : ""}`}>{label}</span>
        </div>
        <div className={`contents ${admin ? "admin-side" : ""}`}><SideContent {...side} /></div>
      </aside>
      <div className="shell-main">
        <header className="shell-top onDark">
          <div className="flex items-center gap-2.5">
            <Logo href={home} size={30} label={admin ? "P&T admin home" : "OnTour Upgrades home"} />
            <span className={`text-[15px] font-extrabold ${admin ? "text-yellow" : "text-white"}`}>{label}</span>
          </div>
          <details className="mobile-menu">
            <summary className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white" aria-label="Menu"><Icon name="menu" size={22} /></summary>
            <div className="mobile-menu-panel"><SideContent {...side} /></div>
          </details>
        </header>
        {banner}
        <main className="page">{children}</main>
      </div>
    </div>
  );
}

export function PageHead({ crumbs, title, eyebrow, aside, children }: {
  crumbs?: { href: string; label: string }[]; title: React.ReactNode; eyebrow?: string; aside?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="crumbs">
          {crumbs.map((c, i) => <span key={c.href} className="flex items-center gap-1.5">{i > 0 && <span aria-hidden>/</span>}<Link href={c.href}>{c.label}</Link></span>)}
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
          <h1 className="break-words">{title}</h1>
          {children && <div className="muted mt-1.5">{children}</div>}
        </div>
        {aside && <div className="flex flex-wrap items-center gap-2">{aside}</div>}
      </div>
    </div>
  );
}
