import { finverseBalances } from "./finverse-balances";
import { prisma } from "./prisma";
import { deriveReconciledBalance, type BalanceLikeTransaction } from "./account-balance";
import { resolveEffectiveAccountBalance, selectLatestAccountCheckpoint } from "./account-balance-projection";

/** Add read-only current balances without replacing the stored opening balance. */
export async function mobileAccountBalances(workspaceId: string, ids: string[]) {
  if (!ids.length) return new Map<string, string | null>();
  const accounts = await prisma.account.findMany({
    where: { workspaceId, id: { in: ids }, source: "manual" },
    select: {
      id: true, type: true, currency: true, balance: true,
      transactions: {
        where: { deletedAt: null, isExcluded: false },
        select: { amount: true, currency: true, type: true, merchantRaw: true, merchantClean: true, description: true, date: true, createdAt: true, rawPayload: true },
      },
      statementCheckpoints: {
        select: { endingBalance: true, status: true, statementEndDate: true, createdAt: true, sourceMetadata: true },
        orderBy: { createdAt: "desc" }, take: 50,
      },
    },
  });
  const snapshots = await finverseBalances(workspaceId, ids);
  const result = new Map(accounts.map(account => {
    const checkpoint = selectLatestAccountCheckpoint(account.statementCheckpoints);
    const balance = deriveReconciledBalance({
      balance: account.balance?.toString() ?? null,
      treatStoredBalanceAsOpening: true,
      transactions: account.transactions
        .filter(t => account.type !== "cash" || t.currency === account.currency)
        .map(t => ({ ...t, amount: t.amount.toString(), rawPayload: t.rawPayload && typeof t.rawPayload === "object" && !Array.isArray(t.rawPayload) ? t.rawPayload as BalanceLikeTransaction["rawPayload"] : null })),
      checkpoints: checkpoint ? [{ ...checkpoint, endingBalance: checkpoint.endingBalance?.toString() ?? null }] : [],
    });
    return [account.id, resolveEffectiveAccountBalance({ accountType: account.type, liveBalance: balance, checkpointStatus: checkpoint?.status, checkpointBalance: checkpoint?.endingBalance })];
  }));
  for (const [id, snapshot] of snapshots) result.set(id, snapshot.bankBalance);
  return result;
}
