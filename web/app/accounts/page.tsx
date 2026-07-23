"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { CloverShell, useCloverChrome } from "@/components/clover-shell";
import { CloverLoadingScreen } from "@/components/clover-loading-screen";
import { EmptyDataCta } from "@/components/empty-data-cta";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { CurrencySelector } from "@/components/currency-selector";
import { FinancialAccountCard } from "@/components/financial-account-card";
import { InstitutionAutocomplete } from "@/components/institution-autocomplete";
import { PlanLimitNudge } from "@/components/plan-limit-nudge";
import { PageFileDropZone } from "@/components/page-file-drop-zone";
import { formatCurrencyAmount, formatCurrencyCode, formatCurrencySymbol } from "@/lib/currency-format";
import { deriveReconciledBalance } from "@/lib/account-balance";
import { prefersLiveInvestmentBalance } from "@/lib/investment-balance";
import { getAccountCardName, getAccountDisplayName, formatUploadAccountDisplayName } from "@/lib/account-display";
import { getAccountPath, getInvestmentInstitutionPath } from "@/lib/account-path";
import { countNonCashAccounts } from "@/lib/account-limit-count";
import type { UploadInsightsSummary } from "@/components/upload-insights-toast";
import { getCurrencyCatalogCodes } from "@/lib/currencies";
import { fetchJsonOnce } from "@/lib/request-dedupe";
import { readSelectedWorkspaceId } from "@/lib/workspace-selection";
import {
  applyOptimisticWorkspaceAccountDeletion,
  accountsWorkspaceCacheKey,
  clearDeletedWorkspaceAccount,
  deletedAccountsWorkspaceCacheKey,
  getCachedAccountsWorkspace,
  getCachedTransactionsWorkspace,
  getDeletedWorkspaceAccountIds,
  getDeletingWorkspaceAccountIds,
  persistAccountsWorkspaceCache,
  persistTransactionsWorkspaceCache,
  markDeletedWorkspaceAccount,
  markDeletingWorkspaceAccount,
  clearDeletingWorkspaceAccount,
  normalizeImportedAccountKey,
  matchesImportedAccountIdentity as isImportedAccountIdentityMatch,
  deletingAccountsWorkspaceCacheKey,
  workspaceCacheUpdatedEventName,
  type WorkspaceCacheUpdatedEventDetail,
} from "@/lib/workspace-cache";
import { getAccountBrand } from "@/lib/account-brand";
import { inferAccountTypeFromStatement } from "@/lib/import-parser";
import { getEffectiveTransactionMerchantName } from "@/lib/transaction-display";
import { chooseWorkspaceId, persistSelectedWorkspaceId } from "@/lib/workspace-selection";
import { mergeImportedWorkspaceTransactions } from "@/lib/workspace-cache";
import {
  getInvestmentFieldConfigs,
  getInvestmentSubtypeLabel,
  INVESTMENT_SUBTYPES,
  type InvestmentSubtype,
  isFixedIncomeInvestmentSubtype,
  isMarketInvestmentSubtype,
} from "@/lib/investments";
import {
  ACCOUNT_TYPE_SECTIONS,
  formatAccountTypeLabel,
  getRecurringKindSuggestionForAccountType,
  isLiabilityAccountType,
  isSpendableAccountType,
  isTrackedAssetAccountType,
  type SupportedAccountType,
} from "@/lib/account-types";
import type { InstitutionSuggestion } from "@/lib/institution-suggestions";
import type { UserLimits } from "@/lib/user-limits";
import { parsePlanLimitPayload, type PlanLimitPayload } from "@/lib/plan-limit-nudges";
import { clearImportActivity, getCompletedImportActivitySummary, readImportActivity, subscribeImportActivity } from "@/lib/import-activity";
import { importActivityHasCompletedRows } from "@/lib/import-activity";
import {
  mergeAccountsWithOptimisticImports as mergeAccountsWithOptimisticImportsShared,
  mergeImportedPreviewTransactions,
  mergeOptimisticImportedAccount as mergeOptimisticImportedAccountShared,
  resolvePersistedImportedAccountId as resolvePersistedImportedAccountIdShared,
  isGenericUploadedAccountShadowed,
  isTransientUploadedAccountPlaceholder,
  transactionMatchesImportedAccount,
  uploadSummaryCanDismissImportUi,
  uploadSummaryMatchesImportedAccount,
} from "@/lib/imported-account-ui";

type PlanUsage = {
  accountCount: number;
  monthlyUploadCount: number;
  transactionCount: number;
};

const IMPORT_ACTIVITY_DATA_SETTLE_WINDOW_MS = 2 * 60 * 1000;
const SYNCING_EMPTY_STATE_REFRESH_DELAY_MS = 250;

const ImportFilesModal = dynamic(
  () => import("@/components/import-files-modal").then((module) => module.ImportFilesModal),
  { ssr: false }
);

const ACCOUNT_SCHEDULE_RECURRENCE_OPTIONS = [
  { value: "once", label: "One-time" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Yearly" },
] as const;

const ACCOUNT_LOADING_TIMEOUT_MS = 45_000;
const ACCOUNT_LOADING_PULSE_MS = 5_000;
const PAGE_LOADING_TIMEOUT_MS = 12_000;
const WORKSPACE_RETRY_AFTER_TRANSIENT_FAILURE_MS = 2_500;

const isImageImportFile = (file: File) =>
  /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name.toLowerCase()) || file.type.startsWith("image/");

const uploadSummaryMatchesAccount = (summary: UploadInsightsSummary, account: Account) => {
  return uploadSummaryMatchesImportedAccount(summary, account);
};

type Workspace = {
  id: string;
  name: string;
  type: string;
};

type Account = {
  id: string;
  workspaceId?: string;
  name: string;
  institution: string | null;
  accountNumber: string | null;
  investmentSubtype: InvestmentSubtype | null;
  investmentSymbol: string | null;
  investmentQuantity: string | null;
  investmentCostBasis: string | null;
  investmentPrincipal: string | null;
  investmentStartDate: string | null;
  investmentMaturityDate: string | null;
  investmentInterestRate: string | null;
  investmentMaturityValue: string | null;
  type: SupportedAccountType;
  currency: string;
  source: string;
  balance: string | null;
  transactionCount?: number | null;
  favorite?: boolean;
  updatedAt: string;
  createdAt: string;
};

const buildCashFallbackAccount = (currency: string): Account => {
  const now = new Date(0).toISOString();
  return {
    id: `fallback-cash-${formatCurrencyCode(currency).toLowerCase()}`,
    name: "Cash",
    institution: "Cash",
    accountNumber: null,
    investmentSubtype: null,
    investmentSymbol: null,
    investmentQuantity: null,
    investmentCostBasis: null,
    investmentPrincipal: null,
    investmentStartDate: null,
    investmentMaturityDate: null,
    investmentInterestRate: null,
    investmentMaturityValue: null,
    type: "cash",
    currency: formatCurrencyCode(currency),
    source: "manual",
    balance: "0",
    transactionCount: 0,
    favorite: false,
    updatedAt: now,
    createdAt: now,
  };
};

const isCashFallbackAccount = (account: Account) => account.id.startsWith("fallback-cash-");
const isWorkspaceAccount = (account: Account, workspaceId: string) =>
  account.workspaceId === workspaceId || (!account.workspaceId && isCashFallbackAccount(account));

type UploadAccountLoadingContext = {
  latestCheckpoint: StatementCheckpoint | null;
  checkpointBalance: string | null;
  stableBalance: string | null;
  hasVisibleBalance: boolean;
  hasLoadedTransactions: boolean;
  displayedBalance: string | null;
  baseIsLoading: boolean;
  isLoading: boolean;
  isTimedOut: boolean;
};

const buildOptimisticImportedAccount = (summary: UploadInsightsSummary): Account | null => {
  if (!summary.accountName) {
    return null;
  }
  // Account-only screenshots can finish parsing before the worker returns its
  // canonical account ID. Keep a stable temporary card in that short gap so
  // the UI never reports a completed import that is invisible until refresh.
  const optimisticAccountId =
    summary.accountId ??
    summary.optimisticAccountId ??
    `optimistic-import-${[summary.fileName, summary.institution ?? "", summary.accountName, summary.accountNumber ?? ""]
      .join("-")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}`;
  const transactionCount = Math.max(
    Number(summary.rowsImported ?? 0) || 0,
    Array.isArray(summary.previewTransactions) ? summary.previewTransactions.length : 0
  );
  const displayName = formatUploadAccountDisplayName(
    summary.accountName,
    summary.institution,
    summary.accountNumber ?? null,
    summary.accountType ?? null
  );

  return {
    id: optimisticAccountId,
    name: displayName,
    institution: summary.institution,
    accountNumber: summary.accountNumber ?? null,
    investmentSubtype: null,
    investmentSymbol: null,
    investmentQuantity: null,
    investmentCostBasis: null,
    investmentPrincipal: null,
    investmentStartDate: null,
    investmentMaturityDate: null,
    investmentInterestRate: null,
    investmentMaturityValue: null,
    type: summary.accountType ?? inferAccountTypeFromStatement(summary.institution, summary.accountName, "bank"),
    currency: summary.previewTransactions?.[0]?.currency ?? "PHP",
    source: "upload",
    balance: summary.balance,
    transactionCount,
    favorite: false,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
};

const resolvePersistedImportedAccountId = (summary: UploadInsightsSummary, accounts: Account[]) => {
  return resolvePersistedImportedAccountIdShared(
    summary,
    accounts,
    summary.accountType ?? inferAccountTypeFromStatement(summary.institution, summary.accountName, "bank"),
    true
  );
};

const getImportedAccountKey = (
  name: string | null,
  institution: string | null,
  accountNumber?: string | null,
  accountType?: string | null,
  currency?: string | null
) => normalizeImportedAccountKey(name, institution, accountNumber ?? null, accountType ?? null, currency ?? null);

const matchesImportedAccountIdentity = (left: Account, right: Account) => {
  return isImportedAccountIdentityMatch(left, right);
};

const transactionMatchesAccount = (transaction: Transaction, account: Account) => {
  return transactionMatchesImportedAccount(transaction, account);
};

const hasImportedTransactionEvidence = (transactions: Transaction[]) =>
  transactions.some((transaction) => transaction.source === "upload" || Boolean(transaction.importFileId));

const inferImportedAccountTypeFromTransaction = (transaction: Transaction): SupportedAccountType => {
  const identity = `${transaction.institution ?? ""} ${transaction.accountName ?? ""}`.toLowerCase();
  if (/\bwise\b/.test(identity)) {
    return "wallet";
  }

  return inferAccountTypeFromStatement(
    transaction.institution ?? null,
    transaction.accountName ?? transaction.merchantClean ?? transaction.merchantRaw,
    "bank"
  );
};

const deriveOptimisticAccountsFromTransactions = (
  transactions: Transaction[],
  existingAccounts: Account[],
  deletedAccountIds: Set<string>
) => {
  const existingById = new Map(existingAccounts.map((account) => [account.id, account] as const));
  const existingByKey = new Map(
    existingAccounts.map(
      (account) =>
        [getImportedAccountKey(account.name, account.institution, account.accountNumber, account.type, account.currency), account] as const
    )
  );
  const derivedAccounts = new Map<string, Account>();

  for (const transaction of transactions) {
    if (!transaction.accountId || deletedAccountIds.has(transaction.accountId)) {
      continue;
    }

    const matchedExistingById = existingById.get(transaction.accountId) ?? null;
    const inferredType = matchedExistingById?.type ?? inferImportedAccountTypeFromTransaction(transaction);
    const importedAccountKey = getImportedAccountKey(
      transaction.accountName ?? null,
      transaction.institution ?? null,
      transaction.accountNumber ?? null,
      inferredType,
      transaction.currency
    );
    const matchedExisting =
      matchedExistingById ??
      (importedAccountKey ? existingByKey.get(importedAccountKey) ?? null : null);

    if (matchedExisting && !matchedExisting.id.startsWith("optimistic-")) {
      continue;
    }

    const displayName = formatUploadAccountDisplayName(
      transaction.accountName ?? transaction.institution ?? "Imported account",
      transaction.institution ?? null,
      transaction.accountNumber ?? null,
      inferredType
    );
    const seedAccount = matchedExisting ?? {
      id: transaction.accountId,
      name: displayName,
      institution: transaction.institution ?? null,
      accountNumber: transaction.accountNumber ?? null,
      investmentSubtype: null,
      investmentSymbol: null,
      investmentQuantity: null,
      investmentCostBasis: null,
      investmentPrincipal: null,
      investmentStartDate: null,
      investmentMaturityDate: null,
      investmentInterestRate: null,
      investmentMaturityValue: null,
      type: inferredType,
      currency: transaction.currency,
      source: "upload",
      balance: null,
      transactionCount: 0,
      favorite: false,
      updatedAt: transaction.date,
      createdAt: transaction.date,
    };
    const currentCount = derivedAccounts.get(seedAccount.id)?.transactionCount ?? seedAccount.transactionCount ?? 0;
    derivedAccounts.set(seedAccount.id, {
      ...seedAccount,
      source: "upload",
      currency: seedAccount.currency || transaction.currency,
      transactionCount: currentCount + 1,
      updatedAt: transaction.date > seedAccount.updatedAt ? transaction.date : seedAccount.updatedAt,
      createdAt: transaction.date < seedAccount.createdAt ? transaction.date : seedAccount.createdAt,
    });
  }

  return Array.from(derivedAccounts.values()).filter((account) => {
    if (isTransientUploadedAccountPlaceholder(account)) {
      return false;
    }

    return !isGenericUploadedAccountShadowed(account, existingAccounts);
  });
};

const mergeAccountsWithOptimisticImports = (
  fetchedAccounts: Account[],
  currentAccounts: Account[],
  deletedAccountIds: Set<string>,
  supportingTransactions: Transaction[] = [],
  options?: { preserveImportedEvidence?: boolean }
) => {
  const baseMergedAccounts = mergeAccountsWithOptimisticImportsShared(
    fetchedAccounts,
    currentAccounts,
    {
      deletedAccountIds,
      preserveNonZeroOptimisticBalance: true,
    }
  );
  const shouldPreserveImportedEvidence =
    (options?.preserveImportedEvidence ?? false) || hasImportedTransactionEvidence(supportingTransactions);
  if (!shouldPreserveImportedEvidence || supportingTransactions.length === 0) {
    return baseMergedAccounts;
  }

  const derivedOptimisticAccounts = deriveOptimisticAccountsFromTransactions(
    supportingTransactions,
    baseMergedAccounts,
    deletedAccountIds
  ).filter(
    (account) =>
      !baseMergedAccounts.some(
        (existingAccount) =>
          existingAccount.id === account.id || matchesImportedAccountIdentity(existingAccount, account)
      )
  );

  return [...derivedOptimisticAccounts, ...baseMergedAccounts];
};

const mergeOptimisticImportedAccount = (currentAccounts: Account[], optimisticAccount: Account) => {
  return mergeOptimisticImportedAccountShared(currentAccounts, optimisticAccount, {
    mergeMatchedAccount: (matchedAccount, nextOptimisticAccount, shouldPreserveExistingBalance) => ({
      ...matchedAccount,
      ...nextOptimisticAccount,
      balance: shouldPreserveExistingBalance ? matchedAccount.balance : nextOptimisticAccount.balance ?? matchedAccount.balance,
      updatedAt: nextOptimisticAccount.updatedAt ?? matchedAccount.updatedAt,
      createdAt: matchedAccount.createdAt ?? nextOptimisticAccount.createdAt,
    }),
  });
};

const getCachedWorkspaceHydration = (workspaceId: string) => {
  if (!workspaceId) {
    return null;
  }

  const transactionsSnapshot = getCachedTransactionsWorkspace(workspaceId);
  const accountsSnapshot = getCachedAccountsWorkspace(workspaceId);
  if (accountsSnapshot) {
    return {
      accounts: ((accountsSnapshot.accounts as Account[] | undefined) ?? []).filter((account) =>
        isWorkspaceAccount(account, workspaceId)
      ),
      accountRules: (accountsSnapshot.accountRules as AccountRule[] | undefined) ?? [],
      transactions: ((accountsSnapshot.transactions as Transaction[] | undefined) ?? []).filter(
        (transaction) => transaction.workspaceId === workspaceId
      ),
      statementCheckpoints: ((accountsSnapshot.statementCheckpoints as StatementCheckpoint[] | undefined) ?? []).filter(
        (checkpoint) => checkpoint.workspaceId === workspaceId
      ),
      imports: (transactionsSnapshot?.imports as ImportFile[] | undefined) ?? [],
      updatedAt: accountsSnapshot.updatedAt,
    };
  }

  if (!transactionsSnapshot) {
    return null;
  }

  return {
    accounts: ((transactionsSnapshot.accounts as Account[] | undefined) ?? []).filter((account) =>
      isWorkspaceAccount(account, workspaceId)
    ),
    accountRules: [] as AccountRule[],
    transactions: ((transactionsSnapshot.transactions as Transaction[] | undefined) ?? []).filter(
      (transaction) => transaction.workspaceId === workspaceId
    ),
    statementCheckpoints: [] as StatementCheckpoint[],
    imports: (transactionsSnapshot.imports as ImportFile[] | undefined) ?? [],
    updatedAt: transactionsSnapshot.updatedAt,
  };
};

const hasCachedWorkspaceDataEvidence = (workspaceId: string) => {
  const cachedSnapshot = getCachedWorkspaceHydration(workspaceId);
  if (!cachedSnapshot) {
    return false;
  }

  return Boolean(
    cachedSnapshot.accounts.length > 0 ||
      cachedSnapshot.transactions.length > 0 ||
      cachedSnapshot.statementCheckpoints.length > 0 ||
      (cachedSnapshot.imports?.length ?? 0) > 0
  );
};

const hasRecentWorkspaceImportEvidence = (
  workspaceId: string,
  activity: ReturnType<typeof readImportActivity>
) => {
  if (!workspaceId || !activity || activity.workspaceId !== workspaceId) {
    return false;
  }

  const isFresh = Date.now() - Number(activity.updatedAt ?? 0) <= IMPORT_ACTIVITY_DATA_SETTLE_WINDOW_MS;
  if (!isFresh) {
    return false;
  }

  return activity.status === "active" || importActivityHasCompletedRows(activity);
};

type AccountRule = {
  accountId: string | null;
  accountName: string;
  institution: string | null;
  accountType: string;
};

type ImportFile = {
  id: string;
  fileName: string;
  status: string;
  uploadedAt: string;
  accountId?: string | null;
};

type Transaction = {
  id: string;
  workspaceId?: string;
  accountId: string;
  accountName?: string;
  institution?: string | null;
  accountNumber?: string | null;
  currency: string;
  amount: string;
  type: "income" | "expense" | "transfer";
  date: string;
  merchantRaw: string;
  merchantClean: string | null;
  categoryName: string | null;
  description: string | null;
  isExcluded: boolean;
  source?: string | null;
  importFileId?: string | null;
  rawPayload?: {
    amountDelta?: string | number | null;
    balance?: string | number | null;
    openingBalance?: string | number | null;
    kind?: string;
  } | null;
};

type StatementCheckpoint = {
  id: string;
  workspaceId?: string;
  accountId: string | null;
  statementStartDate: string | null;
  statementEndDate: string | null;
  openingBalance: string | null;
  endingBalance: string | null;
  status: "pending" | "reconciled" | "mismatch";
  mismatchReason: string | null;
  rowCount: number;
  createdAt: string;
  updatedAt: string;
  sourceMetadata?: {
    accountName?: string | null;
    institution?: string | null;
    accountNumber?: string | null;
    importMode?: string | null;
    documentType?: string | null;
  } | null;
};

type InvestmentInstitutionCard = {
  kind: "investment_institution";
  id: string;
  institution: string;
  currency: string;
  balance: string;
  updatedAt: string;
  accounts: Account[];
};

const isInvestmentInstitutionCard = (row: Account | InvestmentInstitutionCard): row is InvestmentInstitutionCard =>
  "kind" in row && row.kind === "investment_institution";

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const parseAmount = (value: string | null | undefined) => Number(value ?? 0);

const formatAccountAmount = (value: number, currency?: string | null) => formatCurrencyAmount(value, currency ?? "PHP");
const formatDisplayAccountAmount = (value: number, currency?: string | null) =>
  formatCurrencyAmount(Math.abs(value), currency ?? "PHP");

const formatCardAccountNumber = (value: string | null | undefined) => {
  const cleaned = (value ?? "").trim();
  if (!cleaned) {
    return "";
  }

  const digitsOnly = cleaned.replace(/\D/g, "");
  if (digitsOnly.length >= 4) {
    return `•••• ${digitsOnly.slice(-4)}`;
  }

  return cleaned;
};

const getMaskedAccountNumberCollisionKey = (account: Pick<Account, "accountNumber" | "institution" | "type">) => {
  const digitsOnly = String(account.accountNumber ?? "").replace(/\D/g, "");
  if (digitsOnly.length < 4) {
    return null;
  }

  return [account.type, account.institution?.trim().toLowerCase() ?? "", digitsOnly.slice(-4)].join(":");
};

const formatDisambiguatedCardAccountNumber = (
  value: string | null | undefined,
  options?: { showDigitCount?: boolean }
) => {
  const masked = formatCardAccountNumber(value);
  const digitsOnly = String(value ?? "").replace(/\D/g, "");
  if (!masked || !options?.showDigitCount || digitsOnly.length <= 4) {
    return masked;
  }

  return `${masked} · ${digitsOnly.length} digits`;
};

const removeDuplicateCardAccountSuffix = (name: string, accountNumber: string | null | undefined) => {
  const lastFour = String(accountNumber ?? "").replace(/\D/g, "").slice(-4);
  if (!lastFour) {
    return name;
  }

  const cleanedName = name.trim();
  const suffixPattern = new RegExp(`(?:\\s|[-–—_])*(?:[•*xX]{2,}\\s*)?${lastFour}$`);
  const withoutSuffix = cleanedName.replace(suffixPattern, "").trim();
  return withoutSuffix || cleanedName;
};

const getCurrencyCodes = (accounts: Array<{ currency: string }>) =>
  Array.from(new Set(accounts.map((account) => formatCurrencyCode(account.currency))));

const getAccountCardEyebrow = (account: Account) => {
  if (account.type === "cash") {
    return "Cash";
  }

  return account.institution?.trim() || getAccountBrand({
    institution: account.institution,
    name: account.name,
    type: account.type,
  }).label;
};

const getInvestmentInstitutionPreviewLabel = (account: Account) => {
  const symbol = account.investmentSymbol?.trim();
  if (symbol) {
    return symbol;
  }

  // The provider is already the card title. Keep imported PDAX assets concise
  // in the card preview, including accounts created before the parser rename.
  const name = account.name.trim();
  if (/^pdax\s+gold(?:\s+rwa)?$/i.test(name)) {
    return "Gold";
  }
  return name.replace(/^pdax\s+/i, "");
};

const getInvestmentInstitutionPreview = (accounts: Account[]) =>
  accounts
    .map(getInvestmentInstitutionPreviewLabel)
    .filter(Boolean)
    .slice(0, 4)
    .join(", ");

const formatAggregateAmount = (value: number, accounts: Array<{ currency: string }>) => {
  const currencies = getCurrencyCodes(accounts);
  if (currencies.length === 0) {
    return formatDisplayAccountAmount(value, "PHP");
  }

  if (currencies.length === 1) {
    return formatDisplayAccountAmount(value, currencies[0]);
  }

  return "Mixed currencies";
};

const formatSignedAggregateAmount = (value: number, accounts: Array<{ currency: string }>) => {
  const currencies = getCurrencyCodes(accounts);
  if (currencies.length !== 1) {
    return formatAggregateAmount(value, accounts);
  }

  if (value === 0) {
    return formatDisplayAccountAmount(value, currencies[0]);
  }

  return `${value > 0 ? "+" : "-"}${formatDisplayAccountAmount(value, currencies[0])}`;
};

const getNetWorthTone = (value: number) => {
  if (value > 0) {
    return "is-good";
  }

  if (value < 0) {
    return "is-danger";
  }

  return "is-neutral";
};

const getInvestmentInstitutionName = (account: Account) =>
  account.institution?.trim() || account.name.trim() || "Investment institution";

const shouldKeepSeparateInvestmentCard = (account: Account) => {
  if (account.source !== "upload") {
    return false;
  }

  if (!isFixedIncomeInvestmentSubtype(account.investmentSubtype)) {
    return false;
  }

  if (!account.accountNumber?.trim()) {
    return false;
  }

  return /\bgsave\b/i.test(`${account.institution ?? ""} ${account.name}`);
};

const buildInvestmentInstitutionCards = (
  accounts: Account[],
  readBalance: (account: Account) => string | null | undefined = (account) => account.balance
): Array<Account | InvestmentInstitutionCard> => {
  const groups = new Map<string, InvestmentInstitutionCard>();
  const separateCards: Account[] = [];

  for (const account of accounts) {
    if (shouldKeepSeparateInvestmentCard(account)) {
      separateCards.push(account);
      continue;
    }

    const institution = getInvestmentInstitutionName(account);
    const currency = formatCurrencyCode(account.currency);
    const key = `${institution.toLowerCase()}::${currency}`;
    const current = groups.get(key);
    const nextBalance = (parseAmount(current?.balance) ?? 0) + Math.abs(parseAmount(readBalance(account)));
    const nextUpdatedAt =
      current && new Date(current.updatedAt).getTime() > new Date(account.updatedAt).getTime()
        ? current.updatedAt
        : account.updatedAt;

    groups.set(key, {
      kind: "investment_institution",
      id: key,
      institution,
      currency,
      balance: nextBalance.toFixed(2),
      updatedAt: nextUpdatedAt,
      accounts: current ? [...current.accounts, account] : [account],
    });
  }

  return [...separateCards, ...Array.from(groups.values())].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  );
};

