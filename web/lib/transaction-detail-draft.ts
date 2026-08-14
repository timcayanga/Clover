import { receiptLineItemToDraft, parseReceiptLineItemsFromPayload, type ReceiptLineItemDraftValue } from "@/lib/receipt-line-items";
import { getTransactionUserNoteValue } from "@/lib/transaction-notes";

export type TransactionDetailDraftValue = {
  merchantRaw: string;
  merchantClean: string;
  date: string;
  accountId: string;
  categoryId: string;
  amount: string;
  currency: string;
  type: "debit" | "credit" | "transfer";
  description: string;
  isExcluded: boolean;
  isTransfer: boolean;
  receiptLineItems: ReceiptLineItemDraftValue[];
};

type TransactionDetailDraftSource = {
  merchantRaw: string;
  merchantClean?: string | null;
  date: string;
  accountId: string;
  categoryId?: string | null;
  amount: string;
  currency?: string | null;
  isExcluded: boolean;
  isTransfer?: boolean | null;
  rawPayload?: unknown;
  normalizedPayload?: unknown;
  description?: string | null;
  source?: string | null;
  importFileId?: string | null;
};

export const buildTransactionDetailDraft = (
  transaction: TransactionDetailDraftSource,
  options: {
    merchantClean: string;
    effectiveType: "income" | "expense" | "transfer";
    categoryId?: string | null;
    currencyFallback?: string;
    isTransfer?: boolean;
  }
): TransactionDetailDraftValue => ({
  merchantRaw: transaction.merchantRaw,
  merchantClean: options.merchantClean,
  date: transaction.date.slice(0, 10),
  accountId: transaction.accountId,
  categoryId: options.categoryId ?? transaction.categoryId ?? "",
  amount: transaction.amount,
  currency: transaction.currency ?? options.currencyFallback ?? "PHP",
  type: options.effectiveType === "income" ? "credit" : options.effectiveType === "transfer" ? "transfer" : "debit",
  description: getTransactionUserNoteValue({
    normalizedPayload: transaction.normalizedPayload,
    description: transaction.description,
    source: transaction.source,
    importFileId: transaction.importFileId,
  }),
  isExcluded: transaction.isExcluded,
  isTransfer: options.isTransfer ?? Boolean(transaction.isTransfer || options.effectiveType === "transfer"),
  receiptLineItems: parseReceiptLineItemsFromPayload(transaction.rawPayload).map(receiptLineItemToDraft),
});

export const detailDraftTypeToTransactionType = (type: TransactionDetailDraftValue["type"]) =>
  type === "credit" ? "income" : type === "transfer" ? "transfer" : "expense";
