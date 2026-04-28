import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { getUserBillingSubscription } from "@/lib/paypal-billing";
import { getEffectiveUserLimits } from "@/lib/user-limits";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await requireAuth();
    const user = await getOrCreateCurrentUser(userId);
    const billingSubscription = await getUserBillingSubscription(user.id);
    const effectiveLimits = getEffectiveUserLimits(user);

    return NextResponse.json({
      user: {
        id: user.id,
        planTier: user.planTier,
        accountLimit: effectiveLimits.accountLimit,
        monthlyUploadLimit: effectiveLimits.monthlyUploadLimit,
        transactionLimit: effectiveLimits.transactionLimit,
        primaryGoal: user.primaryGoal,
        goalTargetAmount: user.goalTargetAmount ? user.goalTargetAmount.toString() : null,
        goalTargetSource: user.goalTargetSource,
        goalPlan: user.goalPlan,
        onboardingCompletedAt: user.onboardingCompletedAt,
        dataWipedAt: user.dataWipedAt,
        billingSubscription: billingSubscription
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
          : null,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
