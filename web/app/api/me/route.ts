import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { getUserBillingSubscription } from "@/lib/paypal-billing";
import { getEffectiveUserLimits } from "@/lib/user-limits";
import { getUserPlanUsage } from "@/lib/plan-access";
import { prisma } from "@/lib/prisma";
import { createTransientDataUnavailableResponse, isTransientDataError, isUnauthorizedDataError } from "@/lib/transient-data";
import { getCloverTokenUsage } from "@/lib/clover-token-usage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { userId } = await requireAuth();
    const user = await getOrCreateCurrentUser(userId);
    const view = new URL(request.url).searchParams.get("view");
    if (view === "tier") {
      return NextResponse.json({ user: { planTier: user.planTier } });
    }

    const effectiveLimits = getEffectiveUserLimits(user);
    const plan = {
      planTier: user.planTier,
      accountLimit: effectiveLimits.accountLimit,
      monthlyUploadLimit: effectiveLimits.monthlyUploadLimit,
      transactionLimit: effectiveLimits.transactionLimit,
      features: { luxuryAccountCards: true },
    };
    if (view === "plan") {
      return NextResponse.json({ user: { ...plan, usage: await getUserPlanUsage(user.id) } });
    }

    const [billingSubscription, planUsage, latestUpload, cloverTokenUsage] = await Promise.all([
      getUserBillingSubscription(user.id),
      getUserPlanUsage(user.id),
      prisma.importFile.findFirst({
        where: { workspace: { userId: user.id } },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      getCloverTokenUsage(user),
    ]);
    return NextResponse.json({
      user: {
        id: user.id,
        ...plan,
        usage: planUsage,
        cloverTokenUsage,
        primaryGoal: user.primaryGoal,
        goalTargetAmount: user.goalTargetAmount ? user.goalTargetAmount.toString() : null,
        goalTargetSource: user.goalTargetSource,
        goalPlan: user.goalPlan,
        onboardingCompletedAt: user.onboardingCompletedAt,
        dataWipedAt: user.dataWipedAt,
        latestUploadAt: latestUpload?.createdAt.toISOString() ?? null,
        billingSubscription: billingSubscription
          ? {
              provider: billingSubscription.provider,
              status: billingSubscription.status,
              interval: billingSubscription.interval,
              pendingPlanId: billingSubscription.pendingPlanId,
              pendingInterval: billingSubscription.pendingInterval,
              providerSubscriptionId: billingSubscription.providerSubscriptionId,
              currentPeriodEnd: billingSubscription.currentPeriodEnd ? billingSubscription.currentPeriodEnd.toISOString() : null,
              nextBillingTime: billingSubscription.nextBillingTime ? billingSubscription.nextBillingTime.toISOString() : null,
              planTier: billingSubscription.planTier,
            }
          : null,
      },
    });
  } catch (error) {
    if (isTransientDataError(error)) {
      return createTransientDataUnavailableResponse("Clover is refreshing your profile.");
    }

    if (isUnauthorizedDataError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
