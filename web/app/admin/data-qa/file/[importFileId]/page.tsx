import { AdminDataQaFileDetail } from "@/components/admin-data-qa-file-detail";
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
    <main className="admin-page admin-data-qa-page">
      <div className="admin-page__content">
        <AdminDataQaFileDetail importFileId={importFileId} />
      </div>
    </main>
  );
}
