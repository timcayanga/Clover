import type { UploadInsightsSummary } from "@/components/upload-insights-toast";
import type { AccountType } from "@/lib/domain-types";
import { formatUploadAccountDisplayName } from "@/lib/account-display";
import { inferAccountTypeFromStatement } from "@/lib/financial-classification";
import { findKnownImportedBalance, getKnownPreviewTransactions } from "@/lib/import-preview-cache";
import { pickStableBalance } from "@/lib/import-upload-summary";
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

export type ImportSummaryAccountOption = {
  id: string;
  name: string;
  institution: string | null;
  accountNumber?: string | null;
  balance?: string | null;
  currency?: string | null;
  type: string;
};

type UploadInsightMetrics = Pick<
  UploadInsightsSummary,
  | "incomeTotal"
  | "expenseTotal"
  | "netTotal"
  | "topCategoryName"
  | "topCategoryAmount"
  | "topCategoryShare"
  | "topMerchantName"
  | "topMerchantCount"
>;

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
    currency: previewTransactions?.[0]?.currency ?? null,
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

export const buildResolvedOptimisticUploadSummary = (params: {
  accounts: ImportSummaryAccountOption[];
  workspaceId: string;
  fileName: string;
  importedRows: number;
  accountId: string | null;
  accountName: string | null;
  institution: string | null;
  accountType: UploadAccountType;
  currency?: string | null;
  optimisticAccountId: string | null;
  accountNumber?: string | null;
  balanceSources?: Array<unknown>;
  previewTransactions?: UploadInsightsSummary["previewTransactions"];
  showBalanceEvenIfEmpty?: boolean;
  insightMetrics?: Partial<UploadInsightMetrics> | null;
  accountSummaries?: UploadInsightsSummary["accountSummaries"];
  optimistic?: boolean;
}) => {
  const resolvedBalance = pickStableBalance(
    ...(params.balanceSources ?? []),
    findKnownImportedBalance(params.accounts, {
      workspaceId: params.workspaceId,
      accountId: params.accountId,
      accountName: params.accountName,
      institution: params.institution,
      accountNumber: params.accountNumber ?? null,
      accountType: params.accountType,
    })
  );
  const resolvedPreviewTransactions = getKnownPreviewTransactions({
    workspaceId: params.workspaceId,
    accountId: params.accountId,
    optimisticAccountId: params.optimisticAccountId,
    accountName: params.accountName,
    institution: params.institution,
    accountNumber: params.accountNumber ?? null,
    accountType: params.accountType,
    previewTransactions: params.previewTransactions,
  });

  const summary = buildOptimisticUploadSummary(
    params.fileName,
    params.importedRows,
    params.accountId,
    params.accountName,
    params.institution,
    params.accountType,
    params.optimisticAccountId,
    resolvedBalance,
    resolvedPreviewTransactions,
    params.accountNumber ?? null,
    params.showBalanceEvenIfEmpty ?? false
  );

  const baseSummary = {
    ...summary,
    currency: params.currency ?? summary.currency ?? null,
    accountSummaries: params.accountSummaries ?? summary.accountSummaries,
    optimistic: params.optimistic ?? summary.optimistic,
  };

  if (!params.insightMetrics) {
    return baseSummary;
  }

  return {
    ...baseSummary,
    incomeTotal: Number(params.insightMetrics.incomeTotal ?? 0),
    expenseTotal: Number(params.insightMetrics.expenseTotal ?? 0),
    netTotal: Number(params.insightMetrics.netTotal ?? 0),
    topCategoryName: params.insightMetrics.topCategoryName ?? null,
    topCategoryAmount:
      params.insightMetrics.topCategoryAmount === null || params.insightMetrics.topCategoryAmount === undefined
        ? null
        : Number(params.insightMetrics.topCategoryAmount),
    topCategoryShare:
      params.insightMetrics.topCategoryShare === null || params.insightMetrics.topCategoryShare === undefined
        ? null
        : Number(params.insightMetrics.topCategoryShare),
    topMerchantName: params.insightMetrics.topMerchantName ?? null,
    topMerchantCount:
      params.insightMetrics.topMerchantCount === null || params.insightMetrics.topMerchantCount === undefined
        ? null
        : Number(params.insightMetrics.topMerchantCount),
  } satisfies UploadInsightsSummary;
};

export const buildImportedWorkspaceAccount = (summary: UploadInsightsSummary) => {
  if (!summary.accountName) {
    return null;
  }
  if (isFilenameOnlyScreenshotSummary(summary.fileName, summary)) {
    return null;
  }

  // Preserve a parsed account identity during the brief interval before an
  // account-only import has its persisted ID. The Accounts page reconciles it
  // by identity once the server publishes the canonical account.
  const accountId =
    summary.accountId ??
    summary.optimisticAccountId ??
    `optimistic-import-${[summary.fileName, summary.institution ?? "", summary.accountName, summary.accountNumber ?? ""]
      .join("-")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}`;

  const normalizedAccountName =
    summary.institution === "PDAX" && summary.accountType === "wallet" && /^wallet$/i.test(summary.accountName.trim())
      ? "Wallet"
      : formatUploadAccountDisplayName(
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
  const publishedImportInventory = Boolean(
    summary.accountSummaries?.some(
      (accountSummary) => accountSummary.accountId === accountId && Number(accountSummary.rowsImported ?? 0) === 0
    )
  );

  return {
    id: accountId,
    optimisticAccountId: summary.optimisticAccountId ?? null,
    name: normalizedAccountName,
    institution: summary.institution,
    accountNumber: summary.accountNumber ?? null,
    type: accountType,
    currency: summary.currency ?? summary.previewTransactions?.[0]?.currency ?? "PHP",
    source: "upload",
    balance: summary.balance,
    transactionCount,
    publishedImportInventory,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
};

export const seedImportedWorkspaceCaches = (workspaceId: string, summary: UploadInsightsSummary) => {
  // A portfolio snapshot can materialize several durable accounts in one
  // confirmation. Seed every returned identity before reporting completion so
  // Accounts never briefly shows only the worker's primary account.
  const accountSummaries = summary.accountSummaries ?? [];
  if (accountSummaries.length > 1) {
    for (const accountSummary of accountSummaries) {
      seedImportedWorkspaceCaches(workspaceId, {
        ...summary,
        accountId: accountSummary.accountId,
        accountName: accountSummary.accountName,
        institution: accountSummary.institution,
        accountNumber: accountSummary.accountNumber,
        accountType: accountSummary.accountType,
        currency: accountSummary.currency,
        balance: accountSummary.balance,
        rowsImported: accountSummary.rowsImported,
        accountSummaries: undefined,
        optimistic: false,
        optimisticAccountId: null,
        previewTransactions: [],
      });
    }
  }
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
    const authoritativeBalance = summary.optimistic === false && importedBalance !== "";
    if ((!importedBalance || (importedIsZeroish && !authoritativeBalance)) && currentIsNonZero) {
      importedAccount.balance = currentBalance;
    }

    syncImportedWorkspaceAccountCaches(workspaceId, importedAccount, { authoritativeBalance });
  }

  if (Array.isArray(summary.previewTransactions) && summary.previewTransactions.length > 0) {
    syncImportedWorkspaceTransactionCaches(workspaceId, summary.previewTransactions);
  }
};
