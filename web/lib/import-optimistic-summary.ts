import type { UploadInsightsSummary } from "@/components/upload-insights-toast";
import type { AccountType } from "@/lib/domain-types";
import { formatUploadAccountDisplayName } from "@/lib/account-display";
import { inferAccountTypeFromStatement } from "@/lib/import-parser";
import {
  getCachedAccountsWorkspace,
  syncImportedWorkspaceAccountCaches,
  syncImportedWorkspaceTransactionCaches,
} from "@/lib/workspace-cache";
import {
  canonicalizeSecurityBankUploadIdentity,
  importedAccountIdentityKey,
  isFilenameOnlyScreenshotSummary,
  normalizeStatementAccountName,
} from "@/lib/import-statement-identity";

export type UploadAccountType = AccountType | null;

export const buildOptimisticUploadSummary = (
  fileName: string,
  importedRows: number,
  accountId: string | null,
  accountName: string | null,
  institution: string | null,
  accountType: UploadAccountType = null,
  optimisticAccountId: string | null,
  balance: string | null = null,
  previewTransactions: UploadInsightsSummary["previewTransactions"] = [],
  accountNumber: string | null = null,
  showBalanceEvenIfEmpty = false
): UploadInsightsSummary => {
  const canonicalIdentity = canonicalizeSecurityBankUploadIdentity({
    fileName,
    accountName,
    institution,
    accountNumber,
  });

  return {
    fileName,
    rowsImported: importedRows,
    accountId,
    accountName: canonicalIdentity.accountName,
    institution: canonicalIdentity.institution,
    accountNumber: canonicalIdentity.accountNumber,
    accountType,
    balance: showBalanceEvenIfEmpty || importedRows > 0 ? balance : null,
    accountSummaries: undefined,
    optimistic: true,
    optimisticAccountId,
    incomeTotal: 0,
    expenseTotal: 0,
    netTotal: 0,
    topCategoryName: null,
    topCategoryAmount: null,
    topCategoryShare: null,
    topMerchantName: null,
    topMerchantCount: null,
    previewTransactions,
  };
};

export const buildImportedWorkspaceAccount = (summary: UploadInsightsSummary) => {
  const accountId = summary.accountId ?? summary.optimisticAccountId ?? null;
  if (!accountId || !summary.accountName) {
    return null;
  }
  if (isFilenameOnlyScreenshotSummary(summary.fileName, summary)) {
    return null;
  }

  const normalizedAccountName = formatUploadAccountDisplayName(
    summary.accountName,
    summary.institution,
    summary.accountNumber ?? null,
    summary.accountType ?? null
  );
  const accountType =
    summary.accountType ??
    inferAccountTypeFromStatement(summary.institution, normalizedAccountName, "bank");
  const transactionCount = Math.max(
    Number(summary.rowsImported ?? 0) || 0,
    Array.isArray(summary.previewTransactions) ? summary.previewTransactions.length : 0
  );

  return {
    id: accountId,
    optimisticAccountId: summary.optimisticAccountId ?? null,
    name: normalizedAccountName,
    institution: summary.institution,
    accountNumber: summary.accountNumber ?? null,
    type: accountType,
    currency: summary.previewTransactions?.[0]?.currency ?? "PHP",
    source: "upload",
    balance: summary.balance,
    transactionCount,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
};

export const seedImportedWorkspaceCaches = (workspaceId: string, summary: UploadInsightsSummary) => {
  const importedAccount = buildImportedWorkspaceAccount(summary);
  if (importedAccount) {
    const currentAccount = getCachedAccountsWorkspace(workspaceId)?.accounts.find((entry) => {
      const entryId = typeof entry.id === "string" ? entry.id : "";
      const optimisticId =
        typeof (entry as { optimisticAccountId?: string | null }).optimisticAccountId === "string"
          ? (entry as { optimisticAccountId?: string | null }).optimisticAccountId
          : "";
      const entryName =
        typeof entry.name === "string"
          ? normalizeStatementAccountName(entry.name, typeof entry.institution === "string" ? entry.institution : null)
          : "";
      const importedName = formatUploadAccountDisplayName(
        summary.accountName ?? "",
        summary.institution ?? null,
        summary.accountNumber ?? null,
        summary.accountType ?? null
      );
      const entryInstitution = typeof entry.institution === "string" ? entry.institution : null;
      const entryAccountNumber =
        typeof (entry as { accountNumber?: unknown }).accountNumber === "string"
          ? (entry as { accountNumber?: string }).accountNumber
          : null;
      return (
        entryId === importedAccount.id ||
        optimisticId === importedAccount.id ||
        importedAccountIdentityKey(entryName, entryInstitution, entryAccountNumber) ===
          importedAccountIdentityKey(importedName, summary.institution ?? null, summary.accountNumber ?? null)
      );
    });

    if (!importedAccount.accountNumber && typeof currentAccount?.accountNumber === "string" && currentAccount.accountNumber.trim()) {
      importedAccount.accountNumber = currentAccount.accountNumber.trim();
    }
    const currentBalance = typeof currentAccount?.balance === "string" ? currentAccount.balance.trim() : "";
    const importedBalance = typeof importedAccount.balance === "string" ? importedAccount.balance.trim() : "";
    const importedIsZeroish = importedBalance !== "" && Number(importedBalance) === 0;
    const currentIsNonZero = currentBalance !== "" && Number(currentBalance) !== 0;
    if ((!importedBalance || importedIsZeroish) && currentIsNonZero) {
      importedAccount.balance = currentBalance;
    }

    syncImportedWorkspaceAccountCaches(workspaceId, importedAccount);
  }

  if (Array.isArray(summary.previewTransactions) && summary.previewTransactions.length > 0) {
    syncImportedWorkspaceTransactionCaches(workspaceId, summary.previewTransactions);
  }
};
