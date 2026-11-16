import type { Transaction } from "./types";

export function mergeCommittedReceiptRows(rows: Transaction[], committed: readonly Transaction[]) {
  const authoritativeIds = new Set(rows.map(row => row.id));
  const inserted = committed.filter(row => !authoritativeIds.has(row.id));
  if (!inserted.length) return rows;
  return [...rows, ...inserted].sort((left, right) =>
    right.date.localeCompare(left.date) ||
    (right.createdAt ?? "").localeCompare(left.createdAt ?? "") ||
    right.id.localeCompare(left.id)
  );
}
