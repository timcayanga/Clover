/** Display estimates only. Never write converted balances back to accounts. */
export type SummaryAccount = {
  type: string;
  currency: string;
  balance: number | null;
};
export const spendableAccountTypes = [
  "bank",
  "bank_account",
  "savings",
  "checking",
  "wallet",
  "cash",
];
const liabilities = [
  "credit_card",
  "loan",
  "mortgage",
  "line_of_credit",
  "payable",
  "bnpl",
  "liability",
];
export function consolidatedAccountSummary(
  accounts: SummaryAccount[],
  target: string,
  rates: Record<string, number>,
) {
  const missing = new Set<string>();
  let unknown = 0;
  const totals = [0, 0, 0, 0];
  for (const account of accounts) {
    if (account.balance === null || !Number.isFinite(account.balance)) {
      unknown++;
      continue;
    }
    const amount = liabilities.includes(account.type)
      ? -Math.abs(account.balance)
      : account.type === "cash"
        ? Math.max(0, account.balance)
        : account.balance;
    const rate = account.currency === target ? 1 : rates[account.currency];
    if (amount !== 0 && (!Number.isFinite(rate) || rate <= 0)) {
      missing.add(account.currency);
      continue;
    }
    const value = amount === 0 ? 0 : amount * rate;
    if (!Number.isFinite(value)) {
      missing.add(account.currency);
      continue;
    }
    totals[0] += value;
    if (spendableAccountTypes.includes(account.type))
      totals[1] += Math.max(0, value);
    totals[2] += Math.max(0, value);
    totals[3] += Math.max(0, -value);
  }
  return {
    values: totals.map((value) => (missing.size || unknown ? null : value)),
    missingCurrencies: [...missing].sort(),
    unknown,
    estimated: accounts.some((a) => a.currency !== target && a.balance !== 0),
  };
}
