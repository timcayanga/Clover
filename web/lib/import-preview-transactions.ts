import type { UploadInsightsSummary } from "@/components/upload-insights-toast";
import {
  getHsbcUkParsedDirection,
  resolveHsbcUkTransactionCategory,
} from "@/lib/hsbc-uk-transactions";
import { getKnownPreviewTransactions } from "@/lib/import-preview-cache";
import type { UploadAccountType } from "@/lib/import-optimistic-summary";
import { coerceTransactionTypeFromCategoryName } from "@/lib/transaction-directions";

export const buildOptimisticPreviewTransactions = (
  rows: Array<Record<string, unknown>>,
  params: {
    importFileId: string;
    accountId: string;
    accountName: string;
    institution: string | null;
    accountNumber?: string | null;
  }
): NonNullable<UploadInsightsSummary["previewTransactions"]> => {
  const previewTransactions = rows
    .map((row, index) => {
      const rawPayload =
        row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
          ? (row.rawPayload as Record<string, unknown>)
          : null;
      const rowKind = typeof rawPayload?.kind === "string" ? rawPayload.kind.trim().toLowerCase() : "";
      if (
        rowKind === "account_snapshot_marker" ||
        rowKind === "opening_balance" ||
        rowKind === "receivable_commitment_marker"
      ) {
        return null;
      }

      const date = typeof row.date === "string" ? row.date : "";
      const amount = typeof row.amount === "string" || typeof row.amount === "number" ? String(row.amount) : "";
      const merchantRaw =
        typeof row.merchantRaw === "string" && row.merchantRaw.trim()
          ? row.merchantRaw.trim()
          : typeof row.description === "string" && row.description.trim()
            ? row.description.trim()
            : "Imported transaction";
      const merchantClean =
        typeof row.merchantClean === "string" && row.merchantClean.trim()
          ? row.merchantClean.trim()
          : merchantRaw;
      const parsedType = row.type === "income" || row.type === "expense" || row.type === "transfer" ? row.type : "expense";
      const parsedCategoryName = typeof row.categoryName === "string" && row.categoryName.trim() ? row.categoryName.trim() : null;
      const description = typeof row.description === "string" && row.description.trim() ? row.description.trim() : null;
      const categoryName = resolveHsbcUkTransactionCategory({
        categoryName: parsedCategoryName ?? "Other",
        merchantRaw,
        merchantClean,
        description,
        rawPayload,
      });
      const directionalType = getHsbcUkParsedDirection(rawPayload) ?? parsedType;
      const type = coerceTransactionTypeFromCategoryName(
        categoryName,
        directionalType,
        amount,
        row.isTransfer === true
      );
      const isTransfer = type === "transfer";

      if (!date || !amount) {
        return null;
      }

      return {
        id: `optimistic-${params.importFileId}-${index}`,
        importFileId: params.importFileId,
        sourceRowIndex: index + 1,
        accountId: params.accountId,
        accountName: params.accountName,
        institution: params.institution,
        accountNumber: params.accountNumber ?? null,
        accountType: null,
        categoryId: null,
        categoryName,
        reviewStatus: "pending_review" as const,
        date,
        amount,
        currency:
          typeof row.currency === "string" && row.currency.trim() ? row.currency.trim().toUpperCase() : "PHP",
        type,
        merchantRaw,
        merchantClean,
        description,
        isTransfer,
        isExcluded: false,
        source: "upload" as const,
      };
    })
    .filter((row) => row !== null) as NonNullable<UploadInsightsSummary["previewTransactions"]>;

  return previewTransactions;
};

export const loadOptimisticPreviewTransactions = async (
  importFileId: string,
  accountId: string,
  accountName: string,
  institution: string | null,
  accountNumber?: string | null
) => {
  const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const normalizeAccountNumber = (value: unknown) => String(value ?? "").replace(/\D/g, "");
  const requestedAccountNumber = normalizeAccountNumber(accountNumber);
  const accountNumbersMatch = (candidate: string | null) => {
    const normalizedCandidate = normalizeAccountNumber(candidate);
    if (!requestedAccountNumber || !normalizedCandidate) {
      return false;
    }

    return (
      normalizedCandidate === requestedAccountNumber ||
      (requestedAccountNumber.length === 4 && normalizedCandidate.endsWith(requestedAccountNumber)) ||
      (normalizedCandidate.length === 4 && requestedAccountNumber.endsWith(normalizedCandidate))
    );
  };
  const getRowAccountNumber = (row: Record<string, unknown>) => {
    if (typeof row.accountNumber === "string" && row.accountNumber.trim()) {
      return row.accountNumber.trim();
    }

    if (row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)) {
      const rawAccountNumber = (row.rawPayload as Record<string, unknown>).accountNumber;
      if (typeof rawAccountNumber === "string" && rawAccountNumber.trim()) {
        return rawAccountNumber.trim();
      }
    }

    return null;
  };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(`/api/imports/${importFileId}/preview`);
    if (response.ok) {
      const payload = await response.json().catch(() => ({}));
      const parsedRows: Record<string, unknown>[] = Array.isArray(payload.parsedRows)
        ? payload.parsedRows.filter((row: unknown): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)))
        : [];
      const scopedRows = accountNumber
        ? (() => {
            const rowsWithAccountNumbers = parsedRows
              .map((row) => ({ row, accountNumber: getRowAccountNumber(row) }))
              .filter((entry) => entry.accountNumber);
            const matchedRows = rowsWithAccountNumbers
              .filter((entry) => accountNumbersMatch(entry.accountNumber))
              .map((entry) => entry.row);

            if (matchedRows.length > 0) {
              return matchedRows;
            }

            return rowsWithAccountNumbers.length === 0 ? parsedRows : [];
          })()
        : parsedRows;
      if (scopedRows.length > 0) {
        return buildOptimisticPreviewTransactions(scopedRows, {
          importFileId,
          accountId,
          accountName,
          institution,
          accountNumber: accountNumber ?? null,
        });
      }
    }

    if (attempt < 5) {
      await sleep(250 + attempt * 100);
    }
  }

  return [];
};

export const loadOrGetKnownPreviewTransactions = async (params: {
  workspaceId: string;
  importFileId?: string | null;
  accountId: string | null;
  optimisticAccountId?: string | null;
  accountName?: string | null;
  institution?: string | null;
  accountNumber?: string | null;
  accountType?: UploadAccountType;
  previewTransactions?: NonNullable<UploadInsightsSummary["previewTransactions"]>;
}) => {
  const directPreviewTransactions =
    Array.isArray(params.previewTransactions) && params.previewTransactions.length > 0 ? params.previewTransactions : null;
  if (directPreviewTransactions) {
    return directPreviewTransactions;
  }

  const canLoadFreshPreview =
    Boolean(params.importFileId && params.accountId && params.accountName);

  if (canLoadFreshPreview) {
    const loadedRows = await loadOptimisticPreviewTransactions(
      params.importFileId!,
      params.accountId!,
      params.accountName!,
      params.institution ?? null,
      params.accountNumber ?? null
    ).catch(() => []);

    if (loadedRows.length > 0) {
      return loadedRows;
    }
  }

  return getKnownPreviewTransactions({
    workspaceId: params.workspaceId,
    accountId: params.accountId,
    optimisticAccountId: params.optimisticAccountId ?? null,
    accountName: params.accountName ?? null,
    institution: params.institution ?? null,
    accountNumber: params.accountNumber ?? null,
    accountType: params.accountType ?? null,
    previewTransactions: params.previewTransactions,
  });
};
