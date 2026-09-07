import { mergeReceiptLineItemsIntoPayload } from "@/lib/receipt-line-items";
import { detailDraftTypeToTransactionType, type TransactionDetailDraftValue } from "@/lib/transaction-detail-draft";

type TransactionUpdatePayloadSource = {
  rawPayload?: unknown;
  currency?: string | null;
};

export const buildTransactionUpdatePayload = (
  detailDraft: TransactionDetailDraftValue,
  selectedTransaction: TransactionUpdatePayloadSource,
  options?: {
    fallbackCurrency?: string;
  }
) => {
  const currency =
    detailDraft.currency.trim().toUpperCase() ||
    selectedTransaction.currency ||
    options?.fallbackCurrency ||
    "PHP";

  return {
    merchantRaw: detailDraft.merchantRaw,
    merchantClean: detailDraft.merchantClean.trim() || null,
    date: detailDraft.date,
    accountId: detailDraft.accountId,
    categoryId: detailDraft.categoryId || null,
    amount: detailDraft.amount,
    currency,
    type: detailDraftTypeToTransactionType(detailDraft.type),
    // An empty string explicitly clears a note; legacy nulls mean no user note was recorded.
    userNote: detailDraft.description,
    isExcluded: detailDraft.isExcluded,
    isTransfer: detailDraft.type === "transfer",
    rawPayload: mergeReceiptLineItemsIntoPayload(
      selectedTransaction.rawPayload,
      detailDraft.receiptLineItems,
      currency
    ),
  };
};
