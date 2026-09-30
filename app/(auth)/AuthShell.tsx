import { Logo } from "@/components/Logo";

/** Split sign-in layout shared with photos.ontour.vip: navy brand panel, white form panel. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen md:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
      <div className="onDark flex flex-col justify-between gap-6 bg-navy p-6 md:min-h-screen md:p-12">
        <Logo size={52} />
        <div className="grid gap-3">
          <div className="text-[44px] font-extrabold uppercase leading-[0.9] tracking-[-0.03em] text-yellow md:text-[72px]">Upgrades</div>
          <p className="hidden max-w-[380px] text-[17px] leading-normal text-[#d9d5e6] md:block">
            Sell VIP upgrades at every show. Set your prices, check fans in, and deliver their photos after.
          </p>
        </div>
        <p className="hidden text-[13px] text-[#b7b1cc] md:block">For artists and their teams</p>
      </div>
      <main className="flex items-center justify-center bg-white px-5 py-10">
        <div className="grid w-full max-w-[400px] gap-5">
          <div>
            <h1 className="text-[32px]">{title}</h1>
            {subtitle && <p className="muted mt-1.5 text-[15px]">{subtitle}</p>}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
