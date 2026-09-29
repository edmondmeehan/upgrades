import { Wordmark } from "@/components/Wordmark";

export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-8 px-5 py-10">
      <Wordmark />
      <div>
        <h1 className="mb-6">{title}</h1>
        {children}
      </div>
    </main>
  );
}
