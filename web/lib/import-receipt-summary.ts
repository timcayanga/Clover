import type { ReceiptPreviewResult } from "@/lib/split-bill";
import type { UploadInsightsSummary } from "@/components/upload-insights-toast";
import type { AccountType } from "@/lib/domain-types";

export type UploadAccountType = AccountType | null;

export type ReceiptAccountOption = {
  id: string;
  name: string;
  institution: string | null;
  type: string;
};

type BuildOptimisticSummary = (params: {
  fileName: string;
  importedRows: number;
  accountId: string | null;
  accountName: string | null;
  institution: string | null;
  accountType: UploadAccountType;
  optimisticAccountId?: string | null;
  balance?: string | null;
  previewTransactions?: UploadInsightsSummary["previewTransactions"];
  accountNumber?: string | null;
  showBalanceEvenIfEmpty?: boolean;
}) => UploadInsightsSummary;

type ReceiptDocumentLike = {
  total?: string | null;
  transactionDate?: string | null;
  merchantRaw?: string | null;
  merchantClean?: string | null;
  currency?: string | null;
};

type ReceiptTransactionLike = {
  id?: string;
  accountId?: string;
  accountName?: string;
  institution?: string | null;
  accountNumber?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  reviewStatus?: "pending_review" | "suggested" | "confirmed" | "edited" | "rejected" | "duplicate_skipped";
  date?: string;
  amount?: string;
  currency?: string;
  type?: "income" | "expense" | "transfer";
  merchantRaw?: string;
  merchantClean?: string | null;
  description?: string | null;
  rawPayload?: Record<string, unknown> | null;
  isTransfer?: boolean;
  isExcluded?: boolean;
};

export const buildReceiptPreviewTransactions = (
  preview: ReceiptPreviewResult,
  params: {
    importFileId: string;
    accountId: string;
    accountName: string | null;
  }
): NonNullable<UploadInsightsSummary["previewTransactions"]> => {
  const amount = preview.total?.trim() ?? "";
  const date = preview.billDate?.trim() ?? "";

  if (!amount || !date) {
    return [];
  }

  return [
    {
      id: `optimistic-${params.importFileId}-receipt`,
      importFileId: params.importFileId,
      sourceRowIndex: 1,
      accountId: params.accountId,
      accountName: params.accountName ?? "Receipt",
      categoryId: null,
      categoryName: null,
      reviewStatus: "pending_review",
      date,
      amount,
      currency: preview.currency?.trim().toUpperCase() || "PHP",
      type: "expense",
      merchantRaw: preview.merchantName?.trim() || "Receipt",
      merchantClean: preview.merchantName?.trim() || null,
      description: preview.merchantName?.trim() || null,
      isTransfer: false,
      isExcluded: false,
      source: "upload",
    },
  ];
};

export const buildReceiptOptimisticSummary = (
  fileName: string,
  importFileId: string,
  preview: ReceiptPreviewResult,
  account: ReceiptAccountOption,
  buildOptimisticSummary: BuildOptimisticSummary
): UploadInsightsSummary => {
  const accountType = account.type as UploadAccountType;
  const previewTransactions = buildReceiptPreviewTransactions(preview, {
    importFileId,
    accountId: account.id,
    accountName: account.name,
  });

  const summary = buildOptimisticSummary({
    fileName,
    importedRows: previewTransactions.length,
    accountId: account.id,
    accountName: account.name,
    institution: account.institution ?? null,
    accountType,
    optimisticAccountId: null,
    balance: null,
    previewTransactions,
    accountNumber: null,
    showBalanceEvenIfEmpty: false,
  });

  return {
    ...summary,
    optimistic: false,
  };
};

export const buildReceiptSummaryFromReceiptDocument = (
  params: {
    fileName: string;
    importFileId: string;
    receiptDocument: ReceiptDocumentLike;
    accountId: string | null;
    accountType: UploadAccountType;
    previewAccountName?: string | null;
  },
  buildOptimisticSummary: BuildOptimisticSummary
): UploadInsightsSummary | null => {
  const total = typeof params.receiptDocument.total === "string" ? params.receiptDocument.total.trim() : "";
  const transactionDate = typeof params.receiptDocument.transactionDate === "string" ? params.receiptDocument.transactionDate.trim() : "";
  if (!total || !transactionDate) {
    return null;
  }

  const merchantName =
    typeof params.receiptDocument.merchantClean === "string" && params.receiptDocument.merchantClean.trim()
      ? params.receiptDocument.merchantClean.trim()
      : typeof params.receiptDocument.merchantRaw === "string" && params.receiptDocument.merchantRaw.trim()
        ? params.receiptDocument.merchantRaw.trim()
        : "Receipt";

  const normalizedAccountId = params.accountId ?? `receipt-${params.importFileId}`;
  const previewTransactions: NonNullable<UploadInsightsSummary["previewTransactions"]> = [
    {
      id: `optimistic-${params.importFileId}-receipt`,
      importFileId: params.importFileId,
      sourceRowIndex: 1,
      accountId: normalizedAccountId,
      accountName: params.previewAccountName ?? "Receipt",
      categoryId: null,
      categoryName: null,
      reviewStatus: "pending_review",
      date: transactionDate,
      amount: total,
      currency: params.receiptDocument.currency?.trim().toUpperCase() || "PHP",
      type: "expense",
      merchantRaw: merchantName,
      merchantClean: merchantName,
      description: merchantName,
      isTransfer: false,
      isExcluded: false,
      source: "upload",
    },
  ];

  return {
    ...buildOptimisticSummary({
      fileName: params.fileName,
      importedRows: previewTransactions.length,
      accountId: params.accountId,
      accountName: null,
      institution: null,
      accountType: params.accountType,
      optimisticAccountId: null,
      balance: null,
      previewTransactions,
      accountNumber: null,
      showBalanceEvenIfEmpty: false,
    }),
    optimistic: false,
  };
};

