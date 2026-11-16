import { redirect } from "next/navigation";
import { requireAdminAuth } from "@/lib/admin";
import { AdminPageChrome } from "@/components/admin-page-chrome";
import { AdminNotifications } from "@/components/admin-notifications";
export const dynamic = "force-dynamic";
export default async function Page() {
  try {
    await requireAdminAuth();
  } catch {
    redirect("/dashboard");
  }
  return (
    <AdminPageChrome active="notifications" title="Notifications">
      <AdminNotifications />
    </AdminPageChrome>
  );
}
