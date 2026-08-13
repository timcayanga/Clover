import { redirect } from "next/navigation";
import { AdminPageChrome } from "@/components/admin-page-chrome";
import { AdminCommandCenter } from "@/components/admin-command-center";
import { requireAdminAuth } from "@/lib/admin";
import { getCachedAdminCommandCenterSnapshot } from "@/lib/admin-page-data";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Admin",
};

const parseDateBoundary = (value: string | undefined, endOfDay = false) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ adoptionFrom?: string; adoptionTo?: string }>;
}) {
  try {
    await requireAdminAuth();
  } catch {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const requestedFrom = parseDateBoundary(params.adoptionFrom);
  const requestedTo = parseDateBoundary(params.adoptionTo, true);
  const hasValidRange = Boolean(requestedFrom && requestedTo && requestedFrom <= requestedTo);
  const snapshot = await getCachedAdminCommandCenterSnapshot(
    hasValidRange ? requestedFrom!.toISOString() : "",
    hasValidRange ? requestedTo!.toISOString() : "",
  );

  return (
    <AdminPageChrome
      active="home"
      title="Admin"
      kicker="Internal tools"
      subtitle="Production operations, analytics, user management, data QA, support, and error review."
    >
      <AdminCommandCenter snapshot={snapshot} />
    </AdminPageChrome>
  );
}
