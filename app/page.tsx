import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Wordmark } from "@/components/Wordmark";

export default async function Home() {
  const { user } = await getSession();
  if (user) redirect("/dashboard");
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-5 py-8">
      <Wordmark />
      <section className="grid flex-1 content-center gap-8 py-16 md:grid-cols-[1.3fr_1fr] md:items-center">
        <div>
          <h1 className="text-[clamp(2.6rem,7vw,4.6rem)] font-bold leading-[0.95]">
            Sell VIP upgrades at every show, without a VIP company.
          </h1>
          <p className="mt-6 max-w-[34rem] text-lg">
            Build your tour, set your own prices, check fans in from your phone, and send their meet-and-greet photos after.
            Built by Please &amp; Thank You, who have run VIP on tour for more than 20 years.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="btn btn-primary">Create an artist account</Link>
            <Link href="/login" className="btn btn-ghost">Sign in</Link>
          </div>
        </div>
        <ul className="grid gap-3 text-[1.05rem]">
          {[
            ["You set the price", "Fans see one service fee added on top. Nothing comes out of your price."],
            ["You own your fans", "Every buyer lands on your fan list, and you can export it any time."],
            ["Verified artists only", "We confirm every artist is who they say they are before a storefront goes live."],
          ].map(([t, d]) => (
            <li key={t} className="border-l-4 border-yellow pl-4">
              <p className="font-display text-xl font-semibold">{t}</p>
              <p className="muted">{d}</p>
            </li>
          ))}
        </ul>
      </section>
      <footer className="muted text-sm">Please &amp; Thank You, Inc. <a className="ml-3" href="https://help.please.co">Help</a></footer>
    </main>
  );
}
