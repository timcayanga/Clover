import { redirect } from "next/navigation";
import { AdminOperationsConsole } from "@/components/admin-operations-console";
import { AdminPageChrome } from "@/components/admin-page-chrome";
import { requireAdminAuth } from "@/lib/admin";
import { getCachedAdminOperationsSnapshot } from "@/lib/admin-page-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin - Operations" };

export default async function AdminOperationsPage() {
  try { await requireAdminAuth(); } catch { redirect("/dashboard"); }
  const snapshot = await getCachedAdminOperationsSnapshot();
  return <AdminPageChrome active="operations" title="Operations" kicker="Internal tools" subtitle="Billing, imports, alerts, access configuration, and support recovery in one operational view."><AdminOperationsConsole snapshot={snapshot} /></AdminPageChrome>;
}
