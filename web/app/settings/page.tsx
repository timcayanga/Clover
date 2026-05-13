import { CloverShell } from "@/components/clover-shell";
import { SettingsHub } from "@/components/settings-hub";
import { getSessionContext } from "@/lib/auth";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { getOrCreateCurrentUser } from "@/lib/user-context";
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
  let profileList: Array<{
    id: string;
    name: string;
    type: string;
    createdAt: string;
    updatedAt: string;
  }> = [];

  if (user && user.dataWipedAt === null) {
    const cookieStore = await cookies();
    const selectedWorkspaceCookieId = cookieStore.get(selectedWorkspaceKey)?.value ?? "";
    await ensureStarterWorkspace(user.clerkUserId, user.email, user.verified);
    const userWorkspaces = await prisma.workspace.findMany({
      where: { userId: user.id },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        type: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const personalWorkspace =
      (await prisma.workspace.findFirst({
        where: {
          user: {
            clerkUserId: user.clerkUserId,
          },
          type: "personal",
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
    const selectedWorkspace =
      personalWorkspace ??
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
        : null);

    workspaceId = selectedWorkspace?.id ?? "";
    workspaceName = selectedWorkspace?.name ?? "Personal";
    profileList = userWorkspaces.map((workspace) => ({
      ...workspace,
      createdAt: workspace.createdAt.toISOString(),
      updatedAt: workspace.updatedAt.toISOString(),
    }));
  }

  return (
    <CloverShell active="settings" title="Settings">
      <SettingsHub
        mode="full"
        initialSection="account"
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        selectedProfileId={workspaceId}
        initialProfileList={profileList}
        firstName={user?.firstName ?? null}
        lastName={user?.lastName ?? null}
        email={user?.email ?? ""}
        avatarUrl={user?.imageUrl ?? null}
        planTier={user?.planTier ?? "free"}
        paypalClientId={null}
        paypalMonthlyPlanId={null}
        paypalAnnualPlanId={null}
        paypalBuyerCountry={null}
        disableWorkspaceBootstrap={Boolean(user?.dataWipedAt)}
      />
    </CloverShell>
  );
}
