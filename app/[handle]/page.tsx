import { notFound } from "next/navigation";
import { Wordmark } from "@/components/Wordmark";
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
    <main className="mx-auto max-w-3xl px-5 py-8">
      <Wordmark />
      <header className="mt-12 border-b-2 border-stage pb-6">
        <h1 className="text-[clamp(2.6rem,8vw,4.5rem)] font-bold leading-none">{s.name}</h1>
        {s.verified && <p className="mt-3"><span className="pill bg-yellow text-stage !border-stage">Verified artist</span></p>}
        {s.bio && <p className="mt-4 max-w-[36rem] text-lg">{s.bio}</p>}
      </header>
      <section className="mt-8">
        <h2 className="mb-4">Upcoming shows</h2>
        {s.shows.length === 0 ? <p className="muted">No upcoming shows yet. Check back soon.</p> : (
          <ul className="divide-y-[1.5px] divide-line border-y-[1.5px] border-line">
            {s.shows.map((sh) => (
              <li key={sh.slug} className="grid grid-cols-[6rem_1fr] gap-4 py-4">
                <span className="font-display text-xl font-semibold leading-tight">{formatDate(sh.date, { month: "short", day: "numeric" })}<br /><span className="font-sans text-sm font-normal text-mute">{formatDate(sh.date, { weekday: "short" })}</span></span>
                <span><span className="font-semibold">{sh.city}{sh.region ? `, ${sh.region}` : ""}</span><br /><span className="muted">{sh.venue}</span></span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted mt-6 text-sm">VIP upgrades go on sale here soon.</p>
      </section>
    </main>
  );
}
