import { prisma } from './prisma';
/** Bank snapshots are read projections, never replacements for confirmed opening balances. */
export async function finverseBalances(workspaceId: string, accountIds?: string[]) {
  const links = await prisma.finverseAccountLink.findMany({ where: { workspaceId, accountId: accountIds ? { in: accountIds } : { not: null } }, select: { accountId: true, normalizedPayload: true, lastSeenAt: true } });
  const result = new Map<string, { bankBalance: string; bankBalanceAt: string }>();
  for (const link of links) {
    const payload = link.normalizedPayload as { balance?: unknown } | null;
    if (link.accountId && payload?.balance != null && Number.isFinite(Number(payload.balance))) result.set(link.accountId, { bankBalance: Number(payload.balance).toFixed(2), bankBalanceAt: link.lastSeenAt.toISOString() });
  }
  return result;
}
