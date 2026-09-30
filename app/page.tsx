import Link from "next/link";
import { headers } from "next/headers";
import { Logo } from "@/components/Logo";
import { Icon } from "@/components/Icon";
import { Discover, type DiscoverData } from "@/components/Discover";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "VIP upgrades for live shows",
  description: "Meet & greets, soundchecks, early entry and more, sold by the artists themselves. See what's on tonight near you.",
};

export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const h = await headers();
  // Vercel adds the visitor's approximate location from their IP address.
  const region = h.get("x-vercel-ip-country-region")?.toUpperCase() ?? null;
  const country = h.get("x-vercel-ip-country")?.toUpperCase() ?? null;
  const cityRaw = h.get("x-vercel-ip-city");
  const city = cityRaw ? decodeURIComponent(cityRaw) : null;
  const supabase = await createClient();
  const [{ data }, { user }] = await Promise.all([supabase.rpc("get_discover"), getSession()]);

  return (
    <div className="min-h-screen bg-white">
      <section className="home-top onDark">
        <div className="home-wrap">
          <div className="home-top-bar">
            <Logo />
            <nav className="fan-nav" aria-label="Main">
              <Link href="/find-order" className="fan-nav-btn">Find my order</Link>
              <Link href="/for-artists" className="fan-nav-btn">For artists</Link>
              <Link href={user ? "/dashboard" : "/login"} className="fan-nav-btn solid">{user ? "Dashboard" : "Sign in"}</Link>
            </nav>
          </div>
          <h1 className="home-title">Go VIP at your next show</h1>
          <p className="home-sub">Meet &amp; greets, soundchecks, early entry and more, straight from the artists.</p>
        </div>
      </section>
      <main className="home-wrap py-8">
        {deleted && <p className="alert alert-green mb-6">Your account has been deleted.</p>}
        <Discover data={(data ?? { shows: [], artists: [] }) as DiscoverData} geo={{ region: country === "US" ? region : null, city }} />
      </main>
    </div>
  );
}
