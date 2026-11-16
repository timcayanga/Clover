import { prisma } from './prisma';
/** Bank snapshots are read projections, never replacements for confirmed opening balances. */
export async function finverseBalances(workspaceId: string, accountIds?: string[]) {
  const links = await prisma.finverseAccountLink.findMany({ where: { workspaceId, accountId: accountIds ? { in: accountIds } : { not: null } }, select: { accountId: true, normalizedPayload: true, lastSeenAt: true, unlinkedAt:true, connection:{select:{status:true}} } });
  const result = new Map<string, { bankBalance: string; bankBalanceAt: string; bankConnectionStatus:string }>();
  for (const link of links) {
    const payload = link.normalizedPayload as { balance?: unknown } | null;
    if (link.accountId && (!result.has(link.accountId) || +link.lastSeenAt > +new Date(result.get(link.accountId)!.bankBalanceAt)) && payload?.balance != null && Number.isFinite(Number(payload.balance))) result.set(link.accountId, { bankBalance: Number(payload.balance).toFixed(2), bankBalanceAt: link.lastSeenAt.toISOString(), bankConnectionStatus:link.unlinkedAt?"disconnected":link.connection.status });
  }
  return result;
}
