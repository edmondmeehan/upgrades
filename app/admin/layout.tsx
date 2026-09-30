import { requireSuperAdmin } from "@/lib/auth";
import { Shell } from "@/components/Shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireSuperAdmin();
  return <Shell email={profile.email} isAdmin>{children}</Shell>;
}
