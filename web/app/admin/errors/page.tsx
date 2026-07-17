import { redirect } from "next/navigation";
import { AdminErrorLogsTable } from "@/components/admin-error-logs-table";
import { AdminPageChrome } from "@/components/admin-page-chrome";
import { requireAdminAuth } from "@/lib/admin";
import { getAdminErrorLogs } from "@/lib/admin-error-logs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin - Errors" };

export default async function AdminErrorsPage({ searchParams }: { searchParams: Promise<{ query?: string; page?: string }> }) {
  try {
    await requireAdminAuth();
  } catch {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const query = params.query ?? "";
  const page = Math.max(Number(params.page ?? "1") || 1, 1);
  const data = await getAdminErrorLogs({ query, page });

  return (
    <AdminPageChrome active="errors" title="Error Logs" kicker="Internal tools" subtitle="Inspect errors, builds, routes, users, and stack traces in this environment.">
      <AdminErrorLogsTable data={data} query={query} />
    </AdminPageChrome>
  );
}
