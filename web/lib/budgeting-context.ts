import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { getSessionContext } from "@/lib/auth";
import type { PageSessionContext } from "@/lib/page-auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";
import { getMobileRequestContext } from "@/lib/mobile-request-context";
import { assertWorkspaceAccess } from "@/lib/workspace-access";

export const resolveBudgetingWorkspace = async (pageSession?: PageSessionContext) => {
  const mobile = getMobileRequestContext();
  if (mobile) {
    // Never fall back to a cookie or the first Profile for native requests.
    const workspaceId = new URL(mobile.request.url).searchParams.get("workspaceId");
    if (!workspaceId) throw new Error("WORKSPACE_NOT_FOUND");
    await assertWorkspaceAccess(mobile.userId, workspaceId);
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkUserId: mobile.userId } });
    return { user, session: { userId: mobile.userId, isGuest: false }, workspaceId, selectedWorkspaceCookieId: "" };
  }
  const session = pageSession ?? (await getSessionContext());
  const cookieStore = await cookies();
  const selectedWorkspaceCookieId = cookieStore.get(selectedWorkspaceKey)?.value ?? "";

  const existingUser = await prisma.user.findUnique({
    where: { clerkUserId: session.userId },
  });
  const user = existingUser ?? (await getOrCreateCurrentUser(session.userId));

  if (!session.isGuest && !hasCompletedOnboarding(user)) {
    return { user, session, workspaceId: null, selectedWorkspaceCookieId };
  }

  const selectedWorkspaceId =
    (
      (selectedWorkspaceCookieId
        ? await prisma.workspace.findFirst({
            where: {
              id: selectedWorkspaceCookieId,
              user: {
                clerkUserId: user.clerkUserId,
              },
            },
            select: { id: true },
          })
        : null) ??
      (await prisma.workspace.findFirst({
        where: {
          user: {
            clerkUserId: user.clerkUserId,
          },
        },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      }))
    )?.id ?? "";

  if (selectedWorkspaceId) {
    return { user, session, workspaceId: selectedWorkspaceId, selectedWorkspaceCookieId };
  }

  const starterWorkspace = await ensureStarterWorkspace(user);
  const starterWorkspaceId = starterWorkspace?.id ?? null;
  if (!starterWorkspaceId) {
    return { user, session, workspaceId: null, selectedWorkspaceCookieId };
  }

  const starterWorkspaceData = await prisma.workspace.findUnique({
    where: { id: starterWorkspaceId },
    select: { id: true },
  });

  return {
    user,
    session,
    workspaceId: starterWorkspaceData?.id ?? null,
    selectedWorkspaceCookieId,
  };
};
