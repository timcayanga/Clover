import { redirect } from "next/navigation";
import { requireAdminAuth } from "@/lib/admin";
import { AdminPageChrome } from "@/components/admin-page-chrome";
import { AdminPlanAccess } from "@/components/admin-plan-access";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  try {
    await requireAdminAuth();
  } catch {
    redirect("/dashboard");
  }
  const { userId } = await params;
  return (
    <AdminPageChrome active="users" title="Plan & Access">
      <AdminPlanAccess userId={userId} />
    </AdminPageChrome>
  );
}