export const buildReceiptSummaryFromReceiptTransaction = (
  params: {
    fileName: string;
    importFileId: string;
    receiptTransaction: ReceiptTransactionLike;
    accountType: UploadAccountType;
  },
  buildOptimisticSummary: BuildOptimisticSummary
): UploadInsightsSummary | null => {
  const amount = typeof params.receiptTransaction.amount === "string" ? params.receiptTransaction.amount.trim() : "";
  const date = typeof params.receiptTransaction.date === "string" ? params.receiptTransaction.date.trim() : "";
  const accountId = typeof params.receiptTransaction.accountId === "string" ? params.receiptTransaction.accountId.trim() : "";
  const accountName =
    typeof params.receiptTransaction.accountName === "string" && params.receiptTransaction.accountName.trim()
      ? params.receiptTransaction.accountName.trim()
      : "Receipt";
  if (!amount || !date || !accountId) {
    return null;
  }

  const merchantName =
    typeof params.receiptTransaction.merchantClean === "string" && params.receiptTransaction.merchantClean.trim()
      ? params.receiptTransaction.merchantClean.trim()
      : typeof params.receiptTransaction.merchantRaw === "string" && params.receiptTransaction.merchantRaw.trim()
        ? params.receiptTransaction.merchantRaw.trim()
        : typeof params.receiptTransaction.description === "string" && params.receiptTransaction.description.trim()
          ? params.receiptTransaction.description.trim()
          : "Receipt";

  const receiptDetails =
    params.receiptTransaction.rawPayload &&
    typeof params.receiptTransaction.rawPayload === "object" &&
    !Array.isArray(params.receiptTransaction.rawPayload)
      ? (params.receiptTransaction.rawPayload.receiptDetails as Record<string, unknown> | undefined)
      : undefined;

  const previewTransactions: NonNullable<UploadInsightsSummary["previewTransactions"]> = [
    {
      id:
        typeof params.receiptTransaction.id === "string" && params.receiptTransaction.id.trim()
          ? params.receiptTransaction.id.trim()
          : `optimistic-${params.importFileId}-receipt`,
      importFileId: params.importFileId,
      sourceRowIndex: 1,
      accountId,
      accountName,
      categoryId:
        typeof params.receiptTransaction.categoryId === "string" && params.receiptTransaction.categoryId.trim()
          ? params.receiptTransaction.categoryId.trim()
          : null,
      categoryName:
        typeof params.receiptTransaction.categoryName === "string" && params.receiptTransaction.categoryName.trim()
          ? params.receiptTransaction.categoryName.trim()
          : receiptDetails && typeof receiptDetails.category_name === "string"
            ? String(receiptDetails.category_name)
            : null,
      reviewStatus: params.receiptTransaction.reviewStatus ?? "pending_review",
      date,
      amount,
      currency: params.receiptTransaction.currency?.trim().toUpperCase() || "PHP",
      type: params.receiptTransaction.type ?? "expense",
      merchantRaw: merchantName,
      merchantClean: merchantName,
      description:
        typeof params.receiptTransaction.description === "string" && params.receiptTransaction.description.trim()
          ? params.receiptTransaction.description.trim()
          : merchantName,
      isTransfer: Boolean(params.receiptTransaction.isTransfer),
      isExcluded: Boolean(params.receiptTransaction.isExcluded),
      source: "upload",
    },
  ];

  return {
    ...buildOptimisticSummary({
      fileName: params.fileName,
      importedRows: previewTransactions.length,
      accountId,
      accountName,
      institution: params.receiptTransaction.institution ?? null,
      accountType: params.accountType,
      optimisticAccountId: null,
      balance: null,
      previewTransactions,
      accountNumber: params.receiptTransaction.accountNumber ?? null,
      showBalanceEvenIfEmpty: false,
    }),
    optimistic: false,
  };
};
