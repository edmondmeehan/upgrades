import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Icon } from "@/components/Icon";

export const metadata = { title: "For artists" };

export default async function ForArtists() {
  return (
    <div className="min-h-screen bg-white">
      <section className="home-top onDark">
        <div className="home-wrap">
          <div className="home-top-bar">
            <Logo />
            <nav className="fan-nav" aria-label="Account">
              <Link href="/login" className="fan-nav-btn">Sign in</Link>
              <a href="https://help.please.co" className="fan-nav-btn solid"><Icon name="help" size={16} /><span>Support</span></a>
            </nav>
          </div>
          <h1 className="home-title">VIP upgrades, run by you</h1>
          <p className="home-sub">
            Build your tour, set your own prices, check fans in from your phone, and send their meet &amp; greet photos after.
            Built by Please &amp; Thank You, who have run VIP on tour for more than 20 years.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/signup" className="btn btn-yellow btn-lg">Create an artist account</Link>
            <Link href="/login" className="btn btn-lg !bg-transparent !shadow-[inset_0_0_0_1.5px_rgba(255,255,255,.45)] hover:!shadow-[inset_0_0_0_1.5px_#f2d64b]">Sign in</Link>
          </div>
        </div>
      </section>
      <main className="home-wrap py-10">
        <ul className="grid gap-4 md:grid-cols-3">
          {[
            ["You set the price", "Fans see one service fee added on top. Nothing comes out of your price."],
            ["You own your fans", "Every buyer lands on your fan list, and you can export it any time."],
            ["Verified artists only", "P&T confirms every artist before a storefront goes live, so fans know it's real."],
          ].map(([t, d]) => (
            <li key={t} className="card p-6">
              <h2 className="text-[18px]">{t}</h2>
              <p className="muted mt-2">{d}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
