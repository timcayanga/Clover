import { deriveReconciledBalance, type BalanceLikeTransaction } from './account-balance';
type LedgerBalanceRow = Omit<BalanceLikeTransaction, "rawPayload"> & { rawPayload?: unknown };
export type AccountBalanceAnchor<T extends LedgerBalanceRow = LedgerBalanceRow> = {
  accountId: string;
  balance: string;
  openingBalance: string | null;
  rows: T[];
};
/** Keep the full ledger total while applying edits to the visible slice. Page reads extend both slices. */
export function projectPagedAccountBalance<T extends LedgerBalanceRow>(anchor: AccountBalanceAnchor<T>, openingBalance: string | null, rows: T[]) {
  const subtotal = (balance: string | null, transactions: T[]) => Number(deriveReconciledBalance({
    balance, transactions: transactions.filter(row => !row.isExcluded).map(row => ({ ...row, rawPayload: row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload) ? row.rawPayload as BalanceLikeTransaction["rawPayload"] : null })), treatStoredBalanceAsOpening: true,
  }) ?? 0);
  return (Number(anchor.balance) + subtotal(openingBalance, rows) - subtotal(anchor.openingBalance, anchor.rows)).toFixed(2);
}
