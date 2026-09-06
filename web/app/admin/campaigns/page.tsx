import { redirect } from "next/navigation";
import { requireAdminAuth } from "@/lib/admin";
import { AdminPageChrome } from "@/components/admin-page-chrome";
import { AdminCampaigns } from "@/components/admin-campaigns";
export const dynamic = "force-dynamic";
export default async function Page() {
  try {
    await requireAdminAuth();
  } catch {
    redirect("/dashboard");
  }
  return (
    <AdminPageChrome active="campaigns" title="Campaigns & Referrals">
      <AdminCampaigns />
    </AdminPageChrome>
  );
}
