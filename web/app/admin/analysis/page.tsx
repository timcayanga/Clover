import { redirect } from "next/navigation";
import { AdminAnalysisWorkspace } from "@/components/admin-analysis-workspace";
import { AdminPageChrome } from "@/components/admin-page-chrome";
import { requireAdminAuth } from "@/lib/admin";
import { getCachedAdminCommandCenterSnapshot } from "@/lib/admin-page-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin - Analysis" };

export default async function AdminAnalysisPage() {
  try {
    await requireAdminAuth();
  } catch {
    redirect("/dashboard");
  }

  const snapshot = await getCachedAdminCommandCenterSnapshot();

  return (
    <AdminPageChrome active="analysis" title="Analysis">
      <AdminAnalysisWorkspace snapshot={snapshot} />
    </AdminPageChrome>
  );
}
