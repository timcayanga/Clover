import Link from "next/link";
import { AdminDataQaFileDetail } from "@/components/admin-data-qa-file-detail";
import { AdminPageChrome } from "@/components/admin-page-chrome";
import { requireAdminAuth } from "@/lib/admin";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Clover Admin - Data QA File",
};

export const dynamic = "force-dynamic";

export default async function AdminDataQaFilePage({ params }: { params: Promise<{ importFileId: string }> }) {
  await requireAdminAuth();
  const { importFileId } = await params;

  return (
    <AdminPageChrome
      active="data-qa"
      title="Data QA file"
      kicker="Internal tools"
      subtitle="Inspect the imported file behind a Data QA run."
      actions={
        <Link className="button button-secondary button-small" href="/admin/data-qa">
          Back to QA list
        </Link>
      }
    >
      <div className="admin-page__content">
        <AdminDataQaFileDetail importFileId={importFileId} />
      </div>
    </AdminPageChrome>
  );
}
