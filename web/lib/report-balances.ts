import { deriveReconciledBalance, getTransactionAmountDelta, normalizeAccountBalanceSign, type BalanceLikeTransaction } from "@/lib/account-balance";
import { resolveEffectiveAccountBalance, selectLatestAccountCheckpoint } from "@/lib/account-balance-projection";

type Account = {
  id: string; type: string; currency: string; source: string;
  balance: { toString(): string } | string | null;
  transactions: Array<BalanceLikeTransaction & { amount: { toString(): string } | string; currency: string }>;
  statementCheckpoints: Array<{ endingBalance: { toString(): string } | string | null; status: string; statementEndDate: Date | null; createdAt: Date; sourceMetadata: unknown }>;
};

export function reportAccountBalance(account: Account) {
  const checkpoint = selectLatestAccountCheckpoint(account.statementCheckpoints);
  const balance = account.source === "manual" ? deriveReconciledBalance({
    balance: account.balance?.toString() ?? null,
    transactions: account.transactions.filter(t => t.currency === account.currency).map(t => ({ ...t, amount: t.amount.toString() })),
    treatStoredBalanceAsOpening: true,
  }) : account.balance;
  const effective = resolveEffectiveAccountBalance({ accountType: account.type, liveBalance: balance,
    checkpointStatus: checkpoint?.status, checkpointBalance: checkpoint?.endingBalance });
  return effective === null ? null : normalizeAccountBalanceSign(account.type, Number(effective));
}

/** Estimate earlier balances by reversing recorded movements from today's balance.
 * Currency series remain separate; a selected account's transfers affect its balance.
 */
export function buildReportBalanceSeries(
  accounts: Array<{ id: string; currency: string; balance: unknown }>,
  movements: Array<BalanceLikeTransaction & { accountId: string; date: Date }>,
  from: Date, to: Date, asOf: Date,
) {
  const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  return [...new Set(accounts.map(a => a.currency))].map(currency => {
    const selected = accounts.filter(a => a.currency === currency);
    const ids = new Set(selected.map(a => a.id));
    const deltas = new Map<string,number>();
    for (const t of movements) {
      if (!ids.has(t.accountId) || +t.date > +asOf) continue;
      const key = dateKey(t.date);
      deltas.set(key, (deltas.get(key) ?? 0) + getTransactionAmountDelta(t));
    }
    const points: Array<{date:string;balance:number}> = [];
    if (selected.some(a => a.balance === null || !Number.isFinite(Number(a.balance)))) return {currency,points};
    let balance = selected.reduce((sum,a) => sum + Number(a.balance),0);
    const start = dateKey(from);
    for (const [date,delta] of deltas) if(date >= start) balance -= delta;
    const day = new Date(from); day.setHours(0,0,0,0);
    const end = Math.min(+to,+asOf);
    while(+day <= end) {
      const date = dateKey(day); balance += deltas.get(date) ?? 0;
      points.push({date,balance:Math.round(balance*100)/100}); day.setDate(day.getDate()+1);
    }
    return {currency,points};
  });
}
