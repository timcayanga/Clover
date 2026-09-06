import { prisma } from "@/lib/prisma";
import { calculateProAccess } from "@/lib/pro-access-rules";

export async function getProAccess(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      billingSubscription: true,
      proGrants: { orderBy: { startsAt: "asc" } },
    },
  });
  return {
    ...calculateProAccess({
      ...user,
      subscription: user.billingSubscription,
      grants: user.proGrants,
    }),
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
    grants: user.proGrants,
  };
}

export async function refreshProAccess(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      planTier: true,
      planTierLocked: true,
      billingSubscription: {
        select: { status: true, interval: true, paidThrough: true },
      },
      proGrants: {
        where: { revokedAt: null, endsAt: { gt: new Date() } },
        select: { startsAt: true, endsAt: true, revokedAt: true },
      },
    },
  });
  const access = calculateProAccess({
    ...user,
    subscription: user.billingSubscription,
    grants: user.proGrants,
  });
  // Conditional write prevents an entitlement refresh overriding a concurrent Admin lock.
  if (!user.planTierLocked && user.planTier !== access.planTier)
    await prisma.user.updateMany({
      where: {
        id: userId,
        planTierLocked: false,
        planTier: { not: access.planTier },
      },
      data: { planTier: access.planTier },
    });
  return access.planTier;
}
