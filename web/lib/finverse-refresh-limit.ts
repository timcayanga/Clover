import { prisma } from "./prisma";

export const BANK_REFRESH_LIMIT = 4;
const WINDOW_MS = 24 * 60 * 60 * 1000;
export class BankRefreshLimitError extends Error {
  constructor(public readonly retryAt: Date) {
    super("This bank has reached its four refresh attempts in 24 hours. You can refresh again after the limit resets.");
  }
}

/** Reserve before contacting the provider; a failed attempt still uses its slot. */
export async function reserveBankRefresh(connection: { id: string; userId: string; workspaceId: string }, now = new Date()) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`bank-refresh:${connection.id}`}, 0))`;
    const attempts = await tx.auditLog.findMany({
      where: { actorUserId: connection.userId, entity: "FinverseConnection", entityId: connection.id,
        action: "bank.refresh_attempt", createdAt: { gt: new Date(+now - WINDOW_MS) } },
      orderBy: { createdAt: "asc" }, select: { createdAt: true },
    });
    if (attempts.length >= BANK_REFRESH_LIMIT) throw new BankRefreshLimitError(new Date(+attempts[attempts.length - BANK_REFRESH_LIMIT].createdAt + WINDOW_MS));
    await tx.auditLog.create({ data: { workspaceId: connection.workspaceId, actorUserId: connection.userId,
      entity: "FinverseConnection", entityId: connection.id, action: "bank.refresh_attempt", createdAt: now } });
    return { remaining: BANK_REFRESH_LIMIT - attempts.length - 1 };
  });
}
