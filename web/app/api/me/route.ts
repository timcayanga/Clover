import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { getUserBillingSubscription } from "@/lib/paypal-billing";
import { getEffectiveUserLimits } from "@/lib/user-limits";
import { getUserPlanUsage } from "@/lib/plan-access";
import { createTransientDataUnavailableResponse, isTransientDataError, isUnauthorizedDataError } from "@/lib/transient-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await requireAuth();
    const user = await getOrCreateCurrentUser(userId);
    const [billingSubscription, planUsage] = await Promise.all([
      getUserBillingSubscription(user.id),
      getUserPlanUsage(user.id),
    ]);
    const effectiveLimits = getEffectiveUserLimits(user);

    return NextResponse.json({
      user: {
        id: user.id,
        planTier: user.planTier,
        accountLimit: effectiveLimits.accountLimit,
        monthlyUploadLimit: effectiveLimits.monthlyUploadLimit,
        transactionLimit: effectiveLimits.transactionLimit,
        usage: planUsage,
        primaryGoal: user.primaryGoal,
        goalTargetAmount: user.goalTargetAmount ? user.goalTargetAmount.toString() : null,
        goalTargetSource: user.goalTargetSource,
        goalPlan: user.goalPlan,
        onboardingCompletedAt: user.onboardingCompletedAt,
        dataWipedAt: user.dataWipedAt,
        features: {
          luxuryAccountCards: true,
        },
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
