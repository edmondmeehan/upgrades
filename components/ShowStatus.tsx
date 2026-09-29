export function ShowStatus({ status }: { status: "draft" | "published" | "cancelled" }) {
  const map = { draft: ["Draft", "text-mute"], published: ["Published", "text-ok"], cancelled: ["Cancelled", "text-rope"] } as const;
  const [label, cls] = map[status];
  return <span className={`pill ${cls}`}>{label}</span>;
}
