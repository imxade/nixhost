import { DashboardShell } from "@/components/dashboard-shell";
import { requirePageUser } from "@/server/next-auth";

export const dynamic = "force-dynamic";
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return <DashboardShell username={user.username} role={user.role}>{children}</DashboardShell>;
}
