import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Icon } from "@/components/Icon";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/util";

type Store = {
  name: string; handle: string; website: string | null; bio: string | null; verified: boolean;
  shows: { slug: string; date: string; venue: string; city: string; region: string | null; country: string; tour: string }[];
};

async function load(handle: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_storefront", { p_handle: handle });
  return data as Store | null;
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const s = await load((await params).handle);
  return s ? { title: `${s.name} VIP upgrades` } : { title: "Not found" };
}

export default async function Storefront({ params }: { params: Promise<{ handle: string }> }) {
  const s = await load((await params).handle);
  if (!s) notFound();
  return (
    <div className="min-h-screen bg-white">
      <section className="home-top onDark">
        <div className="home-wrap">
          <div className="home-top-bar">
            <Logo href={`/${s.handle}`} label={`${s.name} upgrades`} />
            <nav className="fan-nav" aria-label="Help">
              <a href="https://help.please.co" className="fan-nav-btn solid"><Icon name="help" size={16} /><span>Fan Support</span></a>
            </nav>
          </div>
          <h1 className="home-title">{s.name}</h1>
          {s.verified && <p className="mt-4"><span className="badge b-verified"><Icon name="badge" size={14} />Verified artist</span></p>}
          <p className="home-sub">{s.bio ?? "VIP upgrades for upcoming shows."}</p>
        </div>
      </section>
      <main className="home-wrap py-8">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-bold" aria-live="polite">{s.shows.length} upcoming show{s.shows.length === 1 ? "" : "s"}</span>
        </div>
        {s.shows.length === 0 ? (
          <div className="grid justify-items-center gap-2 px-4 py-12 text-center">
            <span className="grid size-13 place-items-center rounded-full bg-paper"><Icon name="calendar" size={24} /></span>
            <h2 className="text-[16px]">No upcoming shows yet</h2>
            <p className="help">Check back soon.</p>
          </div>
        ) : (
          <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
            {s.shows.map((sh) => (
              <li key={sh.slug} className="card grid gap-2 p-5">
                <p className="eyebrow">{formatDate(sh.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</p>
                <p className="text-[18px] font-extrabold leading-tight">{sh.city}{sh.region ? `, ${sh.region}` : ""}</p>
                <p className="muted font-medium">{sh.venue}</p>
                <p className="help mt-1">VIP upgrades on sale soon</p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
