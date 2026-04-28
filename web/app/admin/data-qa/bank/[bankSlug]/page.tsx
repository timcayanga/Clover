import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireAdminAuth } from "@/lib/admin";
import { getAdminDataQaBankSummary } from "@/lib/admin-data-qa-summary";
import { AdminDataQaBankDetail } from "@/components/admin-data-qa-bank-detail";
import { normalizeBankName } from "@/lib/data-qa-banks";

export const metadata: Metadata = {
  title: "Clover Admin - Bank Data QA",
};

export const dynamic = "force-dynamic";

export default async function AdminDataQaBankPage({ params }: { params: Promise<{ bankSlug: string }> }) {
  await requireAdminAuth();
  const { bankSlug } = await params;
  const data = await getAdminDataQaBankSummary();
  const bank = data.banks.find((entry) => entry.bankSlug === bankSlug) ?? null;

  if (!bank) {
    const normalized = normalizeBankName(bankSlug.replace(/-/g, " "));
    const fallback = data.banks.find((entry) => entry.bankName.toLowerCase() === normalized.toLowerCase()) ?? null;
    if (!fallback) {
      notFound();
    }

    return (
      <main className="admin-page admin-data-qa-page">
        <div className="admin-page__content">
          <AdminDataQaBankDetail bank={fallback} />
        </div>
      </main>
    );
  }

  return (
    <main className="admin-page admin-data-qa-page">
      <div className="admin-page__content">
        <AdminDataQaBankDetail bank={bank} />
      </div>
    </main>
  );
}
