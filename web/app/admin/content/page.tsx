import { redirect } from "next/navigation";
import { requireAdminAuth } from "@/lib/admin";
import { AdminPageChrome } from "@/components/admin-page-chrome";
import { AdminContent } from "@/components/admin-content";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Content",
  robots: { index: false, follow: false },
};
export default async function ContentAdmin() {
  try {
    await requireAdminAuth();
  } catch {
    redirect("/dashboard");
  }
  return (
    <AdminPageChrome active="content" title="Content">
      <AdminContent />
    </AdminPageChrome>
  );
}
