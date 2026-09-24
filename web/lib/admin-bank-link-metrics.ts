export type BankLinkMetricRow = { userId: string; bankId: string; bankName: string; count: number };
export type AdminBankLinkSummary = {
  totalAccounts: number;
  totalUsers: number;
  banks: Array<{ id: string; name: string; accountCount: number; userCount: number }>;
};

export function summarizeBankLinks(rows: BankLinkMetricRow[]): AdminBankLinkSummary {
  const users = new Set<string>();
  const banks = new Map<string, { id: string; name: string; accountCount: number; users: Set<string> }>();
  let totalAccounts = 0;
  for (const row of rows) {
    if (!Number.isSafeInteger(row.count) || row.count <= 0) continue;
    totalAccounts += row.count;
    users.add(row.userId);
    const bank = banks.get(row.bankId) ?? { id: row.bankId, name: row.bankName, accountCount: 0, users: new Set<string>() };
    bank.accountCount += row.count;
    bank.users.add(row.userId);
    banks.set(row.bankId, bank);
  }
  return { totalAccounts, totalUsers: users.size, banks: [...banks.values()]
    .map(bank => ({ id: bank.id, name: bank.name, accountCount: bank.accountCount, userCount: bank.users.size }))
    .sort((a, b) => b.accountCount - a.accountCount || a.name.localeCompare(b.name)) };
}
