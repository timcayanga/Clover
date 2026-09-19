import { parseReceiptLineItemsFromPayload } from "@/lib/receipt-line-items";

export type ReceiptRefreshSource = {
  id: string;
  importFileId?: string | null;
  createdAt?: string;
  rawPayload?: unknown;
  normalizedPayload?: unknown;
};

export function needsReceiptDetailRefresh(transaction: ReceiptRefreshSource | null, now = Date.now()) {
  if (!transaction?.importFileId || !transaction.createdAt) return false;
  const age = now - Date.parse(transaction.createdAt);
  if (!Number.isFinite(age) || age < -5_000 || age > 120_000) return false;
  const raw = transaction.rawPayload as { source?: unknown } | null;
  return raw?.source === "receipt" &&
    parseReceiptLineItemsFromPayload(transaction.rawPayload, transaction.normalizedPayload).length === 0;
}
