import { planContext } from "../../shared/plan-analytics";
import { capturePostHogServerEvent } from "./analytics-server";
import { hasStagingProAccess } from "@/lib/user-limits";
import { prisma } from "@/lib/prisma";
import { calculateProAccess } from "@/lib/pro-access-rules";

export async function getProAccess(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      billingSubscription: true,
      storeAccess: true,
      proGrants: { orderBy: { startsAt: "asc" } },
    },
  });
  const access = calculateProAccess({
      ...user,
      stagingQaAccess: hasStagingProAccess(user),
      subscription: user.billingSubscription,
      grants: user.proGrants,
    });
  return {
    ...access,
    analytics: planContext(access.planTier, access.source, user.storeAccess?.expiresAt && user.storeAccess.expiresAt > new Date() ? user.storeAccess.store : user.billingSubscription?.provider, access.hasPaidSubscription),
    user: {
      id: user.id,
      email: user.email,
      planTierLocked: user.planTierLocked,
      environment: user.environment,
    },
    subscription: user.billingSubscription && {
      provider: user.billingSubscription.provider,
      status: user.billingSubscription.status,
      currentPeriodEnd: user.billingSubscription.currentPeriodEnd,
      nextBillingTime: user.billingSubscription.nextBillingTime,
      cancelledAt: user.billingSubscription.cancelledAt,
    },
    storeSubscription: user.storeAccess,
    grants: user.proGrants,
  };
}

export async function refreshProAccess(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      clerkUserId: true,
      email: true,
      storeAccess: { select: { expiresAt: true, renewing: true, productId: true } },
      planTier: true,
      planTierLocked: true,
      billingSubscription: {
        select: { status: true, interval: true, paidThrough: true, planTier: true },
      },
      proGrants: {
        where: { revokedAt: null, endsAt: { gt: new Date() } },
        select: { planTier: true, startsAt: true, endsAt: true, revokedAt: true },
      },
    },
  });
  const access = calculateProAccess({
    ...user,
    stagingQaAccess: hasStagingProAccess(user),
    subscription: user.billingSubscription,
    grants: user.proGrants,
  });
  // Conditional write prevents an entitlement refresh overriding a concurrent Admin lock.
  if (!user.planTierLocked && user.planTier !== access.planTier) {
    const changed = await prisma.user.updateMany({
      where: {
        id: userId,
        planTierLocked: false,
        planTier: { not: access.planTier },
      },
      data: { planTier: access.planTier },
    });
    if (changed.count) void capturePostHogServerEvent("plan_changed", user.clerkUserId, { previous_plan: user.planTier, plan_tier: access.planTier, access_source: access.source, is_paid_subscriber: access.hasPaidSubscription }).catch(() => {});
  }
  return access.planTier;
}
