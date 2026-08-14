import { receiptLineItemSignature, parseReceiptLineItemsFromPayload } from "@/lib/receipt-line-items";
import { normalizeTransactionNoteValue, getTransactionUserNoteValue } from "@/lib/transaction-notes";
import type { TransactionDetailDraftValue } from "@/lib/transaction-detail-draft";

type TransactionDraftBaseline = {
  merchantRaw: string;
  merchantClean?: string | null;
  date: string;
  accountId: string;
  amount: string;
  currency?: string | null;
  type: "income" | "expense" | "transfer";
  isExcluded: boolean;
  isTransfer?: boolean | null;
  rawPayload?: unknown;
  normalizedPayload?: unknown;
  description?: string | null;
  source?: string | null;
  importFileId?: string | null;
};

export const hasTransactionDetailDraftChanges = (
  detailDraft: TransactionDetailDraftValue | null,
  selectedTransaction: TransactionDraftBaseline | null,
  options: {
    baselineCategoryId: string;
    baselineCurrency: string;
    baselineTransfer: boolean;
  }
) => {
  if (!selectedTransaction || !detailDraft) {
    return false;
  }

  return (
    (detailDraft.merchantClean.trim() || "") !== (selectedTransaction.merchantClean ?? selectedTransaction.merchantRaw).trim() ||
    detailDraft.date !== selectedTransaction.date.slice(0, 10) ||
    detailDraft.accountId !== selectedTransaction.accountId ||
    detailDraft.categoryId !== options.baselineCategoryId ||
    detailDraft.amount !== selectedTransaction.amount ||
    detailDraft.currency !== options.baselineCurrency ||
    detailDraft.type !==
      (selectedTransaction.type === "income" ? "credit" : selectedTransaction.type === "transfer" ? "transfer" : "debit") ||
    normalizeTransactionNoteValue(detailDraft.description) !==
      getTransactionUserNoteValue({
        normalizedPayload: selectedTransaction.normalizedPayload,
        description: selectedTransaction.description,
        source: selectedTransaction.source,
        importFileId: selectedTransaction.importFileId,
      }) ||
    detailDraft.isExcluded !== selectedTransaction.isExcluded ||
    detailDraft.isTransfer !== options.baselineTransfer ||
    receiptLineItemSignature(detailDraft.receiptLineItems) !==
      receiptLineItemSignature(parseReceiptLineItemsFromPayload(selectedTransaction.rawPayload))
  );
};
