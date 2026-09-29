import { requireArtist, canEditShows, isOwnerish } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import { Laminate } from "@/components/Laminate";
import { ArtistNav } from "@/components/ArtistNav";
import { ROLE_LABEL } from "@/lib/types";

export default async function ArtistLayout({ children, params }: { children: React.ReactNode; params: Promise<{ artistId: string }> }) {
  const { artistId } = await params;
  const { artist, role, profile } = await requireArtist(artistId);

  const items = [
    { href: "", label: "Overview" },
    ...(canEditShows(role) ? [{ href: "/tours", label: "Tours & shows" }] : []),
    ...(role !== "rep" ? [{ href: "/financials", label: "Financials" }] : []),
    ...(isOwnerish(role) ? [{ href: "/verification", label: "Verification" }, { href: "/team", label: "Team" }, { href: "/settings", label: "Settings" }] : []),
  ];

  return (
    <>
      <TopBar email={profile.email} isAdmin={profile.is_super_admin} />
      {role === "admin" && (
        <div className="bg-blue px-4 py-2 text-center text-sm font-semibold text-white">
          You&apos;re assisting inside this account as P&amp;T admin. Changes are logged.
        </div>
      )}
      <div className="border-b-2 border-stage bg-paper">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-6 px-4 pt-6">
          <div className="pb-4">
            <p className="muted text-sm">{role === "admin" ? "P&T admin" : ROLE_LABEL[role]}</p>
            <h1 className="text-[clamp(2.2rem,5vw,3.2rem)] font-bold">{artist.name}</h1>
          </div>
          <div className="hidden sm:block -mb-6"><Laminate name={artist.name} handle={artist.handle} status={artist.status} /></div>
        </div>
        <div className="mx-auto max-w-6xl px-4"><ArtistNav base={`/a/${artist.id}`} items={items} /></div>
      </div>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:pt-12">{children}</main>
    </>
  );
}
