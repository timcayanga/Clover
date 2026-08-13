import { redirect } from "next/navigation";
import { AdminAnalyticsWorkspace } from "@/components/admin-analytics-workspace";
import { AdminPageChrome } from "@/components/admin-page-chrome";
import { requireAdminAuth } from "@/lib/admin";
import { getCachedAdminAnalyticsSnapshot } from "@/lib/admin-page-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin - Analytics" };

export default async function AdminAnalyticsPage() {
  try {
    await requireAdminAuth();
  } catch {
    redirect("/dashboard");
  }

  const snapshot = await getCachedAdminAnalyticsSnapshot();

  return (
    <AdminPageChrome
      active="analytics"
      title="Analytics"
      kicker="Internal tools"
      subtitle="Understand activation, import success, retention signals, event coverage, and operational risk."
    >
      <AdminAnalyticsWorkspace snapshot={snapshot} />
    </AdminPageChrome>
  );
}
