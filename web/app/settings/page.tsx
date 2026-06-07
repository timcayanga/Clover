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
    const userWorkspacesRaw = await prisma.workspace.findMany({
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
    const userWorkspaces = [...userWorkspacesRaw].sort((left, right) => {
      if (left.type === "personal" && right.type === "personal") {
        return left.createdAt.getTime() - right.createdAt.getTime();
      }
      if (left.type === "personal") {
        return -1;
      }
      if (right.type === "personal") {
        return 1;
      }

      return right.updatedAt.getTime() === left.updatedAt.getTime()
        ? left.createdAt.getTime() - right.createdAt.getTime()
        : right.updatedAt.getTime() - left.updatedAt.getTime();
    });
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
