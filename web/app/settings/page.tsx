import { CloverShell } from "@/components/clover-shell";
import { SettingsHub } from "@/components/settings-hub";
import { getSessionContext } from "@/lib/auth";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const session = await getSessionContext();
  const user = session.isGuest ? null : await getOrCreateCurrentUser(session.userId);

  let workspaceId = "";
  let workspaceName = "Settings";

  if (user && hasCompletedOnboarding(user)) {
    const cookieStore = await cookies();
    const selectedWorkspaceCookieId = cookieStore.get(selectedWorkspaceKey)?.value ?? "";
    const selectedWorkspace =
      (selectedWorkspaceCookieId
        ? await prisma.workspace.findFirst({
            where: {
              id: selectedWorkspaceCookieId,
              user: {
                clerkUserId: user.clerkUserId,
              },
            },
            select: {
              id: true,
              name: true,
            },
          })
        : null) ??
      (await prisma.workspace.findFirst({
        where: {
          user: {
            clerkUserId: user.clerkUserId,
          },
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
        },
      })) ??
      (await ensureStarterWorkspace(user.clerkUserId, user.email, user.verified).then(async (starterWorkspace) =>
        prisma.workspace.findUnique({
          where: { id: starterWorkspace.id },
          select: {
            id: true,
            name: true,
          },
        })
      ));

    workspaceId = selectedWorkspace?.id ?? "";
    workspaceName = selectedWorkspace?.name ?? "Settings";
  }

  return (
    <CloverShell active="settings" title="Settings">
      <SettingsHub
        mode="full"
        initialSection="account"
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        selectedProfileId={workspaceId}
        firstName={user?.firstName ?? null}
        lastName={user?.lastName ?? null}
        email={user?.email ?? ""}
        avatarUrl={user?.imageUrl ?? null}
        planTier={user?.planTier ?? "free"}
        paypalClientId={null}
        paypalMonthlyPlanId={null}
        paypalAnnualPlanId={null}
        paypalBuyerCountry={null}
      />
    </CloverShell>
  );
}
