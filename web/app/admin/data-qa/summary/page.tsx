import Link from "next/link";
import { redirect } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { AdminDataQaSummary } from "@/components/admin-data-qa-summary";
import { getAdminDataQaBankSummary } from "@/lib/admin-data-qa-summary";
import { requireAdminAuth } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminDataQaSummaryPage() {
  try {
    await requireAdminAuth();
  } catch {
    redirect("/dashboard");
  }

  const data = await getAdminDataQaBankSummary();

  return (
    <CloverShell
      active="admin"
      title="Data QA summary"
      kicker="Internal tools"
      subtitle="See which banks Clover has tested, how many unique files were used, and whether they are ready at a glance."
      actions={
        <Link className="button button-secondary button-small" href="/admin/data-qa">
          Back to QA list
        </Link>
      }
    >
      <AdminDataQaSummary data={data} />
    </CloverShell>
  );
}
