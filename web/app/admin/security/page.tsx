import { redirect } from "next/navigation";
import { requireAdminAuth } from "@/lib/admin";
import { AdminPageChrome } from "@/components/admin-page-chrome";
import { AdminSecurityConsole } from "@/components/admin-security-console";
export const dynamic = "force-dynamic";
export default async function Page() {
  const actor = await requireAdminAuth().catch(() => null);
  if (!actor) redirect("/dashboard");
  return (
    <AdminPageChrome active="security" title="Security & access">
      <AdminSecurityConsole role={actor.role} />
    </AdminPageChrome>
  );
}
