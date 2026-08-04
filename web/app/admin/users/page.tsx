import { redirect } from "next/navigation";
import { AdminPageChrome } from "@/components/admin-page-chrome";
import { AdminUsersConsole } from "@/components/admin-users-console";
import { requireAdminAuth } from "@/lib/admin";
import { getAdminErrorLogs } from "@/lib/admin-error-logs";
import { getAdminUsers } from "@/lib/admin-users";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Admin - Users",
};

export default async function AdminUsersPage() {
  try {
    await requireAdminAuth();
  } catch {
    redirect("/dashboard");
  }

  const [initialData, initialErrorLogData] = await Promise.all([
    getAdminUsers({ page: 1, pageSize: 25 }),
    getAdminErrorLogs({ page: 1, pageSize: 25 }),
  ]);

  return (
    <AdminPageChrome
      active="users"
      title="User Management"
      kicker="Internal tools"
      subtitle="Review current production users, plan tiers, limits, activity, and support signals."
    >
      <AdminUsersConsole initialData={initialData} initialErrorLogData={initialErrorLogData} />
    </AdminPageChrome>
  );
}
