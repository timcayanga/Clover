import { redirect } from "next/navigation";
import { AdminPageChrome } from "@/components/admin-page-chrome";
import { AdminCommandCenter } from "@/components/admin-command-center";
import { requireAdminAuth } from "@/lib/admin";
import { getCachedAdminCommandCenterSnapshot } from "@/lib/admin-page-data";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Admin",
};

export default async function AdminPage() {
  try {
    await requireAdminAuth();
  } catch {
    redirect("/dashboard");
  }

  const snapshot = await getCachedAdminCommandCenterSnapshot();

  return (
    <AdminPageChrome
      active="home"
      title="Admin"
      kicker="Internal tools"
      subtitle="Production operations, analytics, user management, data QA, support, and error review."
    >
      <AdminCommandCenter snapshot={snapshot} />
    </AdminPageChrome>
  );
}
