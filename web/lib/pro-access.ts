import { trialSnapshot } from "../../shared/signup-trial";
import { revokeSignupTrial } from "./signup-trial";
import { after } from "next/server";
import { planContext } from "../../shared/plan-analytics";
import { capturePostHogServerEvent } from "./analytics-server";
import { hasStagingProAccess, hasStagingQaAccess } from "@/lib/user-limits";
import { prisma } from "@/lib/prisma";
import { calculateProAccess } from "@/lib/pro-access-rules";

export async function getProAccess(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      signupTrial: true,
      billingSubscription: true,
      storeAccess: true,
      proGrants: { orderBy: { startsAt: "asc" } },
    },
  });
  const access = calculateProAccess({
      ...user,
      stagingQaAccess: hasStagingProAccess(user),
      stagingQaPlanTier: hasStagingQaAccess(user) ? "premium" : undefined,
      subscription: user.billingSubscription,
      grants: user.proGrants,
    });
  return {
    ...access,
    trial: trialSnapshot(user.signupTrial, access.hasPaidSubscription, access.planTier, new Date(), access.source),
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
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`plan-access:${userId}`}, 0))`;
    const user = await tx.user.findUniqueOrThrow({
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
          select: { source: true, planTier: true, startsAt: true, endsAt: true, revokedAt: true },
        },
      },
    });
    if (user.billingSubscription?.status === "suspended") {
      await revokeSignupTrial(tx, userId, "Verified subscription suspended");
      user.proGrants = user.proGrants.filter(g => g.source !== "signup_trial");
    }
    const access = calculateProAccess({
      ...user,
      stagingQaAccess: hasStagingProAccess(user),
      stagingQaPlanTier: hasStagingQaAccess(user) ? "premium" : undefined,
      subscription: user.billingSubscription,
      grants: user.proGrants,
    });
    // Conditional write prevents an entitlement refresh overriding a concurrent Admin lock.
    if (!user.planTierLocked && user.planTier !== access.planTier) {
      const changed = await tx.user.updateMany({
        where: {
          id: userId,
          planTierLocked: false,
          planTier: { not: access.planTier },
        },
        data: { planTier: access.planTier },
      });
      if (changed.count) void capturePostHogServerEvent("plan_changed", user.clerkUserId, { previous_plan: user.planTier, plan_tier: access.planTier, access_source: access.source, is_paid_subscriber: access.hasPaidSubscription }).catch(() => {});
    }
    return { previousTier: user.planTier, access };
  });
  const { access, previousTier } = result;
  // Entitlement webhooks and access expiry use the same durable revocation queue.
  // A failed provider call never rolls back the paid-access decision.
  if(previousTier !== access.planTier) {
    const {enforceBankAllowance,revokeBankConnection}=await import('./finverse-lifecycle');
    await enforceBankAllowance(userId,access.planTier);
    const pending=await prisma.finverseConnection.findMany({where:{userId,status:'disconnect_pending'},select:{id:true},take:5});
    try { after(async()=>{for(const c of pending) await revokeBankConnection(c.id);}); } catch { /* A scheduled lifecycle sweep also drains the durable queue. */ }
  }
  return access.planTier;
}
