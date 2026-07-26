import { CloverShell } from "@/components/clover-shell";
import { SettingsHub } from "@/components/settings-hub";
import { getSessionContext } from "@/lib/auth";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getEffectiveProfileLimit, getEffectiveUserLimits } from "@/lib/user-limits";
import { getUserPlanUsage } from "@/lib/plan-access";
import { getEnv } from "@/lib/env";

export const metadata = {
  title: "Settings",
};

const settingsSections = [
  "account",
  "profiles",
  "notifications",
  "security",
  "imports",
  "regional",
  "display",
  "data",
  "categories",
  "plan",
] as const;

type SettingsSection = (typeof settingsSections)[number];

const getSettingsSection = (value: string | string[] | undefined): SettingsSection | null => {
  const candidate = Array.isArray(value) ? value[0] : value;
  return settingsSections.find((section) => section === candidate) ?? null;
};

export default async function SettingsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {};
  const requestedSection = getSettingsSection(params.section);
  const initialSection = params.upgrade === "pro" ? "plan" : requestedSection ?? "account";
  const mobileSectionOpen = params.upgrade === "pro" || Boolean(requestedSection);
  const preferredBillingInterval = params.interval === "monthly" || params.interval === "annual" ? params.interval : undefined;
  const session = await getSessionContext();
  let workspaceId = "";
  let workspaceName = "Settings";
  let profileList: Array<{
    id: string;
    name: string;
    type: string;
    createdAt: string;
    updatedAt: string;
  }> = [];
  let user: Awaited<ReturnType<typeof getOrCreateCurrentUser>> | null = null;
  let initialPlanLimits: ReturnType<typeof getEffectiveUserLimits> | null = null;
  let initialPlanUsage: Awaited<ReturnType<typeof getUserPlanUsage>> | null = null;
  const env = getEnv();

  try {
    user = session.isGuest ? null : await getOrCreateCurrentUser(session.userId);
    if (user) {
      [initialPlanLimits, initialPlanUsage] = await Promise.all([getEffectiveUserLimits(user), getUserPlanUsage(user.id)]);
    }
  } catch (error) {
    console.error("[settings-page] unable to load current user", error);
  }

  if (user && user.dataWipedAt === null) {
    try {
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
    } catch (error) {
      console.error("[settings-page] unable to load workspaces", error);
    }
  }

  return (
    <CloverShell active="settings" title="Settings" mobileBackHref={mobileSectionOpen ? "/settings" : "/home"}>
      <SettingsHub
        mode="full"
        initialSection={initialSection}
        mobileSectionOpen={mobileSectionOpen}
        preferredBillingInterval={preferredBillingInterval}
        workspaceId={workspaceId}
        billingCustomerId={user?.id ?? null}
        workspaceName={workspaceName}
        selectedProfileId={workspaceId}
        initialProfileList={profileList}
        firstName={user?.firstName ?? null}
        lastName={user?.lastName ?? null}
        email={user?.email ?? ""}
        avatarUrl={null}
        planTier={user?.planTier ?? "free"}
        profileLimit={user ? getEffectiveProfileLimit(user) : null}
        initialPlanLimits={initialPlanLimits}
        initialPlanUsage={initialPlanUsage}
        paypalClientId={env.PAYPAL_CLIENT_ID ?? null}
        paypalMonthlyPlanId={env.PAYPAL_MONTHLY_PLAN_ID ?? env.PAYPAL_PRO_PLAN_ID ?? null}
        paypalAnnualPlanId={env.PAYPAL_ANNUAL_PLAN_ID ?? env.PAYPAL_PRO_PLAN_ID ?? null}
        paypalBuyerCountry={env.PAYPAL_BUYER_COUNTRY ?? null}
        disableWorkspaceBootstrap={Boolean(user?.dataWipedAt)}
      />
    </CloverShell>
  );
}
