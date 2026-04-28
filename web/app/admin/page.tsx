import { redirect } from "next/navigation";
import Link from "next/link";
import { CloverShell } from "@/components/clover-shell";
import { AdminUsersConsole } from "@/components/admin-users-console";
import { requireAdminAuth } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Admin",
};

export default async function AdminPage() {
  try {
    await requireAdminAuth();
  } catch {
    redirect("/dashboard");
  }

  return (
    <CloverShell
      active="admin"
      title="Admin"
      kicker="Internal tools"
      subtitle="Operate Clover from one place: user editing, analytics, error visibility, and drill-downs. Production users only."
      actions={
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <Link className="button button-secondary button-small" href="/admin/inquiries">
            Inquiries
          </Link>
          <Link className="button button-secondary button-small" href="/admin/data-qa">
            Data QA
          </Link>
          <Link className="button button-secondary button-small" href="/admin/data-qa/summary">
            Bank summary
          </Link>
        </div>
      }
    >
      <AdminUsersConsole />
    </CloverShell>
  );
}
