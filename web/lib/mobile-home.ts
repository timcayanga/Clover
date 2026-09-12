import { parseRecurringTracking } from "@/lib/recurring-tracking";
import { prisma } from "./prisma";
import { buildActiveWorkspaceTransactionWhere } from "./transaction-query";
import { deriveReconciledBalance, normalizeAccountBalanceSign, type BalanceLikeTransaction } from "./account-balance";
import { resolveEffectiveAccountBalance, selectLatestAccountCheckpoint } from "./account-balance-projection";
import { isSpendableAccountType } from "./account-types";
import { resolveFinancialTransactionType } from "./transaction-directions";

// Read-only native dashboard. Reuses Clover's balance/checkpoint and direction
// rules; never totals a paginated list or mixes currencies without conversion.
export async function mobileHome(workspaceId: string, currency: string) {
  const now = new Date();
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow = new Date(+day + 86400000);
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const since = new Date(+day - 90 * 86400000);
  const [accounts, transactions, commitments] = await Promise.all([
    prisma.account.findMany({ where: { workspaceId }, select: {
      type: true, currency: true, balance: true, source: true,
      transactions: { where: { deletedAt: null, isExcluded: false, account: { source: "manual" } }, select: { amount: true, currency: true, type: true, isExcluded: true, merchantRaw: true, merchantClean: true, description: true, date: true, createdAt: true, rawPayload: true } },
      statementCheckpoints: { select: { endingBalance: true, status: true, statementEndDate: true, createdAt: true, sourceMetadata: true }, orderBy: { createdAt: "desc" }, take: 50 },
    } }),
    prisma.transaction.findMany({ where: buildActiveWorkspaceTransactionWhere(workspaceId, { date: { gte: since, lt: tomorrow }, currency }), select: { date: true, amount: true, type: true, isTransfer: true, reviewStatus: true, category: { select: { name: true } } } }),
    prisma.financialCommitment.findMany({ where: { workspaceId, status: "active", currency }, select: { id: true, title: true, amount: true, kind: true, tracking: true, dueDate: true, nextDueDate: true, plannedPaymentDate: true }, take: 100, orderBy: { nextDueDate: "asc" } }),
  ]);
  const spendable = accounts.filter(a => isSpendableAccountType(a.type));
  const rates = new Map<string, number>();
  rates.set(currency, 1);
  await Promise.all([...new Set(spendable.map(a => a.currency))].filter(c => c !== currency).map(async base => {
    try {
      const response = await fetch(`https://api.frankfurter.dev/v2/rates?base=${encodeURIComponent(base)}&quotes=${currency}`, { next: { revalidate: 21600 }, signal: AbortSignal.timeout(5000) });
      if (!response.ok) return;
      const result = await response.json() as { rate: number }[];
      if (Number.isFinite(result[0]?.rate) && result[0].rate > 0) rates.set(base, result[0].rate);
    } catch { /* Missing FX is unavailable, never zero. */ }
  }));
  const balanceAvailable = spendable.every(a => rates.has(a.currency));
  const balance = balanceAvailable ? spendable.reduce((sum, account) => {
    const checkpoint = selectLatestAccountCheckpoint(account.statementCheckpoints);
    const fallback = account.source === "manual" ? deriveReconciledBalance({
      balance: account.balance?.toString() ?? null,
      transactions: (account.type === "cash" ? account.transactions.filter(t => t.currency === account.currency) : account.transactions).map(t => ({ ...t, amount: t.amount.toString(), rawPayload: t.rawPayload && typeof t.rawPayload === "object" && !Array.isArray(t.rawPayload) ? t.rawPayload as BalanceLikeTransaction["rawPayload"] : null })),
      checkpoints: checkpoint ? [{ ...checkpoint, endingBalance: checkpoint.endingBalance?.toString() ?? null }] : [], treatStoredBalanceAsOpening: true,
    }) : account.balance;
    const effective = resolveEffectiveAccountBalance({ accountType: account.type, liveBalance: fallback, checkpointStatus: checkpoint?.status ?? null, checkpointBalance: checkpoint?.endingBalance ?? null });
    return sum + Math.max(0, normalizeAccountBalanceSign(account.type, Number(effective ?? account.balance ?? 0))) * (rates.get(account.currency) ?? 0);
  }, 0) : null;
  const totals = (from: Date, to: Date) => transactions.filter(t => t.date >= from && t.date < to).reduce((sum, t) => {
    const type = resolveFinancialTransactionType({ ...t, categoryName: t.category?.name });
    if (type === "income" || type === "expense") sum[type] += Math.abs(Number(t.amount));
    return sum;
  }, { income: 0, expense: 0 });
  const report = (days: number) => {
    const from = new Date(+day - (days - 1) * 86400000);
    return { ...totals(from, tomorrow), days: Array.from({ length: days }, (_, i) => {
      const date = new Date(+from + i * 86400000);
      return { date: date.toISOString().slice(0, 10), ...totals(date, new Date(+date + 86400000)) };
    }) };
  };
  const upcoming = commitments.map(c => ({ id: c.id, title: c.title, amount: c.kind === "debt" && c.tracking ? parseRecurringTracking(c.tracking)?.paymentAmount?.toString() ?? null : c.amount?.toString() ?? null, date: c.plannedPaymentDate ?? c.nextDueDate ?? c.dueDate }))
    .filter(c => c.date && c.date >= day && +c.date < +day + 30 * 86400000)
    .sort((a, b) => +a.date! - +b.date!).slice(0, 5).map(c => ({ ...c, date: c.date!.toISOString() }));
  return { currency, balance, month: totals(month, tomorrow), previousMonth: totals(previousMonth, month), weekly: report(7), monthly: report(30), upcoming };
}
