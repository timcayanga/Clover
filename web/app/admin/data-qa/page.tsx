import Link from "next/link";
import { redirect } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { requireAdminAuth } from "@/lib/admin";
import { getAdminDataQaBankSummary } from "@/lib/admin-data-qa-summary";
import { AdminDataQaSummary } from "@/components/admin-data-qa-summary";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Data QA",
};

export default async function AdminDataQaPage() {
  try {
    await requireAdminAuth();
  } catch {
    redirect("/dashboard");
  }

  const data = await getAdminDataQaBankSummary();

  return (
    <CloverShell
      active="admin"
      title="Data QA"
      kicker="Internal tools"
      subtitle="Inspect parser quality, speed regressions, and feedback coverage across imported statements."
      actions={
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <Link className="button button-secondary button-small" href="/admin/data-qa/summary">
            Bank summary
          </Link>
          <Link className="button button-secondary button-small" href="/admin">
            Admin home
          </Link>
        </div>
      }
    >
      <AdminDataQaSummary data={data} />
    </CloverShell>
  );
}
