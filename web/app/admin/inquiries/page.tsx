import Link from "next/link";
import { redirect } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { AdminInquiriesConsole } from "@/components/admin-inquiries-console";
import { requireAdminAuth } from "@/lib/admin";
import { getAdminContactInquiries } from "@/lib/contact-inquiries";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Inquiries",
};

export default async function AdminInquiriesPage() {
  try {
    await requireAdminAuth();
  } catch {
    redirect("/dashboard");
  }

  const data = await getAdminContactInquiries({ pageSize: 200 });

  return (
    <CloverShell
      active="admin"
      title="Inquiries"
      kicker="Internal tools"
      subtitle="Review Contact Us messages, draft replies, and keep support requests in one place."
      actions={
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <Link className="button button-secondary button-small" href="/admin">
            Admin home
          </Link>
          <Link className="button button-secondary button-small" href="/contact-us">
            View contact page
          </Link>
        </div>
      }
    >
      <AdminInquiriesConsole inquiries={data.items} />
    </CloverShell>
  );
}
