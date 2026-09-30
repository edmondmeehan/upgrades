import type { ArtistStatus } from "@/lib/types";

const MAP: Record<ArtistStatus, [string, string]> = {
  draft: ["Not submitted", "b-neutral"],
  pending: ["In review", "b-pending"],
  approved: ["Verified", "b-approved"],
  rejected: ["Needs changes", "b-rejected"],
  suspended: ["Suspended", "b-suspended"],
};

export function StatusPill({ status }: { status: ArtistStatus }) {
  const [label, cls] = MAP[status];
  return <span className={`badge ${cls}`}>{label}</span>;
}
