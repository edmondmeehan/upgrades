import Link from "next/link";
import { Wordmark } from "./Wordmark";
import { signOut } from "@/app/(auth)/actions";

export function TopBar({ email, isAdmin }: { email?: string; isAdmin?: boolean }) {
  return (
    <header className="border-b-2 border-stage bg-paper">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Wordmark href="/dashboard" />
        {email && (
          <nav className="flex flex-wrap items-center gap-4 text-[0.95rem]">
            <Link href="/dashboard">Your artists</Link>
            {isAdmin && <Link href="/admin" className="font-semibold">P&amp;T admin</Link>}
            <Link href="/account" className="muted hidden sm:inline">{email}</Link>
            <form action={signOut}><button className="text-blue hover:underline" type="submit">Sign out</button></form>
          </nav>
        )}
      </div>
    </header>
  );
}
