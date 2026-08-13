import { redirect } from "next/navigation";
import { AdminAuditLogsTable } from "@/components/admin-audit-logs-table";
import { AdminPageChrome } from "@/components/admin-page-chrome";
import { requireAdminAuth } from "@/lib/admin";
import { getCachedAdminAuditLogs } from "@/lib/admin-page-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin - Audit Logs" };

export default async function AdminLogsPage({ searchParams }: { searchParams: Promise<{ query?: string; page?: string }> }) {
  try {
    await requireAdminAuth();
  } catch {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const query = params.query ?? "";
  const page = Math.max(Number(params.page ?? "1") || 1, 1);
  const data = await getCachedAdminAuditLogs(query, page);

  return (
    <AdminPageChrome active="logs" title="Audit Logs" kicker="Internal tools" subtitle="Trace durable actions and changes across production.">
      <AdminAuditLogsTable data={data} query={query} />
    </AdminPageChrome>
  );
}
