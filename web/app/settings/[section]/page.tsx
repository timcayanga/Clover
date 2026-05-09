import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";
import { SettingsHub } from "@/components/settings-hub";
import { getSessionContext } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { getUserBillingSubscription } from "@/lib/paypal-billing";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";
import { getEffectiveUserLimits } from "@/lib/user-limits";
import { countNonCashAccounts } from "@/lib/account-limit-count";
import { RouteSplash } from "@/components/route-splash";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Settings",
};

const validSections = new Set(["account", "profiles", "display", "data", "categories", "plan"]);

async function SettingsSectionPageStream({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const session = await getSessionContext();
  const user = await getOrCreateCurrentUser(session.userId);
  const env = getEnv();
  const resolvedParams = await params;

  if (!session.isGuest && !hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }

  if (!validSections.has(resolvedParams.section)) {
    redirect("/settings");
  }

  const cookieStore = await cookies();
  const selectedWorkspaceCookieId = cookieStore.get(selectedWorkspaceKey)?.value ?? "";
  const profileSelect = {
    id: true,
    name: true,
    type: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  let profiles = await prisma.workspace.findMany({
    where: { userId: user.id },
    select: profileSelect,
    orderBy: [{ updatedAt: "desc" }, { createdAt: "asc" }],
  });

  if (!profiles.length) {
    const starterWorkspace = await ensureStarterWorkspace(user);
    profiles = await prisma.workspace.findMany({
      where: { userId: user.id },
      select: profileSelect,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "asc" }],
    });
    if (!profiles.length) {
      profiles = [
        {
          id: starterWorkspace.id,
          name: starterWorkspace.name,
          type: starterWorkspace.type,
          createdAt: starterWorkspace.createdAt,
          updatedAt: starterWorkspace.updatedAt,
        },
      ];
    }
  }

  const selectedWorkspace =
    (selectedWorkspaceCookieId ? profiles.find((profile) => profile.id === selectedWorkspaceCookieId) : null) ?? profiles[0] ?? null;

  if (!selectedWorkspace) {
    redirect("/dashboard");
  }

  const currentDate = new Date();
  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const [accountsForPlanUsage, cashAccountCount, monthlyUploadCount, transactionCount] = await Promise.all([
    prisma.account.findMany({
      where: {
        workspaceId: selectedWorkspace.id,
        type: { not: "cash" },
      },
      select: {
        type: true,
        name: true,
        institution: true,
      },
    }),
    prisma.account.count({
      where: {
        workspaceId: selectedWorkspace.id,
        type: "cash",
      },
    }),
    prisma.importFile.count({
      where: {
        workspaceId: selectedWorkspace.id,
        uploadedAt: { gte: startOfMonth },
      },
    }),
    prisma.transaction.count({
      where: {
        workspaceId: selectedWorkspace.id,
      },
    }),
  ]);

  const accountCount = countNonCashAccounts(accountsForPlanUsage);
  const billingSubscription = await getUserBillingSubscription(user.id);
  const planLimits = getEffectiveUserLimits(user);
  const serializedProfiles = profiles.map((profile) => ({
    ...profile,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  }));

  return (
    <CloverShell active="settings" title="Settings">
      <SettingsHub
        mode="panel"
        initialSection={resolvedParams.section as "account" | "profiles" | "display" | "data" | "categories" | "plan"}
        workspaceId={selectedWorkspace.id}
        workspaceName={selectedWorkspace.name}
        profiles={serializedProfiles}
        selectedProfileId={selectedWorkspace.id}
        firstName={user.firstName}
        lastName={user.lastName}
        email={user.email}
        planTier={user.planTier}
        billingSubscription={
          billingSubscription
            ? {
                status: billingSubscription.status,
                interval: billingSubscription.interval,
                pendingPlanId: billingSubscription.pendingPlanId,
                pendingInterval: billingSubscription.pendingInterval,
                providerSubscriptionId: billingSubscription.providerSubscriptionId,
                currentPeriodEnd: billingSubscription.currentPeriodEnd ? billingSubscription.currentPeriodEnd.toISOString() : null,
                nextBillingTime: billingSubscription.nextBillingTime ? billingSubscription.nextBillingTime.toISOString() : null,
                planTier: billingSubscription.planTier,
              }
            : null
        }
        paypalClientId={env.PAYPAL_CLIENT_ID ?? null}
        paypalMonthlyPlanId={env.PAYPAL_MONTHLY_PLAN_ID ?? env.PAYPAL_PRO_PLAN_ID ?? null}
        paypalAnnualPlanId={env.PAYPAL_ANNUAL_PLAN_ID ?? env.PAYPAL_PRO_PLAN_ID ?? null}
        paypalBuyerCountry={env.PAYPAL_BUYER_COUNTRY ?? null}
        planLimits={{
          accountLimit: planLimits.accountLimit ?? 0,
          monthlyUploadLimit: planLimits.monthlyUploadLimit ?? 0,
          transactionLimit: planLimits.transactionLimit ?? null,
        }}
        planUsage={{
          accountCount,
          cashAccountCount,
          monthlyUploadCount,
          transactionCount,
        }}
      />
    </CloverShell>
  );
}

export default function SettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  return (
    <RouteSplash label="settings">
      <SettingsSectionPageStream params={params} />
    </RouteSplash>
  );
}
