import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminDataQaConsole } from "@/components/admin-data-qa-console";
import { CloverShell } from "@/components/clover-shell";
import { requireAdminAuth } from "@/lib/admin";

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
      <AdminDataQaConsole />
    </CloverShell>
  );
}
