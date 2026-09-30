export function ShowStatus({ status, incomplete }: { status: "draft" | "published" | "cancelled"; incomplete?: boolean }) {
  if (status === "draft" && incomplete) return <span className="badge b-neutral">Needs details</span>;
  const map = { draft: ["Draft", "b-draft"], published: ["Published", "b-published"], cancelled: ["Cancelled", "b-cancelled"] } as const;
  const [label, cls] = map[status];
  return <span className={`badge ${cls}`}>{label}</span>;
}
