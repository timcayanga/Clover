import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireAdminAuth } from "@/lib/admin";
import { getCachedAdminDataQaBankSummary } from "@/lib/admin-page-data";
import { AdminDataQaBankDetail } from "@/components/admin-data-qa-bank-detail";
import { normalizeBankName } from "@/lib/data-qa-banks";
import { AdminPageChrome } from "@/components/admin-page-chrome";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Clover Admin - Bank Data QA",
};

export const dynamic = "force-dynamic";

export default async function AdminDataQaBankPage({ params }: { params: Promise<{ bankSlug: string }> }) {
  await requireAdminAuth();
  const { bankSlug } = await params;
  const data = await getCachedAdminDataQaBankSummary();
  const bank = data.banks.find((entry) => entry.bankSlug === bankSlug) ?? null;

  if (!bank) {
    const normalized = normalizeBankName(bankSlug.replace(/-/g, " "));
    const fallback = data.banks.find((entry) => entry.bankName.toLowerCase() === normalized.toLowerCase()) ?? null;
    if (!fallback) {
      notFound();
    }

    return (
      <AdminPageChrome
        active="data-qa"
        title="Bank data QA"
        kicker="Internal tools"
        subtitle="Inspect a single bank's parser coverage and file quality."
        actions={
          <Link className="button button-secondary button-small" href="/admin/data-qa/summary">
            Back to summary
          </Link>
        }
      >
        <div className="admin-page__content">
          <AdminDataQaBankDetail bank={fallback} />
        </div>
      </AdminPageChrome>
    );
  }

  return (
    <AdminPageChrome
      active="data-qa"
      title="Bank data QA"
      kicker="Internal tools"
      subtitle="Inspect a single bank's parser coverage and file quality."
      actions={
        <Link className="button button-secondary button-small" href="/admin/data-qa/summary">
          Back to summary
        </Link>
      }
    >
      <div className="admin-page__content">
        <AdminDataQaBankDetail bank={bank} />
      </div>
    </AdminPageChrome>
  );
}