const normalizeAccountBalance = (type: Account["type"], value: number) =>
  isLiabilityAccountType(type) ? -Math.abs(value) : Math.abs(value);

const parseNullableNumberInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseNullableDateInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const date = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const getEffectiveAccountType = (account: Account) => {
  if (account.type === "line_of_credit" && /maya/i.test(`${account.institution ?? ""} ${account.name ?? ""}`)) {
    return "credit_card";
  }

  return account.type;
};

const getAccountDisplayType = (account: Account) => {
  const effectiveType = getEffectiveAccountType(account);
  if (effectiveType === "bank" && account.institution === "Checking") return "Checking";
  if (effectiveType === "bank" && account.institution === "Savings") return "Savings";
  return formatAccountTypeLabel(effectiveType);
};

const getAccountTone = (account: Account) => (isLiabilityAccountType(getEffectiveAccountType(account)) ? "liability" : "asset");

const getAccountWarning = (account: Account, duplicateCount: number) => {
  if (duplicateCount > 1) return "Possible duplicate";
  return null;
};

const getCheckpointSummary = (checkpoint: StatementCheckpoint | null | undefined) => {
  if (!checkpoint) {
    return {
      label: "No statement checkpoint yet",
      detail: "Import a statement to anchor this balance.",
      tone: "neutral" as const,
      icon: "clock" as const,
    };
  }

  const checkpointDate = checkpoint.statementEndDate ?? checkpoint.createdAt ?? null;
  const endingDate = checkpointDate ? formatDate(checkpointDate) : "No date";
  if (checkpoint.status === "mismatch") {
    return {
      label: "Needs review",
      detail: checkpoint.mismatchReason ?? `Mismatch detected · ${endingDate}`,
      tone: "danger" as const,
      icon: "warning" as const,
    };
  }

  if (checkpoint.status === "reconciled") {
    return {
      label: "Reconciled",
      detail: endingDate,
      tone: "good" as const,
      icon: "refresh" as const,
    };
  }

  return {
    label: "Checkpoint pending",
    detail: endingDate,
    tone: "neutral" as const,
    icon: "calendar" as const,
  };
};

const buildImportSummaries = (transactions: Transaction[]) => {
  const importGroups = new Map<
    string,
    { key: string; count: number; latestDate: string; label: string; total: number }
  >();

  for (const transaction of transactions) {
    if (transaction.merchantRaw === "Beginning balance") {
      continue;
    }

    if (transaction.source !== "upload" && !transaction.importFileId) {
      continue;
    }

    const key = transaction.importFileId ?? `${transaction.accountId}:${transaction.date.slice(0, 10)}`;
    const current = importGroups.get(key);
    const amount = parseAmount(transaction.amount);
    const next = current
      ? {
          ...current,
          count: current.count + 1,
          latestDate: new Date(transaction.date) > new Date(current.latestDate) ? transaction.date : current.latestDate,
          total: current.total + amount,
        }
      : {
          key,
          count: 1,
          latestDate: transaction.date,
          label: transaction.importFileId ? "Imported batch" : "Uploaded statement",
          total: amount,
        };

    importGroups.set(key, next);
  }

  return Array.from(importGroups.values()).sort(
    (left, right) => new Date(right.latestDate).getTime() - new Date(left.latestDate).getTime()
  );
};

const getCheckpointTone = (status?: StatementCheckpoint["status"] | null) => {
  if (status === "reconciled") return "good";
  if (status === "mismatch") return "danger";
  return "neutral";
};

const getCheckpointDocumentFamily = (checkpoint: StatementCheckpoint | null | undefined) => {
  const rawDocumentType =
    typeof checkpoint?.sourceMetadata?.documentType === "string" && checkpoint.sourceMetadata.documentType.trim()
      ? checkpoint.sourceMetadata.documentType.trim().toLowerCase()
      : typeof checkpoint?.sourceMetadata?.importMode === "string" && checkpoint.sourceMetadata.importMode.trim()
        ? checkpoint.sourceMetadata.importMode.trim().toLowerCase()
        : "statement";

  if (rawDocumentType === "portfolio") {
    return {
      label: "Latest portfolio snapshot",
      dateLabel: "Snapshot date",
      balanceLabel: "Portfolio value",
    };
  }

  if (rawDocumentType === "account_detail") {
    return {
      label: "Latest account snapshot",
      dateLabel: "Snapshot date",
      balanceLabel: "Balance",
    };
  }

  if (rawDocumentType === "receipt" || rawDocumentType === "notes") {
    return {
      label: "Latest image checkpoint",
      dateLabel: "Capture date",
      balanceLabel: "Amount",
    };
  }

  return {
    label: "Latest statement checkpoint",
    dateLabel: "Statement date",
    balanceLabel: "Statement balance",
  };
};

const getCheckpointTrustLabel = (checkpoint: StatementCheckpoint | null | undefined) => {
  if (!checkpoint) {
    return "No statement checkpoint yet";
  }

  const endingDate = checkpoint.statementEndDate ?? checkpoint.createdAt ?? null;
  const formattedDate = endingDate ? formatDate(endingDate) : null;
  if (checkpoint.status === "mismatch") {
    return `Needs review${formattedDate ? ` · ${formattedDate}` : ""}`;
  }

  if (checkpoint.status === "reconciled") {
    return `Reconciled${formattedDate ? ` · ${formattedDate}` : ""}`;
  }

  return `Checkpoint pending${formattedDate ? ` · ${formattedDate}` : ""}`;
};

const getCheckpointIdentityKey = (checkpoint: StatementCheckpoint) =>
  (() => {
    const sourceMetadata = checkpoint.sourceMetadata as Record<string, unknown> | null | undefined;
    const accountType = typeof sourceMetadata?.accountType === "string" ? sourceMetadata.accountType : null;
    const checkpointInstitution =
      typeof sourceMetadata?.institution === "string"
        ? sourceMetadata.institution
        : typeof sourceMetadata?.uploadBankHint === "string"
          ? sourceMetadata.uploadBankHint
          : null;
    return normalizeImportedAccountKey(
      typeof sourceMetadata?.accountName === "string" ? sourceMetadata.accountName : null,
      checkpointInstitution,
      typeof sourceMetadata?.accountNumber === "string" ? sourceMetadata.accountNumber : null,
      accountType,
      typeof sourceMetadata?.currency === "string"
        ? sourceMetadata.currency
        : typeof sourceMetadata?.accountCurrency === "string"
          ? sourceMetadata.accountCurrency
          : null
    );
  })();

const getLastFourDigits = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const digits = String(value).replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
};

const accountNumbersMayMatch = (
  left?: string | null,
  right?: string | null,
  requireExactMatch = false
) => {
  const leftDigits = String(left ?? "").replace(/\D/g, "");
  const rightDigits = String(right ?? "").replace(/\D/g, "");
  if (!leftDigits || !rightDigits) {
    return false;
  }

  if (leftDigits === rightDigits) {
    return true;
  }

  if (requireExactMatch) {
    return false;
  }

  const leftIsSuffixOnly = leftDigits.length === 4;
  const rightIsSuffixOnly = rightDigits.length === 4;
  if (leftIsSuffixOnly !== rightIsSuffixOnly) {
    return false;
  }

  return leftIsSuffixOnly && rightIsSuffixOnly && leftDigits === rightDigits;
};

const getCheckpointFreshnessTime = (checkpoint: StatementCheckpoint) => {
  const sourceMetadata =
    checkpoint.sourceMetadata && typeof checkpoint.sourceMetadata === "object" && !Array.isArray(checkpoint.sourceMetadata)
      ? (checkpoint.sourceMetadata as Record<string, unknown>)
      : null;
  const importMode = typeof sourceMetadata?.importMode === "string" ? sourceMetadata.importMode.trim() : null;
  if (importMode && importMode !== "statement") {
    return new Date(checkpoint.createdAt).getTime();
  }

  return Math.max(
    checkpoint.statementEndDate ? new Date(checkpoint.statementEndDate).getTime() : 0,
    new Date(checkpoint.createdAt).getTime()
  );
};

const mergeStatementCheckpoints = (current: StatementCheckpoint[], next: StatementCheckpoint[]) => {
  if (next.length === 0) {
    return current;
  }

  const checkpointsById = new Map<string, StatementCheckpoint>();
  for (const checkpoint of current) {
    checkpointsById.set(checkpoint.id, checkpoint);
  }
  for (const checkpoint of next) {
    const existing = checkpointsById.get(checkpoint.id);
    if (!existing) {
      checkpointsById.set(checkpoint.id, checkpoint);
      continue;
    }

    const existingScore = [existing.statementEndDate, existing.updatedAt].filter(Boolean).join("|");
    const nextScore = [checkpoint.statementEndDate, checkpoint.updatedAt].filter(Boolean).join("|");
    if (nextScore >= existingScore) {
      checkpointsById.set(checkpoint.id, checkpoint);
    }
  }

  return Array.from(checkpointsById.values());
};

const getLatestCheckpointForAccount = (
  account: Account,
  statementCheckpoints: StatementCheckpoint[]
) => {
  let latestCheckpoint: StatementCheckpoint | null = null;
  let latestTime = -1;
  const identityKey = normalizeImportedAccountKey(
    account.name,
    account.institution,
    account.accountNumber,
    account.type,
    account.currency
  );

  for (const checkpoint of statementCheckpoints) {
    const sourceMetadata = checkpoint.sourceMetadata as Record<string, unknown> | null | undefined;
    const checkpointInstitution =
      typeof sourceMetadata?.institution === "string"
        ? sourceMetadata.institution
        : typeof sourceMetadata?.uploadBankHint === "string"
          ? sourceMetadata.uploadBankHint
          : null;
    const checkpointAccountNumber =
      typeof sourceMetadata?.accountNumber === "string" ? sourceMetadata.accountNumber : null;
    const checkpointLastFour = getLastFourDigits(checkpointAccountNumber);
    const accountLastFour = getLastFourDigits(account.accountNumber ?? account.name);
    const matchesAccount =
      checkpoint.accountId === account.id ||
      (getCheckpointIdentityKey(checkpoint) !== "" && getCheckpointIdentityKey(checkpoint) === identityKey) ||
      accountNumbersMayMatch(account.accountNumber ?? null, checkpointAccountNumber) ||
      Boolean(
        checkpointInstitution &&
          account.institution &&
          checkpointInstitution.trim().toLowerCase() === account.institution.trim().toLowerCase() &&
          checkpointLastFour &&
          accountLastFour &&
          checkpointLastFour === accountLastFour
      );

    if (!matchesAccount) {
      continue;
    }

    const checkpointTime = getCheckpointFreshnessTime(checkpoint);

    if (checkpointTime >= latestTime) {
      latestCheckpoint = checkpoint;
      latestTime = checkpointTime;
    }
  }

  return latestCheckpoint;
};

function ActionIcon({
  name,
}: {
  name:
    | "plus"
    | "filters"
    | "refresh"
    | "calendar"
    | "chart"
    | "save"
    | "download"
    | "chevron-down"
    | "search"
    | "edit"
    | "upload"
    | "history"
    | "chevron-right"
    | "warning"
    | "check"
    | "clock";
}) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6" />
          <path d="m20 20-4.2-4.2" />
        </svg>
      );
    case "filters":
      return (
        <svg {...common}>
          <path d="M4 6h16" />
          <path d="M7 12h10" />
          <path d="M10 18h4" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path d="M20 12a8 8 0 1 1-2.34-5.66" />
          <path d="M20 4v6h-6" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4" />
          <path d="M16 3v4" />
          <path d="M4 9h16" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M4 19h16" />
          <path d="M6 16V9" />
          <path d="M11 16V5" />
          <path d="M16 16v-7" />
        </svg>
      );
    case "save":
      return (
        <svg {...common}>
          <path d="M5 5h11l3 3v11H5z" />
          <path d="M8 5v6h8V5" />
          <path d="M8 19v-6h8v6" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 3v10" />
          <path d="m8 9 4 4 4-4" />
          <path d="M5 19h14" />
        </svg>
      );
    case "upload":
      return (
        <svg {...common}>
          <path d="M12 21V11" />
          <path d="m8 15 4-4 4 4" />
          <path d="M5 5h14" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M4 20h16" />
          <path d="M14.5 5.5 18.5 9.5" />
          <path d="M6 18l1.5-4.5L15 6l3 3-7.5 7.5L6 18z" />
        </svg>
      );
    case "history":
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
          <path d="M12 7v6l4 2" />
        </svg>
      );
    case "chevron-right":
      return (
        <svg {...common}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      );
    case "warning":
      return (
        <svg {...common}>
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="m5 13 4 4 10-10" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg {...common}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
    default:
      return null;
  }
}

export default function AccountsPage() {
  useEffect(() => {
    document.title = "Clover | Accounts";
  }, []);

  return <AccountsPageContent />;
}

function AccountsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { closeChrome } = useCloverChrome();
  const addRef = useRef<HTMLDivElement>(null);
  const balanceInputRef = useRef<HTMLInputElement>(null);
  const workspaceLoadSeqRef = useRef(0);
  const completedImportRefreshKeyRef = useRef<string | null>(null);
  const workspaceHydrationVersionRef = useRef(new Map<string, number>());
  const deletedAccountIdsRef = useRef(new Set<string>());
  const initialWorkspaceId = typeof window === "undefined" ? "" : readSelectedWorkspaceId();
  const deletingAccountIdFromQuery = searchParams?.get("deletingAccountId");
  const deletingWorkspaceIdFromQuery = searchParams?.get("deletingWorkspaceId");
  const initialCachedWorkspace = initialWorkspaceId ? getCachedWorkspaceHydration(initialWorkspaceId) : null;
  const initialDeletedWorkspaceAccountIds = new Set(getDeletedWorkspaceAccountIds(initialWorkspaceId));
  const initialDeletingWorkspaceAccountIds = new Set(getDeletingWorkspaceAccountIds(initialWorkspaceId));
  const initialCachedAccounts = ((initialCachedWorkspace?.accounts as Account[] | undefined) ?? []).filter(
    (account) => !initialDeletedWorkspaceAccountIds.has(account.id) && !initialDeletingWorkspaceAccountIds.has(account.id)
  );
  const initialCachedTransactions = ((initialCachedWorkspace?.transactions as Transaction[] | undefined) ?? []).filter(
    (transaction) =>
      !initialDeletedWorkspaceAccountIds.has(transaction.accountId) && !initialDeletingWorkspaceAccountIds.has(transaction.accountId)
  );
  const initialCachedStatementCheckpoints = (
    (initialCachedWorkspace?.statementCheckpoints as StatementCheckpoint[] | undefined) ?? []
  ).filter(
    (checkpoint) =>
      !checkpoint.accountId ||
      (!initialDeletedWorkspaceAccountIds.has(checkpoint.accountId) && !initialDeletingWorkspaceAccountIds.has(checkpoint.accountId))
  );

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(initialWorkspaceId);
  const [selectedCurrency, setSelectedCurrency] = useState("PHP");
  const [accounts, setAccounts] = useState<Account[]>(initialCachedAccounts);
  const [accountRules, setAccountRules] = useState<AccountRule[]>(
    (initialCachedWorkspace?.accountRules as AccountRule[] | undefined) ?? []
  );
  const [transactions, setTransactions] = useState<Transaction[]>(initialCachedTransactions);
  const [statementCheckpoints, setStatementCheckpoints] = useState<StatementCheckpoint[]>(initialCachedStatementCheckpoints);
  const [drawerTransactions, setDrawerTransactions] = useState<Transaction[]>([]);
  const [drawerStatementCheckpoints, setDrawerStatementCheckpoints] = useState<StatementCheckpoint[]>([]);
  const [message, setMessage] = useState("Select a workspace to review accounts.");
  const [workspacesLoading, setWorkspacesLoading] = useState(true);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsLoadFailed, setAccountsLoadFailed] = useState(false);
  const [accountsHydrationPending, setAccountsHydrationPending] = useState(false);
  const [hasInitialWorkspaceDataLoaded, setHasInitialWorkspaceDataLoaded] = useState(Boolean(initialCachedWorkspace));
  const [planTier, setPlanTier] = useState<"free" | "pro" | "unknown">("unknown");
  const [planLimits, setPlanLimits] = useState<UserLimits | null>(null);
  const [planUsage, setPlanUsage] = useState<PlanUsage | null>(null);
  const [planLimitNudge, setPlanLimitNudge] = useState<PlanLimitPayload | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importSessionId, setImportSessionId] = useState(0);
  const [importSeedFiles, setImportSeedFiles] = useState<File[] | null>(null);
  const [importBackgroundOnly, setImportBackgroundOnly] = useState(false);
  const [drawerAccountId, setDrawerAccountId] = useState<string | null>(null);
  const [manualType, setManualType] = useState<Account["type"]>("bank");
  const [manualName, setManualName] = useState("");
  const [manualInstitution, setManualInstitution] = useState("");
  const [manualAccountNumber, setManualAccountNumber] = useState("");
  const [manualInvestmentSubtype, setManualInvestmentSubtype] = useState<InvestmentSubtype>("stock");
  const [manualInvestmentSymbol, setManualInvestmentSymbol] = useState("");
  const [manualInvestmentQuantity, setManualInvestmentQuantity] = useState("");
  const [manualInvestmentCostBasis, setManualInvestmentCostBasis] = useState("");
  const [manualInvestmentPrincipal, setManualInvestmentPrincipal] = useState("");
  const [manualInvestmentStartDate, setManualInvestmentStartDate] = useState("");
  const [manualInvestmentMaturityDate, setManualInvestmentMaturityDate] = useState("");
  const [manualInvestmentInterestRate, setManualInvestmentInterestRate] = useState("");
  const [manualInvestmentMaturityValue, setManualInvestmentMaturityValue] = useState("");
  const [manualBalance, setManualBalance] = useState("");
  const [manualCurrency, setManualCurrency] = useState("PHP");
  const [manualScheduleEnabled, setManualScheduleEnabled] = useState(false);
  const [manualScheduleDueDate, setManualScheduleDueDate] = useState("");
  const [manualScheduleRecurrence, setManualScheduleRecurrence] =
    useState<(typeof ACCOUNT_SCHEDULE_RECURRENCE_OPTIONS)[number]["value"]>("monthly");
  const [manualScheduleAmount, setManualScheduleAmount] = useState("");
  const [manualScheduleCounterparty, setManualScheduleCounterparty] = useState("");
  const [addAccountError, setAddAccountError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [accountEditName, setAccountEditName] = useState("");
  const [accountEditInstitution, setAccountEditInstitution] = useState("");
  const [accountEditInvestmentSubtype, setAccountEditInvestmentSubtype] = useState<InvestmentSubtype>("stock");
  const [accountEditInvestmentSymbol, setAccountEditInvestmentSymbol] = useState("");
  const [accountEditInvestmentQuantity, setAccountEditInvestmentQuantity] = useState("");
  const [accountEditInvestmentCostBasis, setAccountEditInvestmentCostBasis] = useState("");
  const [accountEditInvestmentPrincipal, setAccountEditInvestmentPrincipal] = useState("");
  const [accountEditInvestmentStartDate, setAccountEditInvestmentStartDate] = useState("");
  const [accountEditInvestmentMaturityDate, setAccountEditInvestmentMaturityDate] = useState("");
  const [accountEditInvestmentInterestRate, setAccountEditInvestmentInterestRate] = useState("");
  const [accountEditInvestmentMaturityValue, setAccountEditInvestmentMaturityValue] = useState("");
  const [accountEditType, setAccountEditType] = useState<Account["type"]>("bank");
  const [accountEditCurrency, setAccountEditCurrency] = useState("PHP");
  const [accountEditBalance, setAccountEditBalance] = useState("");
  const [accountEditSource, setAccountEditSource] = useState("manual");
  const [accountEditBusy, setAccountEditBusy] = useState(false);
  const [accountDeleteBusy, setAccountDeleteBusy] = useState(false);
  const [accountDeleteConfirmOpen, setAccountDeleteConfirmOpen] = useState(false);
  const [balanceDraft, setBalanceDraft] = useState("");
  const [drawerNotice, setDrawerNotice] = useState<string | null>(null);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const [pendingImportSummary, setPendingImportSummary] = useState<UploadInsightsSummary | null>(null);
  const [importActivitySnapshot, setImportActivitySnapshot] = useState(() => readImportActivity());
  const [importRefreshInFlight, setImportRefreshInFlight] = useState(false);
  const [hasCompletedInitialAccountPaint, setHasCompletedInitialAccountPaint] = useState(Boolean(initialCachedWorkspace));
  const stableAccountBalancesRef = useRef(new Map<string, string>());
  const accountLoadingSinceRef = useRef(new Map<string, number>());
  const pageLoadingSinceRef = useRef<number>(Date.now());
  const wasColdLoadingRef = useRef(false);
  const [accountLoadingPulse, setAccountLoadingPulse] = useState(() => Date.now());
  const [pageLoadingPulse, setPageLoadingPulse] = useState(() => Date.now());
  const isLocalDevBrowser =
    typeof window !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i.test(window.location.hostname);
  const [deletingAccountIds, setDeletingAccountIds] = useState<string[]>(
    () => {
      const ids = new Set(getDeletingWorkspaceAccountIds(deletingWorkspaceIdFromQuery ?? initialWorkspaceId));
      if (deletingAccountIdFromQuery) {
        ids.add(deletingAccountIdFromQuery);
      }
      return Array.from(ids);
    }
  );
  const deletingAccountIdsRef = useRef(new Set<string>(getDeletingWorkspaceAccountIds(initialWorkspaceId)));

  const markWorkspaceHydrated = useCallback((workspaceId: string, updatedAt?: number | null) => {
    if (!workspaceId || !updatedAt || !Number.isFinite(updatedAt)) {
      return;
    }

    workspaceHydrationVersionRef.current.set(workspaceId, updatedAt);
  }, []);

  const shouldHydrateWorkspaceSnapshot = useCallback(
    (workspaceId: string) => {
      if (!workspaceId) {
        return false;
      }

      const cachedSnapshot = getCachedWorkspaceHydration(workspaceId);
      if (!cachedSnapshot) {
        return true;
      }

      const previousVersion = workspaceHydrationVersionRef.current.get(workspaceId) ?? 0;
      return Number(cachedSnapshot.updatedAt ?? 0) > previousVersion;
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    const loadPlan = async () => {
      const response = await fetch("/api/me");
      if (!response.ok || cancelled) {
        return;
      }

      const payload = await response.json();
      const nextPlanTier = payload?.user?.planTier === "pro" ? "pro" : "free";
      const nextLimits = payload?.user
        ? {
            accountLimit:
              payload.user.accountLimit === null || payload.user.accountLimit === undefined
                ? null
                : Number(payload.user.accountLimit),
            monthlyUploadLimit:
              payload.user.monthlyUploadLimit === null || payload.user.monthlyUploadLimit === undefined
                ? null
                : Number(payload.user.monthlyUploadLimit),
            transactionLimit:
              payload.user.transactionLimit === null || payload.user.transactionLimit === undefined
                ? null
                : Number(payload.user.transactionLimit),
          }
        : null;
      const nextUsage = payload?.user?.usage
        ? {
            accountCount: Number(payload.user.usage.accountCount ?? 0),
            monthlyUploadCount: Number(payload.user.usage.monthlyUploadCount ?? 0),
            transactionCount: Number(payload.user.usage.transactionCount ?? 0),
          }
        : null;

      setPlanTier(nextPlanTier);
      setPlanLimits(nextLimits);
      setPlanUsage(nextUsage);
    };

    void loadPlan();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [selectedWorkspaceId, workspaces]
  );
  const nonCashAccountCount = useMemo(() => countNonCashAccounts(accounts), [accounts]);
  const accountLimitUsageCount = planUsage?.accountCount ?? nonCashAccountCount;

  const showPlanLimitNudge = (payload: PlanLimitPayload) => {
    setPlanLimitNudge(payload);
  };

  const reconciledAccounts = useMemo(
    () =>
      accounts.map((account) => {
        const accountTransactions = drawerAccountId === account.id
          ? drawerTransactions
          : transactions.filter((transaction) => transactionMatchesAccount(transaction, account));
                        const latestCheckpoint =
                          drawerAccountId === account.id
                            ? drawerStatementCheckpoints[0] ?? null
                            : getLatestCheckpointForAccount(account, statementCheckpoints);
                        const effectiveType = getEffectiveAccountType(account);
                        const accountCheckpoints = latestCheckpoint ? [latestCheckpoint] : [];
                        const checkpointBalance =
                          !prefersLiveInvestmentBalance(effectiveType) &&
                          latestCheckpoint?.endingBalance !== null && latestCheckpoint?.endingBalance !== undefined
                            ? String(latestCheckpoint.endingBalance)
                            : null;
                        const shouldPreserveImportedBalance =
                          account.source === "upload" && checkpointBalance === null;
                        const reconciledBalance =
                          checkpointBalance ??
                          (shouldPreserveImportedBalance
                            ? account.balance
                            : deriveReconciledBalance({
                                balance: account.balance,
                                transactions: accountTransactions,
                                checkpoints: accountCheckpoints,
                              }));
                        const normalizedBalance = normalizeAccountBalance(effectiveType, parseAmount(reconciledBalance ?? account.balance));

        return {
          ...account,
          type: effectiveType,
          balance: String(normalizedBalance),
        };
      }),
    [accounts, drawerAccountId, drawerStatementCheckpoints, drawerTransactions, statementCheckpoints, transactions]
  );

  const collidingMaskedAccountNumberKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const account of reconciledAccounts) {
      const key = getMaskedAccountNumberCollisionKey(account);
      if (!key) {
        continue;
      }

      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key));
  }, [reconciledAccounts]);

  useEffect(() => {
    for (const account of reconciledAccounts) {
      const balance = typeof account.balance === "string" ? account.balance.trim() : "";
      if (balance && Number(balance) !== 0) {
        stableAccountBalancesRef.current.set(account.id, balance);
      }
    }
  }, [reconciledAccounts]);

  useEffect(() => {
    const currentActivity = readImportActivity();
    if (currentActivity?.status !== "active") {
      return;
    }
    const activeImportFileId =
      typeof currentActivity.importFileId === "string" && currentActivity.importFileId.trim()
        ? currentActivity.importFileId.trim()
        : null;
    const hasVisibleCurrentImportTransactions = activeImportFileId
      ? transactions.some((transaction) => {
          const rawPayload = transaction.rawPayload;
          const sourceImportFileId =
            rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
              ? (rawPayload as Record<string, unknown>).sourceImportFileId
              : null;
          return transaction.importFileId === activeImportFileId || sourceImportFileId === activeImportFileId;
        })
      : false;
    const importBatchStillRunning =
      Number(currentActivity.fileTotal ?? 0) > 0 &&
      Number(currentActivity.completedFiles ?? 0) < Number(currentActivity.fileTotal ?? 0);
    if (importBatchStillRunning && !hasVisibleCurrentImportTransactions) {
      return;
    }

    const hasVisibleImportedAccount = reconciledAccounts.some(
      (account) => account.source === "upload" && !account.id.startsWith("optimistic-")
    );
    const hasVisibleImportedTransactions = transactions.some(
      (transaction) => transaction.source === "upload" || Boolean(transaction.importFileId)
    );

    if (hasVisibleCurrentImportTransactions || (hasVisibleImportedAccount && hasVisibleImportedTransactions)) {
      clearImportActivity();
    }
  }, [reconciledAccounts, transactions]);

  const deletingAccountIdsSet = useMemo(
    () => new Set([...deletingAccountIds, ...getDeletingWorkspaceAccountIds(selectedWorkspaceId)]),
    [deletingAccountIds, selectedWorkspaceId]
  );

  const loadWorkspaces = async () => {
    setWorkspacesLoading(true);
    try {
      const response = await fetchJsonOnce<{ workspaces?: Workspace[] }>({
        key: "accounts:workspaces",
        route: "accounts.workspaces",
        input: "/api/workspaces",
        timeoutMs: 5000,
      });
      if (!response.ok) {
        throw new Error("Unable to load workspaces.");
      }

      const items = Array.isArray(response.json?.workspaces) ? response.json.workspaces : [];
      setWorkspaces(items);
      setSelectedWorkspaceId((current) => chooseWorkspaceId(items, current));
    } catch {
      const fallbackWorkspaceId = readSelectedWorkspaceId();
      if (fallbackWorkspaceId) {
        setSelectedWorkspaceId((current) => current || fallbackWorkspaceId);
        setMessage("");
      } else {
        setMessage("Unable to load workspaces.");
        setHasInitialWorkspaceDataLoaded(true);
      }
    } finally {
      setWorkspacesLoading(false);
      setAccountsLoading(false);
    }
  };

  const loadWorkspaceData = async (workspaceId: string, options?: { silent?: boolean; awaitHydration?: boolean; forceFresh?: boolean }) => {
    const loadSeq = ++workspaceLoadSeqRef.current;
    let fetchedAccounts: Account[] = [];
    let visibleFetchedAccounts: Account[] = [];
    let visibleCachedWorkspaceAccounts: Account[] = [];
    const backgroundTasks: Promise<void>[] = [];
    let shouldAwaitBackgroundBeforeCompletingInitialLoad = false;
    const shouldGuardEmptyStateDuringHydration = !options?.silent && accounts.length === 0;
    const hasResilientFallbackEvidence = () =>
      hasCachedWorkspaceDataEvidence(workspaceId) ||
      hasRecentWorkspaceImportEvidence(workspaceId, importActivitySnapshot);

    if (!workspaceId) {
      setAccounts([]);
      setAccountRules([]);
      setTransactions([]);
      setAccountsLoading(false);
      setAccountsLoadFailed(false);
      setAccountsHydrationPending(false);
      setHasInitialWorkspaceDataLoaded(true);
      return;
    }

    if (!options?.silent) {
      setAccountsLoading(true);
    }
    if (shouldGuardEmptyStateDuringHydration) {
      setAccountsHydrationPending(true);
    }

    try {
      const accountsResponse = await fetchJsonOnce<{ accounts?: Account[]; accountRules?: AccountRule[]; statementCheckpoints?: StatementCheckpoint[] }>({
        // An import may finish while the initial workspace request is still in
        // flight. Give the completion handoff its own request so it cannot
        // reuse that pre-import response and leave new snapshot accounts
        // invisible until the user reloads.
        key: options?.forceFresh ? `accounts:data:${workspaceId}:import:${loadSeq}` : `accounts:data:${workspaceId}`,
        route: "accounts.data",
        workspaceId,
        detail: options?.awaitHydration ? "awaitHydration" : options?.silent ? "silent" : "foreground",
        input: `/api/accounts?workspaceId=${encodeURIComponent(workspaceId)}`,
        timeoutMs: options?.silent ? null : 6500,
      });
      if (workspaceLoadSeqRef.current !== loadSeq) {
        return;
      }

      if (accountsResponse.ok) {
        setAccountsLoadFailed(false);
        const payload = accountsResponse.json;
        fetchedAccounts = Array.isArray(payload?.accounts)
          ? (payload.accounts as Account[]).filter((account) => isWorkspaceAccount(account, workspaceId))
          : [];
        const cachedWorkspaceAccounts = getCachedAccountsWorkspace(workspaceId)?.accounts as Account[] | undefined;
        visibleFetchedAccounts = fetchedAccounts.filter((account) => !deletedAccountIdsRef.current.has(account.id));
        visibleCachedWorkspaceAccounts = (cachedWorkspaceAccounts ?? []).filter(
          (account) => isWorkspaceAccount(account, workspaceId) && !deletedAccountIdsRef.current.has(account.id)
        );
        shouldAwaitBackgroundBeforeCompletingInitialLoad =
          !options?.silent && visibleFetchedAccounts.length === 0 && visibleCachedWorkspaceAccounts.length === 0;
        deletedAccountIdsRef.current = new Set(getDeletedWorkspaceAccountIds(workspaceId));
        deletingAccountIdsRef.current = new Set(getDeletingWorkspaceAccountIds(workspaceId));
        setDeletingAccountIds(Array.from(deletingAccountIdsRef.current));
        setAccounts((current) =>
          mergeAccountsWithOptimisticImports(
            visibleFetchedAccounts,
            current.length > 0
              ? current.filter(
                  (account) => isWorkspaceAccount(account, workspaceId) && !deletedAccountIdsRef.current.has(account.id)
                )
              : visibleCachedWorkspaceAccounts,
            deletedAccountIdsRef.current,
            transactions.filter(
              (transaction) =>
                transaction.workspaceId === workspaceId &&
                !deletedAccountIdsRef.current.has(transaction.accountId) &&
                !deletingAccountIdsRef.current.has(transaction.accountId)
            ),
            { preserveImportedEvidence: hasRecentWorkspaceImportEvidence(workspaceId, importActivitySnapshot) }
          )
        );
        setAccountRules(Array.isArray(payload?.accountRules) ? payload.accountRules : []);
        setStatementCheckpoints(Array.isArray(payload?.statementCheckpoints) ? (payload.statementCheckpoints as StatementCheckpoint[]) : []);
        if (visibleFetchedAccounts.length > 0) {
          setAccountsHydrationPending(false);
        }
      } else {
        const cachedWorkspace = getCachedWorkspaceHydration(workspaceId);
        const cachedDeletedAccountIds = new Set(getDeletedWorkspaceAccountIds(workspaceId));
        const cachedDeletingAccountIds = new Set(getDeletingWorkspaceAccountIds(workspaceId));
        const cachedAccounts = ((cachedWorkspace?.accounts as Account[] | undefined) ?? []).filter(
          (account) => !cachedDeletedAccountIds.has(account.id) && !cachedDeletingAccountIds.has(account.id)
        );
        const cachedTransactions = ((cachedWorkspace?.transactions as Transaction[] | undefined) ?? []).filter(
          (transaction) =>
            !cachedDeletedAccountIds.has(transaction.accountId) && !cachedDeletingAccountIds.has(transaction.accountId)
        );
        const cachedCheckpoints = ((cachedWorkspace?.statementCheckpoints as StatementCheckpoint[] | undefined) ?? []).filter(
          (checkpoint) =>
            !checkpoint.accountId ||
            (!cachedDeletedAccountIds.has(checkpoint.accountId) && !cachedDeletingAccountIds.has(checkpoint.accountId))
        );
        const cachedRules = (cachedWorkspace?.accountRules as AccountRule[] | undefined) ?? [];
        const hasCachedWorkspaceSnapshot =
          cachedAccounts.length > 0 || cachedTransactions.length > 0 || cachedCheckpoints.length > 0 || cachedRules.length > 0;

        if (!options?.silent) {
          if (hasCachedWorkspaceSnapshot) {
            deletedAccountIdsRef.current = cachedDeletedAccountIds;
            deletingAccountIdsRef.current = cachedDeletingAccountIds;
            setDeletingAccountIds(Array.from(cachedDeletingAccountIds));
            setAccounts(cachedAccounts);
            setTransactions(cachedTransactions);
            setStatementCheckpoints(cachedCheckpoints);
            setAccountRules(cachedRules);
            setMessage("");
            setAccountsLoadFailed(false);
            setAccountsHydrationPending(false);
            setHasInitialWorkspaceDataLoaded(true);
          } else if (hasResilientFallbackEvidence()) {
            setMessage("");
            setAccountsLoadFailed(false);
            setAccountsHydrationPending(false);
            setHasInitialWorkspaceDataLoaded(true);
            window.setTimeout(() => {
              void loadWorkspaceData(workspaceId, { silent: true, awaitHydration: true });
            }, WORKSPACE_RETRY_AFTER_TRANSIENT_FAILURE_MS);
          } else {
            setMessage("Unable to load accounts for this workspace.");
            setAccountsLoadFailed(true);
          }
          setHasInitialWorkspaceDataLoaded(true);
        }
        setAccountsHydrationPending(false);
      }

      if (!options?.silent) {
        if (!shouldAwaitBackgroundBeforeCompletingInitialLoad) {
          setHasInitialWorkspaceDataLoaded(true);
          setAccountsLoading(false);
        }
      }

      if (!options?.silent) {
        void (async () => {
          try {
            const maintenanceResponse = await fetch(`/api/accounts?workspaceId=${encodeURIComponent(workspaceId)}&repairImportedAccounts=1&cleanupImportedAccounts=1&maintenance=1`, {
              cache: "no-store",
            });
            const maintenancePayload = maintenanceResponse.ok
              ? await maintenanceResponse.json().catch(() => null)
              : null;
            if (
              workspaceLoadSeqRef.current === loadSeq &&
              (Number(maintenancePayload?.maintenance?.removedStalePdaxBucketHoldings ?? 0) > 0 ||
                Number(maintenancePayload?.maintenance?.repairedPdaxPortfolioAssetLabels ?? 0) > 0 ||
                Number(maintenancePayload?.maintenance?.repairedPdaxPortfolioAccounts ?? 0) > 0 ||
                Number(maintenancePayload?.maintenance?.refreshedPdaxCryptoMarketValues ?? 0) > 0)
            ) {
              void loadWorkspaceData(workspaceId, { silent: true, awaitHydration: true });
            }
          } catch {
            // Imported-account maintenance is best-effort and should never block opening Accounts.
          }
        })();
      }

      backgroundTasks.push((async () => {
        try {
          const categoriesResponse = await fetchJsonOnce<{ categories?: Array<{ id: string; name: string }> }>({
            key: `accounts:categories:${workspaceId}`,
            route: "accounts.categories",
            workspaceId,
            detail: "background",
            input: `/api/categories?workspaceId=${encodeURIComponent(workspaceId)}`,
          });
          if (workspaceLoadSeqRef.current !== loadSeq || !categoriesResponse.ok) {
            return;
          }

          const fetchedCategories = Array.isArray(categoriesResponse.json?.categories) ? categoriesResponse.json.categories : [];
          if (fetchedCategories.length === 0) {
            return;
          }

          const cachedWorkspaceTransactions = getCachedAccountsWorkspace(workspaceId);
          persistTransactionsWorkspaceCache(workspaceId, {
            accounts: (cachedWorkspaceTransactions?.accounts as Account[] | undefined) ?? visibleFetchedAccounts,
            categories: fetchedCategories,
            transactions:
              (cachedWorkspaceTransactions?.transactions as Transaction[] | undefined)?.filter(
                (transaction) =>
                  !deletedAccountIdsRef.current.has(transaction.accountId) &&
                  !deletingAccountIdsRef.current.has(transaction.accountId)
              ) ?? [],
            imports: (cachedWorkspaceTransactions?.imports as ImportFile[] | undefined) ?? [],
          });
        } catch {
          // Categories are best-effort during background hydration.
        }
      })());

      backgroundTasks.push((async () => {
        try {
          const transactionsResponse = await fetchJsonOnce<{ transactions?: Transaction[] }>({
            key: `accounts:transactions:${workspaceId}:light`,
            route: "accounts.transactions",
            workspaceId,
            detail: options?.awaitHydration ? "awaitHydration" : "background",
            input: `/api/transactions?workspaceId=${encodeURIComponent(workspaceId)}&pageSize=all&summaryMode=light`,
          });
          if (workspaceLoadSeqRef.current !== loadSeq) {
            return;
          }

          if (transactionsResponse.ok) {
            const fetchedTransactions = Array.isArray(transactionsResponse.json?.transactions)
              ? (transactionsResponse.json.transactions as Transaction[]).filter(
                  (transaction) => transaction.workspaceId === workspaceId
                )
              : [];
            const cachedWorkspaceTransactions = getCachedAccountsWorkspace(workspaceId)?.transactions as Transaction[] | undefined;
            const visibleFetchedTransactions = fetchedTransactions.filter(
              (transaction) =>
                !deletedAccountIdsRef.current.has(transaction.accountId) &&
                !deletingAccountIdsRef.current.has(transaction.accountId)
            );
            const visibleCachedWorkspaceTransactions = (cachedWorkspaceTransactions ?? []).filter(
              (transaction) =>
                transaction.workspaceId === workspaceId &&
                !deletedAccountIdsRef.current.has(transaction.accountId) &&
                !deletingAccountIdsRef.current.has(transaction.accountId)
            );
            setTransactions((current) =>
              visibleFetchedTransactions.length > 0
                ? mergeImportedWorkspaceTransactions([], visibleFetchedTransactions)
                : mergeImportedWorkspaceTransactions(
                    current.length > 0
                      ? current.filter(
                          (transaction) =>
                            !deletedAccountIdsRef.current.has(transaction.accountId) &&
                            !deletingAccountIdsRef.current.has(transaction.accountId)
                        )
                      : visibleCachedWorkspaceTransactions,
                    visibleFetchedTransactions
                  )
            );
            setAccounts((current) =>
              mergeAccountsWithOptimisticImports(
                visibleFetchedAccounts,
                current.filter(
                  (account) => isWorkspaceAccount(account, workspaceId) && !deletedAccountIdsRef.current.has(account.id)
                ),
                deletedAccountIdsRef.current,
                visibleFetchedTransactions.length > 0 ? visibleFetchedTransactions : visibleCachedWorkspaceTransactions,
                { preserveImportedEvidence: true }
              )
            );
          }
        } catch {
          // Background transaction hydration is best-effort.
        } finally {
          if (workspaceLoadSeqRef.current === loadSeq) {
            setAccountsHydrationPending(false);
            if (!options?.silent && shouldAwaitBackgroundBeforeCompletingInitialLoad) {
              setHasInitialWorkspaceDataLoaded(true);
              setAccountsLoading(false);
            }
          }
        }
      })());

      if (options?.awaitHydration) {
        await Promise.allSettled(backgroundTasks);
      }
    } catch {
      if (workspaceLoadSeqRef.current !== loadSeq) {
        return;
      }

      const hydrated = hydrateWorkspaceFromCache(workspaceId);
      if (!options?.silent) {
        const shouldSuppressFailure = hydrated || hasResilientFallbackEvidence();
        setMessage(shouldSuppressFailure ? "" : "Unable to load accounts for this workspace.");
        setAccountsLoadFailed(!shouldSuppressFailure && accounts.length === 0);
        setHasInitialWorkspaceDataLoaded(true);
        if (shouldSuppressFailure) {
          window.setTimeout(() => {
            void loadWorkspaceData(workspaceId, { silent: true, awaitHydration: true });
          }, WORKSPACE_RETRY_AFTER_TRANSIENT_FAILURE_MS);
        }
      }
      setAccountsHydrationPending(false);
    } finally {
      if (!options?.silent && !shouldAwaitBackgroundBeforeCompletingInitialLoad) {
        setAccountsLoading(false);
      }
    }
  };

  const hydrateWorkspaceFromCache = (workspaceId: string) => {
    if (!workspaceId) {
      return false;
    }

    const cachedSnapshot = getCachedWorkspaceHydration(workspaceId);
    deletedAccountIdsRef.current = new Set(getDeletedWorkspaceAccountIds(workspaceId));
    deletingAccountIdsRef.current = new Set(getDeletingWorkspaceAccountIds(workspaceId));
    setDeletingAccountIds(Array.from(deletingAccountIdsRef.current));
    if (!cachedSnapshot) {
      return false;
    }

    const filteredAccounts = (cachedSnapshot.accounts as Account[]).filter(
      (account) => !deletedAccountIdsRef.current.has(account.id) && !deletingAccountIdsRef.current.has(account.id)
    );
    const filteredTransactions = (cachedSnapshot.transactions as Transaction[]).filter(
      (transaction) =>
        !deletedAccountIdsRef.current.has(transaction.accountId) && !deletingAccountIdsRef.current.has(transaction.accountId)
    );
    const filteredCheckpoints = (cachedSnapshot.statementCheckpoints as StatementCheckpoint[]).filter(
      (checkpoint) =>
        !checkpoint.accountId ||
        (!deletedAccountIdsRef.current.has(checkpoint.accountId) && !deletingAccountIdsRef.current.has(checkpoint.accountId))
    );

    setAccounts(
      mergeAccountsWithOptimisticImports(filteredAccounts, filteredAccounts, deletedAccountIdsRef.current, filteredTransactions, {
        preserveImportedEvidence: true,
      })
    );
    setAccountRules(cachedSnapshot.accountRules as AccountRule[]);
    setTransactions(filteredTransactions);
    setStatementCheckpoints(filteredCheckpoints);
    markWorkspaceHydrated(workspaceId, cachedSnapshot.updatedAt);
    setAccountsLoading(false);
    setHasInitialWorkspaceDataLoaded(true);
    return true;
  };

  useEffect(() => {
    void loadWorkspaces();
  }, []);

  useEffect(() => {
    persistSelectedWorkspaceId(selectedWorkspaceId);
  }, [selectedWorkspaceId]);

  useEffect(() => {
    setImportActivitySnapshot(readImportActivity());
    return subscribeImportActivity(() => {
      setImportActivitySnapshot(readImportActivity());
    });
  }, []);

  useEffect(() => {
    const completedSummary = getCompletedImportActivitySummary(importActivitySnapshot);
    if (!selectedWorkspaceId || !completedSummary || importActivitySnapshot?.workspaceId !== selectedWorkspaceId) {
      return;
    }

    const refreshKey = `${importActivitySnapshot.updatedAt}:${completedSummary.accountId ?? completedSummary.optimisticAccountId ?? ""}`;
    if (completedImportRefreshKeyRef.current === refreshKey) {
      return;
    }

    completedImportRefreshKeyRef.current = refreshKey;
    // Import completion can arrive from a global uploader or race the account
    // write. Rehydrate once from the authoritative endpoint so new snapshot
    // accounts are visible without a manual page reload.
    void loadWorkspaceData(selectedWorkspaceId, { silent: true, awaitHydration: true });
  }, [importActivitySnapshot, loadWorkspaceData, selectedWorkspaceId]);

  useEffect(() => {
    if (searchParams?.get("import") === "1") {
      setImportOpen(true);
      router.replace("/accounts");
    }
  }, [router, searchParams]);

  useEffect(() => {
    const deletingAccountId = searchParams?.get("deletingAccountId");
    if (!deletingAccountId) {
      return;
    }

    const activeWorkspaceId = searchParams?.get("deletingWorkspaceId") ?? readSelectedWorkspaceId() ?? selectedWorkspaceId;
    if (!activeWorkspaceId) {
      return;
    }

    markDeletingWorkspaceAccount(activeWorkspaceId, deletingAccountId);
    deletingAccountIdsRef.current.add(deletingAccountId);
    setDeletingAccountIds(Array.from(deletingAccountIdsRef.current));

    const nextSearchParams = new URLSearchParams(searchParams?.toString() ?? "");
    nextSearchParams.delete("deletingAccountId");
    nextSearchParams.delete("deletingWorkspaceId");
    const nextQuery = nextSearchParams.toString();
    router.replace(nextQuery ? `/accounts?${nextQuery}` : "/accounts");
  }, [router, searchParams, selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      if (workspacesLoading || workspaces.length > 0) {
        setAccountsLoading(true);
        setHasInitialWorkspaceDataLoaded(false);
        return;
      }

      setAccounts([]);
      setAccountRules([]);
      setTransactions([]);
      setStatementCheckpoints([]);
      setAccountsLoading(false);
      setAccountsHydrationPending(false);
      setHasInitialWorkspaceDataLoaded(true);
      return;
    }

    deletedAccountIdsRef.current = new Set(getDeletedWorkspaceAccountIds(selectedWorkspaceId));
    deletingAccountIdsRef.current = new Set(getDeletingWorkspaceAccountIds(selectedWorkspaceId));
    if (
      deletingAccountIdFromQuery &&
      (!deletingWorkspaceIdFromQuery || deletingWorkspaceIdFromQuery === selectedWorkspaceId)
    ) {
      deletingAccountIdsRef.current.add(deletingAccountIdFromQuery);
    }
    setDeletingAccountIds(Array.from(deletingAccountIdsRef.current));

    const hydratedFromCache = hydrateWorkspaceFromCache(selectedWorkspaceId);
    if (!hydratedFromCache && accounts.length === 0) {
      setAccounts([]);
      setAccountRules([]);
      setTransactions([]);
      setStatementCheckpoints([]);
    }
    setAccountsLoading(true);
    setAccountsHydrationPending(!hydratedFromCache && accounts.length === 0);
    setHasInitialWorkspaceDataLoaded(hydratedFromCache);
    void loadWorkspaceData(selectedWorkspaceId, { silent: hydratedFromCache });
  }, [selectedWorkspaceId, workspacesLoading, workspaces.length]);

  useEffect(() => {
    if (!selectedWorkspaceId || typeof window === "undefined") {
      return;
    }

    const shouldReactToCacheKey = (key: string | null) =>
      key === accountsWorkspaceCacheKey ||
      key === deletedAccountsWorkspaceCacheKey ||
      key === deletingAccountsWorkspaceCacheKey ||
      key === "clover.selected-workspace-id.v1";

    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) {
        return;
      }

      if (!shouldReactToCacheKey(event.key)) {
        return;
      }

      const activeWorkspaceId = readSelectedWorkspaceId() || selectedWorkspaceId;
      if (!activeWorkspaceId || activeWorkspaceId !== selectedWorkspaceId) {
        return;
      }

      if (!hydrateWorkspaceFromCache(activeWorkspaceId) && shouldHydrateWorkspaceSnapshot(activeWorkspaceId)) {
        setAccountsLoading(true);
        void loadWorkspaceData(activeWorkspaceId);
      }
    };

    const handleWorkspaceCacheUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<WorkspaceCacheUpdatedEventDetail>;
      if (!shouldReactToCacheKey(customEvent.detail?.key ?? null)) {
        return;
      }

      const activeWorkspaceId = readSelectedWorkspaceId() || selectedWorkspaceId;
      if (!activeWorkspaceId || activeWorkspaceId !== selectedWorkspaceId) {
        return;
      }

      if (!hydrateWorkspaceFromCache(activeWorkspaceId) && shouldHydrateWorkspaceSnapshot(activeWorkspaceId)) {
        setAccountsLoading(true);
        void loadWorkspaceData(activeWorkspaceId);
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(workspaceCacheUpdatedEventName, handleWorkspaceCacheUpdated as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(workspaceCacheUpdatedEventName, handleWorkspaceCacheUpdated as EventListener);
    };
  }, [loadWorkspaceData, selectedWorkspaceId, shouldHydrateWorkspaceSnapshot]);

  useEffect(() => {
    if (!selectedWorkspaceId || accountsLoading || accountsLoadFailed) {
      return;
    }

    const updatedAt = persistAccountsWorkspaceCache(selectedWorkspaceId, {
      accounts: accounts.filter((account) => isWorkspaceAccount(account, selectedWorkspaceId)),
      accountRules,
      transactions: transactions.filter((transaction) => transaction.workspaceId === selectedWorkspaceId),
      statementCheckpoints: statementCheckpoints.filter(
        (checkpoint) => checkpoint.workspaceId === selectedWorkspaceId
      ),
    });
    markWorkspaceHydrated(selectedWorkspaceId, updatedAt);
  }, [accounts, accountRules, accountsLoadFailed, accountsLoading, selectedWorkspaceId, statementCheckpoints, transactions]);

  useEffect(() => {
    let cancelled = false;

    const loadStatementCheckpoints = async () => {
      if (!drawerAccountId) {
        setDrawerStatementCheckpoints([]);
        return;
      }

      try {
        const response = await fetch(`/api/accounts/${drawerAccountId}/statement-checkpoints`);
        if (!response.ok) {
          if (!cancelled) {
            setDrawerStatementCheckpoints([]);
          }
          return;
        }

        const payload = await response.json();
        if (!cancelled) {
          const nextCheckpoints = Array.isArray(payload.checkpoints) ? (payload.checkpoints as StatementCheckpoint[]) : [];
          setDrawerStatementCheckpoints(nextCheckpoints);
          setStatementCheckpoints((current) => mergeStatementCheckpoints(current, nextCheckpoints));
        }
      } catch {
        if (!cancelled) {
          setDrawerStatementCheckpoints([]);
        }
      }
    };

    void loadStatementCheckpoints();

    return () => {
      cancelled = true;
    };
  }, [drawerAccountId]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      return;
    }

    const deletingIds = new Set(getDeletingWorkspaceAccountIds(selectedWorkspaceId));
    const deletedIds = new Set(getDeletedWorkspaceAccountIds(selectedWorkspaceId));
    if (deletingIds.size === 0 && deletedIds.size === 0) {
      return;
    }

    setAccounts((current) => current.filter((account) => !deletedIds.has(account.id) && !deletingIds.has(account.id)));
    setTransactions((current) =>
      current.filter((transaction) => !deletedIds.has(transaction.accountId) && !deletingIds.has(transaction.accountId))
    );
    setStatementCheckpoints((current) =>
      current.filter(
        (checkpoint) =>
          !checkpoint.accountId || (!deletedIds.has(checkpoint.accountId) && !deletingIds.has(checkpoint.accountId))
      )
    );
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (!drawerAccountId) {
      return;
    }

    const account = reconciledAccounts.find((entry) => entry.id === drawerAccountId) ?? null;
    if (!account) {
      return;
    }

    setDrawerTransactions(transactions.filter((transaction) => transactionMatchesAccount(transaction, account)));
  }, [drawerAccountId, reconciledAccounts, transactions]);

  useEffect(() => {
    let cancelled = false;

    const loadDrawerTransactions = async () => {
      if (!drawerAccountId || !selectedWorkspaceId) {
        setDrawerTransactions([]);
        return;
      }

      try {
        const response = await fetch(
          `/api/transactions?workspaceId=${encodeURIComponent(selectedWorkspaceId)}&accountId=${encodeURIComponent(drawerAccountId)}`
        );
        if (!response.ok) {
          if (!cancelled) {
            setDrawerTransactions([]);
          }
          return;
        }

        const payload = await response.json();
        if (!cancelled) {
          setDrawerTransactions(Array.isArray(payload.transactions) ? (payload.transactions as Transaction[]) : []);
        }
      } catch {
        if (!cancelled) {
          setDrawerTransactions([]);
        }
      }
    };

    void loadDrawerTransactions();

    return () => {
      cancelled = true;
    };
  }, [drawerAccountId, selectedWorkspaceId]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAddOpen(false);
        setImportOpen(false);
        setDrawerAccountId(null);
        setDownloadMenuOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!downloadMenuRef.current) {
        return;
      }

      if (!downloadMenuRef.current.contains(event.target as Node)) {
        setDownloadMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  const latestCheckpoints = useMemo(() => {
    const checkpointsByAccountId = new Map<string, StatementCheckpoint>();
    const checkpointsByAccountKey = new Map<string, StatementCheckpoint>();

    for (const checkpoint of statementCheckpoints) {
    const checkpointTime = getCheckpointFreshnessTime(checkpoint);

      if (checkpoint.accountId) {
        const current = checkpointsByAccountId.get(checkpoint.accountId);
      const currentTime = current ? getCheckpointFreshnessTime(current) : -1;

        if (!current || checkpointTime >= currentTime) {
          checkpointsByAccountId.set(checkpoint.accountId, checkpoint);
        }
      }

      const checkpointKey = getCheckpointIdentityKey(checkpoint);
      if (checkpointKey) {
        const current = checkpointsByAccountKey.get(checkpointKey);
      const currentTime = current ? getCheckpointFreshnessTime(current) : -1;

        if (!current || checkpointTime >= currentTime) {
          checkpointsByAccountKey.set(checkpointKey, checkpoint);
        }
      }
    }

    return { checkpointsByAccountId, checkpointsByAccountKey };
  }, [statementCheckpoints]);

  const latestCheckpoint = useMemo(() => drawerStatementCheckpoints[0] ?? null, [drawerStatementCheckpoints]);
  const selectedAccountCheckpointSummary = useMemo(
    () => getCheckpointSummary(latestCheckpoint),
    [latestCheckpoint]
  );

  const availableCurrencies = useMemo(() => {
    const currencySet = new Set(
      reconciledAccounts
        .map((account) => formatCurrencyCode(account.currency))
        .filter(Boolean)
    );

    if (currencySet.size === 0) {
      currencySet.add("PHP");
    }

    return Array.from(currencySet).sort((left, right) => left.localeCompare(right));
  }, [reconciledAccounts]);

  useEffect(() => {
    if (availableCurrencies.includes(selectedCurrency)) {
      return;
    }

    setSelectedCurrency(availableCurrencies[0] ?? "PHP");
  }, [availableCurrencies, selectedCurrency]);

  const currencyFilteredAccounts = useMemo(
    () =>
      reconciledAccounts.filter((account) => formatCurrencyCode(account.currency) === selectedCurrency),
    [reconciledAccounts, selectedCurrency]
  );

  const hasResolvedBalance = (value: string | null | undefined) => {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) {
      return false;
    }

    const numeric = Number(normalized);
    return Number.isFinite(numeric);
  };

  const getUploadAccountLoadingContext = (account: Account): UploadAccountLoadingContext => {
    const matchingImportSummary =
      pendingImportSummary
        ? pendingImportSummary
        : getCompletedImportActivitySummary(importActivitySnapshot);
    const latestCheckpoint =
      latestCheckpoints.checkpointsByAccountId.get(account.id) ??
      latestCheckpoints.checkpointsByAccountKey.get(
        normalizeImportedAccountKey(account.name, account.institution, account.accountNumber, account.type, account.currency)
      ) ??
      null;
    const cachedTransactionsWorkspace = selectedWorkspaceId ? getCachedTransactionsWorkspace(selectedWorkspaceId) : null;
    const cachedTransactionsForAccount = Array.isArray(cachedTransactionsWorkspace?.transactions)
      ? (cachedTransactionsWorkspace.transactions as Transaction[]).some((transaction) => transactionMatchesAccount(transaction, account))
      : false;
    const matchingImportSummaryHasRows =
      matchingImportSummary &&
      Number(matchingImportSummary.rowsImported ?? 0) > 0 &&
      uploadSummaryMatchesAccount(matchingImportSummary, account);
    const checkpointBalance =
      latestCheckpoint?.endingBalance !== null && latestCheckpoint?.endingBalance !== undefined
        ? String(latestCheckpoint.endingBalance)
        : null;
    const stableBalance = stableAccountBalancesRef.current.get(account.id) ?? null;
    const hasVisibleBalance = hasResolvedBalance(account.balance);
    const hasApiConfirmedTransactions = Number(account.transactionCount ?? 0) > 0;
    const hasLoadedTransactions = Boolean(
      hasApiConfirmedTransactions ||
        transactions.some((transaction) => transactionMatchesAccount(transaction, account)) ||
        cachedTransactionsForAccount ||
        (typeof latestCheckpoint?.rowCount === "number" && latestCheckpoint.rowCount > 0) ||
        matchingImportSummaryHasRows
    );
    const displayedBalance = hasResolvedBalance(checkpointBalance)
      ? checkpointBalance
      : hasResolvedBalance(account.balance)
        ? account.balance
        : stableBalance;
    const isLoading = Boolean(
      account.source === "upload" &&
        !hasVisibleBalance &&
        !hasResolvedBalance(checkpointBalance) &&
        !stableBalance &&
        !hasLoadedTransactions
    );
    const loadingSince = accountLoadingSinceRef.current.get(account.id);
    const isTimedOut =
      isLoading &&
      loadingSince !== undefined &&
      accountLoadingPulse - loadingSince >= ACCOUNT_LOADING_TIMEOUT_MS;
    const shouldShowLoading = isLoading && !isTimedOut;

    return {
      latestCheckpoint,
      checkpointBalance,
      stableBalance,
      hasVisibleBalance,
      hasLoadedTransactions,
      displayedBalance,
      baseIsLoading: isLoading,
      isLoading: shouldShowLoading,
      isTimedOut,
    };
  };

  const getDisplayedAccountBalance = (account: Account) => {
    // Market investments are revalued from their current holdings. A statement
    // checkpoint is historical evidence and must never override that current
    // value on Accounts; doing so makes the institution card disagree with its
    // own Holdings page until another refresh arrives.
    if (prefersLiveInvestmentBalance(getEffectiveAccountType(account)) && hasResolvedBalance(account.balance)) {
      return account.balance;
    }

    const latestCheckpoint = getLatestCheckpointForAccount(account, statementCheckpoints);
    const checkpointBalance =
      latestCheckpoint?.endingBalance !== null && latestCheckpoint?.endingBalance !== undefined
        ? String(latestCheckpoint.endingBalance)
        : null;
    const stableBalance = stableAccountBalancesRef.current.get(account.id) ?? null;

    if (hasResolvedBalance(checkpointBalance)) {
      return checkpointBalance;
    }

    if (hasResolvedBalance(account.balance)) {
      return account.balance;
    }

    return stableBalance ?? checkpointBalance;
  };

  const activeUploadLoadingAccountIds = useMemo(() => {
    return currencyFilteredAccounts
      .filter((account) => getUploadAccountLoadingContext(account).baseIsLoading)
      .map((account) => account.id);
  }, [accountLoadingPulse, currencyFilteredAccounts, importActivitySnapshot, latestCheckpoints, pendingImportSummary, transactions]);

  const visibleUploadLoadingAccountIds = useMemo(() => {
    return currencyFilteredAccounts.filter((account) => getUploadAccountLoadingContext(account).isLoading).map((account) => account.id);
  }, [accountLoadingPulse, currencyFilteredAccounts, importActivitySnapshot, latestCheckpoints, pendingImportSummary, transactions]);

  useEffect(() => {
    const activeIds = new Set(activeUploadLoadingAccountIds);
    const now = Date.now();

    for (const id of activeIds) {
      if (!accountLoadingSinceRef.current.has(id)) {
        accountLoadingSinceRef.current.set(id, now);
      }
    }

    for (const id of Array.from(accountLoadingSinceRef.current.keys())) {
      if (!activeIds.has(id)) {
        accountLoadingSinceRef.current.delete(id);
      }
    }
  }, [activeUploadLoadingAccountIds]);

  useEffect(() => {
    if (visibleUploadLoadingAccountIds.length === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      setAccountLoadingPulse(Date.now());
    }, ACCOUNT_LOADING_PULSE_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [visibleUploadLoadingAccountIds.length]);

  const isColdLoading =
    (selectedWorkspaceId && (accountsLoading || !hasInitialWorkspaceDataLoaded)) ||
    (!selectedWorkspaceId && (workspacesLoading || accountsLoading || !hasInitialWorkspaceDataLoaded));

  useEffect(() => {
    if (hasInitialWorkspaceDataLoaded) {
      setHasCompletedInitialAccountPaint(true);
    }
  }, [hasInitialWorkspaceDataLoaded]);

  useEffect(() => {
    if (!isColdLoading) {
      wasColdLoadingRef.current = false;
      return;
    }

    if (!wasColdLoadingRef.current) {
      pageLoadingSinceRef.current = Date.now();
    }
    wasColdLoadingRef.current = true;

    const interval = window.setInterval(() => {
      setPageLoadingPulse(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isColdLoading]);

  useEffect(() => {
    if (hasInitialWorkspaceDataLoaded) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setAccountsLoading(false);
      setWorkspacesLoading(false);
      setAccountsLoadFailed(accounts.length === 0);
      setHasInitialWorkspaceDataLoaded(true);
    }, PAGE_LOADING_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [accounts.length, hasInitialWorkspaceDataLoaded]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.body.toggleAttribute(
      "data-clover-accounts-loading",
      !hasCompletedInitialAccountPaint && isColdLoading && accounts.length === 0
    );

    return () => {
      document.body.removeAttribute("data-clover-accounts-loading");
    };
  }, [accounts.length, hasCompletedInitialAccountPaint, isColdLoading]);

  const duplicateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const account of currencyFilteredAccounts) {
      const key = `${account.name.trim().toLowerCase()}::${(account.institution ?? "").trim().toLowerCase()}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [currencyFilteredAccounts]);

  const visibleAccounts = useMemo(() => {
    const hasCashAccount = currencyFilteredAccounts.some((account) => getEffectiveAccountType(account) === "cash");
    const accountsForDisplay = hasCashAccount
      ? currencyFilteredAccounts
      : [...currencyFilteredAccounts, buildCashFallbackAccount(selectedCurrency)];

    return [...accountsForDisplay].sort((left, right) => {
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  }, [currencyFilteredAccounts, selectedCurrency]);

  const featuredAccounts = useMemo(() => {
    const swipableAccountTypes = new Set<SupportedAccountType>(["bank", "credit_card", "wallet", "cash"]);
    const amountSortedAccounts = visibleAccounts
      .filter((account) => swipableAccountTypes.has(getEffectiveAccountType(account)))
      .sort((left, right) => {
        const leftAmount = Math.abs(normalizeAccountBalance(getEffectiveAccountType(left), parseAmount(getDisplayedAccountBalance(left))));
        const rightAmount = Math.abs(normalizeAccountBalance(getEffectiveAccountType(right), parseAmount(getDisplayedAccountBalance(right))));
        if (rightAmount !== leftAmount) {
          return rightAmount - leftAmount;
        }

        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      });
    const favoriteAccounts = amountSortedAccounts.filter((account) => Boolean(account.favorite));
    return favoriteAccounts.length > 0 ? favoriteAccounts : amountSortedAccounts;
  }, [visibleAccounts, statementCheckpoints]);

  const totals = useMemo(() => {
    return visibleAccounts.reduce(
      (accumulator, account) => {
        const displayedBalance = getDisplayedAccountBalance(account);
        const signedValue = normalizeAccountBalance(getEffectiveAccountType(account), parseAmount(displayedBalance));
        if (isSpendableAccountType(getEffectiveAccountType(account)) && signedValue > 0) {
          accumulator.spendable += signedValue;
        }
        if (signedValue >= 0) {
          accumulator.assets += signedValue;
        } else {
          accumulator.liabilities += Math.abs(signedValue);
        }
        accumulator.netWorth += signedValue;
        return accumulator;
      },
      { assets: 0, liabilities: 0, netWorth: 0, spendable: 0 }
    );
  }, [visibleAccounts, statementCheckpoints]);

  const accountGroups = useMemo(() => {
    const groups = [
      {
        title: "Banks & savings",
        tone: "assets",
        itemLabel: "account",
        rows: visibleAccounts.filter((account) => {
          const effectiveType = getEffectiveAccountType(account);
          return effectiveType === "bank";
        }),
      },
      {
        title: "Credit Cards",
        tone: "liability",
        itemLabel: "account",
        rows: visibleAccounts.filter((account) => getEffectiveAccountType(account) === "credit_card"),
      },
      {
        title: "Liabilities",
        tone: "liability",
        itemLabel: "account",
        rows: visibleAccounts.filter((account) => {
          const effectiveType = getEffectiveAccountType(account);
          return effectiveType !== "credit_card" && isLiabilityAccountType(effectiveType);
        }),
      },
      {
        title: "Wallets",
        tone: "assets",
        itemLabel: "account",
        rows: visibleAccounts.filter((account) => getEffectiveAccountType(account) === "wallet"),
      },
      {
        title: "Investments",
        tone: "assets",
        itemLabel: "institution",
        rows: buildInvestmentInstitutionCards(
          visibleAccounts.filter((account) => getEffectiveAccountType(account) === "investment"),
          getDisplayedAccountBalance
        ),
      },
      {
        title: "Tracked assets",
        tone: "neutral",
        itemLabel: "account",
        rows: visibleAccounts.filter((account) => isTrackedAssetAccountType(getEffectiveAccountType(account))),
      },
      {
        title: "Cash",
        tone: "cash",
        itemLabel: "account",
        rows: visibleAccounts.filter((account) => getEffectiveAccountType(account) === "cash"),
      },
    ];

    return groups
      .map((group) => ({
        ...group,
        total: group.rows.reduce(
          (sum, row) =>
            sum +
            normalizeAccountBalance(
              "kind" in row && row.kind === "investment_institution" ? "investment" : getEffectiveAccountType(row as Account),
              parseAmount(row.balance)
            ),
          0
        ),
      }))
      .filter((group) => group.rows.length > 0);
  }, [visibleAccounts]);

  const selectedAccount = useMemo(
    () => reconciledAccounts.find((account) => account.id === drawerAccountId) ?? null,
    [drawerAccountId, reconciledAccounts]
  );
  const selectedAccountLoadingContext = useMemo(
    () => (selectedAccount ? getUploadAccountLoadingContext(selectedAccount) : null),
    [accountLoadingPulse, importActivitySnapshot, pendingImportSummary, selectedAccount, latestCheckpoints, transactions]
  );
  const currencyCatalogCodes = useMemo(() => getCurrencyCatalogCodes(), []);
  const selectedAccountCurrency = selectedAccount?.currency ?? "PHP";

  useEffect(() => {
    if (!selectedAccount) {
      return;
    }

    setAccountEditName(selectedAccount.name);
    setAccountEditInstitution(selectedAccount.institution ?? "");
    setAccountEditInvestmentSubtype(selectedAccount.investmentSubtype ?? "stock");
    setAccountEditInvestmentSymbol(selectedAccount.investmentSymbol ?? "");
    setAccountEditInvestmentQuantity(selectedAccount.investmentQuantity ?? "");
    setAccountEditInvestmentCostBasis(selectedAccount.investmentCostBasis ?? "");
    setAccountEditInvestmentPrincipal(selectedAccount.investmentPrincipal ?? "");
    setAccountEditInvestmentStartDate(selectedAccount.investmentStartDate ? selectedAccount.investmentStartDate.slice(0, 10) : "");
    setAccountEditInvestmentMaturityDate(selectedAccount.investmentMaturityDate ? selectedAccount.investmentMaturityDate.slice(0, 10) : "");
    setAccountEditInvestmentInterestRate(selectedAccount.investmentInterestRate ?? "");
    setAccountEditInvestmentMaturityValue(selectedAccount.investmentMaturityValue ?? "");
    setAccountEditType(selectedAccount.type);
    setAccountEditCurrency(selectedAccount.currency);
    setAccountEditSource(selectedAccount.source);
    setAccountEditBalance(selectedAccount.balance ?? "");
    setBalanceDraft(selectedAccount.balance ?? "");
    setAccountDeleteConfirmOpen(false);
  }, [selectedAccount]);

  const selectedAccountTransactions = useMemo(
    () =>
      selectedAccount
        ? drawerTransactions.filter((transaction) => !transaction.isExcluded || transaction.merchantRaw === "Beginning balance")
        : [],
    [selectedAccount, drawerTransactions]
  );

  const accountHistoryEntries = useMemo(() => {
    if (!selectedAccount) return [];
    return selectedAccountTransactions.slice(0, 5).map((transaction) => ({
      id: transaction.id,
      title: transaction.merchantClean ?? transaction.merchantRaw,
      subtitle: transaction.categoryName ?? "Uncategorized",
      value: transaction.amount,
      date: transaction.date,
      kind: transaction.type,
    }));
  }, [selectedAccount, selectedAccountTransactions]);

  const openingBalanceEntry = useMemo(
    () => selectedAccountTransactions.find((transaction) => transaction.merchantRaw === "Beginning balance") ?? null,
    [selectedAccountTransactions]
  );
  const selectedAccountImportSummaries = useMemo(
    () => buildImportSummaries(selectedAccountTransactions),
    [selectedAccountTransactions]
  );
  useEffect(() => {
    if (!importOpen || !pendingImportSummary || pendingImportSummary.optimistic) {
      return;
    }

    const inferredType =
      pendingImportSummary.accountType ??
      inferAccountTypeFromStatement(pendingImportSummary.institution, pendingImportSummary.accountName, "bank");
    if (!uploadSummaryCanDismissImportUi(pendingImportSummary, accounts, inferredType, true)) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setImportOpen(false);
      setPendingImportSummary(null);
    }, 250);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [accounts, importOpen, pendingImportSummary]);

  const manualAccountBrand = useMemo(
    () =>
      getAccountBrand({
        institution:
          manualType === "cash"
            ? "Cash"
            : manualType === "investment"
              ? manualInstitution
              : manualName,
        name: manualName,
        type: manualType,
      }),
    [manualInstitution, manualName, manualType]
  );

  const manualInvestmentFieldConfigs = useMemo(
    () => getInvestmentFieldConfigs(manualType === "investment" ? manualInvestmentSubtype : null),
    [manualInvestmentSubtype, manualType]
  );

  const manualTypeGuidance = useMemo(() => {
    if (isLiabilityAccountType(manualType)) {
      return "Use Recurring if you want Clover to track due dates, installments, or repayment reminders for this liability.";
    }

    if (manualType === "receivable") {
      return "Use Recurring if you want Clover to follow collection dates or repayment reminders for money owed to you.";
    }

    if (manualType === "prepaid") {
      return "Use the balance to track stored value. Add a recurring item if you want reload or expiry reminders.";
    }

    if (manualType === "insurance") {
      return "Use the balance to track policy or cash value. Add a recurring item if you want premium or renewal reminders.";
    }

    return null;
  }, [manualType]);

  const manualScheduleConfig = useMemo(() => {
    if (manualType === "receivable") {
      return {
        kind: "receivable" as const,
        titleSuffix: "collection",
        toggleLabel: "Track collections in Clover",
        helper: "Add the next collection date here and Clover will create a linked receivable reminder for this account.",
        amountLabel: "Expected amount",
        amountPlaceholder: "0.00",
        counterpartyLabel: "Who owes you? (optional)",
        counterpartyPlaceholder: "Client, friend, employer",
        dueDateLabel: "Next collection date",
        recurrenceDefault: "once" as const,
      };
    }

    if (manualType === "insurance") {
      return {
        kind: "planned_payment" as const,
        titleSuffix: "premium",
        toggleLabel: "Track premiums in Clover",
        helper: "Add the premium schedule here and Clover will create a linked reminder for this policy.",
        amountLabel: "Premium amount",
        amountPlaceholder: "0.00",
        counterpartyLabel: "Provider (optional)",
        counterpartyPlaceholder: "Insurer or broker",
        dueDateLabel: "Next premium date",
        recurrenceDefault: "monthly" as const,
      };
    }

    if (manualType === "prepaid") {
      return {
        kind: "planned_payment" as const,
        titleSuffix: "reload",
        toggleLabel: "Track reloads or expiry in Clover",
        helper: "Use this if you want Clover to remind you about reloads, renewals, or stored-value expiry.",
        amountLabel: "Reload amount",
        amountPlaceholder: "0.00",
        counterpartyLabel: "Provider (optional)",
        counterpartyPlaceholder: "Merchant or wallet provider",
        dueDateLabel: "Next reminder date",
        recurrenceDefault: "monthly" as const,
      };
    }

    const suggestedKind = getRecurringKindSuggestionForAccountType(manualType);
    if (suggestedKind === "debt") {
      return {
        kind: "debt" as const,
        titleSuffix: "repayment",
        toggleLabel: "Track repayments in Clover",
        helper: "Add the next due date here and Clover will create a linked repayment reminder for this account.",
        amountLabel: "Amount due",
        amountPlaceholder: "0.00",
        counterpartyLabel: "Lender or provider (optional)",
        counterpartyPlaceholder: "Bank, lender, merchant",
        dueDateLabel: "Next due date",
        recurrenceDefault: "monthly" as const,
      };
    }

    return null;
  }, [manualType]);

  useEffect(() => {
    if (!manualScheduleConfig) {
      setManualScheduleEnabled(false);
      setManualScheduleDueDate("");
      setManualScheduleRecurrence("monthly");
      setManualScheduleAmount("");
      setManualScheduleCounterparty("");
      return;
    }

    setManualScheduleRecurrence((current) =>
      current === manualScheduleConfig.recurrenceDefault ? current : manualScheduleConfig.recurrenceDefault
    );
  }, [manualScheduleConfig]);

  const manualAccountReference = useMemo(() => {
    if (manualType === "insurance") {
      return {
        label: "Policy number",
        placeholder: "Example: POL-12345678",
        helper: "Use a policy or member number if this insurance account has one.",
      };
    }

    if (manualType === "prepaid") {
      return {
        label: "Card or reference number",
        placeholder: "Example: GC-1024-7788",
        helper: "Helpful for gift cards, stored-value cards, and other prepaid balances.",
      };
    }

    if (manualType === "receivable") {
      return {
        label: "Invoice or reference number",
        placeholder: "Example: INV-2026-001",
        helper: "Use a reimbursement, invoice, or collection reference if you have one.",
      };
    }

    if (manualType === "payable" || manualType === "bnpl") {
      return {
        label: "Reference number",
        placeholder: "Example: REF-8291",
        helper: "Use the merchant, billing, or plan reference number if it helps you track this obligation.",
      };
    }

    if (manualType === "loan" || manualType === "mortgage" || manualType === "line_of_credit") {
      return {
        label: "Loan or account number",
        placeholder: "Example: 1234 5678 9012",
        helper: "Use the lender or account number if you want this liability easier to match later.",
      };
    }

    return {
      label: "Account number",
      placeholder: "Example: 1234 5678 9012",
      helper: null,
    };
  }, [manualType]);

  const accountEditInvestmentFieldConfigs = useMemo(
    () => getInvestmentFieldConfigs(accountEditType === "investment" ? accountEditInvestmentSubtype : null),
    [accountEditInvestmentSubtype, accountEditType]
  );

  const refreshAll = async () => {
    if (!selectedWorkspaceId) return;
    await loadWorkspaceData(selectedWorkspaceId, { silent: true, awaitHydration: true, forceFresh: true });
    setMessage(`Workspace "${selectedWorkspace?.name ?? "selected"}" refreshed.`);
  };

  const openAddAccount = () => {
    flushSync(() => {
      closeChrome();
    });

    if (!isLocalDevBrowser && planLimits?.accountLimit != null && accountLimitUsageCount >= planLimits.accountLimit) {
      showPlanLimitNudge({
        planTier,
        limitType: "account_limit",
        limitValue: planLimits.accountLimit,
      });
      setMessage("You’ve reached the current account limit for this plan.");
      return;
    }

    flushSync(() => {
      setAddAccountError(null);
      setAddOpen(true);
    });
  };

  const openImportFiles = (files: File[] | null = null, backgroundOnly = false) => {
    const shouldLaunchInBackground = backgroundOnly && !(files?.some(isImageImportFile) ?? false);
    flushSync(() => {
      closeChrome();
    });

    if (!selectedWorkspaceId || !hasInitialWorkspaceDataLoaded) {
      setMessage("Clover is still loading your workspace. Please wait a moment, then upload again.");
      return;
    }

    if (!isLocalDevBrowser && planLimits?.accountLimit != null && accountLimitUsageCount >= planLimits.accountLimit) {
      showPlanLimitNudge({
        planTier,
        limitType: "account_limit",
        limitValue: planLimits.accountLimit,
      });
      setMessage("You’ve reached the current account limit for this plan.");
      return;
    }

    flushSync(() => {
      setPendingImportSummary(null);
      setAddOpen(false);
      setImportBackgroundOnly(shouldLaunchInBackground);
      setImportSessionId((current) => current + 1);
      setImportSeedFiles(files && files.length > 0 ? files : null);
      setImportOpen(true);
    });
  };

  const renderAccountCard = (row: Account | InvestmentInstitutionCard, key: string) => {
    if (isInvestmentInstitutionCard(row)) {
      const accountBrand = getAccountBrand({
        institution: row.institution,
        name: row.institution,
        type: "investment",
      });

      return (
        <FinancialAccountCard
          key={key}
          accountBrand={accountBrand}
          name={row.institution}
          accountNumber={getInvestmentInstitutionPreview(row.accounts)}
          amount={formatAccountAmount(Math.abs(parseAmount(row.balance)), row.currency)}
          onOpen={() => openInvestmentInstitution(row)}
          openLabel={`Open ${row.institution} investment institution`}
        />
      );
    }

    const isDeleting = deletingAccountIdsSet.has(row.id);
    const loadingContext = getUploadAccountLoadingContext(row);
    const latestCheckpoint = loadingContext.latestCheckpoint;
    const latestCheckpointMetadata = latestCheckpoint?.sourceMetadata as Record<string, unknown> | null | undefined;
    const fallbackAccountNumber =
      row.accountNumber ?? latestCheckpoint?.sourceMetadata?.accountNumber ?? null;
    const relatedTransactionInstitution = transactions.find((transaction) => {
      if (!transactionMatchesAccount(transaction, row)) {
        return false;
      }

      return typeof transaction.institution === "string" && transaction.institution.trim().length > 0;
    })?.institution?.trim() ?? null;
    const checkpointInstitution =
      typeof latestCheckpointMetadata?.institution === "string"
        ? latestCheckpointMetadata.institution
        : typeof latestCheckpointMetadata?.uploadBankHint === "string"
          ? latestCheckpointMetadata.uploadBankHint
        : null;
    // Checkpoints begin with provisional parser metadata. Once an account and
    // transactions are persisted, their identity is authoritative; otherwise
    // an old provisional label can rename a correct account card after refresh.
    const resolvedBankLabel = row.institution ?? relatedTransactionInstitution ?? checkpointInstitution ?? null;
    const checkpointAccountName =
      typeof latestCheckpointMetadata?.accountName === "string"
        ? latestCheckpointMetadata.accountName
        : null;
    const rawAccountCardName =
      resolvedBankLabel
        ? formatUploadAccountDisplayName(
            checkpointAccountName ?? row.name,
            resolvedBankLabel,
            fallbackAccountNumber,
            row.type
          )
        : row.source === "upload" && !fallbackAccountNumber
        ? formatUploadAccountDisplayName(row.name, row.institution, null, row.type)
        : getAccountCardName({
            name: row.name,
            institution: row.institution ?? resolvedBankLabel,
            accountNumber: fallbackAccountNumber,
            type: row.type,
            source: row.source,
          });
    const accountBrand = getAccountBrand({
      institution: row.institution ?? resolvedBankLabel,
      name: rawAccountCardName,
      type: getEffectiveAccountType(row),
    });
    const balanceValue = Math.abs(parseAmount(loadingContext.displayedBalance));
    const accountCardNumber = formatDisambiguatedCardAccountNumber(fallbackAccountNumber, {
      showDigitCount: collidingMaskedAccountNumberKeys.has(getMaskedAccountNumberCollisionKey(row) ?? ""),
    });
    const accountCardName = accountCardNumber
      ? removeDuplicateCardAccountSuffix(rawAccountCardName, fallbackAccountNumber)
      : rawAccountCardName;

    return (
      <FinancialAccountCard
        key={key}
        accountBrand={accountBrand}
        name={accountCardName}
        accountNumber={accountCardNumber}
        amount={
          loadingContext.isLoading
            ? "Loading..."
            : loadingContext.isTimedOut
              ? "Pending review"
              : formatAccountAmount(balanceValue, row.currency)
        }
        onOpen={() => openAccountDrawer(row)}
        openLabel={`Open ${accountCardName} account`}
        state={isDeleting ? "deleting" : loadingContext.isLoading ? "loading" : undefined}
      />
    );
  };

  const renderMobileListRow = (row: Account | InvestmentInstitutionCard, key: string) => {
    if (isInvestmentInstitutionCard(row)) {
      const accountBrand = getAccountBrand({
        institution: row.institution,
        name: row.institution,
        type: "investment",
      });

      return (
        <button
          key={key}
          type="button"
          className="accounts-mobile-list-row"
          onClick={() => openInvestmentInstitution(row)}
        >
          <span className="accounts-mobile-list-row__brand">
            <AccountBrandMark accountBrand={accountBrand} label={row.institution} />
            <span>
              <strong>{row.institution}</strong>
              <small>{getInvestmentInstitutionPreview(row.accounts)}</small>
            </span>
          </span>
          <span className="accounts-mobile-list-row__end">
            <strong>{formatAccountAmount(Math.abs(parseAmount(row.balance)), row.currency)}</strong>
            <span className="accounts-mobile-list-row__chevron" aria-hidden="true">
              ›
            </span>
          </span>
        </button>
      );
    }

    const accountBrand = getAccountBrand({
      institution: row.institution,
      name: row.name,
      type: getEffectiveAccountType(row),
    });
    const accountDisplayName = getAccountDisplayName(row);
    const loadingContext = getUploadAccountLoadingContext(row);

    return (
      <button
        key={key}
        type="button"
        className="accounts-mobile-list-row"
        onClick={() => openAccountDrawer(row)}
      >
        <span className="accounts-mobile-list-row__brand">
          <AccountBrandMark accountBrand={accountBrand} label={accountDisplayName} />
          <span>
            <strong>{accountDisplayName}</strong>
            <small>{getAccountCardEyebrow(row)}</small>
          </span>
        </span>
        <span className="accounts-mobile-list-row__end">
          <strong>
            {loadingContext.isLoading
              ? "Loading..."
              : loadingContext.isTimedOut
                ? "Pending review"
                : formatAccountAmount(Math.abs(parseAmount(loadingContext.displayedBalance ?? row.balance)), row.currency)}
          </strong>
          <span className="accounts-mobile-list-row__chevron" aria-hidden="true">
            ›
          </span>
        </span>
      </button>
    );
  };

  useEffect(() => {
    const active = addOpen;
    document.body.toggleAttribute("data-clover-page-modal", active);

    return () => {
      document.body.removeAttribute("data-clover-page-modal");
    };
  }, [addOpen]);

  const applyManualNameSuggestion = (suggestion: InstitutionSuggestion) => {
    if (suggestion.category === "investment_platform") {
      setManualType("investment");
      setManualInstitution(suggestion.label);
      return;
    }

    if (suggestion.category === "wallet") {
      setManualType("wallet");
      setManualInstitution("");
      return;
    }

    setManualType("bank");
    setManualInstitution("");
  };

  const openInvestmentInstitution = (institutionCard: InvestmentInstitutionCard) => {
    closeChrome();
    window.location.assign(
      getInvestmentInstitutionPath({
        institution: institutionCard.institution,
        currency: institutionCard.currency,
      })
    );
  };

  const resolveNavigableAccount = (account: Account) => {
    if (!account.id.startsWith("optimistic-")) {
      return account;
    }

    const accountKey = getImportedAccountKey(account.name, account.institution, account.accountNumber, account.type, account.currency);
    return (
      accounts.find(
        (entry) =>
          !entry.id.startsWith("optimistic-") &&
          getImportedAccountKey(entry.name, entry.institution, entry.accountNumber, entry.type, entry.currency) === accountKey
      ) ??
      accounts.find((entry) => !entry.id.startsWith("optimistic-") && matchesImportedAccountIdentity(entry, account)) ??
      null
    );
  };

  const openAccountDrawer = (account: Account) => {
    if (deletingAccountIdsSet.has(account.id) || isCashFallbackAccount(account)) {
      return;
    }
    const navigableAccount = resolveNavigableAccount(account);
    const targetAccount = navigableAccount ?? account;
    closeChrome();
    window.location.assign(getAccountPath(targetAccount));
  };

  const openFullAccountPage = () => {
    if (!selectedAccount) return;
    const navigableAccount = resolveNavigableAccount(selectedAccount);
    const targetAccount = navigableAccount ?? selectedAccount;
    closeChrome();
    window.location.assign(getAccountPath(targetAccount));
  };

  const openDrawerForWarning = (account: Account, warning: string) => {
    void warning;
    if (deletingAccountIdsSet.has(account.id)) {
      return;
    }
    closeChrome();
    const targetAccount = resolveNavigableAccount(account) ?? account;
    window.location.assign(getAccountPath(targetAccount));
  };

  const saveAccountChanges = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!selectedWorkspaceId || !selectedAccount) return;

    const name = accountEditName.trim();
    if (!name) {
      setMessage("Account name is required.");
      return;
    }

    setAccountEditBusy(true);
    try {
      const editIsInvestment = accountEditType === "investment";
      const editIsMarket = editIsInvestment && isMarketInvestmentSubtype(accountEditInvestmentSubtype);
      const editIsFixedIncome = editIsInvestment && isFixedIncomeInvestmentSubtype(accountEditInvestmentSubtype);
      const response = await fetch(`/api/accounts/${selectedAccount.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          name,
          institution: accountEditInstitution.trim() || null,
          investmentSubtype: editIsInvestment ? accountEditInvestmentSubtype : null,
          investmentSymbol:
            editIsInvestment && (editIsMarket || accountEditInvestmentSubtype === "other")
              ? accountEditInvestmentSymbol.trim() || null
              : null,
          investmentQuantity: editIsMarket ? parseNullableNumberInput(accountEditInvestmentQuantity) : null,
          investmentCostBasis:
            editIsInvestment && (editIsMarket || accountEditInvestmentSubtype === "other")
              ? parseNullableNumberInput(accountEditInvestmentCostBasis)
              : editIsFixedIncome
                ? null
                : null,
          investmentPrincipal: editIsFixedIncome ? parseNullableNumberInput(accountEditInvestmentPrincipal) : null,
          investmentStartDate: editIsFixedIncome ? parseNullableDateInput(accountEditInvestmentStartDate) : null,
          investmentMaturityDate: editIsFixedIncome ? parseNullableDateInput(accountEditInvestmentMaturityDate) : null,
          investmentInterestRate: editIsFixedIncome ? parseNullableNumberInput(accountEditInvestmentInterestRate) : null,
          investmentMaturityValue: editIsFixedIncome ? parseNullableNumberInput(accountEditInvestmentMaturityValue) : null,
          type: accountEditType,
          currency: accountEditCurrency || "PHP",
          source: accountEditSource || selectedAccount.source,
          balance: accountEditBalance.trim() ? Number(accountEditBalance) : null,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to update account.");
      }

      const payload = await response.json();
      if (payload.account) {
        setAccounts((current) => current.map((account) => (account.id === selectedAccount.id ? payload.account : account)));
        setMessage(`Account "${name}" updated.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update account.");
    } finally {
      setAccountEditBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (!selectedWorkspaceId || !selectedAccount) return;

    const accountToDelete = selectedAccount;
    setAccountDeleteBusy(true);
    try {
      clearDeletingWorkspaceAccount(selectedWorkspaceId, accountToDelete.id);
      deletingAccountIdsRef.current.delete(accountToDelete.id);
      setDeletingAccountIds(Array.from(deletingAccountIdsRef.current));
      markDeletedWorkspaceAccount(selectedWorkspaceId, accountToDelete.id);
      deletedAccountIdsRef.current.add(accountToDelete.id);
      applyOptimisticWorkspaceAccountDeletion(selectedWorkspaceId, accountToDelete.id);
      flushSync(() => {
        setAccounts((current) => current.filter((account) => account.id !== accountToDelete.id));
        setTransactions((current) => current.filter((transaction) => transaction.accountId !== accountToDelete.id));
        setAccountRules((current) => current.filter((rule) => rule.accountId !== accountToDelete.id));
        setDrawerAccountId(null);
        setAccountDeleteConfirmOpen(false);
        setMessage(`Account "${accountToDelete.name}" deleted.`);
      });

      const response = await fetch(`/api/accounts/${accountToDelete.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(`Unable to delete account "${accountToDelete.name}".`);
      }
    } catch (error) {
      clearDeletedWorkspaceAccount(selectedWorkspaceId, accountToDelete.id);
      deletedAccountIdsRef.current.delete(accountToDelete.id);
      clearDeletingWorkspaceAccount(selectedWorkspaceId, accountToDelete.id);
      deletingAccountIdsRef.current.delete(accountToDelete.id);
      setDeletingAccountIds(Array.from(deletingAccountIdsRef.current));
      await loadWorkspaceData(selectedWorkspaceId, { silent: true });
      setMessage(error instanceof Error ? error.message : `Unable to delete account "${accountToDelete.name}".`);
    } finally {
      setAccountDeleteBusy(false);
    }
  };

  const saveManualAccount = async ({ keepOpen }: { keepOpen: boolean }) => {
    setAddAccountError(null);
    if (!selectedWorkspaceId) {
      const nextError = "Select a workspace first.";
      setAddAccountError(nextError);
      setMessage(nextError);
      return;
    }

    const name = manualName.trim();
    if (!name) {
      const nextError = "Account name is required.";
      setAddAccountError(nextError);
      setMessage(nextError);
      return;
    }

    if (manualScheduleEnabled && manualScheduleConfig && !manualScheduleDueDate) {
      const nextError = `${manualScheduleConfig.dueDateLabel} is required when schedule tracking is turned on.`;
      setAddAccountError(nextError);
      setMessage(nextError);
      return;
    }

    setIsSaving(true);
    try {
      const manualIsInvestment = manualType === "investment";
      const manualIsMarket = manualIsInvestment && isMarketInvestmentSubtype(manualInvestmentSubtype);
      const manualIsFixedIncome = manualIsInvestment && isFixedIncomeInvestmentSubtype(manualInvestmentSubtype);
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          name,
          institution:
            manualType === "cash"
              ? "Cash"
              : manualType === "investment"
                ? manualInstitution.trim() || name
                : name,
          accountNumber: manualAccountNumber.trim() || null,
          investmentSubtype: manualIsInvestment ? manualInvestmentSubtype : null,
          investmentSymbol:
            manualIsInvestment && (manualIsMarket || manualInvestmentSubtype === "other")
              ? manualInvestmentSymbol.trim() || null
              : null,
          investmentQuantity: manualIsMarket ? parseNullableNumberInput(manualInvestmentQuantity) : null,
          investmentCostBasis:
            manualIsInvestment && (manualIsMarket || manualInvestmentSubtype === "other")
              ? parseNullableNumberInput(manualInvestmentCostBasis)
              : null,
          investmentPrincipal: manualIsFixedIncome ? parseNullableNumberInput(manualInvestmentPrincipal) : null,
          investmentStartDate: manualIsFixedIncome ? parseNullableDateInput(manualInvestmentStartDate) : null,
          investmentMaturityDate: manualIsFixedIncome ? parseNullableDateInput(manualInvestmentMaturityDate) : null,
          investmentInterestRate: manualIsFixedIncome ? parseNullableNumberInput(manualInvestmentInterestRate) : null,
          investmentMaturityValue: manualIsFixedIncome ? parseNullableNumberInput(manualInvestmentMaturityValue) : null,
          type: manualType,
          currency: manualCurrency.trim().toUpperCase() || "PHP",
          source: "manual",
          balance: manualBalance ? Number(manualBalance) : 0,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const limitPayload = parsePlanLimitPayload(payload);
        if (limitPayload) {
          showPlanLimitNudge(limitPayload);
        }
        throw new Error(payload?.error ?? "Unable to create account.");
      }

      const data = await response.json();
      if (!data.account) {
        throw new Error("The account was not returned after saving.");
      }

      let scheduleCreated = false;
      let scheduleError: string | null = null;
      if (manualScheduleEnabled && manualScheduleConfig) {
        const scheduleTitle = `${name} ${manualScheduleConfig.titleSuffix}`;
        const scheduleResponse = await fetch("/api/commitments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: selectedWorkspaceId,
            kind: manualScheduleConfig.kind,
            title: scheduleTitle,
            counterparty: manualScheduleCounterparty.trim() || null,
            amount: manualScheduleAmount.trim() || null,
            currency: manualCurrency.trim().toUpperCase() || "PHP",
            dueDate: manualScheduleDueDate,
            recurrence: manualScheduleRecurrence,
            nextDueDate: manualScheduleDueDate,
            notes: `${formatAccountTypeLabel(manualType)} linked from Add account`,
            accountId: data.account.id,
            status: "active",
          }),
        });

        if (!scheduleResponse.ok) {
          const payload = await scheduleResponse.json().catch(() => null);
          scheduleError = payload?.error ?? "The account was saved, but Clover could not add the linked schedule.";
        } else {
          scheduleCreated = true;
        }
      }

      setAccounts((current) => [data.account, ...current]);
      setManualName("");
      setManualInstitution("");
      setManualAccountNumber("");
      setManualInvestmentSubtype("stock");
      setManualInvestmentSymbol("");
      setManualInvestmentQuantity("");
      setManualInvestmentCostBasis("");
      setManualInvestmentPrincipal("");
      setManualInvestmentStartDate("");
      setManualInvestmentMaturityDate("");
      setManualInvestmentInterestRate("");
      setManualInvestmentMaturityValue("");
      setManualBalance("");
      setManualCurrency("PHP");
      setManualScheduleEnabled(false);
      setManualScheduleDueDate("");
      setManualScheduleRecurrence("monthly");
      setManualScheduleAmount("");
      setManualScheduleCounterparty("");
      setAddAccountError(null);
      if (!keepOpen) {
        setManualType("bank");
        setAddOpen(false);
      }
      setMessage(
        scheduleError
          ? `${scheduleError} The account "${name}" was still created.`
          : scheduleCreated
          ? `Account "${name}" created and its schedule is now being tracked.`
          : `Account "${name}" created.`
      );
    } catch (error) {
      const nextError = error instanceof Error ? error.message : "Unable to create account.";
      setAddAccountError(nextError);
      setMessage(nextError);
    } finally {
      setIsSaving(false);
    }
  };

  const createManualAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await saveManualAccount({ keepOpen: false });
  };

  const createAnotherManualAccount = async () => {
    await saveManualAccount({ keepOpen: true });
  };

  const exportCsv = () => {
    const rows = [
      ["Name", "Type", "Amount", "Currency", "Last updated", "Source"],
      ...visibleAccounts.map((account) => [
        account.name,
        getAccountDisplayType(account),
        formatAccountAmount(parseAmount(account.balance), account.currency),
        formatCurrencyCode(account.currency),
        formatDate(account.updatedAt),
        account.source,
      ]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedWorkspace?.name ?? "accounts"}-summary.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const report = window.open("", "_blank", "width=980,height=780");
    if (!report) return;
    report.document.write(`
      <html>
        <head>
          <title>${selectedWorkspace?.name ?? "Accounts"} summary</title>
          <style>
            body { font-family: Inter, Arial, sans-serif; padding: 32px; color: #111; }
            h1 { margin: 0 0 10px; }
            .muted { color: #66727b; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; }
            th, td { text-align: left; border-bottom: 1px solid #e2e8ec; padding: 10px 8px; }
          </style>
        </head>
        <body>
          <h1>${selectedWorkspace?.name ?? "Accounts"} summary</h1>
          <p class="muted">Net worth ${formatAggregateAmount(totals.netWorth, visibleAccounts)} · Assets ${formatAggregateAmount(totals.assets, visibleAccounts)} · Liabilities ${formatAggregateAmount(totals.liabilities, visibleAccounts)}</p>
          <table>
            <thead>
              <tr><th>Name</th><th>Type</th><th>Amount</th><th>Symbol</th><th>Last updated</th></tr>
            </thead>
            <tbody>
              ${visibleAccounts
                .map(
                  (account) => `
                    <tr>
                      <td>${account.name}</td>
                      <td>${getAccountDisplayType(account)}</td>
                      <td>${formatDisplayAccountAmount(parseAmount(account.balance), account.currency)}</td>
                      <td><span class="currency-symbol">${formatCurrencySymbol(account.currency)}</span></td>
                      <td>${formatDate(account.updatedAt)}</td>
                    </tr>`
                )
                .join("")}
            </tbody>
          </table>
          <script>window.print();</script>
        </body>
      </html>
    `);
    report.document.close();
  };

  const downloadSummary = (format: "csv" | "pdf") => {
    setDownloadMenuOpen(false);
    if (format === "csv") {
      exportCsv();
      return;
    }

    exportPdf();
  };

  const showColdLoadGuard =
    !hasCompletedInitialAccountPaint &&
    accounts.length === 0 &&
    isColdLoading &&
    pageLoadingPulse - pageLoadingSinceRef.current < PAGE_LOADING_TIMEOUT_MS;
  const hasWorkspaceDataEvidence =
    Boolean(selectedWorkspaceId) &&
    (
      accounts.length > 0 ||
      transactions.length > 0 ||
      statementCheckpoints.length > 0 ||
      hasCachedWorkspaceDataEvidence(selectedWorkspaceId) ||
      (importActivitySnapshot?.workspaceId === selectedWorkspaceId &&
        (importActivitySnapshot.status === "active" || importActivityHasCompletedRows(importActivitySnapshot)))
    );
  const shouldShowSyncingInsteadOfEmpty =
    accounts.length === 0 &&
    !accountsLoadFailed &&
    !accountsLoading &&
    (hasWorkspaceDataEvidence || accountsHydrationPending);

  useEffect(() => {
    if (!selectedWorkspaceId || !shouldShowSyncingInsteadOfEmpty) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void loadWorkspaceData(selectedWorkspaceId, { silent: true, awaitHydration: true });
    }, SYNCING_EMPTY_STATE_REFRESH_DELAY_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [loadWorkspaceData, selectedWorkspaceId, shouldShowSyncingInsteadOfEmpty]);

  const showAccountsSplash =
    !accountsLoadFailed &&
    accounts.length === 0 &&
    (
      showColdLoadGuard ||
      (!hasCompletedInitialAccountPaint &&
        (workspacesLoading ||
          accountsLoading ||
          !hasInitialWorkspaceDataLoaded ||
          accountsHydrationPending ||
          shouldShowSyncingInsteadOfEmpty))
    );

  if (showAccountsSplash) {
    return <CloverLoadingScreen label="accounts" />;
  }

  const accountsShellActions = (
    <>
      <CurrencySelector
        value={selectedCurrency}
        onChange={setSelectedCurrency}
        options={availableCurrencies}
        ariaLabel="Select account currency"
        className="accounts-currency-filter"
        buttonClassName="accounts-currency-filter__button"
        menuClassName="accounts-currency-filter__menu"
        optionClassName="accounts-currency-filter__option"
        menuAlignment="end"
        showChevron={false}
      />
      <button className="button button-secondary button-small accounts-toolbar-add" type="button" onClick={openAddAccount}>
        <ActionIcon name="plus" />
        <span>Add account</span>
      </button>
      <button className="button button-primary button-small accounts-toolbar-button accounts-toolbar-button--upload" type="button" onClick={() => openImportFiles()}>
        <ActionIcon name="upload" />
        <span>Upload files</span>
      </button>
    </>
  );

  return (
    <CloverShell
      active="accounts"
      title="Accounts"
      actions={accountsShellActions}
      >
      <div className="accounts-page">
        {visibleAccounts.length > 0 ? (
          <section className="accounts-overview-grid" aria-label="Account summary">
            <article className="accounts-overview-card glass">
              <button className="accounts-overview-card__info" type="button" aria-label="How Net Worth is calculated">
                i
                <span className="accounts-overview-card__info-tooltip" role="tooltip">
                  Assets minus liabilities across visible accounts. Positive balances add to net worth; credit cards, loans, and other debts subtract from it.
                </span>
              </button>
              <p className="eyebrow">Net Worth</p>
              <strong className={`accounts-overview-card__amount ${getNetWorthTone(totals.netWorth)}`}>
                {formatSignedAggregateAmount(totals.netWorth, visibleAccounts)}
              </strong>
            </article>
            <article className="accounts-overview-card glass">
              <button className="accounts-overview-card__info" type="button" aria-label="How Spendable is calculated">
                i
                <span className="accounts-overview-card__info-tooltip" role="tooltip">
                  Positive balances from spendable accounts, such as bank, wallet, and cash accounts. Debts and tracked assets are excluded.
                </span>
              </button>
              <p className="eyebrow">Spendable</p>
              <strong className="accounts-overview-card__amount is-good">
                {formatAggregateAmount(totals.spendable, visibleAccounts)}
              </strong>
            </article>
            <article className="accounts-overview-card glass">
              <button className="accounts-overview-card__info" type="button" aria-label="How Assets is calculated">
                i
                <span className="accounts-overview-card__info-tooltip" role="tooltip">
                  Sum of visible account balances that count as positive value after Clover applies each account type's balance rules.
                </span>
              </button>
              <p className="eyebrow">Assets</p>
              <strong className="accounts-overview-card__amount is-good">
                {formatAggregateAmount(totals.assets, visibleAccounts)}
              </strong>
            </article>
            <article className="accounts-overview-card glass">
              <button className="accounts-overview-card__info" type="button" aria-label="How Liabilities is calculated">
                i
                <span className="accounts-overview-card__info-tooltip" role="tooltip">
                  Sum of visible credit card, loan, and other debt balances. Clover shows this as a positive total so the amount is easy to scan.
                </span>
              </button>
              <p className="eyebrow">Liabilities</p>
              <strong className="accounts-overview-card__amount is-danger">
                {formatAggregateAmount(totals.liabilities, visibleAccounts)}
              </strong>
            </article>
          </section>
        ) : null}
        <section className="accounts-main-grid">
          <div className="accounts-list-column">
            <div className="accounts-sections">
              {featuredAccounts.length > 0 ? (
                <section className="accounts-mobile-featured" aria-label="Favorite accounts">
                  <div className="accounts-mobile-featured__rail" aria-label="Favorite accounts carousel">
                    {featuredAccounts.map((row) => renderAccountCard(row, `featured-${row.id}`))}
                  </div>
                </section>
              ) : null}
              {accountsLoadFailed ? (
                <div className="empty-state accounts-empty-state accounts-empty-state--error">
                  <strong>Couldn&apos;t load accounts.</strong>
                  <p>Your accounts may still be there, but Clover could not reach the latest workspace data. Try again before adding anything new.</p>
                  <div className="accounts-empty-state__actions">
                    <button className="button button-primary button-small" type="button" onClick={() => void loadWorkspaceData(selectedWorkspaceId)}>
                      Retry
                    </button>
                  </div>
                </div>
              ) : accountGroups.length > 0 ? (
                accountGroups.map((group) => (
                  <article key={group.title} className="accounts-group">
                    <div className="accounts-group__head">
                      <div className="accounts-group__title-row">
                        <h5>{group.title}</h5>
                        <strong>{formatAggregateAmount(group.total, group.rows)}</strong>
                      </div>
                    </div>

                    <div className="accounts-card-grid accounts-card-grid--desktop" aria-label={`${group.title} accounts`}>
                      {group.rows.map((row) => renderAccountCard(row, `${group.title}-${row.id}`))}
                    </div>
                    <div className="accounts-mobile-list accounts-mobile-list--mobile" aria-label={`${group.title} account list`}>
                      {group.rows.map((row) => renderMobileListRow(row, `${group.title}-mobile-${row.id}`))}
                    </div>
                    </article>
                ))
              ) : (
                accounts.length > 0 ? (
                  <EmptyDataCta
                    eyebrow={selectedCurrency}
                    title={`No ${formatCurrencySymbol(selectedCurrency)} accounts yet`}
                    copy={`This view is focused on ${formatCurrencySymbol(selectedCurrency)} accounts only. Add or import one to compare balances here, or switch currencies to see the rest of your workspace.`}
                    highlights={[
                      "Keep each currency separate when you want a cleaner balance view.",
                      "Import another statement to let Clover detect the matching account automatically.",
                    ]}
                    accountHref="/accounts"
                    transactionHref="/transactions?manual=1"
                    actions={
                      <>
                        <button className="button button-secondary button-small" type="button" onClick={openAddAccount}>
                          Add account
                        </button>
                        <button className="button button-primary button-small" type="button" onClick={() => openImportFiles()}>
                          Upload files
                        </button>
                      </>
                    }
                  />
                ) : (
                  <EmptyDataCta
                    className="empty-state--illustrated"
                    eyebrow="Accounts"
                    title="Build your financial picture here"
                    copy="This page becomes your account map. Add accounts, upload statements, and Clover organizes each balance into cards you can scan at a glance."
                    highlights={[
                      "Create manual accounts for cash, wallets, and balances you want to track today.",
                      "Upload statements when you want Clover to populate cards for you.",
                      "Open each card later to review account-specific transactions and details.",
                    ]}
                    illustration="/illustrations/clover-empty-dashboard-3d.png"
                    illustrationAlt="A 3D Clover dashboard illustration"
                    importHref="/accounts?import=1"
                    accountHref="/accounts"
                    transactionHref="/transactions?manual=1"
                    actions={
                      <>
                        <button className="button button-secondary button-small" type="button" onClick={openAddAccount}>
                          Add account
                        </button>
                        <button className="button button-primary button-small" type="button" onClick={() => openImportFiles()}>
                          Upload files
                        </button>
                      </>
                    }
                  />
                )
              )}
            </div>
          </div>

        </section>
      </div>

      {selectedAccount ? (
        <div className="accounts-drawer-backdrop" role="presentation" onClick={() => setDrawerAccountId(null)}>
          <aside className="accounts-drawer glass" role="dialog" aria-modal="true" aria-labelledby="account-drawer-title" onClick={(event) => event.stopPropagation()}>
            <div className="accounts-drawer__head">
              <div>
                <p className="eyebrow">Account drawer</p>
                <h4 id="account-drawer-title">{accountEditName || selectedAccount.name}</h4>
                <p>{getAccountDisplayType(selectedAccount)} · {selectedAccount.source === "manual" ? "Manual" : "Imported"}</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setDrawerAccountId(null)} aria-label="Close account drawer">
                ×
              </button>
            </div>

            <div className="accounts-drawer__overview">
              <div>
                <span>Current balance</span>
                <strong>
                  {selectedAccountLoadingContext?.isLoading
                    ? "Loading..."
                    : selectedAccountLoadingContext?.isTimedOut
                      ? "Pending review"
                      : formatAccountAmount(parseAmount(selectedAccount.balance), selectedAccount.currency)}
                </strong>
              </div>
              <div>
                <span>Last updated</span>
                <strong>{formatDate(selectedAccount.updatedAt)}</strong>
              </div>
              {getEffectiveAccountType(selectedAccount) !== "cash" ? (
                <div>
                  <span>Institution</span>
                  <strong>{selectedAccount.institution ?? "No institution"}</strong>
                </div>
              ) : null}
                <div>
                  <span>Status</span>
                  <strong>
                    {deletingAccountIdsSet.has(selectedAccount.id)
                      ? "Deleting"
                      : (latestCheckpoint?.status === "pending" ? "Loading" : null) ??
                        getAccountWarning(
                          selectedAccount,
                          duplicateCounts.get(`${selectedAccount.name.trim().toLowerCase()}::${(selectedAccount.institution ?? "").trim().toLowerCase()}`) ?? 0
                        ) ??
                        "Ready"}
                  </strong>
                </div>
              </div>

            <div className="accounts-drawer__guide">
              <strong>Balance guide</strong>
              <p>
                Current balance is the number on this account now.
              </p>
            </div>

            {drawerNotice ? (
              <div className="accounts-drawer__notice">
                <strong>Needs review</strong>
                <p>{drawerNotice}</p>
              </div>
            ) : null}

            <section className="accounts-drawer__section">
              <div className="accounts-drawer__section-head">
                <h5>Edit account</h5>
                <ActionIcon name="edit" />
              </div>
              <form className="accounts-drawer__form" onSubmit={saveAccountChanges}>
                <label>
                  Name
                  <input value={accountEditName} onChange={(event) => setAccountEditName(event.target.value)} />
                </label>
                <label>
                  Institution
                  <input
                    value={accountEditInstitution}
                    onChange={(event) => setAccountEditInstitution(event.target.value)}
                    placeholder={accountEditType === "investment" ? "Broker or platform" : "Bank or wallet name"}
                  />
                </label>
                <label>
                  Type
                  <select value={accountEditType} onChange={(event) => setAccountEditType(event.target.value as Account["type"])}>
                    {ACCOUNT_TYPE_SECTIONS.map((section) => (
                      <optgroup key={section.label} label={section.label}>
                        {section.options.map((option) => (
                          <option key={option} value={option}>
                            {formatAccountTypeLabel(option)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                {accountEditType === "investment" ? (
                  <>
                    <label>
                      Investment subtype
                      <select
                        value={accountEditInvestmentSubtype}
                        onChange={(event) => setAccountEditInvestmentSubtype(event.target.value as InvestmentSubtype)}
                      >
                        {INVESTMENT_SUBTYPES.map((subtype) => (
                          <option key={subtype} value={subtype}>
                            {getInvestmentSubtypeLabel(subtype)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="accounts-investment-fields">
                      {accountEditInvestmentFieldConfigs.map((field) => {
                        const value =
                          field.key === "investmentSymbol"
                            ? accountEditInvestmentSymbol
                            : field.key === "investmentQuantity"
                              ? accountEditInvestmentQuantity
                              : field.key === "investmentCostBasis"
                                ? accountEditInvestmentCostBasis
                                : field.key === "investmentPrincipal"
                                  ? accountEditInvestmentPrincipal
                                  : field.key === "investmentStartDate"
                                    ? accountEditInvestmentStartDate
                                    : field.key === "investmentMaturityDate"
                                      ? accountEditInvestmentMaturityDate
                                      : field.key === "investmentInterestRate"
                                        ? accountEditInvestmentInterestRate
                                        : field.key === "investmentMaturityValue"
                                          ? accountEditInvestmentMaturityValue
                                          : "";

                        const onChange =
                          field.key === "investmentSymbol"
                            ? setAccountEditInvestmentSymbol
                            : field.key === "investmentQuantity"
                              ? setAccountEditInvestmentQuantity
                              : field.key === "investmentCostBasis"
                                ? setAccountEditInvestmentCostBasis
                                : field.key === "investmentPrincipal"
                                  ? setAccountEditInvestmentPrincipal
                                  : field.key === "investmentStartDate"
                                    ? setAccountEditInvestmentStartDate
                                    : field.key === "investmentMaturityDate"
                                      ? setAccountEditInvestmentMaturityDate
                                      : field.key === "investmentInterestRate"
                                        ? setAccountEditInvestmentInterestRate
                                        : field.key === "investmentMaturityValue"
                                          ? setAccountEditInvestmentMaturityValue
                                          : setAccountEditInvestmentSymbol;

                        return (
                          <label key={field.key}>
                            {field.label}
                            <input
                              value={value}
                              onChange={(event) => onChange(event.target.value)}
                              placeholder={field.placeholder}
                              inputMode={field.inputMode}
                              type={field.type}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </>
                ) : null}
                <label>
                  Balance
                  <input value={accountEditBalance} onChange={(event) => setAccountEditBalance(event.target.value)} inputMode="decimal" placeholder="0.00" />
                </label>
                <div className="accounts-form-currency-field">
                  <span className="sr-only">Currency</span>
                          <CurrencySelector
                            value={accountEditCurrency}
                            onChange={setAccountEditCurrency}
                            options={currencyCatalogCodes}
                            ariaLabel="Select account currency"
                            className="accounts-form-currency-field__selector"
                            buttonClassName="accounts-form-currency-field__button"
                            menuClassName="accounts-form-currency-field__menu"
                            optionClassName="accounts-form-currency-field__option"
                            menuAlignment="end"
                          />
                </div>
                <button className="button button-primary" type="submit" disabled={accountEditBusy}>
                  {accountEditBusy ? "Saving..." : "Save changes"}
                </button>
              </form>
            </section>

            <section className="accounts-drawer__section">
              <div className="accounts-drawer__section-head">
                <h5>Add balance</h5>
                <ActionIcon name="plus" />
              </div>
              <div className="accounts-drawer__mini-form">
                <label>
                  Balance
                  <input
                    ref={balanceInputRef}
                    value={balanceDraft}
                    onChange={(event) => setBalanceDraft(event.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                </label>
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={() => {
                    setAccountEditBalance(balanceDraft);
                    void saveAccountChanges();
                  }}
                >
                  Update balance
                </button>
              </div>
            </section>

            {openingBalanceEntry ? (
              <section className="accounts-drawer__section">
                <div className="accounts-drawer__section-head">
                  <h5>Opening balance</h5>
                  <ActionIcon name="history" />
                </div>
                <div className="accounts-drawer__note">
                  <strong>{formatDate(openingBalanceEntry.date)}</strong>
                  <span>{formatAccountAmount(parseAmount(openingBalanceEntry.amount), selectedAccount?.currency)}</span>
                </div>
              </section>
            ) : null}

            {latestCheckpoint ? (
              <section className="accounts-drawer__section">
                <div className="accounts-drawer__section-head">
                  <h5>{getCheckpointDocumentFamily(latestCheckpoint).label}</h5>
                  <ActionIcon name="calendar" />
                </div>
                <div className="accounts-drawer__checkpoint">
                  <div className={`accounts-drawer__checkpoint-hero is-${getCheckpointSummary(latestCheckpoint).tone}`}>
                    <div className="accounts-drawer__checkpoint-hero-head">
                      <div className={`accounts-checkpoint-badge is-${getCheckpointSummary(latestCheckpoint).tone}`}>
                        <span className="accounts-checkpoint-badge__icon">
                          <ActionIcon name={getCheckpointSummary(latestCheckpoint).icon} />
                        </span>
                        <div>
                          <strong>{getCheckpointSummary(latestCheckpoint).label}</strong>
                          <span>{getCheckpointSummary(latestCheckpoint).detail}</span>
                        </div>
                      </div>
                      <span className={`accounts-summary-chip is-${getCheckpointTone(latestCheckpoint.status)}`}>
                        {latestCheckpoint.rowCount} rows
                      </span>
                    </div>
                    <div className="accounts-drawer__checkpoint-grid">
                      <div>
                        <span>{getCheckpointDocumentFamily(latestCheckpoint).dateLabel}</span>
                        <strong>{formatDate(latestCheckpoint.statementEndDate ?? latestCheckpoint.createdAt)}</strong>
                      </div>
                      <div>
                        <span>{getCheckpointDocumentFamily(latestCheckpoint).balanceLabel}</span>
                        <strong>{formatAccountAmount(parseAmount(latestCheckpoint.endingBalance), selectedAccount?.currency)}</strong>
                      </div>
                      <div>
                        <span>Difference</span>
                        <strong>
                          {latestCheckpoint.status === "mismatch"
                            ? latestCheckpoint.mismatchReason ?? "Mismatch detected"
                            : latestCheckpoint.status === "reconciled"
                              ? "Matches ledger"
                              : "Pending review"}
                        </strong>
                      </div>
                    </div>
                  </div>
                  <div className="accounts-drawer__actions">
                    <button className="button button-secondary button-small" type="button" onClick={openFullAccountPage}>
                      {latestCheckpoint.status === "mismatch" ? "Review mismatch" : "View checkpoint"}
                    </button>
                    <button className="button button-secondary button-small" type="button" onClick={() => openImportFiles()}>
                      Upload files
                    </button>
                    <button
                      className="button button-secondary button-small"
                      type="button"
                      onClick={() => balanceInputRef.current?.focus()}
                    >
                      Add balance
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="accounts-drawer__section">
              <div className="accounts-drawer__section-head">
                <h5>Recent imports</h5>
                <ActionIcon name="upload" />
              </div>
              {selectedAccountImportSummaries.length > 0 ? (
                <div className="accounts-drawer__imports">
                  {selectedAccountImportSummaries.slice(0, 3).map((summary) => (
                    <div key={summary.key} className="accounts-drawer__import">
                      <div>
                        <strong>{summary.label}</strong>
                        <span>{summary.count} rows · {formatDate(summary.latestDate)}</span>
                      </div>
                      <strong>{formatAccountAmount(summary.total, selectedAccount?.currency)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="accounts-drawer__note">No uploaded import batches are linked to this account yet.</p>
              )}
              <div className="accounts-drawer__actions">
                <button className="button button-secondary button-small" type="button" onClick={() => openImportFiles()}>
                  Upload files
                </button>
                <button className="button button-secondary button-small" type="button" onClick={openFullAccountPage} disabled={!selectedAccount}>
                  Open account page
                </button>
              </div>
            </section>

            <section className="accounts-drawer__section">
              <div className="accounts-drawer__section-head">
                <h5>Delete account</h5>
                <ActionIcon name="warning" />
              </div>
              <p className="accounts-drawer__note">This removes the account and its linked transactions from the workspace.</p>
              {accountDeleteConfirmOpen ? (
                <div className="detail-warning-box accounts-drawer__delete-confirm">
                  <div className="detail-warning-box__header">
                    <span className="detail-warning-box__icon" aria-hidden="true">
                      <ActionIcon name="warning" />
                    </span>
                    <strong>Delete this account?</strong>
                  </div>
                  <p>
                    This will remove <strong>{selectedAccount?.name ?? "this account"}</strong> from the workspace and also delete its linked transactions.
                  </p>
                  <p>If you change your mind later, you can always add it again or re-import the original file.</p>
                  <div className="detail-warning-actions">
                    <button
                      className="button button-secondary button-small"
                      type="button"
                      onClick={() => setAccountDeleteConfirmOpen(false)}
                      disabled={accountDeleteBusy}
                    >
                      Cancel
                    </button>
                    <button className="button button-danger button-small" type="button" onClick={() => void deleteAccount()} disabled={accountDeleteBusy}>
                      {accountDeleteBusy ? "Deleting..." : "Yes, delete account"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="button button-secondary button-small accounts-drawer__delete"
                  type="button"
                  onClick={() => setAccountDeleteConfirmOpen(true)}
                  disabled={accountDeleteBusy}
                >
                  Delete account
                </button>
              )}
            </section>

            <section className="accounts-drawer__section">
              <div className="accounts-drawer__section-head">
                <h5>Recent transactions</h5>
                <ActionIcon name="history" />
              </div>
              <div className="accounts-drawer__transactions">
                {selectedAccountTransactions.length > 0 ? (
                  selectedAccountTransactions.slice(0, 5).map((transaction) => (
                    <div key={transaction.id} className="accounts-drawer__transaction">
                      <div>
                        <strong>
                          {getEffectiveTransactionMerchantName({
                            merchantClean: transaction.merchantClean,
                            merchantRaw: transaction.merchantRaw,
                            rawPayload: transaction.rawPayload as never,
                          }) ?? transaction.merchantRaw}
                        </strong>
                        <span>
                          {formatDate(transaction.date)} · {transaction.type}
                          {transaction.merchantClean && transaction.merchantClean !== transaction.merchantRaw
                            ? ` · ${transaction.merchantRaw}`
                            : ""}
                        </span>
                      </div>
                      <strong>{formatAccountAmount(parseAmount(transaction.amount), selectedAccountCurrency)}</strong>
                    </div>
                  ))
                ) : (
                  <p className="accounts-drawer__note">No recent transactions are linked to this account yet.</p>
                )}
              </div>
            </section>
          </aside>
        </div>
      ) : null}

      {addOpen ? (
        <div className="modal-backdrop modal-backdrop--centered-mobile" role="presentation" onClick={() => setAddOpen(false)}>
          <section
            className="modal-card modal-card--wide accounts-add-modal glass"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-account-title"
            ref={addRef}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Accounts</p>
                <h4 id="add-account-title">Add an account</h4>
              </div>
              <button className="icon-button" type="button" onClick={() => setAddOpen(false)} aria-label="Close add account">
                ×
              </button>
            </div>

            <div className="accounts-add-grid">
              <form className="accounts-manual-form" onSubmit={createManualAccount}>
                <div
                  className="accounts-add-layout"
                  style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12, width: "100%" }}
                >
                  <div className="accounts-add-fields" style={{ width: "100%", minWidth: 0 }}>
                    <div className="accounts-add-fields__name-row" style={{ display: "flex", alignItems: "flex-end", gap: 12, width: "100%", minWidth: 0 }}>
                      <span className="accounts-add-brand-inline" aria-label="Account logo preview">
                        <AccountBrandMark accountBrand={manualAccountBrand} label={manualName || manualInstitution || "Account"} />
                      </span>
                      <div className="accounts-add-fields__name-grow" style={{ flex: "1 1 auto", minWidth: 0, width: "100%" }}>
                        <InstitutionAutocomplete
                          label="Name"
                          value={manualName}
                          onChange={setManualName}
                          onSelectSuggestion={applyManualNameSuggestion}
                          placeholder={manualType === "investment" ? "Example: FMETF" : "Example: BDO"}
                          variant="account"
                        />
                      </div>
                    </div>
                    <div className="accounts-add-fields__row accounts-add-fields__row--amount" style={{ display: "flex", alignItems: "flex-end", gap: 12, width: "100%", minWidth: 0 }}>
                      <label className="accounts-add-fields__currency">
                        <span className="sr-only">Currency</span>
                        <div className="accounts-form-currency-field accounts-form-currency-field--inline">
                          <CurrencySelector
                            value={manualCurrency}
                            onChange={setManualCurrency}
                            options={currencyCatalogCodes}
                            ariaLabel="Select account currency"
                            className="accounts-form-currency-field__selector"
                            buttonClassName="accounts-form-currency-field__button"
                            menuClassName="accounts-form-currency-field__menu"
                            optionClassName="accounts-form-currency-field__option"
                            compact
                            showGroupedSections
                            portalMenu
                          />
                        </div>
                      </label>
                      <div className="accounts-add-fields__amount-grow" style={{ flex: "1 1 auto", minWidth: 0, width: "100%" }}>
                        <label className="accounts-add-fields__balance">
                          Amount
                          <input
                            value={manualBalance}
                            onChange={(event) => setManualBalance(event.target.value)}
                            inputMode="decimal"
                            placeholder="0.00"
                          />
                        </label>
                      </div>
                    </div>
                    <div className="accounts-add-advanced" style={{ width: "100%", minWidth: 0 }}>
                        <div
                          className="accounts-add-fields__row accounts-add-fields__row--meta"
                          style={{ display: "flex", alignItems: "flex-end", gap: 12, width: "100%", minWidth: 0 }}
                        >
                          <label className="accounts-add-fields__type-field" style={{ flex: "0 0 180px", minWidth: 0 }}>
                            Type
                            <select
                              value={manualType}
                              onChange={(event) => setManualType(event.target.value as Account["type"])}
                            >
                              {ACCOUNT_TYPE_SECTIONS.map((section) => (
                                <optgroup key={section.label} label={section.label}>
                                  {section.options.map((option) => (
                                    <option key={option} value={option}>
                                      {formatAccountTypeLabel(option)}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          </label>
                          <label className="accounts-add-fields__account-number" style={{ flex: "1 1 auto", minWidth: 0, width: "100%" }}>
                            <span className="field-label-inline">
                              {manualAccountReference.label} <span className="field-optional">(optional)</span>
                            </span>
                            <input
                              value={manualAccountNumber}
                              onChange={(event) => setManualAccountNumber(event.target.value)}
                              inputMode="numeric"
                              placeholder={manualAccountReference.placeholder}
                            />
                            {manualAccountReference.helper ? <span className="field-help">{manualAccountReference.helper}</span> : null}
                          </label>
                        </div>
                        {manualTypeGuidance ? <p className="modal-copy">{manualTypeGuidance}</p> : null}
                        {manualScheduleConfig ? (
                          <div className="accounts-add-schedule">
                            <label className="accounts-add-schedule__toggle">
                              <input
                                type="checkbox"
                                checked={manualScheduleEnabled}
                                onChange={(event) => setManualScheduleEnabled(event.target.checked)}
                              />
                              <span>{manualScheduleConfig.toggleLabel}</span>
                            </label>
                            <p className="field-help">{manualScheduleConfig.helper}</p>
                            {manualScheduleEnabled ? (
                              <div className="accounts-add-schedule__fields">
                                <div className="accounts-add-fields__row">
                                  <label>
                                    {manualScheduleConfig.dueDateLabel}
                                    <input
                                      type="date"
                                      value={manualScheduleDueDate}
                                      onChange={(event) => setManualScheduleDueDate(event.target.value)}
                                    />
                                  </label>
                                  <label>
                                    Repeats
                                    <select
                                      value={manualScheduleRecurrence}
                                      onChange={(event) =>
                                        setManualScheduleRecurrence(
                                          event.target.value as (typeof ACCOUNT_SCHEDULE_RECURRENCE_OPTIONS)[number]["value"]
                                        )
                                      }
                                    >
                                      {ACCOUNT_SCHEDULE_RECURRENCE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>
                                <div className="accounts-add-fields__row">
                                  <label>
                                    {manualScheduleConfig.amountLabel} <span className="field-optional">(optional)</span>
                                    <input
                                      value={manualScheduleAmount}
                                      onChange={(event) => setManualScheduleAmount(event.target.value)}
                                      inputMode="decimal"
                                      placeholder={manualScheduleConfig.amountPlaceholder}
                                    />
                                  </label>
                                  <label>
                                    {manualScheduleConfig.counterpartyLabel}
                                    <input
                                      value={manualScheduleCounterparty}
                                      onChange={(event) => setManualScheduleCounterparty(event.target.value)}
                                      placeholder={manualScheduleConfig.counterpartyPlaceholder}
                                    />
                                  </label>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                    </div>
                  </div>
                </div>
                {manualType === "investment" ? (
                  <InstitutionAutocomplete
                    label="Institution"
                    value={manualInstitution}
                    onChange={setManualInstitution}
                    placeholder="Example: COL Financial"
                    variant="investment"
                    helperText="Use the platform or provider name when it differs from the investment name."
                  />
                ) : null}
                {manualType === "investment" ? (
                  <>
                    <label>
                      Investment subtype
                      <select
                        value={manualInvestmentSubtype}
                        onChange={(event) => setManualInvestmentSubtype(event.target.value as InvestmentSubtype)}
                      >
                        {INVESTMENT_SUBTYPES.map((subtype) => (
                          <option key={subtype} value={subtype}>
                            {getInvestmentSubtypeLabel(subtype)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="accounts-investment-fields">
                      {manualInvestmentFieldConfigs.map((field) => {
                        const value =
                          field.key === "investmentSymbol"
                            ? manualInvestmentSymbol
                            : field.key === "investmentQuantity"
                              ? manualInvestmentQuantity
                              : field.key === "investmentCostBasis"
                                ? manualInvestmentCostBasis
                                : field.key === "investmentPrincipal"
                                  ? manualInvestmentPrincipal
                                  : field.key === "investmentStartDate"
                                    ? manualInvestmentStartDate
                                    : field.key === "investmentMaturityDate"
                                      ? manualInvestmentMaturityDate
                                      : field.key === "investmentInterestRate"
                                        ? manualInvestmentInterestRate
                                        : field.key === "investmentMaturityValue"
                                          ? manualInvestmentMaturityValue
                                          : "";

                        const onChange =
                          field.key === "investmentSymbol"
                            ? setManualInvestmentSymbol
                            : field.key === "investmentQuantity"
                              ? setManualInvestmentQuantity
                              : field.key === "investmentCostBasis"
                                ? setManualInvestmentCostBasis
                                : field.key === "investmentPrincipal"
                                  ? setManualInvestmentPrincipal
                                  : field.key === "investmentStartDate"
                                    ? setManualInvestmentStartDate
                                    : field.key === "investmentMaturityDate"
                                      ? setManualInvestmentMaturityDate
                                      : field.key === "investmentInterestRate"
                                        ? setManualInvestmentInterestRate
                                        : field.key === "investmentMaturityValue"
                                          ? setManualInvestmentMaturityValue
                                          : setManualInvestmentSymbol;

                        return (
                          <label key={field.key}>
                            {field.label}
                            <input
                              value={value}
                              onChange={(event) => onChange(event.target.value)}
                              placeholder={field.placeholder}
                              inputMode={field.inputMode}
                              type={field.type}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </>
                ) : null}
                <div className="accounts-add-actions">
                  <div className="accounts-add-actions__buttons">
                    <button className="button button-secondary" type="button" onClick={() => void createAnotherManualAccount()} disabled={isSaving}>
                      {isSaving ? "Saving..." : "Add another"}
                    </button>
                    <button className="button button-primary" type="submit" disabled={isSaving}>
                      {isSaving ? "Saving..." : "Create account"}
                    </button>
                  </div>
                </div>
                {addAccountError ? (
                  <div className="accounts-drawer__notice" role="alert">
                    <strong>Unable to save account</strong>
                    <p>{addAccountError}</p>
                  </div>
                ) : null}
              </form>
            </div>
          </section>
        </div>
      ) : null}

      <PageFileDropZone
        enabled={true}
        title="Drop statement files anywhere"
        onFilesDropped={(files) => openImportFiles(files, true)}
      />

      <PlanLimitNudge payload={planLimitNudge} onDismiss={() => setPlanLimitNudge(null)} />

      <ImportFilesModal
        key={importSessionId}
        open={importOpen}
        workspaceId={selectedWorkspaceId}
        accounts={accounts}
        accountRules={accountRules}
        defaultAccountId={null}
        initialFiles={importSeedFiles}
        onInitialFilesConsumed={() => setImportSeedFiles(null)}
        backgroundOnly={importBackgroundOnly}
        onClose={() => {
          setImportOpen(false);
          setImportSeedFiles(null);
          setImportBackgroundOnly(false);
        }}
      onImported={async (summary) => {
          const optimisticAccount = buildOptimisticImportedAccount(summary);
          const previewTransactions = summary.previewTransactions ?? [];
          const importedAccountKey = getImportedAccountKey(
            summary.accountName,
            summary.institution,
            summary.accountNumber ?? null,
            summary.accountType ?? null,
            previewTransactions[0]?.currency ?? null
          );
          const importedAccountId = summary.accountId ?? summary.optimisticAccountId ?? null;
          let nextAccountsSnapshot: Account[] | null = null;
          let nextTransactionsSnapshot: Transaction[] | null = null;

          flushSync(() => {
            setAccountsLoading(false);
            if (optimisticAccount) {
              setAccounts((current) =>
                (nextAccountsSnapshot = current.filter((account) => {
                  if (summary.optimisticAccountId && account.id === summary.optimisticAccountId) {
                    return false;
                  }

                  if (account.source === "upload") {
                    return (
                      getImportedAccountKey(account.name, account.institution, account.accountNumber, account.type, account.currency) !==
                        importedAccountKey
                    );
                  }

                  return true;
                }))
              );
            }

            if (importedAccountId) {
              setTransactions((current) => {
                if (previewTransactions.length === 0) {
                  nextTransactionsSnapshot = current;
                  return current;
                }
                const next = mergeImportedPreviewTransactions(current, previewTransactions);
                nextTransactionsSnapshot = next;
                return next;
              });
            } else if (previewTransactions.length > 0) {
              setTransactions((current) => {
                const next = mergeImportedPreviewTransactions(current, previewTransactions);
                nextTransactionsSnapshot = next;
                return next;
              });
            } else {
              setTransactions((current) => {
                nextTransactionsSnapshot = current;
                return current;
              });
            }

            if (optimisticAccount) {
              setAccounts((current) => {
                const next = mergeOptimisticImportedAccount(current, optimisticAccount);
                nextAccountsSnapshot = next;
                return next;
              });
            } else {
              setAccounts((current) => {
                nextAccountsSnapshot = current;
                return current;
              });
            }

            if (
              drawerAccountId &&
              previewTransactions.length > 0 &&
              (drawerAccountId === importedAccountId || drawerAccountId === summary.optimisticAccountId)
            ) {
              setDrawerTransactions((current) => mergeImportedPreviewTransactions(current, previewTransactions));
            }
          });

          const settledAccountId =
            (nextAccountsSnapshot ? resolvePersistedImportedAccountId(summary, nextAccountsSnapshot) : null) ??
            (summary.accountId && !summary.accountId.startsWith("optimistic-") ? summary.accountId : null);
          const settledSummary =
            settledAccountId && settledAccountId !== summary.accountId
              ? {
                  ...summary,
                  accountId: settledAccountId,
                  optimistic: false,
                  optimisticAccountId: null,
                }
              : summary;
          setPendingImportSummary(settledSummary);

          if (selectedWorkspaceId && nextAccountsSnapshot && nextTransactionsSnapshot) {
            const cachedTransactionsWorkspace = getCachedTransactionsWorkspace(selectedWorkspaceId);
            persistTransactionsWorkspaceCache(selectedWorkspaceId, {
              accounts: nextAccountsSnapshot,
              categories: cachedTransactionsWorkspace?.categories ?? [],
              transactions: nextTransactionsSnapshot,
              imports: cachedTransactionsWorkspace?.imports ?? [],
            });
          }

          setImportRefreshInFlight(true);
          const requiresSnapshotVisibilityRefresh =
            previewTransactions.length === 0 &&
            (summary.accountType === "investment" || summary.accountType === "bank" || summary.accountType === "wallet");
          // Keep the import handoff non-blocking: a multi-account snapshot
          // emits one settled summary per detected account. The local cache is
          // already updated above, while this authoritative refresh converges
          // in the background instead of serially delaying later accounts.
          const refreshImportWorkspace = async () => {
            await refreshAll();
            if (Number(settledSummary.rowsImported ?? 0) > 0 && previewTransactions.length === 0) {
              await new Promise((resolve) => window.setTimeout(resolve, 900));
              await refreshAll();
            }
          };
          if (requiresSnapshotVisibilityRefresh) {
            // A snapshot has no transaction row to prove visibility. Do not
            // let its modal report 100% until Accounts has adopted the card.
            try {
              await refreshImportWorkspace();
            } finally {
              setImportRefreshInFlight(false);
            }
          } else {
            void refreshImportWorkspace().finally(() => {
              setImportRefreshInFlight(false);
            });
          }
          setMessage("Import complete. Accounts and Transactions are updated.");
        }}
      />
    </CloverShell>
  );
}
