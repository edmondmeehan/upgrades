import type { ArtistStatus } from "@/lib/types";

const STATE: Record<ArtistStatus, { strip: string; text: string; label: string; note: string }> = {
  draft:     { strip: "bg-line",   text: "text-stage", label: "Not submitted", note: "Submit verification to go live" },
  pending:   { strip: "bg-yellow", text: "text-stage", label: "In review",     note: "P&T is checking your details" },
  approved:  { strip: "bg-stage",  text: "text-paper", label: "Verified",      note: "Storefront is live" },
  rejected:  { strip: "bg-rope",   text: "text-paper", label: "Needs changes", note: "See notes and resubmit" },
  suspended: { strip: "bg-rope",   text: "text-paper", label: "Suspended",     note: "Storefront is offline" },
};

/** The artist's backstage pass: a lanyard laminate showing account status. */
export function Laminate({ name, handle, status }: { name: string; handle: string; status: ArtistStatus }) {
  const s = STATE[status];
  return (
    <div className="relative w-56 shrink-0 select-none rotate-[-2deg]" aria-label={`Account status: ${s.label}`}>
      <div className="mx-auto h-5 w-3 rounded-b-sm bg-stage" aria-hidden />
      <div className="overflow-hidden rounded-xl border-2 border-stage bg-card shadow-[4px_4px_0_#1b1b1b]">
        <div className="flex justify-center pt-2" aria-hidden>
          <span className="h-2 w-12 rounded-full border-2 border-stage bg-paper" />
        </div>
        <div className="px-4 pb-3 pt-2">
          <p className="font-display text-xs font-semibold text-mute">All access</p>
          <p className="font-display text-2xl font-bold leading-tight break-words">{name}</p>
          <p className="text-sm text-mute">upgrades.ontour.vip/{handle}</p>
        </div>
        <div className={`${s.strip} ${s.text} px-4 py-2`}>
          <p className="font-display text-lg font-bold leading-none">{s.label}</p>
          <p className="mt-1 text-xs opacity-90">{s.note}</p>
        </div>
      </div>
    </div>
  );
}

export function StatusPill({ status }: { status: ArtistStatus }) {
  const color = { draft: "text-mute", pending: "text-[#8a6d00]", approved: "text-ok", rejected: "text-rope", suspended: "text-rope" }[status];
  return <span className={`pill ${color}`}>{STATE[status].label}</span>;
}
