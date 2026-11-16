import { getAccountCardName, getAccountDisplayName } from "@/lib/account-display";
import { appendImportedAccountLastFour, appendWiseWalletCurrency, isWiseWalletWithoutVisibleAccountNumber } from "@/lib/imported-account-identity";

type AccountLabelInput = Parameters<typeof getAccountDisplayName>[0];
type SortAccount = AccountLabelInput & { id: string };
type Direction = "asc" | "desc";
const compareLabels = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

export const formatTransactionAccountName = (account: AccountLabelInput) => {
  if (account.type === "cash") return getAccountDisplayName(account);
  const label = account.source === "upload" ? getAccountCardName(account) : getAccountDisplayName(account);
  return isWiseWalletWithoutVisibleAccountNumber(account)
    ? appendWiseWalletCurrency(label, account.currency)
    : appendImportedAccountLastFour(label, account.accountNumber);
};

// Count account groups first, then read only the groups intersecting this page.
// Equal display labels share a group so date/id ties stay stable across accounts.
export const planTransactionAccountPage = (
  accounts: SortAccount[],
  counts: Array<{ accountId: string; count: number }>,
  offset: number,
  limit: number,
  direction: Direction
) => {
  const labels = new Map(accounts.map(a => [a.id, formatTransactionAccountName(a)]));
  const ordered = counts.filter(c => c.count > 0).map(c => ({ ...c, label: labels.get(c.accountId) ?? "Account" }))
    .sort((a, b) => compareLabels(a.label, b.label) * (direction === "asc" ? 1 : -1));
  const groups: Array<{ label: string; accountIds: string[]; count: number }> = [];
  for (const row of ordered) {
    const previous = groups.at(-1);
    if (previous && compareLabels(previous.label, row.label) === 0) {
      previous.accountIds.push(row.accountId);
      previous.count += row.count;
    } else groups.push({ label: row.label, accountIds: [row.accountId], count: row.count });
  }
  const segments: Array<{ accountIds: string[]; skip: number; take: number }> = [];
  let start = 0;
  for (const group of groups) {
    const skip = Math.max(0, offset - start);
    const take = Math.max(0, Math.min(start + group.count, offset + limit) - Math.max(start, offset));
    if (take) segments.push({ accountIds: group.accountIds, skip, take });
    start += group.count;
  }
  return segments;
};

export const compareTransactionsByAccount = (accounts: SortAccount[], direction: Direction) => {
  const labels = new Map(accounts.map(a => [a.id, formatTransactionAccountName(a)]));
  const multiplier = direction === "asc" ? 1 : -1;
  return (a: { id: string; accountId: string; date: string | Date }, b: { id: string; accountId: string; date: string | Date }) =>
    compareLabels(labels.get(a.accountId) ?? "Account", labels.get(b.accountId) ?? "Account") * multiplier ||
    new Date(b.date).getTime() - new Date(a.date).getTime() ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) * multiplier;
};
