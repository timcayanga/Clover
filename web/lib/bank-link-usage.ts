import { calculateProAccess } from "./pro-access-rules";
import { trialActive } from "../../shared/signup-trial";
import type { Prisma, User, BillingSubscription, StoreAccess, ProAccessGrant } from '@prisma/client';
import { PLAN_CATALOG } from '../../shared/plan-catalog';
import { hasStagingProAccess, hasStagingQaAccess, hasUnlimitedPlanLimits } from './user-limits';
import { bankLinkUsageIdentity } from './finverse-matching';

/** Monthly anniversaries also apply to annual subscriptions; clamp short months. */
export function bankLinkPeriod(anchor: Date, now = new Date()) {
  const anniversary = (offset: number) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1, anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds()));
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(anchor.getUTCDate(), last)); return d;
  };
  const offset = anniversary(0) > now ? -1 : 0;
  return { periodStart: anniversary(offset), periodEnd: anniversary(offset + 1) };
}
/** A trial has one allocation bucket. Transition carries reservations, not only active cards. */
async function allocationWindow(tx: Prisma.TransactionClient, user: User & { proGrants: ProAccessGrant[] }, subscription: BillingSubscription | null, store: StoreAccess | null, now: Date) {
  const trial = await tx.signupTrial.findUnique({ where: { userId: user.id } });
  const effective = calculateProAccess({ ...user, subscription, storeAccess: store, grants: user.proGrants, stagingQaAccess: hasStagingProAccess(user), stagingQaPlanTier: hasStagingQaAccess(user) ? "premium" : undefined }, now);
  const paid = effective.hasPaidSubscription;
  const raw = subscription?.rawPayload as { current_billing_period?: { starts_at?: string } } | null;
  const rawStart = raw?.current_billing_period?.starts_at ? new Date(raw.current_billing_period.starts_at) : null;
  const anchor = subscription?.approvedAt ?? (rawStart && Number.isFinite(+rawStart) ? rawStart : subscription?.createdAt ?? store?.expiresAt ?? user.createdAt);
  const onTrial = trialActive(trial, now) && !paid;
  const period = onTrial ? { periodStart: trial!.startsAt, periodEnd: trial!.endsAt } : bankLinkPeriod(anchor, now);
  // During the original trial, returning from paid access includes paid reservations.
  // When buying, seed the first paid window with reservations made in this trial.
  const carry = trial && (onTrial || (trial.startsAt < period.periodEnd && trial.endsAt > period.periodStart))
    ? await tx.bankLinkUsage.findMany({ where: { userId: user.id,
        ...(onTrial ? { periodStart: { lte: now }, periodEnd: { gt: trial.startsAt } } : { periodStart: trial.startsAt }) }, select: { externalAccountId: true } }) : [];
  return { period, carry, effectiveTier: effective.planTier };
}
/** Caller holds the owner's plan-quota advisory lock. Usage survives unlink/deletion. */
export async function bankLinkAllowance(tx: Prisma.TransactionClient, userId: string, now = new Date()) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: { proGrants: true } });
  const subscription = await tx.billingSubscription.findUnique({ where: { userId } });
  const store = await tx.storeAccess.findUnique({ where: { userId } });
  const { period, carry, effectiveTier } = await allocationWindow(tx, user, subscription, store, now);
  // Carry active accounts into every new period; reserve legacy links before unlinking.
  const active = await tx.finverseAccountLink.findMany({ where: { workspace: { userId }, accountId: { not: null }, unlinkedAt: null, connection: { status: { not: 'disconnected' } } }, select: { externalAccountId: true, normalizedPayload: true } });
  await tx.bankLinkUsage.createMany({ data: [...active.map(bankLinkUsageIdentity), ...carry.map(a => a.externalAccountId)].map(externalAccountId => ({ userId, externalAccountId, ...period })), skipDuplicates: true });
  const usage = await tx.bankLinkUsage.findMany({ where: { userId, periodStart: period.periodStart } });
  const usedIds = new Set(usage.map(a => a.externalAccountId));
  const limit = hasUnlimitedPlanLimits(user) ? Number.MAX_SAFE_INTEGER : PLAN_CATALOG[effectiveTier].linkedBanks;
  return { ...period, usedIds, limit, remaining: Math.max(0, limit - usedIds.size) };
}

/** Read-only usage includes reserved slots after unlink and active legacy links. */
export async function readBankLinkUsage(tx: Prisma.TransactionClient, userId: string, now = new Date()) {
  const [user, subscription, store, active] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { id: userId }, include: { proGrants: true } }),
    tx.billingSubscription.findUnique({ where: { userId } }),
    tx.storeAccess.findUnique({ where: { userId } }),
    tx.finverseAccountLink.findMany({ where: { workspace: { userId }, accountId: { not: null }, unlinkedAt: null, connection: { status: { not: 'disconnected' } } }, select: { externalAccountId: true, normalizedPayload: true } }),
  ]);
  const { period: { periodStart }, carry, effectiveTier } = await allocationWindow(tx, user, subscription, store, now);
  const reserved = await tx.bankLinkUsage.findMany({ where: { userId, periodStart }, select: { externalAccountId: true } });
  return { used: new Set([...reserved.map(row => row.externalAccountId), ...carry.map(row => row.externalAccountId), ...active.map(bankLinkUsageIdentity)]).size, limit: hasUnlimitedPlanLimits(user) ? null : PLAN_CATALOG[effectiveTier].linkedBanks };
}
