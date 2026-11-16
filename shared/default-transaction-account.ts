/** Prefer the most-used eligible account, retaining source order for ties. */
export function mostUsedTransactionAccount<T extends { transactionCount?: number | null }>(accounts: readonly T[]): T | undefined {
  const count = (account: T) => Number.isFinite(account.transactionCount) ? Math.max(0, account.transactionCount ?? 0) : 0;
  return accounts.reduce<T | undefined>((best, account) => !best || count(account) > count(best) ? account : best, undefined);
}
