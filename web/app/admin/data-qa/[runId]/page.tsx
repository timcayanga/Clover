import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminDataQaRunDetail } from "@/components/admin-data-qa-run-detail";
import { CloverShell } from "@/components/clover-shell";
import { requireAdminAuth } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminDataQaRunPage({ params }: { params: Promise<{ runId: string }> }) {
  try {
    await requireAdminAuth();
  } catch {
    redirect("/dashboard");
  }

  const { runId } = await params;

  return (
    <CloverShell
      active="admin"
      title="Data QA run"
      kicker="Internal tools"
      subtitle="Review a single imported statement, inspect the uploaded file, and leave granular feedback for the Data Engine."
      actions={
        <Link className="button button-secondary button-small" href="/admin/data-qa">
          Back to QA list
        </Link>
      }
    >
      <AdminDataQaRunDetail runId={runId} />
    </CloverShell>
  );
}
