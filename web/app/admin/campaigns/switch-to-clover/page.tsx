import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { requireAdminAuth } from "@/lib/admin";
import { AdminPageChrome } from "@/components/admin-page-chrome";
import { AdminSwitchCampaign } from "@/components/admin-switch-campaign";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!(await auth()).userId) redirect("/sign-in?redirect_url=%2Fadmin%2Fcampaigns%2Fswitch-to-clover");
  try { await requireAdminAuth(); } catch { redirect("/dashboard"); }
  return <AdminPageChrome active="campaigns" title="Switch to Clover"><a href="/admin/campaigns">← All campaigns</a><AdminSwitchCampaign /></AdminPageChrome>;
}
