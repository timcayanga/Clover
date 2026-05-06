import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageChrome } from "@/components/admin-page-chrome";
import { requireAdminAuth } from "@/lib/admin";
import { getAdminDataQaBankSummary } from "@/lib/admin-data-qa-summary";
import { AdminDataQaSummary } from "@/components/admin-data-qa-summary";
import { AdminDataQaGenericTraining } from "@/components/admin-data-qa-generic-training";
import { AdminImageLabelCorpusTraining } from "@/components/admin-image-label-corpus-training";
import { synchronizeDataQaTraining } from "@/lib/data-qa-training-sync";

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

  await synchronizeDataQaTraining({
    force: false,
    actorUserId: null,
  }).catch(() => null);
  const data = await getAdminDataQaBankSummary();

  return (
    <AdminPageChrome
      active="data-qa"
      title="Data QA"
      kicker="Internal tools"
      subtitle="Inspect parser quality, speed regressions, and feedback coverage across imported statements and image OCR training."
      actions={
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <Link className="button button-secondary button-small" href="/admin/data-qa/summary">
            Bank summary
          </Link>
        </div>
      }
    >
      <div style={{ display: "grid", gap: 24 }}>
        <AdminImageLabelCorpusTraining />
        <AdminDataQaGenericTraining />
        <AdminDataQaSummary data={data} />
      </div>
    </AdminPageChrome>
  );
}
