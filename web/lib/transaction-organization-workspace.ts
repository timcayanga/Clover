import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { getPageSessionContext } from "@/lib/page-auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";

export const resolveTransactionOrganizationWorkspace = async () => {
  const session = await getPageSessionContext();
  const user = await getOrCreateCurrentUser(session.userId);
  if (!session.isGuest && !hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }

  const selectedWorkspaceId = (await cookies()).get(selectedWorkspaceKey)?.value ?? "";
  const selectedWorkspace = selectedWorkspaceId
    ? await prisma.workspace.findFirst({
        where: { id: selectedWorkspaceId, userId: user.id },
        select: { id: true, name: true },
      })
    : null;
  const workspace =
    selectedWorkspace ??
    (await prisma.workspace.findFirst({
      where: { userId: user.id },
      orderBy: [{ createdAt: "asc" }],
      select: { id: true, name: true },
    })) ??
    (await ensureStarterWorkspace(user));

  return { id: workspace.id, name: workspace.name };
};
