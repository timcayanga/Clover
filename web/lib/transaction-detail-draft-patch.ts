import type { TransactionDetailDraftValue } from "@/lib/transaction-detail-draft";

type TransactionDraftPatch = {
  merchantRaw?: string;
  merchantClean?: string | null;
  date?: string;
  accountId?: string;
  categoryId?: string | null;
  amount?: string;
  currency?: string;
  type?: "income" | "expense" | "transfer";
  description?: string | null;
  isExcluded?: boolean;
  isTransfer?: boolean;
};

export const applyTransactionPatchToDetailDraft = (
  current: TransactionDetailDraftValue,
  patch: TransactionDraftPatch
): TransactionDetailDraftValue => ({
  ...current,
  merchantRaw: patch.merchantRaw ?? current.merchantRaw,
  merchantClean: patch.merchantClean ?? current.merchantClean,
  date: patch.date ? patch.date.slice(0, 10) : current.date,
  accountId: patch.accountId ?? current.accountId,
  categoryId: patch.categoryId ?? current.categoryId,
  amount: patch.amount ?? current.amount,
  currency: patch.currency ?? current.currency,
  type:
    patch.type === "income"
      ? "credit"
      : patch.type === "expense"
        ? "debit"
        : current.type,
  description: patch.description !== undefined ? patch.description ?? "" : current.description,
  isExcluded: patch.isExcluded ?? current.isExcluded,
  isTransfer: patch.isTransfer ?? current.isTransfer,
});
