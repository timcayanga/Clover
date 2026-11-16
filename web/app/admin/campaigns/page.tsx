import { AdminCampaignList } from "@/components/admin-campaign-list";
import { redirect } from "next/navigation";
import { requireAdminAuth } from "@/lib/admin";
import { AdminPageChrome } from "@/components/admin-page-chrome";
export const dynamic = "force-dynamic";
export default async function Page() {
  try {
    await requireAdminAuth();
  } catch {
    redirect("/dashboard");
  }
  return (
    <AdminPageChrome active="campaigns" title="Campaigns & Referrals">
      <AdminCampaignList />
    </AdminPageChrome>
  );
}
