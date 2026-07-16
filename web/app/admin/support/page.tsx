import { redirect } from "next/navigation";
import { AdminPageChrome } from "@/components/admin-page-chrome";
import { AdminSupportConsole } from "@/components/admin-support-console";
import { requireAdminAuth } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin - Support" };

export default async function AdminSupportPage() {
  try {
    await requireAdminAuth();
  } catch {
    redirect("/dashboard");
  }

  return (
    <AdminPageChrome
      active="support"
      title="Support"
      kicker="Internal tools"
      subtitle="Resolve account issues without exposing passwords or changing financial records silently."
    >
      <AdminSupportConsole />
    </AdminPageChrome>
  );
}
