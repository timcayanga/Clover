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

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const session = await getSessionContext();
  const user = await getOrCreateCurrentUser(session.userId);
  const env = getEnv();

  if (!session.isGuest && !hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }

  const cookieStore = await cookies();
  const selectedWorkspaceCookieId = cookieStore.get(selectedWorkspaceKey)?.value ?? "";
  const workspaceSelect = {
    id: true,
    name: true,
  } as const;

  let selectedWorkspace =
    (selectedWorkspaceCookieId
      ? await prisma.workspace.findFirst({
          where: {
            id: selectedWorkspaceCookieId,
            userId: user.id,
          },
          select: workspaceSelect,
        })
      : null) ??
    (await prisma.workspace.findFirst({
      where: { userId: user.id },
      select: workspaceSelect,
      orderBy: { createdAt: "asc" },
    }));

  if (!selectedWorkspace) {
    const starterWorkspace = await ensureStarterWorkspace(user);
    selectedWorkspace = await prisma.workspace.findUnique({
      where: { id: starterWorkspace.id },
      select: workspaceSelect,
    });
  }

  if (!selectedWorkspace) {
    redirect("/dashboard");
  }

  const currentDate = new Date();
  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const [accountCount, cashAccountCount, monthlyUploadCount, transactionCount] = await Promise.all([
    prisma.account.count({
      where: {
        workspaceId: selectedWorkspace.id,
        type: { not: "cash" },
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

  const billingSubscription = await getUserBillingSubscription(user.id);

  return (
    <CloverShell active="settings" title="Settings">
      <SettingsHub
        workspaceId={selectedWorkspace.id}
        workspaceName={selectedWorkspace.name}
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
