import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPageSessionContext } from "@/lib/page-auth";
import {
  getOrCreateCurrentUser,
  hasCompletedOnboarding,
} from "@/lib/user-context";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { loadReportsWorkspace } from "@/lib/reports-workspace";
import { reportViewFromParams } from "@/lib/report-view";
import { ReportsWorkspaceView } from "@/components/reports-workspace";
export default async function ReportsWorkspacePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const session = await getPageSessionContext();
  const user = await getOrCreateCurrentUser(session.userId);
  if (!session.isGuest && !hasCompletedOnboarding(user))
    redirect("/onboarding");
  const profiles = await prisma.workspace.findMany({
    where: { userId: user.id },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const cookie = (await cookies()).get(selectedWorkspaceKey)?.value;
  const workspaceId =
    profiles.find((p) => p.id === cookie)?.id ??
    profiles[0]?.id ??
    (await ensureStarterWorkspace(user))?.id;
  if (!workspaceId) redirect("/dashboard");
  const params = (await searchParams) ?? {};
  const query = new URLSearchParams(
    Object.entries(params).filter(
      (v): v is [string, string] => typeof v[1] === "string",
    ),
  );
  const initial = await loadReportsWorkspace(
    user.id,
    workspaceId,
    reportViewFromParams(query),
  );
  return <ReportsWorkspaceView key={workspaceId} initial={initial} />;
}
