import { redirect } from "next/navigation";
import { requireAdminAuth } from "@/lib/admin";
import { AdminPageChrome } from "@/components/admin-page-chrome";
import { AdminApprovalsConsole } from "@/components/admin-approvals-console";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!(await requireAdminAuth("destructive").catch(() => null)))
    redirect("/admin/security");
  return (
    <AdminPageChrome active="approvals" title="Approvals">
      <AdminApprovalsConsole />
    </AdminPageChrome>
  );
}
