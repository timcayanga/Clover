import { redirect } from "next/navigation";
import { requireAdminAuth } from "@/lib/admin";
import { AdminPageChrome } from "@/components/admin-page-chrome";
import { AdminInquiriesConsole } from "@/components/admin-inquiries-console";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!(await requireAdminAuth().catch(() => null))) redirect("/dashboard");
  return (
    <AdminPageChrome active="work-queue" title="Work queue">
      <AdminInquiriesConsole inquiries={[]} />
    </AdminPageChrome>
  );
}
