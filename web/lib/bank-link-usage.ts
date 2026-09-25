import type { Prisma } from '@prisma/client';
import { PLAN_CATALOG } from '../../shared/plan-catalog';
import { hasUnlimitedPlanLimits } from './user-limits';
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
/** Caller holds the owner's plan-quota advisory lock. Usage survives unlink/deletion. */
export async function bankLinkAllowance(tx: Prisma.TransactionClient, userId: string, now = new Date()) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  const subscription = await tx.billingSubscription.findUnique({ where: { userId } });
  const store = await tx.storeAccess.findUnique({ where: { userId } });
  const raw = subscription?.rawPayload as { current_billing_period?: { starts_at?: string } } | null;
  const rawStart = raw?.current_billing_period?.starts_at ? new Date(raw.current_billing_period.starts_at) : null;
  const anchor = subscription?.approvedAt ?? (rawStart && Number.isFinite(+rawStart) ? rawStart : subscription?.createdAt ?? store?.expiresAt ?? user.createdAt);
  const period = bankLinkPeriod(anchor, now);
  // Carry active accounts into every new period; reserve legacy links before unlinking.
  const active = await tx.finverseAccountLink.findMany({ where: { workspace: { userId }, accountId: { not: null }, unlinkedAt: null, connection: { status: { not: 'disconnected' } } }, select: { externalAccountId: true, normalizedPayload: true } });
  await tx.bankLinkUsage.createMany({ data: active.map(a => ({ userId, externalAccountId: bankLinkUsageIdentity(a), ...period })), skipDuplicates: true });
  const usage = await tx.bankLinkUsage.findMany({ where: { userId, periodStart: period.periodStart } });
  const usedIds = new Set(usage.map(a => a.externalAccountId));
  const limit = hasUnlimitedPlanLimits(user) ? Number.MAX_SAFE_INTEGER : PLAN_CATALOG[user.planTier].linkedBanks;
  return { ...period, usedIds, limit, remaining: Math.max(0, limit - usedIds.size) };
}
