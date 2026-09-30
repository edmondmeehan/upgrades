import { requireArtist } from "@/lib/auth";
import { Shell, artistNav } from "@/components/Shell";
import { ROLE_LABEL } from "@/lib/types";

export default async function ArtistLayout({ children, params }: { children: React.ReactNode; params: Promise<{ artistId: string }> }) {
  const { artistId } = await params;
  const { artist, role, profile } = await requireArtist(artistId);
  return (
    <Shell
      email={profile.email}
      isAdmin={profile.is_super_admin}
      artist={{ id: artist.id, name: artist.name, status: artist.status, roleLabel: role === "admin" ? "P&T admin" : ROLE_LABEL[role] }}
      items={artistNav(artist.id, role)}
      banner={role === "admin" ? (
        <div className="bg-violet px-4 py-2.5 text-center text-[14px] font-semibold text-white">
          You&apos;re assisting inside this account as P&amp;T admin. Changes are logged.
        </div>
      ) : undefined}
    >
      {children}
    </Shell>
  );
}
