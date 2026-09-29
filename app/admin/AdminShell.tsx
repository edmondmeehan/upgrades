import Link from "next/link";
import { TopBar } from "@/components/TopBar";

export function AdminShell({ email, children, current }: { email: string; children: React.ReactNode; current: "artists" | "audit" }) {
  const tab = (href: string, label: string, key: string) => (
    <Link href={href} aria-current={current === key ? "page" : undefined}
      className={`border-b-4 px-3 py-2.5 font-semibold !no-underline ${current === key ? "border-yellow text-stage" : "border-transparent text-mute hover:text-stage"}`}>{label}</Link>
  );
  return (
    <>
      <TopBar email={email} isAdmin />
      <div className="border-b-2 border-stage bg-stage text-paper">
        <div className="mx-auto max-w-6xl px-4 pt-6">
          <h1 className="pb-4 text-paper">P&amp;T admin</h1>
          <nav className="-mb-[2px] flex gap-1 [&_a]:!text-paper/70 [&_a[aria-current]]:!text-paper">
            {tab("/admin", "Artists", "artists")}{tab("/admin/audit", "Audit log", "audit")}
          </nav>
        </div>
      </div>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </>
  );
}
