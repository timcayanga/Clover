"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useLayoutEffect,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal, flushSync } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CloverShell, useCloverChrome } from "@/components/clover-shell";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { CategoryBrandMark } from "@/components/category-brand-mark";
import { CurrencySelector } from "@/components/currency-selector";
import { EmptyDataCta } from "@/components/empty-data-cta";
import { PlanLimitNudge } from "@/components/plan-limit-nudge";
import { PageFileDropZone } from "@/components/page-file-drop-zone";
import { SplitBillTransactionLinkFields } from "@/components/split-bill-transaction-link-fields";
import { getCategoryIconTone } from "@/lib/category-icons";
import {
  analyticsOnceKey,
  capturePostHogClientEvent,
  capturePostHogClientEventOnce,
} from "@/components/posthog-analytics";
import type { UploadInsightsSummary } from "@/components/upload-insights-toast";
import type { AccountType } from "@/lib/domain-types";
import { getAccountDisplayName, formatUploadAccountDisplayName } from "@/lib/account-display";
import { getAccountBrand } from "@/lib/account-brand";
import { guessCategoryName, inferAccountTypeFromStatement } from "@/lib/import-parser";
import { summarizeMerchantText } from "@/lib/merchant-labels";
import { buildTransactionQuerySearchParams } from "@/lib/transaction-query";
import { getEffectiveTransactionCategoryName } from "@/lib/transaction-display";
import { coerceTransactionTypeFromCategoryName } from "@/lib/transaction-directions";
import { readSelectedWorkspaceId } from "@/lib/workspace-selection";
import { chooseWorkspaceId, persistSelectedWorkspaceId, selectedWorkspaceKey } from "@/lib/workspace-selection";
import { clearImportActivity, readImportActivity } from "@/lib/import-activity";
import {
  buildFinalizingNoticeDismissalKey,
  dismissFinalizingNotice,
  isFinalizingNoticeDismissed,
} from "@/lib/finalizing-notice-dismissal";
import { createSplitBillFromTransaction, type SplitBillTransactionLinkDraft } from "@/lib/split-bill-transaction-link";
import {
  applyOptimisticWorkspaceTransactionDeletion,
  deriveCachedCategoriesFromTransactions,
  findBestImportedAccountMatch as findBestImportedAccountIdentityMatch,
  mergeImportedWorkspaceTransactions,
  getDeletedWorkspaceAccountIds,
  getDeletingWorkspaceAccountIds,
  normalizeImportedAccountKey,
  matchesImportedAccountIdentity as isImportedAccountIdentityMatch,
} from "@/lib/workspace-cache";
import { fetchJsonOnce } from "@/lib/request-dedupe";
import { formatCurrencyAmount, formatCurrencyCode } from "@/lib/currency-format";
import { getCurrencyCatalogCodes } from "@/lib/currencies";
import type { UserLimits } from "@/lib/user-limits";
import { parsePlanLimitPayload, type PlanLimitPayload } from "@/lib/plan-limit-nudges";

const ImportFilesModal = dynamic(
  () => import("@/components/import-files-modal").then((module) => module.ImportFilesModal),
  { ssr: false }
);

type Workspace = {
  id: string;
  name: string;
  type: string;
};

type Account = {
  id: string;
  name: string;
  institution: string | null;
  accountNumber?: string | null;
  type: AccountType;
  currency: string;
  source?: string;
  balance?: string | null;
};

const buildOptimisticImportedAccount = (summary: UploadInsightsSummary): Account | null => {
  const optimisticAccountId = summary.accountId ?? summary.optimisticAccountId ?? null;
  if (!optimisticAccountId || !summary.accountName) {
    return null;
  }

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
    type: summary.accountType ?? inferAccountTypeFromStatement(summary.institution, summary.accountName, "bank"),
    currency: "PHP",
    balance: summary.balance,
  };
};

const resolvePersistedImportedAccountId = (summary: UploadInsightsSummary, accounts: Account[]) => {
  const importedAccount = findBestImportedAccountIdentityMatch(
    accounts.filter((account) => !account.id.startsWith("optimistic-")),
    {
      name: summary.accountName,
      institution: summary.institution,
      accountNumber: summary.accountNumber ?? null,
      type: summary.accountType ?? inferAccountTypeFromStatement(summary.institution, summary.accountName, "bank"),
    }
  );

  return importedAccount?.id ?? null;
};

const getImportedAccountLastFour = (value?: string | null) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
};

const matchesImportedAccountIdentity = (left: Account, right: Account) => {
  return isImportedAccountIdentityMatch(left, right);
};

const transactionsEmptyStateIllustration = "/illustrations/clover-transactions-search-3d.png";

const isImageImportFile = (file: File) =>
  /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name.toLowerCase()) || file.type.startsWith("image/");

const mergeImportedPreviewTransactions = (
  currentTransactions: Transaction[],
  previewTransactions: NonNullable<UploadInsightsSummary["previewTransactions"]>
) => {
  if (previewTransactions.length === 0) {
    return currentTransactions;
  }

  return mergeImportedWorkspaceTransactions(currentTransactions, previewTransactions);
};

const mergeAccountsWithOptimisticImports = (fetchedAccounts: Account[], currentAccounts: Account[]) => {
  const fetchedById = new Map(fetchedAccounts.map((account) => [account.id, account] as const));
  const fetchedByKey = new Map(
    fetchedAccounts.map((account) => [normalizeImportedAccountKey(account.name, account.institution, account.accountNumber, account.type), account] as const)
  );
  const mergedFetchedAccounts = fetchedAccounts.map((account) => {
    const optimistic = currentAccounts.find((currentAccount) => {
      if (currentAccount.source !== "upload") {
        return false;
      }

      return matchesImportedAccountIdentity(currentAccount, account);
    });
    if (!optimistic) {
      return account;
    }

    return {
      ...account,
      balance:
        account.balance && Number(account.balance) !== 0
          ? account.balance
          : optimistic.balance ?? account.balance,
      source: optimistic.source ?? account.source,
    };
  });

  const preservedCurrentAccounts = currentAccounts.filter((account) => {
    if (account.source === "upload") {
      return false;
    }

    const accountKey = normalizeImportedAccountKey(account.name, account.institution, account.accountNumber, account.type);
    return !fetchedById.has(account.id) && !fetchedByKey.has(accountKey);
  });

  const optimisticAccounts = currentAccounts.filter((account) => {
    if (account.source !== "upload") {
      return false;
    }

    const accountKey = normalizeImportedAccountKey(account.name, account.institution, account.accountNumber, account.type);
    return !fetchedById.has(account.id) && !fetchedAccounts.some((fetchedAccount) => matchesImportedAccountIdentity(account, fetchedAccount)) && !fetchedByKey.has(accountKey);
  });

  return [...preservedCurrentAccounts, ...optimisticAccounts, ...mergedFetchedAccounts];
};

const mergeOptimisticImportedAccount = (currentAccounts: Account[], optimisticAccount: Account) => {
  const matchedAccounts = currentAccounts.filter((account) => {
    if (account.id === optimisticAccount.id) {
      return true;
    }

    if (account.source !== "upload") {
      return false;
    }

    return matchesImportedAccountIdentity(account, optimisticAccount);
  });

  const matchedAccount = matchedAccounts[0] ?? null;
  const existingBalance = typeof matchedAccount?.balance === "string" ? matchedAccount.balance.trim() : "";
  const optimisticBalance = typeof optimisticAccount.balance === "string" ? optimisticAccount.balance.trim() : "";
  const shouldPreserveExistingBalance =
    existingBalance !== "" &&
    Number(existingBalance) !== 0 &&
    (optimisticBalance === "" || Number(optimisticBalance) === 0);

  const mergedAccount: Account = matchedAccount
    ? {
        ...matchedAccount,
        ...optimisticAccount,
        balance: shouldPreserveExistingBalance ? matchedAccount.balance : optimisticAccount.balance ?? matchedAccount.balance,
      }
    : optimisticAccount;

  const remainingAccounts = currentAccounts.filter((account) => {
    if (account.id === optimisticAccount.id) {
      return false;
    }

    if (account.source !== "upload") {
      return true;
    }

    return !matchesImportedAccountIdentity(account, optimisticAccount);
  });

  return [mergedAccount, ...remainingAccounts];
};

const accountMatchesTransaction = (transaction: Transaction, account: Account) =>
  transaction.accountId === account.id;

const isGenericAccountBrand = (brand: ReturnType<typeof getAccountBrand>) => {
  const label = brand.label.trim().toLowerCase();
  return (
    !brand.logoSrc &&
    brand.logoSrcs.length === 0 &&
    (label === "bank" || label === "account" || label === "other" || label === "wallet" || label === "investment")
  );
};

type Category = {
  id: string;
  name: string;
  type: "income" | "expense" | "transfer";
};

type Transaction = {
  id: string;
  workspaceId: string;
  accountId: string;
  accountName: string;
  institution?: string | null;
  categoryId: string | null;
  categoryName: string | null;
  reviewStatus?: "pending_review" | "suggested" | "confirmed" | "edited" | "rejected" | "duplicate_skipped";
  categoryConfidence?: number | null;
  date: string;
  amount: string;
  currency: string;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  description?: string | null;
  isTransfer: boolean;
  isExcluded: boolean;
  splitBill?: { id: string; title: string } | null;
  source?: string | null;
  importFileId?: string | null;
  warningReason?: string | null;
  rawPayload?: unknown;
  normalizedPayload?: unknown;
};

type TransactionPageMeta = {
  totalCount: number;
  income: number;
  spending: number;
  transfers: number;
  review: number;
  currencyCodes: string[];
  topCategory: [string, number] | null;
  topAccount: [string, number] | null;
  firstTransactionDate: string | null;
  lastTransactionDate: string | null;
  firstReviewTransaction: Transaction | null;
  firstReviewTransactionIndex: number | null;
};

type ImportFile = {
  id: string;
  fileName: string;
  status: string;
  uploadedAt: string;
  accountId?: string | null;
  enrichmentJob?: {
    status?: string | null;
    phase?: string | null;
    processedRows?: number | null;
    totalRows?: number | null;
    updatedAt?: string | Date | null;
  } | null;
};

type TransactionsWorkspaceCacheSnapshot = {
  workspaceId: string;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  imports: ImportFile[];
  page?: number;
  pageSize?: number;
  totalCount?: number;
  currencyCodes?: string[];
  summary?: TransactionPageMeta;
  updatedAt: number;
};

type TransactionsWorkspaceCacheState = {
  selectedWorkspaceId: string;
  snapshots: Record<string, TransactionsWorkspaceCacheSnapshot>;
};

type DateFilterMode = "ltd" | "day" | "week" | "month" | "quarter" | "year" | "custom";
type TransactionSortField = "date" | "name" | "account" | "category" | "amount";
type TransactionSortDirection = "asc" | "desc";
type TransactionTypeFilter = "debit" | "credit" | "transfer";

type ManualTransactionForm = {
  date: string;
  accountId: string;
  categoryId: string;
  currency: string;
  amount: string;
  type: "debit" | "credit";
  merchantRaw: string;
  description: string;
  receiptLineItems: ReceiptLineItemDraft[];
};

type BulkEditForm = {
  accountId: string;
  categoryId: string;
  type: "" | "debit" | "credit";
};

type TransactionDetailDraft = {
  merchantRaw: string;
  merchantClean: string;
  date: string;
  accountId: string;
  categoryId: string;
  amount: string;
  currency: string;
  type: "debit" | "credit";
  description: string;
  isExcluded: boolean;
  isTransfer: boolean;
};

type ReceiptLineItemDraft = {
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
};

type ReceiptLineItem = {
  description: string;
  quantity?: string | null;
  unitPrice?: string | null;
  amount?: string | null;
};

type EditableTransactionField = "name" | "date" | "accountId" | "categoryId" | "amount" | "currency";

type InlineEditableCellProps = {
  value: string;
  displayValue: string;
  ariaLabel: string;
  kind: "text" | "date" | "number" | "select";
  onCommit: (value: string) => Promise<void> | void;
  options?: Array<{ value: string; label: string }>;
  className?: string;
};

type TransactionHistoryEntry = {
  before: Transaction;
  after: Transaction;
};

type TransactionConfidenceSignal = {
  label: string;
  value: number;
  note: string;
};

type MerchantRenameSuggestion = {
  sourceTransactionId: string;
  sourceMerchantRaw: string;
  targetMerchantClean: string;
  matchingTransactionIds: string[];
};

type CategorySuggestion = {
  categoryId: string;
  categoryName: string;
  confidence: number;
  source: "merchant_rule" | "training_signal" | "heuristic";
  sourceLabel: string;
  reason: string;
};

const isAutoApplyCategorySuggestion = (suggestion: CategorySuggestion | null): suggestion is CategorySuggestion => {
  if (!suggestion?.categoryId) {
    return false;
  }

  if (suggestion.categoryName.trim().toLowerCase() === "other") {
    return false;
  }

  if (suggestion.source !== "heuristic") {
    return true;
  }

  return suggestion.confidence >= 60;
};

type UpdateTransactionOptions = {
  recordHistory?: boolean;
  historyBefore?: Transaction | null;
};

const todayIso = new Date().toISOString().slice(0, 10);
const transactionsWorkspaceCacheKey = "clover.transactions.workspace-cache.v1";

const formatTransactionAmount = (value: number, currency?: string | null) => formatCurrencyAmount(value, currency ?? "PHP");

const formatAuditPayloadPreview = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return "Not available";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Not available";
  }
};

const getCurrencyCodes = (transactions: Array<{ currency: string }>) =>
  Array.from(new Set(transactions.map((transaction) => formatCurrencyCode(transaction.currency))));

const getWorkspaceCurrencyCodes = (transactions: Array<{ currency: string }>, fallback = "PHP") => {
  const codes = getCurrencyCodes(transactions);
  return codes.length > 0 ? codes : [fallback];
};

const formatTransactionAggregate = (value: number, transactions: Array<{ currency: string }>) => {
  const currencies = getCurrencyCodes(transactions);
  if (currencies.length === 0) {
    return formatTransactionAmount(value, "PHP");
  }

  if (currencies.length === 1) {
    return formatTransactionAmount(value, currencies[0]);
  }

  return "Mixed currencies";
};

const buildVisibleTransactionSummary = (
  transactions: Transaction[],
  fallback?: Partial<TransactionPageMeta> | null
): TransactionPageMeta => {
  const summary: TransactionPageMeta = {
    totalCount: fallback?.totalCount ?? transactions.length,
    income: 0,
    spending: 0,
    transfers: 0,
    review: fallback?.review ?? 0,
    currencyCodes: fallback?.currencyCodes ?? getWorkspaceCurrencyCodes(transactions),
    topCategory: fallback?.topCategory ?? null,
    topAccount: fallback?.topAccount ?? null,
    firstTransactionDate: fallback?.firstTransactionDate ?? null,
    lastTransactionDate: fallback?.lastTransactionDate ?? null,
    firstReviewTransaction: fallback?.firstReviewTransaction ?? null,
    firstReviewTransactionIndex: fallback?.firstReviewTransactionIndex ?? null,
  };

  for (const transaction of transactions) {
    if (transaction.isExcluded) {
      continue;
    }

    const amount = Math.abs(Number(transaction.amount));
    if (!Number.isFinite(amount)) {
      continue;
    }

    const effectiveType =
      normalizeCategoryName(transaction.categoryName) === "income"
        ? "income"
        : normalizeCategoryName(transaction.categoryName) === "transfers" || transaction.isTransfer
          ? "transfer"
          : transaction.type;

    if (effectiveType === "income") {
      summary.income += amount;
    } else if (effectiveType === "transfer") {
      summary.transfers += amount;
    } else {
      summary.spending += amount;
    }
  }

  return summary;
};

const createEmptyManualForm = (accountId = "", categoryId = "", currency = "PHP"): ManualTransactionForm => ({
  date: todayIso,
  accountId,
  categoryId,
  currency,
  amount: "",
  type: "debit",
  merchantRaw: "",
  description: "",
  receiptLineItems: [],
});

const getOtherCategoryId = (categoryList: Category[]) =>
  categoryList.find((category) => category.name.trim().toLowerCase() === "other")?.id ?? "";

const getCategoryIdByName = (categoryList: Category[], categoryName: string) =>
  categoryList.find((category) => category.name.trim().toLowerCase() === categoryName.trim().toLowerCase())?.id ?? "";

const getCategoryNameById = (categoryList: Category[], categoryId: string | null | undefined) =>
  categoryList.find((category) => category.id === categoryId)?.name ?? null;

const normalizeCategoryName = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";
const ENRICHMENT_JOB_ACTIVE_STALE_MS = 10 * 60 * 1000;

const isResolvedReviewStatus = (status: Transaction["reviewStatus"]) =>
  status === "confirmed" || status === "rejected" || status === "duplicate_skipped";

const isImportFinalizingTransaction = (transaction: Transaction) => {
  if (!transaction.importFileId) {
    return false;
  }

  const categoryName = normalizeCategoryName(transaction.categoryName);
  return (
    transaction.reviewStatus === "pending_review" ||
    transaction.reviewStatus === "suggested" ||
    (typeof transaction.categoryConfidence === "number" && transaction.categoryConfidence < 90) ||
    !categoryName ||
    categoryName === "other" ||
    categoryName === "needs category review"
  );
};

const isActiveEnrichmentJob = (importFile: ImportFile) => {
  const status = importFile.enrichmentJob?.status;
  if (!status || status === "done" || status === "failed") {
    return false;
  }

  const updatedAt = importFile.enrichmentJob?.updatedAt;
  const updatedAtMs = updatedAt ? new Date(updatedAt).getTime() : 0;
  return !Number.isFinite(updatedAtMs) || updatedAtMs <= 0 || Date.now() - updatedAtMs < ENRICHMENT_JOB_ACTIVE_STALE_MS;
};

const isFailedEnrichmentJob = (importFile: ImportFile) => importFile.enrichmentJob?.status === "failed";

const getEnrichmentNoticeState = (importFiles: ImportFile[], nowMs: number) => {
  const activeJobs = importFiles.filter(isActiveEnrichmentJob);
  if (activeJobs.length === 0) {
    const failedJobs = importFiles.filter(isFailedEnrichmentJob);
    return {
      label: failedJobs.length > 0 ? "Needs review" : "Review suggested",
      detail: failedJobs.length > 0 ? "couldn't finalize automatically; please review" : "some details may need a quick look",
      needsReview: true,
    };
  }

  const remainingRows = activeJobs.reduce((total, importFile) => {
      const totalRows = Number(importFile.enrichmentJob?.totalRows ?? 0);
      const processedRows = Number(importFile.enrichmentJob?.processedRows ?? 0);
      return total + Math.max(0, totalRows - processedRows);
    }, 0);
  const latestUpdatedAtMs = activeJobs.reduce((latest, importFile) => {
    const updatedAt = importFile.enrichmentJob?.updatedAt;
    const timestamp = updatedAt ? new Date(updatedAt).getTime() : 0;
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);

  const estimatedSeconds = Math.max(30, Math.min(600, Math.ceil(remainingRows / 50) * 60));
  const elapsedSeconds = latestUpdatedAtMs > 0 ? Math.max(0, Math.floor((nowMs - latestUpdatedAtMs) / 1000)) : 0;
  const remainingSeconds = estimatedSeconds - elapsedSeconds;

  if (remainingRows <= 0) {
    return {
      label: "Enriching data",
      detail: "finishing now",
      needsReview: false,
    };
  }

  if (remainingSeconds <= -60 || elapsedSeconds >= 300) {
    return {
      label: "Enriching data",
      detail: "taking longer than expected",
      needsReview: false,
    };
  }

  if (remainingSeconds <= 60) {
    return {
      label: "Enriching data",
      detail: "less than 1 min left",
      needsReview: false,
    };
  }

  const minutes = Math.max(1, Math.ceil(remainingSeconds / 60));
  return {
    label: "Enriching data",
    detail: `about ${minutes} min${minutes === 1 ? "" : "s"} left`,
    needsReview: false,
  };
};

function InlineEditableCell({
  value,
  displayValue,
  ariaLabel,
  kind,
  onCommit,
  options = [],
  className,
}: InlineEditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const fieldRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [editing, value]);

  useEffect(() => {
    if (!editing) {
      return;
    }

    const field = fieldRef.current;
    field?.focus();
    if (field instanceof HTMLInputElement) {
      field.select();
    }
  }, [editing]);

  const openEditor = () => {
    setDraft(value);
    setEditing(true);
  };

  const cancelEditor = () => {
    setDraft(value);
    setEditing(false);
  };

  const commit = async (nextValue = draft) => {
    const normalized = kind === "text" ? nextValue.trim() : nextValue;
    if (normalized === value) {
      setEditing(false);
      return;
    }

    try {
      await onCommit(normalized);
      setEditing(false);
    } catch {
      setDraft(value);
      setEditing(false);
    }
  };

  if (kind === "select") {
    return (
      <select
        ref={(node) => {
          fieldRef.current = node;
        }}
        className={className}
        value={draft}
        aria-label={ariaLabel}
        title={displayValue}
        onFocus={() => setDraft(value)}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            if (next === value) {
              return;
            }

            void Promise.resolve(onCommit(next)).catch(() => {
              setDraft(value);
            });
          }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (editing) {
    return (
      <input
        ref={(node) => {
          fieldRef.current = node;
        }}
        className={className}
        value={draft}
        aria-label={ariaLabel}
        type={kind}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          void commit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
          }

          if (event.key === "Escape") {
            event.preventDefault();
            cancelEditor();
          }
        }}
      />
    );
  }

  return (
    <button type="button" className={className} onClick={openEditor} aria-label={ariaLabel} title={displayValue}>
      {displayValue}
    </button>
  );
}

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const MOBILE_TRANSACTIONS_BATCH_SIZE = 12;

const appendUniqueTransactions = <T extends { id: string }>(current: T[], incoming: T[]) => {
  if (incoming.length === 0) {
    return current;
  }

  const knownIds = new Set(current.map((transaction) => transaction.id));
  const appended = incoming.filter((transaction) => !knownIds.has(transaction.id));

  return appended.length > 0 ? [...current, ...appended] : current;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);

const dateAtNoon = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`);

const startOfWeekIso = (value: string) => {
  const date = dateAtNoon(value);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return toIsoDate(date);
};

const endOfWeekIso = (value: string) => {
  const date = dateAtNoon(value);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() + (6 - day));
  return toIsoDate(date);
};

const startOfMonthIso = (value: string) => {
  const date = dateAtNoon(value);
  date.setDate(1);
  return toIsoDate(date);
};

const endOfMonthIso = (value: string) => {
  const date = dateAtNoon(value);
  date.setMonth(date.getMonth() + 1, 0);
  return toIsoDate(date);
};

const startOfQuarterIso = (value: string) => {
  const date = dateAtNoon(value);
  const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
  date.setMonth(quarterStartMonth, 1);
  return toIsoDate(date);
};

const endOfQuarterIso = (value: string) => {
  const date = dateAtNoon(value);
  const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
  date.setMonth(quarterStartMonth + 3, 0);
  return toIsoDate(date);
};

const startOfYearIso = (value: string) => {
  const date = dateAtNoon(value);
  date.setMonth(0, 1);
  return toIsoDate(date);
};

const endOfYearIso = (value: string) => {
  const date = dateAtNoon(value);
  date.setMonth(11, 31);
  return toIsoDate(date);
};

const getDateFilterLabel = (mode: DateFilterMode, anchor: string, customStart: string, customEnd: string) => {
  switch (mode) {
    case "day":
      return "Today";
    case "week":
      return "This week";
    case "month":
      return "This month";
    case "quarter":
      return "This quarter";
    case "year":
      return "This year";
    case "custom":
      return customStart && customEnd ? `${formatDate(customStart)} - ${formatDate(customEnd)}` : "Custom range";
    default:
      return "Lifetime to date";
  }
};

const createEmptyBulkEditForm = (): BulkEditForm => ({
  accountId: "",
  categoryId: "",
  type: "",
});

const normalizeFilterValue = (value: string) => value.trim().toLowerCase();

const readSearchParamValues = (searchParams: { getAll: (key: string) => string[] } | null, key: string) =>
  (searchParams?.getAll(key) ?? [])
    .flatMap((entry) => splitMerchantFilters(entry))
    .map((entry) => entry.trim())
    .filter(Boolean);

const findMatchingId = (value: string, items: Array<{ id: string; name: string }>) => {
  const normalizedValue = normalizeFilterValue(value);
  return items.find((item) => item.id === value || normalizeFilterValue(item.name) === normalizedValue)?.id ?? "";
};

const toggleFilterValue = (values: string[], value: string) =>
  values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];

const toggleTypedFilterValue = <T extends string>(values: T[], value: T) =>
  values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];

const splitMerchantFilters = (value: string) =>
  value
    .split(/[,;\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const normalizeTransactionSearch = (value: string) => value.trim().toLowerCase();

const startOfUtcDay = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);

const endOfUtcDay = (value: string) => new Date(`${value.slice(0, 10)}T23:59:59.999Z`);

const startOfUtcWeek = (value: string) => {
  const date = startOfUtcDay(value);
  const day = date.getUTCDay();
  const offset = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date;
};

const endOfUtcWeek = (value: string) => {
  const date = startOfUtcWeek(value);
  date.setUTCDate(date.getUTCDate() + 6);
  date.setUTCHours(23, 59, 59, 999);
  return date;
};

const startOfUtcMonth = (value: string) => {
  const date = startOfUtcDay(value);
  date.setUTCDate(1);
  return date;
};

const endOfUtcMonth = (value: string) => {
  const date = startOfUtcMonth(value);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  date.setUTCHours(23, 59, 59, 999);
  return date;
};

const startOfUtcQuarter = (value: string) => {
  const date = startOfUtcDay(value);
  const quarterStartMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  date.setUTCMonth(quarterStartMonth, 1);
  return date;
};

const endOfUtcQuarter = (value: string) => {
  const date = startOfUtcQuarter(value);
  date.setUTCMonth(date.getUTCMonth() + 3, 0);
  date.setUTCHours(23, 59, 59, 999);
  return date;
};

const startOfUtcYear = (value: string) => {
  const date = startOfUtcDay(value);
  date.setUTCMonth(0, 1);
  return date;
};

const endOfUtcYear = (value: string) => {
  const date = startOfUtcYear(value);
  date.setUTCMonth(11, 31);
  date.setUTCHours(23, 59, 59, 999);
  return date;
};

const formatUtcDateKey = (value: Date) => value.toISOString().slice(0, 10);

const matchesDateFilter = (
  transactionDate: string,
  mode: DateFilterMode,
  anchor: string,
  customStart: string,
  customEnd: string
) => {
  if (mode === "ltd") {
    return true;
  }

  const date = formatUtcDateKey(new Date(transactionDate));
  const normalizedAnchor = anchor?.trim() || todayIso;

  const range =
    mode === "day"
      ? { start: formatUtcDateKey(startOfUtcDay(normalizedAnchor)), end: formatUtcDateKey(endOfUtcDay(normalizedAnchor)) }
      : mode === "week"
        ? { start: formatUtcDateKey(startOfUtcWeek(normalizedAnchor)), end: formatUtcDateKey(endOfUtcWeek(normalizedAnchor)) }
        : mode === "month"
          ? { start: formatUtcDateKey(startOfUtcMonth(normalizedAnchor)), end: formatUtcDateKey(endOfUtcMonth(normalizedAnchor)) }
          : mode === "quarter"
            ? { start: formatUtcDateKey(startOfUtcQuarter(normalizedAnchor)), end: formatUtcDateKey(endOfUtcQuarter(normalizedAnchor)) }
            : mode === "year"
              ? { start: formatUtcDateKey(startOfUtcYear(normalizedAnchor)), end: formatUtcDateKey(endOfUtcYear(normalizedAnchor)) }
              : {
                  start: customStart.trim() ? formatUtcDateKey(startOfUtcDay(customStart)) : "",
                  end: customEnd.trim() ? formatUtcDateKey(endOfUtcDay(customEnd)) : "",
                };

  if (!range.start && !range.end) {
    return true;
  }

  if (range.start && date < range.start) {
    return false;
  }

  if (range.end && date > range.end) {
    return false;
  }

  return true;
};

const matchesTransactionSearch = (transaction: Transaction, searchText: string) => {
  if (!searchText) {
    return true;
  }

  const haystack = [
    transaction.merchantClean ?? "",
    transaction.merchantRaw,
    transaction.accountName,
    transaction.categoryName ?? "",
    transaction.date,
    transaction.currency,
    String(transaction.amount),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(searchText);
};

const matchesTransactionFilters = (
  transaction: Transaction,
  filters: {
    currencyFilter: string;
    categoryFilters: string[];
    accountFilters: string[];
    typeFilters: TransactionTypeFilter[];
    dateFilterMode: DateFilterMode;
    dateFilterAnchor: string;
    customStart: string;
    customEnd: string;
    amountMin: string;
    amountMax: string;
    otherCategoryId: string;
  }
) => {
  if (filters.currencyFilter && formatCurrencyCode(transaction.currency) !== formatCurrencyCode(filters.currencyFilter)) {
    return false;
  }

  if (filters.categoryFilters.length > 0 && !filters.categoryFilters.includes(transaction.categoryId ?? filters.otherCategoryId)) {
    return false;
  }

  if (filters.accountFilters.length > 0 && !filters.accountFilters.includes(transaction.accountId)) {
    return false;
  }

  if (filters.typeFilters.length > 0) {
    const effectiveCategoryName =
      getEffectiveTransactionCategoryName({
        categoryName: transaction.categoryName ?? null,
        rawPayload: transaction.rawPayload as never,
        merchantRaw: transaction.merchantRaw,
        merchantClean: transaction.merchantClean,
        institution: transaction.institution ?? null,
        source: transaction.source ?? null,
        type: transaction.type,
      }) ?? transaction.categoryName ?? null;
    const effectiveType = coerceTransactionTypeFromCategoryName(effectiveCategoryName, transaction.type);
    const normalizedType = effectiveType === "income" ? "credit" : effectiveType === "transfer" ? "transfer" : "debit";
    if (!filters.typeFilters.includes(normalizedType)) {
      return false;
    }
  }

  if (!matchesDateFilter(transaction.date, filters.dateFilterMode, filters.dateFilterAnchor, filters.customStart, filters.customEnd)) {
    return false;
  }

  const amount = Number(transaction.amount);
  const minAmount = filters.amountMin.trim() ? Number(filters.amountMin) : null;
  const maxAmount = filters.amountMax.trim() ? Number(filters.amountMax) : null;

  if (minAmount !== null && Number.isFinite(minAmount) && amount < minAmount) {
    return false;
  }

  if (maxAmount !== null && Number.isFinite(maxAmount) && amount > maxAmount) {
    return false;
  }

  return true;
};

const getLocalStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const getSessionStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const readTransactionsWorkspaceCache = (): TransactionsWorkspaceCacheState | null => {
  const readFromStorage = (storage: Storage | null): TransactionsWorkspaceCacheState | null => {
    if (!storage) {
      return null;
    }

    const stored = storage.getItem(transactionsWorkspaceCacheKey);
    if (!stored) {
      return null;
    }

    try {
      const parsed = JSON.parse(stored) as Partial<TransactionsWorkspaceCacheState>;
      if (!parsed || typeof parsed !== "object") {
        return null;
      }

      const selectedWorkspaceId = typeof parsed.selectedWorkspaceId === "string" ? parsed.selectedWorkspaceId : "";
      const snapshots = parsed.snapshots && typeof parsed.snapshots === "object" ? parsed.snapshots : {};
      return {
        selectedWorkspaceId,
        snapshots: Object.fromEntries(
          Object.entries(snapshots).filter(([, snapshot]) => {
            return (
              snapshot &&
              typeof snapshot === "object" &&
              typeof snapshot.workspaceId === "string" &&
              Array.isArray(snapshot.accounts) &&
              Array.isArray(snapshot.categories) &&
              Array.isArray(snapshot.transactions) &&
              Array.isArray(snapshot.imports) &&
              (!("currencyCodes" in snapshot) || Array.isArray(snapshot.currencyCodes))
            );
          })
      ) as Record<string, TransactionsWorkspaceCacheSnapshot>,
      };
    } catch {
      return null;
    }
  };

  return readFromStorage(getLocalStorage()) ?? readFromStorage(getSessionStorage());
};

const getCachedTransactionsWorkspace = (workspaceId: string): TransactionsWorkspaceCacheSnapshot | null => {
  if (!workspaceId) {
    return null;
  }

  const cache = readTransactionsWorkspaceCache();
  const snapshot = cache?.snapshots[workspaceId] ?? null;
  if (!snapshot) {
    return null;
  }

  const deletedAccountIds = new Set([
    ...getDeletedWorkspaceAccountIds(workspaceId),
    ...getDeletingWorkspaceAccountIds(workspaceId),
  ]);

  if (deletedAccountIds.size === 0) {
    return snapshot;
  }

  return {
    ...snapshot,
    accounts: snapshot.accounts.filter((account) => {
      const accountId = typeof account.id === "string" ? account.id : "";
      return !deletedAccountIds.has(accountId);
    }),
    transactions: snapshot.transactions.filter((transaction) => {
      const accountId = typeof transaction.accountId === "string" ? transaction.accountId : "";
      return !deletedAccountIds.has(accountId);
    }),
    imports: snapshot.imports.filter((importFile) => {
      const accountId = typeof importFile.accountId === "string" ? importFile.accountId : "";
      return !accountId || !deletedAccountIds.has(accountId);
    }),
  };
};

const persistTransactionsWorkspaceCache = (
  workspaceId: string,
  snapshot: Omit<TransactionsWorkspaceCacheSnapshot, "workspaceId" | "updatedAt">
) => {
  const localStorageRef = getLocalStorage();
  const sessionStorageRef = getSessionStorage();
  if ((!localStorageRef && !sessionStorageRef) || !workspaceId) {
    return null;
  }

  const cache = readTransactionsWorkspaceCache();
  const existingSnapshot = cache?.snapshots[workspaceId] ?? null;
  const incomingHasData =
    snapshot.accounts.length > 0 ||
    snapshot.transactions.length > 0 ||
    snapshot.imports.length > 0;
  const existingHasData =
    existingSnapshot !== null &&
    (existingSnapshot.accounts.length > 0 ||
      existingSnapshot.transactions.length > 0 ||
      existingSnapshot.imports.length > 0);

  if (existingHasData && !incomingHasData) {
    return existingSnapshot.updatedAt;
  }

  const nextSnapshot: TransactionsWorkspaceCacheSnapshot = {
    workspaceId,
    updatedAt: Date.now(),
    ...snapshot,
  };

  const nextState: TransactionsWorkspaceCacheState = {
    selectedWorkspaceId: workspaceId,
    snapshots: {
      ...(cache?.snapshots ?? {}),
      [workspaceId]: nextSnapshot,
    },
  };

  const serialized = JSON.stringify(nextState);
  localStorageRef?.setItem(transactionsWorkspaceCacheKey, serialized);
  sessionStorageRef?.setItem(transactionsWorkspaceCacheKey, serialized);
  return nextSnapshot.updatedAt;
};

const looksLikeJsonBlob = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || !/^[\[{]/.test(trimmed)) {
    return false;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return parsed !== null && typeof parsed === "object";
  } catch {
    return true;
  }
};

const normalizeTransactionNotes = (value: string | null | undefined) => {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (looksLikeJsonBlob(trimmed)) {
    return "";
  }

  return trimmed;
};

const createEmptyReceiptLineItem = (): ReceiptLineItemDraft => ({
  description: "",
  quantity: "",
  unitPrice: "",
  amount: "",
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeReceiptLineItemText = (value: unknown) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  return trimmed;
};

const parseReceiptLineItemsFromPayload = (rawPayload: unknown): ReceiptLineItem[] => {
  if (!isRecord(rawPayload)) {
    return [];
  }

  const candidateSources: unknown[] = [];
  if (Array.isArray(rawPayload.receiptLineItems)) {
    candidateSources.push(rawPayload.receiptLineItems);
  }

  const receiptDetails = isRecord(rawPayload.receiptDetails) ? rawPayload.receiptDetails : null;
  if (receiptDetails) {
    if (Array.isArray(receiptDetails.lineItems)) {
      candidateSources.push(receiptDetails.lineItems);
    }

    if (Array.isArray(receiptDetails.line_items)) {
      candidateSources.push(receiptDetails.line_items);
    }
  }

  for (const source of candidateSources) {
    const lineItems = (source as unknown[]).flatMap((entry) => {
      if (!isRecord(entry)) {
        return [];
      }

      const description = normalizeReceiptLineItemText(entry.description ?? entry.name ?? entry.label);
      if (!description) {
        return [];
      }

      return [
        {
          description,
          quantity: normalizeReceiptLineItemText(entry.quantity) || null,
          unitPrice: normalizeReceiptLineItemText(entry.unitPrice ?? entry.unit_price) || null,
          amount: normalizeReceiptLineItemText(entry.amount ?? entry.total) || null,
        },
      ];
    });

    if (lineItems.length > 0) {
      return lineItems;
    }
  }

  return [];
};

const parseReceiptLineItemNumber = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const getReceiptLineItemComputedAmount = (item: ReceiptLineItemDraft | ReceiptLineItem) => {
  const amount = parseReceiptLineItemNumber(item.amount);
  if (amount !== null) {
    return amount;
  }

  const unitPrice = parseReceiptLineItemNumber(item.unitPrice);
  const quantity = parseReceiptLineItemNumber(item.quantity);
  if (unitPrice !== null && quantity !== null) {
    return unitPrice * quantity;
  }

  return null;
};

const getManualReceiptLineItemTotal = (lineItems: ReceiptLineItemDraft[]) =>
  lineItems.reduce((total, item) => total + (getReceiptLineItemComputedAmount(item) ?? 0), 0);

const sanitizeReceiptLineItems = (lineItems: ReceiptLineItemDraft[]) =>
  lineItems
    .map((item) => ({
      description: item.description.trim(),
      quantity: item.quantity.trim(),
      unitPrice: item.unitPrice.trim(),
      amount: item.amount.trim(),
    }))
    .filter((item) => Boolean(item.description))
    .map((item) => ({
      description: item.description,
      quantity: item.quantity || null,
      unitPrice: item.unitPrice || null,
      amount: item.amount || null,
    }));

const normalizeMerchantGroupKey = (value: string) =>
  value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const summarizeTransactionMerchantText = (value: string, institution?: string | null) =>
  summarizeMerchantText(value, institution);

const getConfidenceLabel = (value: number) => {
  if (value >= 85) {
    return "High";
  }

  if (value >= 65) {
    return "Medium";
  }

  return "Needs review";
};

const inferTransactionConfidenceSignals = (transaction: Transaction, warningReason: string | null): TransactionConfidenceSignal[] => {
  const source = transaction.source ?? "upload";
  const hasWarning = Boolean(warningReason);
  const isDuplicateWarning = warningReason === "Review similar transaction";
  const sourceBoost = source === "manual" ? 6 : source === "upload" ? 0 : -4;

  const nameValue = Math.max(
    40,
    Math.min(98, (transaction.merchantClean?.trim() ? 88 : 74) + sourceBoost + (transaction.merchantRaw.trim() ? 4 : -10))
  );
  const accountValue = Math.max(40, Math.min(98, (transaction.accountId ? 92 : 58) + sourceBoost + (transaction.accountName ? 2 : -6)));
  const categoryValue = Math.max(
    20,
    Math.min(
      98,
      (!transaction.categoryId ? 28 : 86) +
        sourceBoost +
        (isDuplicateWarning ? -8 : 0) +
        (warningReason === "Needs category review" ? -20 : 0) +
        (hasWarning && !isDuplicateWarning ? -4 : 0)
    )
  );

  return [
    {
      label: "Name",
      value: nameValue,
      note: transaction.merchantClean?.trim() ? "Cleaned merchant name present" : "Using the raw statement label",
    },
    {
      label: "Account",
      value: accountValue,
      note: transaction.accountName ? "Account match is present" : "Account needs a closer look",
    },
    {
      label: "Category",
      value: categoryValue,
      note: !transaction.categoryId
        ? "No category assigned yet"
        : warningReason === "Needs category review"
          ? "Category still needs review"
          : "Category has a strong match",
    },
  ];
};

const summarizeTransactionChange = (before: Transaction, after: Transaction, accountNames: Map<string, string>, categoryNames: Map<string, string>) => {
  const changes: string[] = [];
  const beforeName = before.merchantClean ?? before.merchantRaw;
  const afterName = after.merchantClean ?? after.merchantRaw;
  if (beforeName !== afterName) {
    changes.push(`Name: ${beforeName} → ${afterName}`);
  }

  const beforeDate = before.date.slice(0, 10);
  const afterDate = after.date.slice(0, 10);
  if (beforeDate !== afterDate) {
    changes.push(`Date: ${formatDate(beforeDate)} → ${formatDate(afterDate)}`);
  }

  if (before.accountId !== after.accountId) {
    changes.push(`Account: ${accountNames.get(before.accountId) ?? before.accountName} → ${accountNames.get(after.accountId) ?? after.accountName}`);
  }

  if ((before.categoryId ?? "") !== (after.categoryId ?? "")) {
    changes.push(
      `Category: ${categoryNames.get(before.categoryId ?? "") ?? before.categoryName ?? "Other"} → ${
        categoryNames.get(after.categoryId ?? "") ?? after.categoryName ?? "Other"
      }`
    );
  }

  if (before.amount !== after.amount) {
    changes.push(
      `Amount: ${formatTransactionAmount(Number(before.amount), before.currency)} → ${formatTransactionAmount(Number(after.amount), after.currency)}`
    );
  }

  if (before.currency !== after.currency) {
    changes.push(`Currency: ${before.currency} → ${after.currency}`);
  }

  if (before.isExcluded !== after.isExcluded) {
    changes.push(after.isExcluded ? "Excluded from totals" : "Included in totals");
  }

  if (before.isTransfer !== after.isTransfer) {
    changes.push(after.isTransfer ? "Marked as transfer" : "Marked as non-transfer");
  }

  return changes;
};

const createDetailDraft = (transaction: Transaction): TransactionDetailDraft => {
  const effectiveCategoryName =
    getEffectiveTransactionCategoryName({
      categoryName: transaction.categoryName ?? null,
      rawPayload: transaction.rawPayload as never,
      merchantRaw: transaction.merchantRaw,
      merchantClean: transaction.merchantClean,
      institution: transaction.institution ?? null,
      source: transaction.source ?? null,
      type: transaction.type,
    }) ?? transaction.categoryName ?? null;
  const effectiveType = coerceTransactionTypeFromCategoryName(effectiveCategoryName, transaction.type);

  return {
    merchantRaw: transaction.merchantRaw,
    merchantClean: transaction.merchantClean ?? transaction.merchantRaw,
    date: transaction.date.slice(0, 10),
    accountId: transaction.accountId,
    categoryId: transaction.categoryId ?? "",
    amount: transaction.amount,
    currency: transaction.currency,
    type: effectiveType === "income" ? "credit" : "debit",
    description: normalizeTransactionNotes(transaction.description),
    isExcluded: transaction.isExcluded,
    isTransfer: transaction.isTransfer,
  };
};

const detailDraftTypeToTransactionType = (type: TransactionDetailDraft["type"]) => (type === "credit" ? "income" : "expense");

const toolbarChipStyle = {
  backgroundColor: "var(--surface-2)",
  borderColor: "var(--stroke-strong)",
  color: "var(--text)",
  boxShadow: "none",
} as const;

const toolbarAddStyle = {
  backgroundColor: "var(--accent)",
  borderColor: "var(--accent)",
  color: "#ffffff",
  boxShadow: "none",
} as const;

const transactionsMenuStyle = {
  position: "relative",
  zIndex: 20,
  display: "inline-flex",
  alignItems: "center",
  flex: "0 0 auto",
} as const;

const transactionsLayoutStyle = {
  flex: "1 1 auto",
  minHeight: 0,
} as const;

const transactionsToolbarSearchStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  height: "32px",
  padding: "0 10px",
  borderRadius: "999px",
  border: "1px solid rgba(219, 227, 232, 0.9)",
  background: "rgba(255, 255, 255, 0.96)",
  boxShadow: "var(--shadow-soft)",
  minWidth: "160px",
  maxWidth: "180px",
  flex: "0 1 180px",
} as const;

const transactionsToolbarSearchCompactStyle = {
  ...transactionsToolbarSearchStyle,
  width: "min(160px, 34vw)",
  minWidth: "96px",
  maxWidth: "160px",
  flex: "0 1 auto",
} as const;

const transactionsShellActionsStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "6px",
  flexWrap: "nowrap",
  minWidth: 0,
  width: "auto",
  flex: "0 0 auto",
} as const;

const transactionsFooterStyle = {
  background: "transparent",
  borderTop: "1px solid rgba(219, 227, 232, 0.72)",
  boxShadow: "none",
  backdropFilter: "none",
  WebkitBackdropFilter: "none",
} as const;

const transactionsFooterNetMetricStyle = {
  borderColor: "var(--stroke)",
  background: "rgba(255, 255, 255, 0.94)",
} as const;

function ActionIcon({
  name,
}: {
  name:
    | "plus"
    | "chevron-left"
    | "chevron-down"
    | "chevron-right"
    | "undo"
    | "redo"
    | "search"
    | "calendar"
    | "currency"
    | "filters"
    | "summary"
    | "save"
    | "download"
    | "more"
    | "account";
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
    case "chevron-left":
      return (
        <svg {...common}>
          <path d="m15 6-6 6 6 6" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg {...common}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
    case "chevron-right":
      return (
        <svg {...common}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      );
    case "undo":
      return (
        <svg {...common}>
          <path d="M9 7H5v4" />
          <path d="M5 11c1.8-3 5-5 8.5-5 4.4 0 8 3.6 8 8s-3.6 8-8 8c-3.1 0-5.8-1.7-7.1-4.2" />
        </svg>
      );
    case "redo":
      return (
        <svg {...common}>
          <path d="M15 7h4v4" />
          <path d="M19 11c-1.8-3-5-5-8.5-5-4.4 0-8 3.6-8 8s3.6 8 8 8c3.1 0 5.8-1.7 7.1-4.2" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="5.5" />
          <path d="m16 16 4 4" />
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
    case "currency":
      return (
        <svg {...common}>
          <path d="M12 5v14" />
          <path d="M15.5 8c0-1.7-1.6-3-3.5-3s-3.5 1.3-3.5 3 1.6 2.5 3.5 3 3.5 1.3 3.5 3-1.6 3-3.5 3-3.5-1.3-3.5-3" />
        </svg>
      );
    case "filters":
      return (
        <svg {...common}>
          <path d="M4 7h16" />
          <path d="M7 12h10" />
          <path d="M10 17h4" />
        </svg>
      );
    case "summary":
      return (
        <svg {...common}>
          <rect x="5" y="4" width="14" height="16" rx="2" />
          <path d="M8 8h8" />
          <path d="M8 12h8" />
          <path d="M8 16h5" />
        </svg>
      );
    case "save":
      return (
        <svg {...common}>
          <path d="M5 5h11l3 3v11H5z" />
          <path d="M8 5v5h8V5" />
          <path d="M9 19v-6h6v6" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 4v10" />
          <path d="m8 10 4 4 4-4" />
          <path d="M5 19h14" />
        </svg>
      );
    case "more":
      return (
        <svg {...common}>
          <circle cx="6" cy="12" r="1.4" />
          <circle cx="12" cy="12" r="1.4" />
          <circle cx="18" cy="12" r="1.4" />
        </svg>
      );
    case "account":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="14" rx="3" />
          <path d="M8 9h8" />
          <path d="M8 13h6" />
        </svg>
      );
    default:
      return null;
  }
}

function MultiSelectFilterGroup({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="transactions-filter-group" role="group" aria-label={label}>
      <div className="transactions-filter-group__head">
        <span className="transactions-filter-group__label">{label}</span>
        {selected.length ? (
          <button className="transactions-filter-group__clear" type="button" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>
      <div className="transactions-filter-group__options">
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <button
              key={option.value}
              className={`pill pill-interactive transactions-filter-pill ${isSelected ? "pill-is-selected" : ""}`}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggle(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MerchantFilterGroup({
  merchants,
  input,
  onInputChange,
  onAddMerchants,
  onRemoveMerchant,
  onClear,
}: {
  merchants: string[];
  input: string;
  onInputChange: (value: string) => void;
  onAddMerchants: (value: string) => void;
  onRemoveMerchant: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="transactions-filter-group transactions-filter-group--merchants" role="group" aria-label="Merchants">
      <div className="transactions-filter-group__head">
        <span className="transactions-filter-group__label">Merchants</span>
        {merchants.length ? (
          <button className="transactions-filter-group__clear" type="button" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>
      <div className="transactions-merchant-filter">
        <input
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              onAddMerchants(input);
            }
          }}
          placeholder="Type one or more merchants, then press Enter"
        />
        <button className="button button-secondary button-small" type="button" onClick={() => onAddMerchants(input)}>
          Add
        </button>
      </div>
      {merchants.length ? (
        <div className="transactions-filter-group__options transactions-filter-group__options--wrap">
          {merchants.map((merchant) => (
            <button
              key={merchant}
              className="pill pill-interactive pill-is-selected transactions-filter-pill transactions-filter-pill--merchant"
              type="button"
              aria-label={`Remove merchant filter ${merchant}`}
              onClick={() => onRemoveMerchant(merchant)}
            >
              <span>{merchant}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
          </div>
      ) : null}
    </div>
  );
}

function CategorySuggestionChip({
  suggestion,
  applied,
  onApply,
}: {
  suggestion: CategorySuggestion;
  applied: boolean;
  onApply?: () => void;
}) {
  const chip = (
    <>
      <span className="transactions-suggestion-chip__label">{applied ? "Applied suggestion" : "Suggested category"}</span>
      <strong>{suggestion.categoryName}</strong>
      <span className="transactions-suggestion-chip__meta">
        {suggestion.sourceLabel} · {suggestion.confidence}%
      </span>
    </>
  );

  if (!onApply || applied) {
    return <div className={`transactions-suggestion-chip ${applied ? "transactions-suggestion-chip--applied" : ""}`}>{chip}</div>;
  }

  return (
    <button className="transactions-suggestion-chip transactions-suggestion-chip--button" type="button" onClick={onApply}>
      {chip}
      <span className="transactions-suggestion-chip__action">Use suggestion</span>
    </button>
  );
}

export default function TransactionsPage() {
  useEffect(() => {
    document.title = "Clover | Transactions";
  }, []);

  return <TransactionsPageContent />;
}

function TransactionsPageContent() {
  const { closeChrome } = useCloverChrome();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSearchParams = useMemo(() => searchParams ?? new URLSearchParams(), [searchParams]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const manualNameInputRef = useRef<HTMLInputElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const addMenuPanelRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const initialWorkspaceId = urlSearchParams.get("workspaceId") || readSelectedWorkspaceId();
  const initialCachedWorkspace = null;

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(initialWorkspaceId);
  const [accounts, setAccounts] = useState<Account[]>(
    () => []
  );
  const [categories, setCategories] = useState<Category[]>(
    () => []
  );
  const [transactions, setTransactions] = useState<Transaction[]>(
    () => []
  );
  const transactionsRef = useRef<Transaction[]>([]);
  const [imports, setImports] = useState<ImportFile[]>(
    () => []
  );
  const [transactionsSummary, setTransactionsSummary] = useState<TransactionPageMeta>(
    () => ({
      totalCount: 0,
      income: 0,
      spending: 0,
      transfers: 0,
      review: 0,
      currencyCodes: ["PHP"],
      topCategory: null,
      topAccount: null,
      firstTransactionDate: null,
      lastTransactionDate: null,
      firstReviewTransaction: null,
      firstReviewTransactionIndex: null,
    })
  );
  const [transactionsPageSize, setTransactionsPageSize] = useState(25);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [query, setQuery] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [sortField, setSortField] = useState<TransactionSortField>("date");
  const [sortDirection, setSortDirection] = useState<TransactionSortDirection>("desc");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [accountFilters, setAccountFilters] = useState<string[]>([]);
  const [typeFilters, setTypeFilters] = useState<TransactionTypeFilter[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [message, setMessage] = useState("Select a workspace to review transactions.");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addMenuPortalStyle, setAddMenuPortalStyle] = useState<React.CSSProperties | null>(null);
  const [selectionMenuOpen, setSelectionMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importSeedFiles, setImportSeedFiles] = useState<File[] | null>(null);
  const [importBackgroundOnly, setImportBackgroundOnly] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const selectedTransactionCount = selectedTransactionIds.length;
  const hasSelectedTransactions = selectedTransactionCount > 0;
  const [detailDraft, setDetailDraft] = useState<TransactionDetailDraft | null>(null);
  const [transactionDeleteConfirmOpen, setTransactionDeleteConfirmOpen] = useState(false);
  const [transactionSplitBillOpen, setTransactionSplitBillOpen] = useState(false);
  const [transactionSplitBillDraft, setTransactionSplitBillDraft] = useState<SplitBillTransactionLinkDraft>({
    groupId: "",
    participantNames: [],
  });
  const [transactionSplitBillSaving, setTransactionSplitBillSaving] = useState(false);
  const [transactionSplitBillError, setTransactionSplitBillError] = useState<string | null>(null);
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>("ltd");
  const [dateFilterAnchor, setDateFilterAnchor] = useState(todayIso);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [bulkEditForm, setBulkEditForm] = useState<BulkEditForm>(createEmptyBulkEditForm());
  const [manualForm, setManualForm] = useState<ManualTransactionForm>(createEmptyManualForm());
  const [isSaving, setIsSaving] = useState(false);
  const [planTier, setPlanTier] = useState<"free" | "pro" | "unknown">("unknown");
  const [planLimits, setPlanLimits] = useState<UserLimits | null>(null);
  const [planLimitNudge, setPlanLimitNudge] = useState<PlanLimitPayload | null>(null);
  const [isWorkspaceDataReady, setIsWorkspaceDataReady] = useState(false);
  const [transactionsLoadFailed, setTransactionsLoadFailed] = useState(false);
  const [, setHasInitialTransactionsLoaded] = useState(false);
  const [hasLoadedWorkspaceList, setHasLoadedWorkspaceList] = useState(false);
  const [workspaceCurrencyCodes, setWorkspaceCurrencyCodes] = useState<string[]>(() => ["PHP"]);
  const [undoStack, setUndoStack] = useState<TransactionHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<TransactionHistoryEntry[]>([]);
  const [isApplyingHistory, setIsApplyingHistory] = useState(false);
  const [merchantRenameSuggestion, setMerchantRenameSuggestion] = useState<MerchantRenameSuggestion | null>(null);
  const currencyCatalogCodes = useMemo(() => getCurrencyCatalogCodes(), []);
  const searchText = useMemo(() => normalizeTransactionSearch(query), [query]);

  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);
  const [merchantRenameBusy, setMerchantRenameBusy] = useState(false);
  const [manualCategoryTouched, setManualCategoryTouched] = useState(false);
  const [manualMoreOpen, setManualMoreOpen] = useState(false);
  const [manualAccountMenuOpen, setManualAccountMenuOpen] = useState(false);
  const [manualCategoryMenuOpen, setManualCategoryMenuOpen] = useState(false);
  const [mobileVisibleCount, setMobileVisibleCount] = useState(MOBILE_TRANSACTIONS_BATCH_SIZE);
  const [isMobileLoadingMore, setIsMobileLoadingMore] = useState(false);
  const transactionRowRefs = useRef(new Map<string, HTMLElement>());
  const warningPopoverRefs = useRef(new Map<string, HTMLDivElement | null>());
  const selectionActionsMenuRef = useRef<HTMLDivElement | null>(null);
  const transactionsLoadRequestRef = useRef(0);
  const transactionsHydrationVersionRef = useRef(new Map<string, number>());
  const mobileLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const [pendingImportSummary, setPendingImportSummary] = useState<UploadInsightsSummary | null>(null);
  const [importRefreshInFlight, setImportRefreshInFlight] = useState(false);
  const reviewTransactionParamRef = useRef<string | null>(null);
  const drilldownParamRef = useRef<string | null>(null);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [activeWarningTransactionId, setActiveWarningTransactionId] = useState<string | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState<TransactionSortField | null>(null);
  const [headerMenuPosition, setHeaderMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const headerMenuRef = useRef<HTMLDivElement | null>(null);
  const detailAutosaveTimerRef = useRef<number | null>(null);
  const manualModalStyle = useMemo<React.CSSProperties>(
    () => ({
      width: isCompactViewport ? "calc(100vw - 16px)" : "420px",
      maxHeight: isCompactViewport ? "calc(100dvh - 16px)" : "calc(100dvh - 24px)",
      overflow: "auto",
    }),
    [isCompactViewport]
  );

  const markTransactionsHydrated = useCallback((workspaceId: string, updatedAt?: number | null) => {
    if (!workspaceId || !updatedAt || !Number.isFinite(updatedAt)) {
      return;
    }

    transactionsHydrationVersionRef.current.set(workspaceId, updatedAt);
  }, []);

  const shouldHydrateTransactionsSnapshot = useCallback(
    (workspaceId: string) => {
      if (!workspaceId) {
        return false;
      }

      const cachedSnapshot = getCachedTransactionsWorkspace(workspaceId);
      if (!cachedSnapshot) {
        return true;
      }

      const previousVersion = transactionsHydrationVersionRef.current.get(workspaceId) ?? 0;
      return Number(cachedSnapshot.updatedAt ?? 0) > previousVersion;
    },
    []
  );

  useEffect(() => {
    document.body.classList.toggle("transactions-manual-open", manualOpen);

    return () => {
      document.body.classList.remove("transactions-manual-open");
    };
  }, [manualOpen]);

  const workspace = workspaces.find((entry) => entry.id === selectedWorkspaceId) ?? null;
  const workspaceTransactionCount = transactions.length;
  const otherCategoryId = useMemo(() => getOtherCategoryId(categories), [categories]);
  const accountInstitutionById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.institution ?? null] as const)),
    [accounts]
  );
  const accountNameById = useMemo(() => new Map(accounts.map((account) => [account.id, getAccountDisplayName(account)] as const)), [accounts]);
  const accountBrandById = useMemo(
    () => {
      const brandById = new Map(
        accounts.map(
          (account) =>
            [
              account.id,
              getAccountBrand({
                institution: account.institution ?? null,
                name: account.name,
                type: account.type,
              }),
            ] as const
        )
      );

      for (const transaction of transactions) {
        const accountDisplayName = accountNameById.get(transaction.accountId) ?? transaction.accountName;
        const transactionInstitution = transaction.institution ?? accountInstitutionById.get(transaction.accountId) ?? null;
        const transactionBrand = getAccountBrand({
          institution: transactionInstitution,
          name: accountDisplayName,
          type: inferAccountTypeFromStatement(transactionInstitution, accountDisplayName, "bank"),
        });
        const currentBrand = brandById.get(transaction.accountId);

        if (
          !currentBrand ||
          isGenericAccountBrand(currentBrand) ||
          (!currentBrand.logoSrc && transactionBrand.logoSrcs.length > 0) ||
          (currentBrand.logoSrcs.length === 0 && transactionBrand.logoSrcs.length > 0)
        ) {
          brandById.set(transaction.accountId, transactionBrand);
        }
      }

      return brandById;
    },
    [accounts, transactions, accountInstitutionById, accountNameById]
  );

  useEffect(() => {
    const sources = new Set<string>();
    for (const brand of accountBrandById.values()) {
      for (const source of [...brand.logoSrcs, brand.logoSrc, brand.fallbackIconSrc]) {
        if (source) {
          sources.add(source);
        }
      }
    }

    for (const source of sources) {
      const image = new Image();
      image.loading = "eager";
      image.fetchPriority = "high";
      image.decoding = "async";
      image.src = source;
    }
  }, [accountBrandById]);

  const accountKeyById = useMemo(
    () =>
      new Map(
        accounts.map((account) => [account.id, normalizeImportedAccountKey(account.name, account.institution, account.accountNumber, account.type)] as const)
      ),
    [accounts]
  );
  const manualSelectedAccount = useMemo(
    () => accounts.find((account) => account.id === manualForm.accountId) ?? null,
    [accounts, manualForm.accountId]
  );
  const manualSelectedCategoryId = manualForm.categoryId || otherCategoryId;
  const manualSelectedCategory = useMemo(
    () => categories.find((category) => category.id === manualSelectedCategoryId) ?? null,
    [categories, manualSelectedCategoryId]
  );
  const manualSelectedAccountBrand = useMemo(
    () =>
      accountBrandById.get(manualForm.accountId) ??
      getAccountBrand({
        institution: manualSelectedAccount?.institution ?? null,
        name: manualSelectedAccount?.name ?? "Cash",
        type: manualSelectedAccount?.type ?? "cash",
      }),
    [accountBrandById, manualForm.accountId, manualSelectedAccount]
  );
  const expandedAccountFilters = useMemo(() => {
    if (accountFilters.length === 0) {
      return accountFilters;
    }

    const selectedKeys = new Set(
      accountFilters.map((accountId) => accountKeyById.get(accountId)).filter((value): value is string => Boolean(value))
    );

    if (selectedKeys.size === 0) {
      return accountFilters;
    }

    return accounts
      .filter((account) => selectedKeys.has(normalizeImportedAccountKey(account.name, account.institution, account.accountNumber, account.type)))
      .map((account) => account.id);
  }, [accountFilters, accountKeyById, accounts]);
  const categoryNameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name] as const)),
    [categories]
  );

  const loadWorkspaces = async () => {
    try {
      const response = await fetchJsonOnce<{ workspaces?: Workspace[] }>({
        key: "transactions:workspaces",
        route: "transactions.workspaces",
        input: "/api/workspaces",
      });
      if (!response.ok) return;
      const items = Array.isArray(response.json?.workspaces) ? response.json.workspaces : [];
      setWorkspaces(items);
      setSelectedWorkspaceId((current) => {
        return chooseWorkspaceId(items, current);
      });
    } finally {
      setHasLoadedWorkspaceList(true);
    }
  };

  const loadWorkspaceMetadata = async (workspaceId: string, options?: { skipImports?: boolean; background?: boolean }) => {
    if (!workspaceId) {
      setAccounts([]);
      setCategories([]);
      setImports([]);
      return;
    }

    try {
      const [accountsResponse, categoriesResponse, importResponse] = await Promise.all([
        fetchJsonOnce<{ accounts?: Account[] }>({
          key: `transactions:accounts:${workspaceId}`,
          route: "transactions.accounts",
          workspaceId,
          detail: options?.background ? "background" : "foreground",
          input: `/api/accounts?workspaceId=${encodeURIComponent(workspaceId)}`,
        }),
        fetchJsonOnce<{ categories?: Category[] }>({
          key: `transactions:categories:${workspaceId}`,
          route: "transactions.categories",
          workspaceId,
          detail: options?.background ? "background" : "foreground",
          input: `/api/categories?workspaceId=${encodeURIComponent(workspaceId)}`,
        }),
        options?.skipImports
          ? Promise.resolve(null)
          : fetchJsonOnce<{ importFiles?: ImportFile[] }>({
              key: `transactions:imports:${workspaceId}`,
              route: "transactions.imports",
              workspaceId,
              detail: options?.background ? "background" : "foreground",
              input: `/api/imports?workspaceId=${encodeURIComponent(workspaceId)}`,
            }),
      ]);

      if (accountsResponse.ok) {
        const fetchedAccounts = Array.isArray(accountsResponse.json?.accounts) ? (accountsResponse.json.accounts as Account[]) : [];
        const cachedWorkspaceAccounts = getCachedTransactionsWorkspace(workspaceId)?.accounts as Account[] | undefined;
        setAccounts((current) =>
          mergeAccountsWithOptimisticImports(
            fetchedAccounts,
            current.length > 0 ? current : cachedWorkspaceAccounts ?? []
          )
        );
      }

      if (categoriesResponse.ok) {
        const payload = categoriesResponse.json;
        const cachedWorkspaceCategories = getCachedTransactionsWorkspace(workspaceId)?.categories as Category[] | undefined;
        const nextCategories =
          Array.isArray(payload?.categories) && payload.categories.length > 0 ? (payload.categories as Category[]) : cachedWorkspaceCategories ?? [];
        setCategories(nextCategories);
      } else {
        const cachedWorkspaceCategories = getCachedTransactionsWorkspace(workspaceId)?.categories as Category[] | undefined;
        setCategories((current) => (current.length > 0 ? current : cachedWorkspaceCategories ?? current));
      }

      if (importResponse && importResponse.ok) {
        setImports(Array.isArray(importResponse.json?.importFiles) ? importResponse.json.importFiles : []);
      }
    } catch {
      if (!options?.background) {
        setMessage("Unable to load workspace metadata.");
      }
    }
  };

  const loadTransactionsPage = async (
    workspaceId: string,
    options?: {
      background?: boolean;
      append?: boolean;
      includeAll?: boolean;
      pageOverride?: number;
      pageSizeOverride?: number;
      summaryMode?: "light" | "full";
    }
  ) => {
    const requestId = ++transactionsLoadRequestRef.current;

    if (!workspaceId) {
      setTransactions([]);
      setTransactionsLoadFailed(false);
      setTransactionsSummary({
        totalCount: 0,
        income: 0,
        spending: 0,
        transfers: 0,
        review: 0,
        currencyCodes: ["PHP"],
        topCategory: null,
        topAccount: null,
        firstTransactionDate: null,
        lastTransactionDate: null,
        firstReviewTransaction: null,
        firstReviewTransactionIndex: null,
      });
      setIsWorkspaceDataReady(true);
      setHasInitialTransactionsLoaded(true);
      return;
    }

    if (!options?.background) {
      setIsWorkspaceDataReady(false);
    }

    const compactViewport = typeof window !== "undefined" && window.matchMedia("(max-width: 1100px)").matches;

    const searchParams = buildTransactionQuerySearchParams(
      workspaceId,
      {
        query,
        currencyFilter,
        categoryIds: categoryFilters,
        accountIds: expandedAccountFilters,
        typeFilters,
        dateFilterMode,
        dateFilterAnchor,
        customStart,
        customEnd,
        sortField,
        sortDirection,
        amountMin,
        amountMax,
      },
      {
        page: options?.pageOverride ?? transactionsPage,
        pageSize:
          options?.includeAll
            ? "all"
            : options?.pageSizeOverride ?? (compactViewport ? MOBILE_TRANSACTIONS_BATCH_SIZE : transactionsPageSize),
      }
    );
    searchParams.set("summaryMode", options?.summaryMode ?? (options?.background ? "full" : "light"));

    try {
      const response = await fetchJsonOnce<{ transactions?: Transaction[]; totalCount?: number; summary?: TransactionPageMeta; currencyCodes?: string[] }>({
        key: `transactions:list:${workspaceId}:${searchParams.toString()}`,
        route: "transactions.list",
        workspaceId,
        detail: options?.background ? "background" : options?.append ? "append" : "foreground",
        input: `/api/transactions?${searchParams?.toString() ?? ""}`,
      });
      if (!response.ok) {
        throw new Error("Unable to load transactions.");
      }

      if (requestId !== transactionsLoadRequestRef.current) {
        return;
      }

      setTransactionsLoadFailed(false);
      const payload = response.json;
      const deletedAccountIds = new Set([
        ...getDeletedWorkspaceAccountIds(workspaceId),
        ...getDeletingWorkspaceAccountIds(workspaceId),
      ]);
      const fetchedTransactions = Array.isArray(payload?.transactions)
        ? payload.transactions.filter((transaction) => !deletedAccountIds.has(transaction.accountId))
        : [];
      const cachedWorkspaceTransactions = getCachedTransactionsWorkspace(workspaceId)?.transactions as Transaction[] | undefined;
      const visibleCachedWorkspaceTransactions = (cachedWorkspaceTransactions ?? []).filter(
        (transaction) => !deletedAccountIds.has(transaction.accountId)
      );
      const hasFreshTransactions = fetchedTransactions.length > 0;
      const stableBaseTransactions =
        transactionsRef.current.length > 0
          ? transactionsRef.current.filter((transaction) => !deletedAccountIds.has(transaction.accountId))
          : visibleCachedWorkspaceTransactions;
      const hasVisibleImportedBase = stableBaseTransactions.some(
        (transaction) => transaction.source === "upload" || Boolean(transaction.importFileId)
      );
      const baseTransactions =
        options?.append || !hasFreshTransactions || hasVisibleImportedBase
          ? stableBaseTransactions
          : [];
      const mergedTransactions = options?.append
        ? appendUniqueTransactions(baseTransactions, fetchedTransactions)
        : mergeImportedWorkspaceTransactions(baseTransactions, fetchedTransactions);
      const summaryPayload = payload?.summary && typeof payload.summary === "object" ? payload.summary : null;
      const responseCurrencyCodes = Array.isArray(payload?.currencyCodes)
        ? payload.currencyCodes.map((value: unknown) => formatCurrencyCode(String(value ?? ""))).filter(Boolean)
        : [];
      const workspaceCurrencyCodesFromData = getWorkspaceCurrencyCodes(
        mergedTransactions.length > 0 ? mergedTransactions : fetchedTransactions
      );
      const nextCurrencyCodes = responseCurrencyCodes.length > 0 ? responseCurrencyCodes : workspaceCurrencyCodesFromData;
      setWorkspaceCurrencyCodes(nextCurrencyCodes);
      setTransactions(mergedTransactions);
      if (options?.append) {
        setMobileVisibleCount((current) => current + fetchedTransactions.length);
      } else {
        setMobileVisibleCount(MOBILE_TRANSACTIONS_BATCH_SIZE);
      }
      if (options?.append) {
        setIsMobileLoadingMore(false);
      }
      const visibleSummaryFallback =
        mergedTransactions.length > 0 ? buildVisibleTransactionSummary(mergedTransactions, { totalCount: Math.max(Number(payload?.totalCount ?? 0), mergedTransactions.length), currencyCodes: nextCurrencyCodes }) : null;
      setTransactionsSummary(
        summaryPayload
          ? {
              totalCount:
                  typeof payload?.totalCount === "number"
                    ? Math.max(payload.totalCount, mergedTransactions.length)
                  : typeof summaryPayload.totalCount === "number"
                    ? Math.max(summaryPayload.totalCount, mergedTransactions.length)
                    : fetchedTransactions.length,
              income: typeof summaryPayload.income === "number" && summaryPayload.income !== 0 ? summaryPayload.income : visibleSummaryFallback?.income ?? 0,
              spending: typeof summaryPayload.spending === "number" && summaryPayload.spending !== 0 ? summaryPayload.spending : visibleSummaryFallback?.spending ?? 0,
              transfers: typeof summaryPayload.transfers === "number" && summaryPayload.transfers !== 0 ? summaryPayload.transfers : visibleSummaryFallback?.transfers ?? 0,
              review: typeof summaryPayload.review === "number" ? summaryPayload.review : 0,
              currencyCodes: nextCurrencyCodes,
              topCategory: Array.isArray(summaryPayload.topCategory) ? summaryPayload.topCategory : null,
              topAccount: Array.isArray(summaryPayload.topAccount) ? summaryPayload.topAccount : null,
              firstTransactionDate:
                typeof summaryPayload.firstTransactionDate === "string" ? summaryPayload.firstTransactionDate : null,
              lastTransactionDate:
                typeof summaryPayload.lastTransactionDate === "string" ? summaryPayload.lastTransactionDate : null,
              firstReviewTransaction:
                summaryPayload.firstReviewTransaction && typeof summaryPayload.firstReviewTransaction === "object"
                  ? (summaryPayload.firstReviewTransaction as Transaction)
                  : null,
              firstReviewTransactionIndex:
                typeof summaryPayload.firstReviewTransactionIndex === "number"
                  ? summaryPayload.firstReviewTransactionIndex
                  : null,
            }
          : {
              totalCount:
                typeof payload?.totalCount === "number"
                  ? Math.max(payload.totalCount, mergedTransactions.length)
                  : mergedTransactions.length,
              income: visibleSummaryFallback?.income ?? 0,
              spending: visibleSummaryFallback?.spending ?? 0,
              transfers: visibleSummaryFallback?.transfers ?? 0,
              review: 0,
              currencyCodes: nextCurrencyCodes,
              topCategory: null,
              topAccount: null,
              firstTransactionDate: null,
              lastTransactionDate: null,
              firstReviewTransaction: null,
              firstReviewTransactionIndex: null,
            }
      );

      if (!options?.background) {
        setIsWorkspaceDataReady(true);
        setHasInitialTransactionsLoaded(true);
      }

      if (!options?.append) {
        setIsMobileLoadingMore(false);
      }

      if (!options?.background && (options?.summaryMode ?? "light") === "light" && Number(payload?.totalCount ?? 0) > 0) {
        void loadTransactionsPage(workspaceId, {
          background: true,
          includeAll: options?.includeAll,
          pageOverride: options?.pageOverride ?? transactionsPage,
          pageSizeOverride: options?.pageSizeOverride ?? transactionsPageSize,
          summaryMode: "full",
        });
      }
    } catch {
      if (requestId !== transactionsLoadRequestRef.current) {
        return;
      }

      if (options?.append) {
        setIsMobileLoadingMore(false);
      }

      if (!options?.background) {
        setMessage("Unable to load transactions.");
        setTransactionsLoadFailed(true);
        setIsWorkspaceDataReady(true);
        setHasInitialTransactionsLoaded(true);
      }
    }
  };

  const hydrateWorkspaceFromCache = (workspaceId: string) => {
    if (!workspaceId) {
      return false;
    }

    const cachedSnapshot = getCachedTransactionsWorkspace(workspaceId);
    if (!cachedSnapshot) {
      return false;
    }

    const deletedAccountIds = new Set([
      ...getDeletedWorkspaceAccountIds(workspaceId),
      ...getDeletingWorkspaceAccountIds(workspaceId),
    ]);
    const filteredAccounts = (cachedSnapshot.accounts as Account[]).filter((account) => !deletedAccountIds.has(account.id));
    const filteredTransactions = (cachedSnapshot.transactions as Transaction[]).filter(
      (transaction) => !deletedAccountIds.has(transaction.accountId)
    );
    const dedupedCachedTransactions = mergeImportedWorkspaceTransactions([], filteredTransactions);
    setAccounts(filteredAccounts);
    setCategories(
      cachedSnapshot.categories.length > 0
        ? cachedSnapshot.categories
        : (deriveCachedCategoriesFromTransactions(dedupedCachedTransactions) as Category[])
    );
    setTransactions(dedupedCachedTransactions);
    setImports(cachedSnapshot.imports);
    const cachedCurrencyCodes =
      cachedSnapshot.summary?.currencyCodes ?? cachedSnapshot.currencyCodes ?? getWorkspaceCurrencyCodes(dedupedCachedTransactions);
    setTransactionsSummary(
      cachedSnapshot.summary
        ? {
            ...cachedSnapshot.summary,
            currencyCodes: cachedSnapshot.summary.currencyCodes ?? cachedCurrencyCodes,
          }
        : {
            totalCount: cachedSnapshot.totalCount ?? dedupedCachedTransactions.length,
            income: 0,
            spending: 0,
            transfers: 0,
            review: 0,
            currencyCodes: cachedCurrencyCodes,
            topCategory: null,
            topAccount: null,
            firstTransactionDate: null,
            lastTransactionDate: null,
            firstReviewTransaction: null,
            firstReviewTransactionIndex: null,
          }
    );
    setWorkspaceCurrencyCodes(cachedCurrencyCodes);
    markTransactionsHydrated(workspaceId, cachedSnapshot.updatedAt);
    setIsWorkspaceDataReady(true);
    setHasInitialTransactionsLoaded(true);
    return true;
  };

  useEffect(() => {
    void loadWorkspaces();
  }, []);

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

      setPlanTier(nextPlanTier);
      setPlanLimits(nextLimits);
    };

    void loadPlan();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    persistSelectedWorkspaceId(selectedWorkspaceId);
  }, [selectedWorkspaceId]);

  useLayoutEffect(() => {
    setSelectedTransactionIds([]);
    setSelectedTransaction(null);
    setDetailDraft(null);
    setUndoStack([]);
    setRedoStack([]);

    if (!selectedWorkspaceId) {
      setAccounts([]);
      setCategories([]);
      setTransactions([]);
      setImports([]);
      setTransactionsSummary({
        totalCount: 0,
        income: 0,
        spending: 0,
        transfers: 0,
        review: 0,
        currencyCodes: ["PHP"],
        topCategory: null,
        topAccount: null,
        firstTransactionDate: null,
        lastTransactionDate: null,
        firstReviewTransaction: null,
        firstReviewTransactionIndex: null,
      });
      setWorkspaceCurrencyCodes(["PHP"]);
      setIsWorkspaceDataReady(hasLoadedWorkspaceList);
      setHasInitialTransactionsLoaded(hasLoadedWorkspaceList);
      return;
    }

    if (hydrateWorkspaceFromCache(selectedWorkspaceId)) {
      void loadWorkspaceMetadata(selectedWorkspaceId, { skipImports: true, background: true });
      void loadTransactionsPage(selectedWorkspaceId, { background: true });
      return;
    }

    setAccounts([]);
    setCategories([]);
    setTransactions([]);
    setImports([]);
    setTransactionsSummary({
      totalCount: 0,
      income: 0,
      spending: 0,
      transfers: 0,
      review: 0,
      currencyCodes: ["PHP"],
      topCategory: null,
      topAccount: null,
      firstTransactionDate: null,
      lastTransactionDate: null,
      firstReviewTransaction: null,
      firstReviewTransactionIndex: null,
    });
    setWorkspaceCurrencyCodes(["PHP"]);
    setIsWorkspaceDataReady(false);
    setHasInitialTransactionsLoaded(false);
    void loadWorkspaceMetadata(selectedWorkspaceId, { skipImports: true });
  }, [hasLoadedWorkspaceList, selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedWorkspaceId || typeof window === "undefined") {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) {
        return;
      }

      if (
        event.key !== transactionsWorkspaceCacheKey &&
        event.key !== selectedWorkspaceKey
      ) {
        return;
      }

      const activeWorkspaceId = readSelectedWorkspaceId() || selectedWorkspaceId;
      if (!activeWorkspaceId || activeWorkspaceId !== selectedWorkspaceId) {
        return;
      }

      if (!hydrateWorkspaceFromCache(activeWorkspaceId) && shouldHydrateTransactionsSnapshot(activeWorkspaceId)) {
        setIsWorkspaceDataReady(false);
        void loadWorkspaceMetadata(activeWorkspaceId, { skipImports: true, background: true });
        void loadTransactionsPage(activeWorkspaceId, { background: true });
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [loadTransactionsPage, loadWorkspaceMetadata, selectedWorkspaceId, shouldHydrateTransactionsSnapshot]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      return;
    }

    void loadTransactionsPage(selectedWorkspaceId);
  }, [
    selectedWorkspaceId,
    currencyFilter,
    categoryFilters,
    accountFilters,
    typeFilters,
    dateFilterMode,
    dateFilterAnchor,
    customStart,
    customEnd,
    sortField,
    sortDirection,
    amountMin,
    amountMax,
    transactionsPage,
    transactionsPageSize,
  ]);

  useEffect(() => {
    setTransactionsPage(1);
  }, [
    query,
    currencyFilter,
    categoryFilters,
    accountFilters,
    typeFilters,
    dateFilterMode,
    dateFilterAnchor,
    customStart,
    customEnd,
    sortField,
    sortDirection,
    amountMin,
    amountMax,
    transactionsPageSize,
  ]);

  useEffect(() => {
    if (!addMenuOpen && !selectionMenuOpen && !activeWarningTransactionId && !headerMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (
        addMenuRef.current?.contains(target) ||
        addMenuPanelRef.current?.contains(target) ||
        selectionActionsMenuRef.current?.contains(target) ||
        headerMenuRef.current?.contains(target) ||
        (activeWarningTransactionId ? warningPopoverRefs.current.get(activeWarningTransactionId)?.contains(target) : false)
      ) {
        return;
      }

      setAddMenuOpen(false);
      setSelectionMenuOpen(false);
      setActiveWarningTransactionId(null);
      setHeaderMenuOpen(null);
      setHeaderMenuPosition(null);
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setAddMenuOpen(false);
        setSelectionMenuOpen(false);
        setActiveWarningTransactionId(null);
        setHeaderMenuOpen(null);
        setHeaderMenuPosition(null);
        setImportOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeWarningTransactionId, addMenuOpen, headerMenuOpen, selectionMenuOpen]);

  useLayoutEffect(() => {
    if (!addMenuOpen) {
      setAddMenuPortalStyle(null);
      return;
    }

    const updateAddMenuPosition = () => {
      const trigger = addMenuRef.current;
      if (!trigger || typeof window === "undefined") {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = 196;
      const left = Math.max(12, Math.min(rect.right - width, viewportWidth - width - 12));
      const top = Math.min(rect.bottom + 8, viewportHeight - 16);

      setAddMenuPortalStyle({
        position: "fixed",
        top,
        left,
        width,
        zIndex: 140,
      });
    };

    updateAddMenuPosition();
    window.addEventListener("resize", updateAddMenuPosition);
    window.addEventListener("scroll", updateAddMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateAddMenuPosition);
      window.removeEventListener("scroll", updateAddMenuPosition, true);
    };
  }, [addMenuOpen]);

  useEffect(() => {
    if (manualOpen) {
      manualNameInputRef.current?.focus();
      setManualAccountMenuOpen(false);
      setManualCategoryMenuOpen(false);
    }
  }, [manualOpen]);

  useEffect(() => {
    const reviewTransactionId = urlSearchParams.get("review");
    if (!reviewTransactionId || !isWorkspaceDataReady || !transactions.length) {
      return;
    }

    if (reviewTransactionParamRef.current === reviewTransactionId) {
      return;
    }

    const reviewTransaction = transactions.find((transaction) => transaction.id === reviewTransactionId);
    if (!reviewTransaction) {
      return;
    }

    reviewTransactionParamRef.current = reviewTransactionId;
    openTransactionReview(reviewTransaction);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("review");
    window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  }, [isWorkspaceDataReady, searchParams, transactions, urlSearchParams]);

  const closeToolbarMenus = () => {
    setAddMenuOpen(false);
    setSelectionMenuOpen(false);
    setHeaderMenuOpen(null);
    setHeaderMenuPosition(null);
  };

  const openAddMenu = () => {
    flushSync(() => {
      setSelectionMenuOpen(false);
      setHeaderMenuOpen(null);
      setHeaderMenuPosition(null);
      setAddMenuOpen((current) => !current);
    });
  };

  const openImportFiles = (files: File[] | null = null, backgroundOnly = false) => {
    const shouldLaunchInBackground = backgroundOnly && !(files?.some(isImageImportFile) ?? false);
    flushSync(() => {
      closeChrome();
      setPendingImportSummary(null);
      closeToolbarMenus();
      setImportBackgroundOnly(shouldLaunchInBackground);
      setImportSeedFiles(files && files.length > 0 ? files : null);
      setImportOpen(true);
    });
  };

  useEffect(() => {
    const active = manualOpen;
    document.body.toggleAttribute("data-clover-page-modal", active);

    return () => {
      document.body.removeAttribute("data-clover-page-modal");
    };
  }, [addMenuOpen, manualOpen]);

  useEffect(() => {
    if (urlSearchParams.get("import") === "1") {
      setImportOpen(true);
      window.history.replaceState({}, "", "/transactions");
    }
  }, [urlSearchParams]);

  useEffect(() => {
    if (urlSearchParams.get("manual") === "1") {
      setManualOpen(true);
      window.history.replaceState({}, "", "/transactions");
    }
  }, [urlSearchParams]);

  useEffect(() => {
    const handleOpenManual = () => {
      void openManualAdd();
    };

    window.addEventListener("clover:open-transaction-add", handleOpenManual);
    return () => {
      window.removeEventListener("clover:open-transaction-add", handleOpenManual);
    };
  }, []);

  useEffect(() => {
    if (!isWorkspaceDataReady) {
      return;
    }

    const drilldownSignature = [
      urlSearchParams.get("q") ?? "",
      urlSearchParams.get("month") ?? "",
      urlSearchParams.get("category") ?? "",
      urlSearchParams.get("account") ?? "",
      urlSearchParams.get("currency") ?? "",
    ].join("|");

    if (drilldownParamRef.current === drilldownSignature) {
      return;
    }

    const q = urlSearchParams.get("q") ?? "";
    const month = urlSearchParams.get("month") ?? "";
    const categoriesFromUrl = readSearchParamValues(urlSearchParams, "category");
    const accountsFromUrl = readSearchParamValues(urlSearchParams, "account");
    const currencyFromUrl = urlSearchParams.get("currency") ?? "";

    const hasDrilldownParams = Boolean(q || month || categoriesFromUrl.length > 0 || accountsFromUrl.length > 0 || currencyFromUrl);

    if (!hasDrilldownParams) {
      if (drilldownParamRef.current === drilldownSignature) {
        return;
      }

      drilldownParamRef.current = drilldownSignature;
      setQuery("");
      setCurrencyFilter("");
      setCategoryFilters([]);
      setAccountFilters([]);
      setTypeFilters([]);
      setDateFilterMode("ltd");
      setDateFilterAnchor(todayIso);
      setCustomStart("");
      setCustomEnd("");
      setFilterOpen(false);
      setHeaderMenuOpen(null);
      setHeaderMenuPosition(null);
      return;
    }

    drilldownParamRef.current = drilldownSignature;

    const nextCategoryFilters = categoriesFromUrl
      .map((value) => findMatchingId(value, categories))
      .filter(Boolean);
    const nextAccountFilters = accountsFromUrl
      .map((value) => findMatchingId(value, accounts))
      .filter(Boolean);

    setQuery(q);
    setCurrencyFilter(currencyFromUrl ? formatCurrencyCode(currencyFromUrl) : "");
    setCategoryFilters(nextCategoryFilters);
    setAccountFilters(nextAccountFilters);
    setTypeFilters([]);
    setDateFilterMode(month ? "month" : "ltd");
    setDateFilterAnchor(month ? `${month}-01` : todayIso);
    setCustomStart("");
    setCustomEnd("");
    setFilterOpen(false);
    setHeaderMenuOpen(null);
    setHeaderMenuPosition(null);
  }, [accounts, categories, isWorkspaceDataReady, searchParams]);

  const ensureDefaultAccount = async (workspaceId: string) => {
    const cashAccount = accounts.find((account) => account.type === "cash" || account.name.trim().toLowerCase() === "cash");
    if (cashAccount) {
      return cashAccount.id;
    }

    const response = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        name: "Cash",
        institution: "Cash",
        type: "cash",
        currency: "PHP",
        source: "manual",
      }),
    });

    if (!response.ok) {
      throw new Error("Unable to create a default account for this workspace.");
    }

    const data = await response.json();
    const accountId = data.account?.id as string | undefined;

    if (!accountId) {
      throw new Error("Default account was not created.");
    }

    setAccounts([data.account]);
    return accountId;
  };
  const visibleTransactions = useMemo(() => {
    const filteredTransactions = transactions.filter(
      (transaction) =>
        !transaction.isExcluded &&
        matchesTransactionSearch(transaction, searchText) &&
        matchesTransactionFilters(transaction, {
          currencyFilter,
          categoryFilters,
          accountFilters: expandedAccountFilters,
          typeFilters,
          dateFilterMode,
          dateFilterAnchor,
          customStart,
          customEnd,
          amountMin,
          amountMax,
          otherCategoryId,
        })
    );
    const directionMultiplier = sortDirection === "asc" ? 1 : -1;

    const getTransactionSortValue = (transaction: Transaction, field: TransactionSortField) => {
      switch (field) {
        case "name":
          return summarizeTransactionMerchantText(
            transaction.merchantClean ?? transaction.merchantRaw,
            accountInstitutionById.get(transaction.accountId) ?? null
          );
        case "account":
          return accountNameById.get(transaction.accountId) ?? transaction.accountName;
        case "category": {
          const categoryValue = transaction.categoryId ?? otherCategoryId;
          const categoryLabel =
            getEffectiveTransactionCategoryName({
              categoryName: transaction.categoryName ?? categories.find((category) => category.id === categoryValue)?.name ?? null,
              rawPayload: transaction.rawPayload as never,
              merchantRaw: transaction.merchantRaw,
              merchantClean: transaction.merchantClean,
              institution: accountInstitutionById.get(transaction.accountId) ?? null,
              source: transaction.source ?? null,
              type: transaction.type,
            }) ??
            guessCategoryName(transaction.merchantClean ?? transaction.merchantRaw, transaction.type) ??
            "Other";
          return (
            categoryLabel
          );
        }
        case "amount":
          return Number(transaction.amount);
        case "date":
        default:
          return new Date(transaction.date).getTime();
      }
    };

    return [...filteredTransactions].sort((left, right) => {
      const leftValue = getTransactionSortValue(left, sortField);
      const rightValue = getTransactionSortValue(right, sortField);

      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return (leftValue - rightValue) * directionMultiplier;
      }

      return (
        String(leftValue).localeCompare(String(rightValue), undefined, { sensitivity: "base", numeric: true }) *
        directionMultiplier
      );
    });
  }, [
    accountInstitutionById,
    accountNameById,
    categories,
    currencyFilter,
    categoryFilters,
    expandedAccountFilters,
    typeFilters,
    dateFilterMode,
    dateFilterAnchor,
    customStart,
    customEnd,
    amountMin,
    amountMax,
    otherCategoryId,
    searchText,
    sortDirection,
    sortField,
    transactions,
  ]);
  const totalTransactionCountForDisplay = searchText ? visibleTransactions.length : transactionsSummary.totalCount;
  const activeFinalizingImportIds = useMemo(
    () => new Set(imports.filter(isActiveEnrichmentJob).map((importFile) => importFile.id)),
    [imports]
  );
  const failedFinalizingImportIds = useMemo(
    () => new Set(imports.filter(isFailedEnrichmentJob).map((importFile) => importFile.id)),
    [imports]
  );
  const [finalizingNowMs, setFinalizingNowMs] = useState(() => Date.now());
  const hasActiveFinalizingImports = activeFinalizingImportIds.size > 0;
  useEffect(() => {
    if (!hasActiveFinalizingImports) {
      return;
    }

    setFinalizingNowMs(Date.now());
    const intervalId = window.setInterval(() => setFinalizingNowMs(Date.now()), 30_000);
    return () => window.clearInterval(intervalId);
  }, [hasActiveFinalizingImports]);
  const finalizingNoticeState = useMemo(() => getEnrichmentNoticeState(imports, finalizingNowMs), [finalizingNowMs, imports]);
  const finalizingTransactions = useMemo(
    () =>
      visibleTransactions.filter(
        (transaction) => {
          if (!transaction.importFileId) {
            return false;
          }

          if (activeFinalizingImportIds.has(transaction.importFileId)) {
            return true;
          }

          return failedFinalizingImportIds.has(transaction.importFileId) && isImportFinalizingTransaction(transaction);
        }
      ),
    [activeFinalizingImportIds, failedFinalizingImportIds, visibleTransactions]
  );
  const finalizingTransactionCount = finalizingTransactions.length;
  const [finalizingNoticeDismissed, setFinalizingNoticeDismissed] = useState(false);
  const finalizingNeedsReview = finalizingNoticeState.needsReview;
  const finalizingNoticeDismissalKey = useMemo(
    () =>
      finalizingNeedsReview && finalizingTransactionCount > 0
        ? buildFinalizingNoticeDismissalKey({
            workspaceId: selectedWorkspaceId,
            importFileIds: finalizingTransactions.map((transaction) => transaction.importFileId ?? ""),
            transactionIds: finalizingTransactions.map((transaction) => transaction.id),
          })
        : null,
    [finalizingNeedsReview, finalizingTransactionCount, finalizingTransactions, selectedWorkspaceId]
  );
  useEffect(() => {
    setFinalizingNoticeDismissed(isFinalizingNoticeDismissed(finalizingNoticeDismissalKey));
  }, [finalizingNoticeDismissalKey]);
  useEffect(() => {
    if (visibleTransactions.length === 0) {
      return;
    }

    const currentActivity = readImportActivity();
    if (currentActivity?.status !== "active") {
      return;
    }
    const importBatchStillRunning =
      Number(currentActivity.fileTotal ?? 0) > 0 &&
      Number(currentActivity.completedFiles ?? 0) < Number(currentActivity.fileTotal ?? 0);
    if (importBatchStillRunning) {
      return;
    }

    const hasVisibleImportedTransactions = visibleTransactions.some(
      (transaction) => transaction.source === "upload" || Boolean(transaction.importFileId)
    );
    if ((finalizingNeedsReview && finalizingTransactionCount > 0) || hasVisibleImportedTransactions) {
      clearImportActivity();
    }
  }, [finalizingNeedsReview, finalizingTransactionCount, visibleTransactions]);
  const showFinalizingNotice = finalizingTransactionCount > 0 && !finalizingNoticeDismissed;
  const dismissFinalizingStatusNotice = () => {
    if (finalizingNeedsReview) {
      dismissFinalizingNotice(finalizingNoticeDismissalKey);
    }

    setFinalizingNoticeDismissed(true);
  };
  const totalTransactionPages = Math.max(1, Math.ceil(totalTransactionCountForDisplay / Math.max(transactionsPageSize, 1)));
  const currentTransactionPage = Math.min(transactionsPage, totalTransactionPages);
  const pageStartIndex = (currentTransactionPage - 1) * transactionsPageSize;
  const pageEndIndex = pageStartIndex + transactionsPageSize;
  const desktopPageTransactions = useMemo(
    () => visibleTransactions.slice(pageStartIndex, pageEndIndex),
    [pageEndIndex, pageStartIndex, visibleTransactions]
  );
  const mobileVisibleTransactions = useMemo(
    () => visibleTransactions.slice(0, Math.max(mobileVisibleCount, MOBILE_TRANSACTIONS_BATCH_SIZE)),
    [mobileVisibleCount, visibleTransactions]
  );
  const mobileTransactionGroups = useMemo(() => {
    const groups: Array<{ date: string; label: string; transactions: Transaction[] }> = [];

    for (const transaction of mobileVisibleTransactions) {
      const dateKey = transaction.date.slice(0, 10);
      const label = formatDate(dateKey);
      const lastGroup = groups[groups.length - 1];

      if (!lastGroup || lastGroup.date !== dateKey) {
        groups.push({ date: dateKey, label, transactions: [transaction] });
      } else {
        lastGroup.transactions.push(transaction);
      }
    }

    return groups;
  }, [mobileVisibleTransactions]);
  const hasVisibleTransactions = visibleTransactions.length > 0;
  const desktopPageTransactionIds = useMemo(
    () => desktopPageTransactions.map((transaction) => transaction.id),
    [desktopPageTransactions]
  );
  const allVisibleSelected =
    desktopPageTransactionIds.length > 0 &&
    desktopPageTransactionIds.every((transactionId) => selectedTransactionIds.includes(transactionId));
  const someVisibleSelected = desktopPageTransactionIds.some((transactionId) => selectedTransactionIds.includes(transactionId));
  const hasMoreMobileTransactions =
    isCompactViewport &&
    !searchText &&
    (mobileVisibleTransactions.length < visibleTransactions.length || transactions.length < transactionsSummary.totalCount);

  const currentPageLabel = useMemo(() => {
    if (totalTransactionCountForDisplay === 0) {
      return "0 of 0";
    }

    return `${pageStartIndex + 1}-${Math.min(pageEndIndex, totalTransactionCountForDisplay)} of ${totalTransactionCountForDisplay}`;
  }, [pageEndIndex, pageStartIndex, totalTransactionCountForDisplay]);

  const paginationPages = useMemo(() => {
    if (totalTransactionPages <= 1) {
      return [1];
    }

    const candidatePages = new Set<number>([
      1,
      totalTransactionPages,
      Math.max(1, currentTransactionPage - 1),
      currentTransactionPage,
      Math.min(totalTransactionPages, currentTransactionPage + 1),
    ]);

    const sortedPages = Array.from(candidatePages)
      .filter((page) => page >= 1 && page <= totalTransactionPages)
      .sort((a, b) => a - b);

    return sortedPages.reduce<Array<number | "ellipsis">>((pages, page) => {
      const previous = pages[pages.length - 1];
      if (typeof previous === "number" && page - previous > 1) {
        pages.push("ellipsis");
      }
      pages.push(page);
      return pages;
    }, []);
  }, [currentTransactionPage, totalTransactionPages]);

  const loadMoreMobileTransactions = useCallback(async () => {
    if (!isCompactViewport || !hasMoreMobileTransactions) {
      return;
    }

    if (mobileVisibleCount < visibleTransactions.length) {
      setMobileVisibleCount((current) => Math.min(current + MOBILE_TRANSACTIONS_BATCH_SIZE, visibleTransactions.length));
      return;
    }

    if (isMobileLoadingMore || !selectedWorkspaceId || transactions.length >= transactionsSummary.totalCount) {
      return;
    }

    const nextPage = Math.max(1, Math.ceil(transactions.length / MOBILE_TRANSACTIONS_BATCH_SIZE)) + 1;
    setIsMobileLoadingMore(true);
    try {
      await loadTransactionsPage(selectedWorkspaceId, {
        background: true,
        append: true,
        pageOverride: nextPage,
        pageSizeOverride: MOBILE_TRANSACTIONS_BATCH_SIZE,
        summaryMode: "light",
      });
    } finally {
      setIsMobileLoadingMore(false);
    }
  }, [
    hasMoreMobileTransactions,
    isCompactViewport,
    isMobileLoadingMore,
    loadTransactionsPage,
    mobileVisibleCount,
    transactions.length,
    transactionsSummary.totalCount,
    visibleTransactions.length,
    selectedWorkspaceId,
  ]);

  useEffect(() => {
    if (!isCompactViewport) {
      setIsMobileLoadingMore(false);
      return;
    }

    const target = mobileLoadMoreRef.current;
    if (!target || !hasMoreMobileTransactions) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMoreMobileTransactions();
        }
      },
      {
        root: null,
        rootMargin: "320px 0px",
        threshold: 0.1,
      }
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [hasMoreMobileTransactions, isCompactViewport, loadMoreMobileTransactions]);

  useEffect(() => {
    if (!isCompactViewport) {
      return;
    }

    let rafId = 0;
    const checkScrollPosition = () => {
      if (rafId) {
        return;
      }

      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        const doc = document.documentElement;
        const distanceFromBottom = doc.scrollHeight - window.innerHeight - window.scrollY;

        if (distanceFromBottom < 900) {
          void loadMoreMobileTransactions();
        }
      });
    };

    window.addEventListener("scroll", checkScrollPosition, { passive: true });
    window.addEventListener("resize", checkScrollPosition);
    checkScrollPosition();

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("scroll", checkScrollPosition);
      window.removeEventListener("resize", checkScrollPosition);
    };
  }, [isCompactViewport, loadMoreMobileTransactions]);

  useEffect(() => {
    if (!selectAllRef.current) {
      return;
    }

    selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [allVisibleSelected, someVisibleSelected]);

  useEffect(() => {
    setTransactionsPage(1);
  }, [
    selectedWorkspaceId,
    query,
    currencyFilter,
    categoryFilters,
    accountFilters,
    typeFilters,
    dateFilterMode,
    dateFilterAnchor,
    customStart,
    customEnd,
    sortField,
    sortDirection,
    amountMin,
    amountMax,
    transactionsPageSize,
  ]);

  useEffect(() => {
    setTransactionsPage((current) => Math.min(Math.max(current, 1), totalTransactionPages));
  }, [totalTransactionPages]);

  const importSummary = useMemo(() => {
    return imports.reduce(
      (accumulator, file) => {
        if (file.status === "processing") {
          accumulator.processing += 1;
        } else if (file.status === "done") {
          accumulator.done += 1;
        } else if (file.status === "failed") {
          accumulator.failed += 1;
        }
        return accumulator;
      },
      { processing: 0, done: 0, failed: 0 }
    );
  }, [imports]);

  const warningReasonFor = (transaction: Transaction) => {
    const normalizedCategoryName = (transaction.categoryName ?? "").trim().toLowerCase();
    if (normalizedCategoryName === "other" || normalizedCategoryName === "needs category review") {
      return null;
    }

    if (transaction.isExcluded) {
      return null;
    }

    if (transaction.warningReason) {
      if (transaction.warningReason === "Possible duplicate") {
        return "Review similar transaction";
      }

      if (transaction.warningReason === "Needs category review") {
        return null;
      }

      return transaction.warningReason;
    }

    if (isResolvedReviewStatus(transaction.reviewStatus)) {
      return null;
    }

  return null;
  };

  const isDuplicateWarningTransaction = (transaction: Transaction) => transaction.warningReason === "Possible duplicate";

  const detailWarningReasonFor = (transaction: Transaction) => {
    return warningReasonFor(transaction);
  };

  const isReviewableTransaction = (transaction: Transaction) => {
    return Boolean(warningReasonFor(transaction));
  };

  const firstReviewTransaction = useMemo(
    () => transactionsSummary.firstReviewTransaction ?? transactions.find((transaction) => isReviewableTransaction(transaction)) ?? null,
    [transactions, transactionsSummary.firstReviewTransaction]
  );

  const selectedTransactionWarningReason = selectedTransaction ? detailWarningReasonFor(selectedTransaction) : null;
  const detailTransactionSummary = useMemo(() => {
    if (!selectedTransaction) {
      return "";
    }

    return summarizeTransactionMerchantText(
      detailDraft?.merchantClean ?? selectedTransaction.merchantClean ?? selectedTransaction.merchantRaw,
      accountInstitutionById.get(selectedTransaction.accountId) ?? null
    );
  }, [accountInstitutionById, detailDraft?.merchantClean, selectedTransaction]);
  const detailTransactionRawName = selectedTransaction?.merchantRaw.trim() ?? "";
  const hasDistinctDetailRawName = Boolean(
    detailTransactionRawName &&
      detailTransactionSummary &&
      detailTransactionRawName.toLowerCase() !== detailTransactionSummary.toLowerCase()
  );
  const hasDetailDraftChanges = useMemo(() => {
    if (!selectedTransaction || !detailDraft) {
      return false;
    }

    return (
      (detailDraft.merchantClean.trim() || "") !== (selectedTransaction.merchantClean ?? selectedTransaction.merchantRaw).trim() ||
      detailDraft.date !== selectedTransaction.date.slice(0, 10) ||
      detailDraft.accountId !== selectedTransaction.accountId ||
      (detailDraft.categoryId || otherCategoryId) !== (selectedTransaction.categoryId ?? otherCategoryId) ||
      detailDraft.amount !== selectedTransaction.amount ||
      detailDraft.type !== (selectedTransaction.type === "income" ? "credit" : "debit") ||
      normalizeTransactionNotes(detailDraft.description) !== normalizeTransactionNotes(selectedTransaction.description ?? "") ||
      detailDraft.isExcluded !== selectedTransaction.isExcluded ||
      detailDraft.isTransfer !== selectedTransaction.isTransfer
    );
  }, [detailDraft, otherCategoryId, selectedTransaction]);

  useEffect(() => {
    if (detailAutosaveTimerRef.current) {
      window.clearTimeout(detailAutosaveTimerRef.current);
      detailAutosaveTimerRef.current = null;
    }

    if (!selectedTransaction || !detailDraft || !hasDetailDraftChanges || isSaving || isApplyingHistory) {
      return;
    }

    detailAutosaveTimerRef.current = window.setTimeout(() => {
      detailAutosaveTimerRef.current = null;
      void persistDetailDraft({ closeAfterSave: false });
    }, 500);

    return () => {
      if (detailAutosaveTimerRef.current) {
        window.clearTimeout(detailAutosaveTimerRef.current);
        detailAutosaveTimerRef.current = null;
      }
    };
  }, [detailDraft, hasDetailDraftChanges, isApplyingHistory, isSaving, selectedTransaction]);

  useEffect(() => {
    if (!activeWarningTransactionId || !isWorkspaceDataReady) {
      return;
    }

    const row = transactionRowRefs.current.get(activeWarningTransactionId);
    if (!row) {
      return;
    }

    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.focus();
  }, [activeWarningTransactionId, isWorkspaceDataReady, transactions, transactionsPage]);
  const detailSelectedAccount = useMemo(
    () => (detailDraft ? accounts.find((account) => account.id === detailDraft.accountId) ?? null : null),
    [accounts, detailDraft]
  );
  const detailSelectedAccountBrand = useMemo(
    () =>
      detailSelectedAccount
        ? getAccountBrand({
            name: detailSelectedAccount.name,
            institution: detailSelectedAccount.institution,
            type: detailSelectedAccount.type,
          })
        : null,
    [detailSelectedAccount]
  );
  const detailSelectedCategory = useMemo(
    () => categories.find((category) => category.id === (detailDraft?.categoryId ?? otherCategoryId)) ?? null,
    [categories, detailDraft?.categoryId, otherCategoryId]
  );
  const selectedTransactionReceiptLineItems = useMemo(
    () => parseReceiptLineItemsFromPayload(selectedTransaction?.rawPayload),
    [selectedTransaction?.rawPayload]
  );
  const manualReceiptLineItemTotal = useMemo(
    () => getManualReceiptLineItemTotal(manualForm.receiptLineItems),
    [manualForm.receiptLineItems]
  );
  const manualReceiptLineItemHasValues = manualForm.receiptLineItems.some(
    (item) => item.description.trim() || item.amount.trim() || item.quantity.trim() || item.unitPrice.trim()
  );
  const manualReceiptLineItemAmount = Number(manualForm.amount || 0);
  const manualReceiptLineItemMismatch =
    manualReceiptLineItemHasValues && Number.isFinite(manualReceiptLineItemAmount)
      ? Math.abs(manualReceiptLineItemTotal - manualReceiptLineItemAmount) > 0.01
      : false;

  const nextReviewTransactionAfter = (transactionId: string) => {
    const startIndex = visibleTransactions.findIndex((transaction) => transaction.id === transactionId);
    const start = startIndex >= 0 ? startIndex + 1 : 0;
    const ordered = [...visibleTransactions.slice(start), ...visibleTransactions.slice(0, start)];
    return ordered.find((transaction) => isReviewableTransaction(transaction)) ?? null;
  };

  const focusTransactionRow = (transactionId: string | null | undefined) => {
    if (!transactionId) {
      return;
    }

    const row = transactionRowRefs.current.get(transactionId);
    row?.focus();
  };

  const handleTransactionRowKeyDown = (event: ReactKeyboardEvent<HTMLElement>, transaction: Transaction, index: number) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusTransactionRow(desktopPageTransactions[index + 1]?.id);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusTransactionRow(desktopPageTransactions[index - 1]?.id);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      openTransactionDetail(transaction);
      return;
    }

    if (event.key === " ") {
      event.preventDefault();
      toggleSelectedTransaction(transaction.id, !selectedTransactionIds.includes(transaction.id));
    }
  };

  const openTransactionDetail = (transaction: Transaction) => {
    setActiveWarningTransactionId(null);
    setSelectedTransaction(transaction);
    setTransactionDeleteConfirmOpen(false);
    setTransactionSplitBillOpen(false);
    setTransactionSplitBillDraft({
      groupId: "",
      participantNames: [],
    });
    setTransactionSplitBillSaving(false);
    setDetailDraft({
      ...createDetailDraft(transaction),
      categoryId: transaction.categoryId ?? otherCategoryId,
    });
  };

  const openTransactionReview = (transaction: Transaction, transactionIndex?: number | null) => {
    const revealWarning = () => {
      setActiveWarningTransactionId(transaction.id);
      setTransactionDeleteConfirmOpen(false);

      const warningReason = warningReasonFor(transaction);
      if (warningReason) {
        capturePostHogClientEventOnce(
          "review_item_opened",
          {
            workspace_id: selectedWorkspaceId || null,
            transaction_id: transaction.id,
            review_reason: warningReason,
            review_status: transaction.reviewStatus ?? null,
          },
          analyticsOnceKey("review_item_opened", `transaction:${transaction.id}`)
        );
      }
    };

    if (typeof transactionIndex === "number" && transactionIndex >= 0) {
      setTransactionsPage(Math.max(1, Math.ceil((transactionIndex + 1) / Math.max(transactionsPageSize, 1))));
    }

    revealWarning();
  };

  const resolveTransactionWarning = (
    transaction: Transaction,
    patch: Pick<Transaction, "isExcluded" | "isTransfer" | "reviewStatus">,
    successMessage: string,
    outcome: "accepted" | "rejected"
  ) => {
    const nextReviewTransaction = nextReviewTransactionAfter(transaction.id);

    capturePostHogClientEvent(
      outcome === "accepted" ? "review_item_accepted" : "review_item_rejected",
      {
        workspace_id: selectedWorkspaceId || null,
        transaction_id: transaction.id,
        transaction_amount: Number(transaction.amount),
        transaction_currency: transaction.currency,
        transaction_account: transaction.accountName,
        transaction_category: transaction.categoryName ?? "Uncategorized",
        merchant_raw: transaction.merchantRaw,
        merchant_clean: transaction.merchantClean ?? transaction.merchantRaw,
        review_reason: warningReasonFor(transaction),
        review_status: patch.reviewStatus,
        is_excluded: patch.isExcluded,
        is_transfer: patch.isTransfer,
      }
    );

    if (isDuplicateWarningTransaction(transaction) && outcome === "rejected") {
      capturePostHogClientEvent("transaction_split", {
        workspace_id: selectedWorkspaceId || null,
        transaction_id: transaction.id,
        split_reason: "duplicate_review",
        transaction_amount: Number(transaction.amount),
        transaction_account: transaction.accountName,
      });
    }

    applyTransactionPatchLocally(transaction.id, patch);
    setMessage(successMessage);

    void updateTransaction(
      transaction.id,
      {
        isExcluded: patch.isExcluded,
        isTransfer: patch.isTransfer,
        reviewStatus: patch.reviewStatus,
      },
      { recordHistory: false }
    ).catch((error) => {
      applyTransactionPatchLocally(transaction.id, {
        isExcluded: transaction.isExcluded,
        isTransfer: transaction.isTransfer,
        reviewStatus: transaction.reviewStatus,
      });
      setMessage(error instanceof Error ? error.message : "Unable to update transaction.");
    });

    setActiveWarningTransactionId(null);
    if (nextReviewTransaction) {
      window.requestAnimationFrame(() => {
        openTransactionReview(nextReviewTransaction);
      });
      return;
    }

    closeTransactionDetail();
  };

  const closeTransactionDetail = () => {
    if (detailAutosaveTimerRef.current) {
      window.clearTimeout(detailAutosaveTimerRef.current);
      detailAutosaveTimerRef.current = null;
    }

    if (selectedTransaction && detailDraft && hasDetailDraftChanges && !isSaving && !isApplyingHistory) {
      void persistDetailDraft({ closeAfterSave: true });
      return;
    }

    setSelectedTransaction(null);
    setDetailDraft(null);
    setTransactionDeleteConfirmOpen(false);
    setTransactionSplitBillOpen(false);
    setTransactionSplitBillDraft({
      groupId: "",
      participantNames: [],
    });
    setTransactionSplitBillSaving(false);
    setTransactionSplitBillError(null);
    setActiveWarningTransactionId(null);
  };

  const createTransactionSplitBill = async () => {
    if (!selectedTransaction) {
      return;
    }

    const transactionTitle = (detailDraft?.merchantClean ?? selectedTransaction.merchantClean ?? selectedTransaction.merchantRaw).trim();
    const transactionAmount = detailDraft?.amount ?? selectedTransaction.amount;
    const transactionCurrency = detailDraft?.currency ?? selectedTransaction.currency;
    const transactionDate = detailDraft?.date ?? selectedTransaction.date.slice(0, 10);

    setTransactionSplitBillSaving(true);
    try {
      const createdBill = (await createSplitBillFromTransaction({
        workspaceId: selectedTransaction.workspaceId,
        transactionId: selectedTransaction.id,
        transactionTitle: transactionTitle || "Split Bill",
        billDate: transactionDate,
        currency: transactionCurrency,
        amount: transactionAmount,
        draft: transactionSplitBillDraft,
      })) as { id: string; title: string } | null;

      setTransactionSplitBillOpen(false);
      setTransactionSplitBillDraft({
        groupId: "",
        participantNames: [],
      });
      setTransactionSplitBillError(null);
      if (createdBill) {
        setSelectedTransaction((current) => (current ? { ...current, splitBill: createdBill } : current));
      }
      router.refresh();
    } catch (error) {
      setTransactionSplitBillError(error instanceof Error ? error.message : "Unable to create split bill.");
    } finally {
      setTransactionSplitBillSaving(false);
    }
  };

  const toggleSelectedTransaction = (transactionId: string, selected: boolean) => {
    setSelectedTransactionIds((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(transactionId);
      } else {
        next.delete(transactionId);
      }
      return Array.from(next);
    });
  };

  const clearSelection = () => {
    setSelectedTransactionIds([]);
    setBulkDeleteConfirmOpen(false);
  };

  const syncAfterTransactionRemoval = (transactionId: string) => {
    if (selectedWorkspaceId) {
      applyOptimisticWorkspaceTransactionDeletion(selectedWorkspaceId, transactionId);
    }
    setTransactions((current) => current.filter((entry) => entry.id !== transactionId));
    setSelectedTransactionIds((current) => current.filter((entryId) => entryId !== transactionId));
    setActiveWarningTransactionId((current) => (current === transactionId ? null : current));
    setSelectedTransaction((current) => (current?.id === transactionId ? null : current));
    setDetailDraft((current) => {
      if (!current || selectedTransaction?.id !== transactionId) {
        return current;
      }

      return null;
    });
  };

  const openBulkEdit = () => {
    setBulkEditForm(createEmptyBulkEditForm());
    setBulkEditOpen(true);
  };

  const applyDateFilterMode = (mode: DateFilterMode) => {
    if (mode === "ltd") {
      setDateFilterMode("ltd");
      setDateFilterAnchor(todayIso);
      setCustomStart("");
      setCustomEnd("");
      return;
    }

    if (mode === "custom") {
      setDateFilterMode("custom");
      setDateFilterAnchor(todayIso);
      setCustomStart((current) => current || todayIso);
      setCustomEnd((current) => current || todayIso);
      return;
    }

    setDateFilterMode(mode);
    setDateFilterAnchor(todayIso);
    setCustomStart("");
    setCustomEnd("");
  };

  const toggleFiltersPanel = () => {
    closeToolbarMenus();
    setFilterOpen((current) => !current);
  };

  const closeHeaderMenu = () => {
    setHeaderMenuOpen(null);
    setHeaderMenuPosition(null);
  };

  const openHeaderMenu = (field: TransactionSortField, event: ReactMouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = field === "category" ? 380 : field === "amount" ? 400 : field === "date" ? 460 : 320;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));
    setAddMenuOpen(false);
    setSelectionMenuOpen(false);
    setFilterOpen(false);
    setHeaderMenuOpen((current) => (current === field ? null : field));
    setHeaderMenuPosition((current) => (current && current.left === left && current.width === menuWidth ? current : {
      top: rect.bottom + 10,
      left,
      width: menuWidth,
    }));
  };

  const clearAllTransactionFilters = () => {
    setQuery("");
    setCurrencyFilter("");
    setCategoryFilters([]);
    setAccountFilters([]);
    setTypeFilters([]);
    setDateFilterMode("ltd");
    setDateFilterAnchor(todayIso);
    setCustomStart("");
    setCustomEnd("");
    setAmountMin("");
    setAmountMax("");
  };

  const openManualAdd = async () => {
    flushSync(() => {
      closeChrome();
      setAddMenuOpen(false);
    });

    const activeWorkspaceId = selectedWorkspaceId || readTransactionsWorkspaceCache()?.selectedWorkspaceId || workspaces[0]?.id || null;

    if (!activeWorkspaceId) {
      setMessage("Choose a workspace first.");
      return;
    }

    if (activeWorkspaceId !== selectedWorkspaceId) {
      setSelectedWorkspaceId(activeWorkspaceId);
    }

    if (planLimits?.transactionLimit != null && workspaceTransactionCount >= planLimits.transactionLimit) {
      setPlanLimitNudge({
        planTier,
        limitType: "transaction_limit",
        limitValue: planLimits.transactionLimit,
      });
      setMessage("You’ve reached the current transaction limit for this plan.");
      return;
    }

    flushSync(() => {
      setManualForm(createEmptyManualForm("", getOtherCategoryId(categories)));
      setManualCategoryTouched(false);
      setManualMoreOpen(false);
      setManualAccountMenuOpen(false);
      setManualCategoryMenuOpen(false);
      setManualOpen(true);
    });

    try {
      const accountId = await ensureDefaultAccount(activeWorkspaceId);
      setManualForm((current) => {
        if (current.accountId) {
          return current;
        }

        return {
          ...current,
          accountId,
        };
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to prepare transaction form.");
    }
  };

  const fetchCategorySuggestion = useCallback(
    async (merchantText: string, type: Transaction["type"], signal?: AbortSignal) => {
      if (!selectedWorkspaceId || merchantText.trim().length < 2) {
        return null;
      }

      const response = await fetch("/api/transaction-category-suggestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          merchantText,
          type,
        }),
        signal,
      });

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as { suggestion?: CategorySuggestion | null };
      return payload.suggestion ?? null;
    },
    [selectedWorkspaceId]
  );

  useEffect(() => {
    const handleKeyboardShortcuts = (event: globalThis.KeyboardEvent) => {
      const target = event.target;
      const isEditableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      if (event.key === "Escape") {
        if (merchantRenameSuggestion) {
          setMerchantRenameSuggestion(null);
          return;
        }

        if (transactionDeleteConfirmOpen) {
          setTransactionDeleteConfirmOpen(false);
          return;
        }

        if (selectedTransaction) {
          closeTransactionDetail();
          return;
        }

        if (bulkDeleteConfirmOpen) {
          setBulkDeleteConfirmOpen(false);
          return;
        }

        if (manualOpen) {
          setManualOpen(false);
          return;
        }

        if (bulkEditOpen) {
          setBulkEditOpen(false);
          return;
        }

        if (filterOpen) {
          setFilterOpen(false);
          return;
        }

        if (headerMenuOpen) {
          setHeaderMenuOpen(null);
          setHeaderMenuPosition(null);
          return;
        }

        if (addMenuOpen) {
          closeToolbarMenus();
        }

        return;
      }

      if (isEditableTarget || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (key === "f") {
        event.preventDefault();
        toggleFiltersPanel();
        return;
      }

      if (key === "a") {
        event.preventDefault();
        void openManualAdd();
        return;
      }

      if (key === "i") {
        event.preventDefault();
        openImportFiles();
        return;
      }

      if (key === "b" && hasSelectedTransactions) {
        event.preventDefault();
        openBulkEdit();
      }
    };

    document.addEventListener("keydown", handleKeyboardShortcuts);
    return () => document.removeEventListener("keydown", handleKeyboardShortcuts);
  }, [
    addMenuOpen,
    bulkDeleteConfirmOpen,
    bulkEditOpen,
    headerMenuOpen,
    filterOpen,
    hasSelectedTransactions,
    manualOpen,
    merchantRenameSuggestion,
    openBulkEdit,
    openManualAdd,
    selectedTransaction,
    transactionDeleteConfirmOpen,
    toggleFiltersPanel,
  ]);

  const saveManualTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = event.nativeEvent instanceof SubmitEvent ? event.nativeEvent.submitter : null;
    const submitMode = submitter instanceof HTMLElement ? submitter.getAttribute("data-submit-mode") : null;
    const keepOpenAfterSave = submitMode === "add-another";

    const activeWorkspaceId = selectedWorkspaceId || readTransactionsWorkspaceCache()?.selectedWorkspaceId || workspaces[0]?.id || null;

    if (!activeWorkspaceId) {
      setMessage("Choose a workspace first.");
      return;
    }

    if (activeWorkspaceId !== selectedWorkspaceId) {
      setSelectedWorkspaceId(activeWorkspaceId);
    }

    setIsSaving(true);
    let optimisticTransactionId = "";
    let optimisticTransactionAmount = 0;
    let optimisticTransactionType: Transaction["type"] = "expense";
    let resolvedAccountId = "";
    try {
      const accountId = manualForm.accountId || (await ensureDefaultAccount(activeWorkspaceId));
      resolvedAccountId = accountId;
      const merchantText = manualForm.merchantRaw.trim();
      const categoryId = manualForm.categoryId || getOtherCategoryId(categories) || undefined;
      const categoryName = getCategoryNameById(categories, categoryId ?? null);
      const account = accounts.find((entry) => entry.id === accountId) ?? null;
      const accountName = account?.name ?? accountId;
      const accountCurrency = formatCurrencyCode(account?.currency ?? "PHP");
      const transactionCurrency = formatCurrencyCode(manualForm.currency || accountCurrency);
      const receiptLineItems = sanitizeReceiptLineItems(manualForm.receiptLineItems);
      const optimisticTransaction: Transaction = {
        id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        workspaceId: activeWorkspaceId,
        accountId,
        accountName,
        categoryId: categoryId ?? null,
        categoryName,
        reviewStatus: "confirmed",
        date: manualForm.date,
        amount: Number(manualForm.amount).toFixed(2),
        currency: transactionCurrency,
        type: manualForm.type === "credit" ? "income" : "expense",
        merchantRaw: manualForm.merchantRaw,
        merchantClean: null,
        description: manualForm.description.trim() || null,
        isTransfer: false,
        isExcluded: false,
        source: "manual",
        importFileId: null,
        warningReason: null,
        rawPayload: {
          source: "manual",
          merchantRaw: manualForm.merchantRaw,
          merchantClean: null,
          description: manualForm.description.trim() || null,
          receiptLineItems,
        },
      };
      optimisticTransactionId = optimisticTransaction.id;
      optimisticTransactionAmount = Number(optimisticTransaction.amount);
      optimisticTransactionType = optimisticTransaction.type;

      flushSync(() => {
        setTransactionsPage(1);
        setTransactions((current) => [optimisticTransaction, ...current.filter((entry) => entry.id !== optimisticTransaction.id)]);
        setTransactionsSummary((current) => ({
          ...current,
          totalCount: current.totalCount + 1,
          income: current.income + (optimisticTransaction.type === "income" ? optimisticTransactionAmount : 0),
          spending: current.spending + (optimisticTransaction.type === "expense" ? optimisticTransactionAmount : 0),
          transfers: current.transfers + (optimisticTransaction.type === "transfer" ? optimisticTransactionAmount : 0),
        }));
        setUndoStack([]);
        setRedoStack([]);
        setManualMoreOpen(false);
        setManualAccountMenuOpen(false);
        setManualCategoryMenuOpen(false);
        if (!keepOpenAfterSave) {
          setManualOpen(false);
        }
      });

      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: activeWorkspaceId,
          accountId,
          categoryId: categoryId ?? null,
          date: manualForm.date,
          amount: manualForm.amount,
          currency: transactionCurrency,
          type: manualForm.type === "credit" ? "income" : "expense",
          merchantRaw: manualForm.merchantRaw,
          merchantClean: null,
          description: manualForm.description.trim() || null,
          receiptLineItems,
          isTransfer: false,
          isExcluded: false,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const limitPayload = parsePlanLimitPayload(payload);
        if (limitPayload) {
          setPlanLimitNudge(limitPayload);
        }
        if (optimisticTransactionId) {
          setTransactions((current) => current.filter((entry) => entry.id !== optimisticTransactionId));
          setTransactionsSummary((current) => ({
            ...current,
            totalCount: Math.max(0, current.totalCount - 1),
            income: current.income - (optimisticTransactionType === "income" ? optimisticTransactionAmount : 0),
            spending: current.spending - (optimisticTransactionType === "expense" ? optimisticTransactionAmount : 0),
            transfers: current.transfers - (optimisticTransactionType === "transfer" ? optimisticTransactionAmount : 0),
          }));
        }
        throw new Error(payload?.error ?? "Unable to create transaction.");
      }

      const payload = await response.json();
      const created = payload.transaction as Transaction;
      if (optimisticTransactionId) {
        setTransactions((current) =>
          current.map((entry) => (entry.id === optimisticTransactionId ? created : entry))
        );
      }
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      void loadTransactionsPage(activeWorkspaceId, {
        background: true,
        pageOverride: 1,
        pageSizeOverride: transactionsPageSize,
        summaryMode: "full",
      });
      if (
        merchantText.length >= 2 &&
        !manualCategoryTouched &&
        (!categoryId || categoryId === getOtherCategoryId(categories))
      ) {
        window.setTimeout(() => {
          void (async () => {
            const currentTransaction = transactionsRef.current.find((entry) => entry.id === created.id);
            if (!currentTransaction || currentTransaction.categoryId !== created.categoryId) {
              return;
            }

            const immediateSuggestionCategoryName = guessCategoryName(
              merchantText,
              created.type === "income" ? "income" : "expense"
            );
            let suggestedCategoryId = immediateSuggestionCategoryName
              ? getCategoryIdByName(categories, immediateSuggestionCategoryName)
              : "";

            if (!suggestedCategoryId) {
              const suggestion = await fetchCategorySuggestion(
                merchantText,
                created.type === "income" ? "income" : "expense"
              );
              if (!isAutoApplyCategorySuggestion(suggestion)) {
                return;
              }
              suggestedCategoryId = suggestion.categoryId;
            }

            if (!suggestedCategoryId || suggestedCategoryId === currentTransaction.categoryId) {
              return;
            }

            await updateTransaction(
              created.id,
              {
                categoryId: suggestedCategoryId,
              },
              {
                recordHistory: false,
                historyBefore: null,
              }
            );
          })();
        }, 1800);
      }
      setMessage(`Transaction "${created.merchantRaw}" added.`);

      if (keepOpenAfterSave) {
        const nextAccountId = resolvedAccountId || created.accountId || (await ensureDefaultAccount(activeWorkspaceId));
        const nextAccount = accounts.find((entry) => entry.id === nextAccountId) ?? null;
        const nextCurrency = formatCurrencyCode(nextAccount?.currency ?? created.currency ?? "PHP");
        flushSync(() => {
          setManualForm(
            createEmptyManualForm(
              nextAccountId,
              getOtherCategoryId(categories),
              nextCurrency
            )
          );
          setManualCategoryTouched(false);
          setManualMoreOpen(false);
          setManualAccountMenuOpen(false);
          setManualCategoryMenuOpen(false);
          setManualOpen(true);
        });

        window.requestAnimationFrame(() => {
          manualNameInputRef.current?.focus();
        });
      }
    } catch (error) {
      if (optimisticTransactionId) {
        setTransactions((current) => current.filter((entry) => entry.id !== optimisticTransactionId));
      }
      setMessage(error instanceof Error ? error.message : "Unable to create transaction.");
    } finally {
      setIsSaving(false);
    }
  };

  const transactionToPatch = (transaction: Transaction) => ({
    categoryId: transaction.categoryId,
    accountId: transaction.accountId,
    isExcluded: transaction.isExcluded,
    isTransfer: transaction.isTransfer,
    type: coerceTransactionTypeFromCategoryName(
      getEffectiveTransactionCategoryName({
        categoryName: transaction.categoryName ?? null,
        rawPayload: transaction.rawPayload as never,
        merchantRaw: transaction.merchantRaw,
        merchantClean: transaction.merchantClean,
        institution: transaction.institution ?? null,
        source: transaction.source ?? null,
        type: transaction.type,
      }) ?? transaction.categoryName ?? null,
      transaction.type
    ),
    merchantRaw: transaction.merchantRaw,
    merchantClean: transaction.merchantClean,
    description: transaction.description ?? null,
    date: transaction.date.slice(0, 10),
    amount: transaction.amount,
    currency: transaction.currency,
  });

  const updateTransaction = async (
    transactionId: string,
    body: Record<string, unknown>,
    options: UpdateTransactionOptions = {}
  ) => {
    const before =
      options.recordHistory === false
        ? null
        : options.historyBefore ?? transactions.find((entry) => entry.id === transactionId) ?? null;
    const response = await fetch(`/api/transactions/${transactionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error("Unable to update transaction.");
    }

    const payload = await response.json();
    const updated = payload.transaction as Transaction;
    setTransactions((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
    setSelectedTransaction((current) => (current?.id === updated.id ? updated : current));
    setDetailDraft((current) => {
      if (!current || selectedTransaction?.id !== updated.id) {
        return current;
      }

      return createDetailDraft(updated);
    });

    if (before) {
      setUndoStack((current) => [{ before, after: updated }, ...current]);
      setRedoStack([]);
    }

    return updated;
  };

  const suggestMerchantRenameForSimilarTransactions = (transaction: Transaction, nextMerchantClean: string) => {
    const target = nextMerchantClean.trim();
    if (!target) {
      return;
    }

    const sourceKey = normalizeMerchantGroupKey(transaction.merchantRaw);
    const matchingTransactionIds = transactions
      .filter((entry) => entry.id !== transaction.id && normalizeMerchantGroupKey(entry.merchantRaw) === sourceKey)
      .filter((entry) => normalizeMerchantGroupKey(entry.merchantClean ?? entry.merchantRaw) !== normalizeMerchantGroupKey(target))
      .map((entry) => entry.id);

    if (matchingTransactionIds.length === 0) {
      return;
    }

    capturePostHogClientEventOnce(
      "ai_suggestion_shown",
      {
        workspace_id: selectedWorkspaceId || null,
        suggestion_type: "merchant_rename",
        source_transaction_id: transaction.id,
        source_merchant_raw: transaction.merchantRaw,
        target_merchant_clean: target,
        matching_count: matchingTransactionIds.length,
        transaction_amount: Number(transaction.amount),
        transaction_account: transaction.accountName,
        transaction_category: transaction.categoryName ?? "Uncategorized",
      },
      analyticsOnceKey("ai_suggestion_shown", `merchant:${transaction.id}:${target}`)
    );

    setMerchantRenameSuggestion({
      sourceTransactionId: transaction.id,
      sourceMerchantRaw: transaction.merchantRaw,
      targetMerchantClean: target,
      matchingTransactionIds,
    });
  };

  const applyMerchantRenameSuggestion = async () => {
    if (!merchantRenameSuggestion) {
      return;
    }

    setMerchantRenameBusy(true);
    try {
      const transactionsToUpdate = merchantRenameSuggestion.matchingTransactionIds
        .map((transactionId) => transactions.find((entry) => entry.id === transactionId))
        .filter((entry): entry is Transaction => Boolean(entry));

      if (!transactionsToUpdate.length) {
        setMerchantRenameSuggestion(null);
        setMessage("No matching transactions were found.");
        return;
      }

      await Promise.allSettled(
        transactionsToUpdate.map((transaction) =>
          updateTransaction(
            transaction.id,
            {
              merchantClean: merchantRenameSuggestion.targetMerchantClean,
            },
            { recordHistory: false }
          )
        )
      );

      capturePostHogClientEvent("ai_suggestion_accepted", {
        workspace_id: selectedWorkspaceId || null,
        suggestion_type: "merchant_rename",
        source_transaction_id: merchantRenameSuggestion.sourceTransactionId,
        source_merchant_raw: merchantRenameSuggestion.sourceMerchantRaw,
        target_merchant_clean: merchantRenameSuggestion.targetMerchantClean,
        matching_count: transactionsToUpdate.length,
        transaction_account: transactionsToUpdate[0]?.accountName ?? null,
        transaction_category: transactionsToUpdate[0]?.categoryName ?? null,
      });
      capturePostHogClientEvent("transaction_merged", {
        workspace_id: selectedWorkspaceId || null,
        source_transaction_id: merchantRenameSuggestion.sourceTransactionId,
        target_merchant_clean: merchantRenameSuggestion.targetMerchantClean,
        merged_count: transactionsToUpdate.length,
        transaction_account: transactionsToUpdate[0]?.accountName ?? null,
      });

      setMerchantRenameSuggestion(null);
      setMessage(
        `Applied "${merchantRenameSuggestion.targetMerchantClean}" to ${transactionsToUpdate.length} similar transaction${
          transactionsToUpdate.length === 1 ? "" : "s"
        }.`
      );
    } finally {
      setMerchantRenameBusy(false);
    }
  };

  const applyTransactionPatchLocally = (transactionId: string, patch: Partial<Transaction>) => {
    setTransactions((current) =>
      current.map((entry) => (entry.id === transactionId ? { ...entry, ...patch } : entry))
    );
    setSelectedTransaction((current) => (current?.id === transactionId ? { ...current, ...patch } : current));
    setDetailDraft((current) => {
      if (!current || selectedTransaction?.id !== transactionId) {
        return current;
      }

      return {
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
      };
    });
  };

  const applyTransactionPatchesLocally = (patches: Array<{ transactionId: string; patch: Partial<Transaction> }>) => {
    if (!patches.length) {
      return;
    }

    const patchMap = new Map(patches.map(({ transactionId, patch }) => [transactionId, patch] as const));

    setTransactions((current) =>
      current.map((entry) => {
        const patch = patchMap.get(entry.id);
        return patch ? { ...entry, ...patch } : entry;
      })
    );

    setSelectedTransaction((current) => {
      if (!current) {
        return current;
      }

      const patch = patchMap.get(current.id);
      return patch ? { ...current, ...patch } : current;
    });

    setDetailDraft((current) => {
      if (!current || !selectedTransaction) {
        return current;
      }

      const patch = patchMap.get(selectedTransaction.id);
      if (!patch) {
        return current;
      }

      return {
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
      };
    });
  };

  const deleteTransactionRemote = async (transactionId: string) => {
    const response = await fetch(`/api/transactions/${transactionId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("Unable to delete transaction.");
    }
  };

  const deleteTransaction = async (transactionId: string) => {
    await deleteTransactionRemote(transactionId);

    syncAfterTransactionRemoval(transactionId);
  };

  const deleteWarningTransaction = async (transaction: Transaction) => {
    setActiveWarningTransactionId(null);
    syncAfterTransactionRemoval(transaction.id);
    setMessage("Deleting transaction...");

    try {
      await deleteTransactionRemote(transaction.id);
      refreshTransactionsSummary();
      setMessage("Transaction deleted.");
    } catch (error) {
      void loadTransactionsPage(selectedWorkspaceId || "", {
        background: true,
        pageOverride: transactionsPage,
        pageSizeOverride: transactionsPageSize,
        summaryMode: "full",
      });
      setMessage(error instanceof Error ? error.message : "Unable to delete transaction.");
    }
  };

  const refreshTransactionsSummary = () => {
    if (!selectedWorkspaceId) {
      return;
    }

    void loadTransactionsPage(selectedWorkspaceId, {
      background: true,
      pageOverride: transactionsPage,
      pageSizeOverride: transactionsPageSize,
      summaryMode: "full",
    });
  };

  const confirmDeleteTransaction = async () => {
    if (!selectedTransaction) {
      return;
    }

    setIsSaving(true);
    try {
      await deleteTransaction(selectedTransaction.id);
      refreshTransactionsSummary();
      setTransactionDeleteConfirmOpen(false);
      closeTransactionDetail();
      setMessage("Transaction deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete transaction.");
    } finally {
      setIsSaving(false);
    }
  };

  const commitInlineEdit = async (transaction: Transaction, field: EditableTransactionField, value: string) => {
    const payload: Record<string, unknown> = {};

    if (field === "name") {
      payload.merchantClean = value.trim() || null;
    } else if (field === "date") {
      payload.date = value;
    } else if (field === "accountId") {
      payload.accountId = value;
    } else if (field === "categoryId") {
      payload.categoryId = value || otherCategoryId || null;
    } else if (field === "currency") {
      payload.currency = value.trim().toUpperCase();
    } else if (field === "amount") {
      payload.amount = value;
    }

    if (Object.keys(payload).length === 0) {
      return;
    }

    if (field === "accountId" || field === "categoryId") {
      const nextPatch: Partial<Transaction> = {};
      const rollbackPatch: Partial<Transaction> = {
        accountId: transaction.accountId,
        accountName: transaction.accountName,
        categoryId: transaction.categoryId,
        categoryName: transaction.categoryName,
      };

      if (field === "accountId") {
        nextPatch.accountId = value;
        nextPatch.accountName = accounts.find((account) => account.id === value)?.name ?? transaction.accountName;
        rollbackPatch.categoryId = transaction.categoryId;
        rollbackPatch.categoryName = transaction.categoryName;
      }

      if (field === "categoryId") {
        nextPatch.categoryId = value || null;
        nextPatch.categoryName =
          categories.find((category) => category.id === value)?.name ?? (value ? transaction.categoryName : null);
        rollbackPatch.accountId = transaction.accountId;
        rollbackPatch.accountName = transaction.accountName;
      }

      applyTransactionPatchLocally(transaction.id, nextPatch);
      void updateTransaction(transaction.id, payload).catch((error) => {
        applyTransactionPatchLocally(transaction.id, rollbackPatch);
        setMessage(error instanceof Error ? error.message : "Unable to update transaction.");
      });
      setMessage("Transaction updated.");
      return;
    }

    if (field === "name") {
      const nextMerchantClean = value.trim() || null;
      applyTransactionPatchLocally(transaction.id, {
        merchantClean: nextMerchantClean,
      });

      setMessage("Transaction updated.");
      void updateTransaction(
        transaction.id,
        {
          merchantClean: nextMerchantClean,
        },
        { historyBefore: transaction }
      )
        .then((updated) => {
          if (nextMerchantClean) {
            suggestMerchantRenameForSimilarTransactions(updated, nextMerchantClean);
          }
        })
        .catch((error) => {
          applyTransactionPatchLocally(transaction.id, {
            merchantClean: transaction.merchantClean,
          });
          setMessage(error instanceof Error ? error.message : "Unable to update transaction.");
        });
      return;
    }

    await updateTransaction(transaction.id, payload);
    setMessage("Transaction updated.");
  };

  const applyHistoryEntry = async (entry: TransactionHistoryEntry, direction: "undo" | "redo") => {
    setIsApplyingHistory(true);
    try {
      const destination = direction === "undo" ? entry.before : entry.after;
      await updateTransaction(destination.id, transactionToPatch(destination), {
        recordHistory: false,
      });

      if (direction === "undo") {
        setUndoStack((current) => current.slice(1));
        setRedoStack((current) => [entry, ...current]);
        setMessage("Undid the last transaction change.");
        capturePostHogClientEvent("transaction_undone", {
          workspace_id: selectedWorkspaceId || null,
          transaction_id: destination.id,
          before_transaction_id: entry.after.id,
          after_transaction_id: entry.before.id,
          transaction_amount: Number(entry.after.amount),
          transaction_account: entry.after.accountName,
          transaction_category: entry.after.categoryName ?? "Uncategorized",
        });
      } else {
        setRedoStack((current) => current.slice(1));
        setUndoStack((current) => [entry, ...current]);
        setMessage("Redid the last transaction change.");
      }
    } finally {
      setIsApplyingHistory(false);
    }
  };

  const undoLastChange = async () => {
    const entry = undoStack[0];
    if (!entry || isSaving || isApplyingHistory) {
      return;
    }

    await applyHistoryEntry(entry, "undo");
  };

  const redoLastChange = async () => {
    const entry = redoStack[0];
    if (!entry || isSaving || isApplyingHistory) {
      return;
    }

    await applyHistoryEntry(entry, "redo");
  };

  const applyBulkEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedTransactionIds.length) {
      setMessage("Select transactions first.");
      return;
    }

    setIsSaving(true);
    const count = selectedTransactionIds.length;
    const selected = selectedTransactionIds
      .map((transactionId) => transactions.find((entry) => entry.id === transactionId))
      .filter((entry): entry is Transaction => Boolean(entry));
    const originalTransactions = new Map(selected.map((transaction) => [transaction.id, transaction] as const));
    const accountNames = new Map(accounts.map((account) => [account.id, getAccountDisplayName(account)] as const));
    const categoryNames = new Map(categories.map((category) => [category.id, category.name] as const));

    const payloads: Array<{
      transaction: Transaction;
      payload: {
        accountId?: string;
        categoryId?: string;
        type?: "income" | "expense";
      };
    }> = selected.map((transaction) => ({
      transaction,
      payload: {
        accountId: bulkEditForm.accountId || undefined,
        categoryId: bulkEditForm.categoryId || undefined,
        type:
          bulkEditForm.type === ""
            ? undefined
            : bulkEditForm.type === "credit"
              ? "income"
              : "expense",
      },
    }));

    applyTransactionPatchesLocally(
      payloads.map(({ transaction, payload }) => ({
        transactionId: transaction.id,
        patch: {
          ...(payload.accountId
            ? {
                accountId: payload.accountId,
                accountName: accountNames.get(payload.accountId) ?? transaction.accountName,
              }
            : {}),
          ...(payload.categoryId
            ? {
                categoryId: payload.categoryId,
                categoryName: categoryNames.get(payload.categoryId) ?? transaction.categoryName,
              }
            : {}),
          ...(payload.type !== undefined ? { type: payload.type } : {}),
        },
      }))
    );

    setBulkEditOpen(false);
    clearSelection();
    setUndoStack([]);
    setRedoStack([]);
    setMessage(`${count} transaction${count === 1 ? "" : "s"} updated.`);

    void (async () => {
      try {
        const results = await Promise.allSettled(
          payloads.map(({ transaction, payload }) =>
            updateTransaction(transaction.id, payload, {
              recordHistory: false,
            })
          )
        );

        const failedTransactions = results
          .map((result, index) => ({ result, transaction: payloads[index].transaction }))
          .filter(
            (
              entry
            ): entry is {
              result: PromiseRejectedResult;
              transaction: Transaction;
            } => entry.result.status === "rejected"
          );

        if (failedTransactions.length) {
          applyTransactionPatchesLocally(
            failedTransactions.map(({ transaction }) => ({
              transactionId: transaction.id,
              patch: originalTransactions.get(transaction.id) ?? transaction,
            }))
          );
          setMessage("Some transactions could not be updated. Please try again.");
          return;
        }

        const updatedFields = Array.from(
          new Set(
            payloads.flatMap(({ payload }) =>
              Object.keys(payload).filter((key) => payload[key as keyof typeof payload] !== undefined)
            )
          )
        );

        capturePostHogClientEvent("bulk_transaction_updated", {
          workspace_id: selectedWorkspaceId || null,
          selected_count: selected.length,
          updated_count: selected.length - failedTransactions.length,
          updated_fields: updatedFields.join(",") || null,
          transaction_type: Object.prototype.hasOwnProperty.call(payloads[0]?.payload ?? {}, "type")
            ? String(payloads[0]?.payload?.type)
            : null,
        });
      } finally {
        setIsSaving(false);
      }
    })();
  };

  const deleteSelectedTransactions = async () => {
    if (!selectedTransactionIds.length) {
      setMessage("Select transactions first.");
      return;
    }

    const transactionIds = [...selectedTransactionIds];
    const count = selectedTransactionIds.length;
    setIsSaving(true);
    transactionIds.forEach((transactionId) => {
      syncAfterTransactionRemoval(transactionId);
    });
    clearSelection();
    setBulkDeleteConfirmOpen(false);
    setUndoStack([]);
    setRedoStack([]);
    setMessage(`Deleting ${count} transaction${count === 1 ? "" : "s"}...`);

    try {
      const results = await Promise.allSettled(transactionIds.map((transactionId) => deleteTransactionRemote(transactionId)));
      const failedCount = results.filter((result) => result.status === "rejected").length;

      refreshTransactionsSummary();

      capturePostHogClientEvent("bulk_transaction_deleted", {
        workspace_id: selectedWorkspaceId || null,
        selected_count: count,
        deleted_count: count - failedCount,
      });

      if (failedCount > 0) {
        void loadTransactionsPage(selectedWorkspaceId || "", {
          background: true,
          pageOverride: transactionsPage,
          pageSizeOverride: transactionsPageSize,
          summaryMode: "full",
        });
        setMessage(
          `${count - failedCount} transaction${count - failedCount === 1 ? "" : "s"} deleted. ${failedCount} could not be deleted.`
        );
        return;
      }

      setMessage(`${count} transaction${count === 1 ? "" : "s"} deleted.`);
    } catch (error) {
      void loadTransactionsPage(selectedWorkspaceId || "", {
        background: true,
        pageOverride: transactionsPage,
        pageSizeOverride: transactionsPageSize,
        summaryMode: "full",
      });
      setMessage(error instanceof Error ? error.message : "Unable to delete transactions.");
    } finally {
      setIsSaving(false);
    }
  };

  const persistDetailDraft = async ({ closeAfterSave = true }: { closeAfterSave?: boolean } = {}) => {
    if (!selectedTransaction || !detailDraft) {
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        merchantRaw: detailDraft.merchantRaw,
        merchantClean: detailDraft.merchantClean || null,
        date: detailDraft.date,
        accountId: detailDraft.accountId,
        categoryId: detailDraft.categoryId || null,
        amount: detailDraft.amount,
        currency: detailDraft.currency.trim().toUpperCase() || selectedTransaction.currency,
        type: detailDraftTypeToTransactionType(detailDraft.type),
        description: detailDraft.description || null,
        isExcluded: detailDraft.isExcluded,
        isTransfer: detailDraft.isTransfer,
      };

      await updateTransaction(selectedTransaction.id, payload);
      capturePostHogClientEvent("feature_used", {
        workspace_id: selectedWorkspaceId || null,
        feature_name: "transaction_detail_edit",
      });
      if (closeAfterSave) {
        setMessage("Transaction details updated.");
        closeTransactionDetail();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update transaction.");
    } finally {
      setIsSaving(false);
    }
  };

  const fetchTransactionsForPdf = async () => {
    if (!selectedWorkspaceId) {
      return [];
    }

    const searchParams = buildTransactionQuerySearchParams(
      selectedWorkspaceId,
      {
        query,
        currencyFilter,
        categoryIds: categoryFilters,
        accountIds: accountFilters,
        typeFilters,
        dateFilterMode,
        dateFilterAnchor,
        customStart,
        customEnd,
        sortField,
        sortDirection,
        amountMin,
        amountMax,
      },
      {
        pageSize: "all",
      }
    );

    const response = await fetch(`/api/transactions?${searchParams?.toString() ?? ""}`);
    if (!response.ok) {
      throw new Error("Unable to export transactions.");
    }

    const payload = await response.json();
    return Array.isArray(payload.transactions) ? (payload.transactions as Transaction[]) : [];
  };

  const downloadPdf = async () => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const exportRows = await fetchTransactionsForPdf();
      const report = window.open("", "_blank", "width=1280,height=900");
      if (!report) {
        setMessage("Your browser blocked the PDF preview. Please allow popups and try again.");
        return;
      }

      const rows = exportRows
        .map((transaction) => {
          const warningReason = warningReasonFor(transaction);
          const amount = Number(transaction.amount);
          const categoryValue = transaction.categoryId ?? otherCategoryId;
          const categoryLabel =
            getEffectiveTransactionCategoryName({
              categoryName: transaction.categoryName ?? categories.find((category) => category.id === categoryValue)?.name ?? null,
              rawPayload: transaction.rawPayload as never,
              merchantRaw: transaction.merchantRaw,
              merchantClean: transaction.merchantClean,
              institution: accountInstitutionById.get(transaction.accountId) ?? null,
              source: transaction.source ?? null,
              type: transaction.type,
            }) ??
            guessCategoryName(transaction.merchantClean ?? transaction.merchantRaw, transaction.type) ??
            "Other";
          const effectiveType = coerceTransactionTypeFromCategoryName(categoryLabel, transaction.type);
          const categoryTone = getCategoryIconTone(categoryLabel);
          const accountInstitution = transaction.institution ?? accountInstitutionById.get(transaction.accountId) ?? null;
          const merchantSummary = summarizeTransactionMerchantText(
            transaction.merchantClean ?? transaction.merchantRaw,
            accountInstitution
          );
          const typeLabel =
            effectiveType === "transfer" || transaction.isTransfer
              ? "Transfer"
              : effectiveType === "income"
                ? "Credit"
                : "Debit";

          return `
            <tr>
              <td>${escapeHtml(formatDate(transaction.date))}</td>
              <td>
                <div class="transactions-pdf-merchant">
                  <strong>${escapeHtml(merchantSummary)}</strong>
                  ${transaction.description ? `<span>${escapeHtml(transaction.description)}</span>` : ""}
                </div>
              </td>
              <td>${escapeHtml(transaction.accountName)}</td>
              <td>
                <span class="transactions-pdf-category">
                  <span
                    class="transactions-pdf-category__swatch"
                    style="background: ${categoryTone.backgroundColor}; border-color: ${categoryTone.borderColor};"
                  ></span>
                  <span>${escapeHtml(categoryLabel)}</span>
                </span>
              </td>
              <td>
                <span class="transactions-pdf-type transactions-pdf-type--${effectiveType === "transfer" || transaction.isTransfer ? "transfer" : effectiveType === "income" ? "credit" : "debit"}">
                  ${escapeHtml(typeLabel)}
                </span>
              </td>
              <td class="${effectiveType === "income" ? "positive" : effectiveType === "transfer" || transaction.isTransfer ? "neutral" : "negative"}">${escapeHtml(
                formatTransactionAmount(amount, transaction.currency)
              )}</td>
              <td>${escapeHtml(warningReason ?? "—")}</td>
            </tr>
          `;
        })
        .join("");

      const exportedCount = exportRows.length;
      const exportTitle = workspace?.name ? `${workspace.name} Transactions` : "Transactions";
      const summaryCards = [
        { label: "Rows", value: String(transactionsSummary.totalCount) },
        { label: "Income", value: formatTransactionAggregate(transactionsSummary.income, exportRows) },
        { label: "Spending", value: formatTransactionAggregate(transactionsSummary.spending, exportRows) },
        { label: "Transfers", value: formatTransactionAggregate(transactionsSummary.transfers, exportRows) },
      ];

      report.document.open();
      report.document.write(`
        <html>
          <head>
            <title>${escapeHtml(exportTitle)}</title>
            <style>
              @page { size: auto; margin: 12mm; }
              :root {
                color-scheme: light;
                --clover-teal: #18b4ce;
                --clover-ink: #10212b;
                --clover-muted: #5f7280;
                --clover-stroke: #dbe3e8;
                --clover-background: #f4fbfd;
                --clover-positive: #16a34a;
                --clover-negative: #ef4444;
                --clover-neutral: #64748b;
              }
              body {
                font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                color: var(--clover-ink);
                margin: 0;
                padding: 0;
                background:
                  radial-gradient(circle at top left, rgba(24, 180, 206, 0.14), transparent 28%),
                  linear-gradient(180deg, #f8fcfd 0%, #ffffff 30%, #ffffff 100%);
              }
              .page {
                padding: 16px;
              }
              .sheet {
                border: 1px solid rgba(219, 227, 232, 0.9);
                border-radius: 28px;
                overflow: hidden;
                background: rgba(255, 255, 255, 0.94);
                box-shadow: 0 24px 60px rgba(16, 33, 43, 0.12);
              }
              .hero {
                padding: 24px 28px 20px;
                background: linear-gradient(135deg, rgba(24, 180, 206, 0.95) 0%, rgba(15, 196, 176, 0.95) 100%);
                color: white;
              }
              .hero__eyebrow {
                margin: 0;
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.22em;
                opacity: 0.8;
              }
              .hero__title {
                margin: 8px 0 6px;
                font-size: 28px;
                line-height: 1.05;
                letter-spacing: -0.04em;
              }
              .hero__meta {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                font-size: 12px;
                color: rgba(255, 255, 255, 0.88);
              }
              .hero__pill {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 7px 10px;
                border-radius: 999px;
                background: rgba(255, 255, 255, 0.18);
                backdrop-filter: blur(12px);
              }
              .summary-grid {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 12px;
                padding: 18px 20px 10px;
                background: var(--clover-background);
                border-bottom: 1px solid var(--clover-stroke);
              }
              .summary-card {
                border: 1px solid rgba(219, 227, 232, 0.9);
                border-radius: 20px;
                padding: 14px 16px;
                background: rgba(255, 255, 255, 0.95);
              }
              .summary-card__label {
                display: block;
                font-size: 10px;
                text-transform: uppercase;
                letter-spacing: 0.16em;
                color: var(--clover-muted);
                margin-bottom: 8px;
              }
              .summary-card__value {
                font-size: 18px;
                font-weight: 700;
                letter-spacing: -0.02em;
              }
              .content {
                padding: 16px 20px 22px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                table-layout: auto;
              }
              thead th {
                font-size: 10px;
                text-transform: uppercase;
                letter-spacing: 0.14em;
                color: var(--clover-muted);
                text-align: left;
                padding: 10px 8px;
                border-bottom: 1px solid var(--clover-stroke);
              }
              tbody td {
                text-align: left;
                vertical-align: top;
                padding: 12px 8px;
                border-bottom: 1px solid rgba(219, 227, 232, 0.85);
                font-size: 12px;
                word-break: break-word;
              }
              tbody tr:nth-child(even) {
                background: rgba(24, 180, 206, 0.03);
              }
              .transactions-pdf-merchant {
                display: grid;
                gap: 3px;
              }
              .transactions-pdf-merchant strong {
                font-size: 12.5px;
                line-height: 1.25;
              }
              .transactions-pdf-merchant span {
                color: var(--clover-muted);
                font-size: 10.5px;
                line-height: 1.3;
              }
              .transactions-pdf-category {
                display: inline-flex;
                align-items: center;
                gap: 8px;
              }
              .transactions-pdf-category__swatch {
                width: 12px;
                height: 12px;
                border-radius: 999px;
                border: 1px solid transparent;
                flex: 0 0 auto;
              }
              .transactions-pdf-type {
                display: inline-flex;
                align-items: center;
                padding: 6px 10px;
                border-radius: 999px;
                font-size: 10px;
                font-weight: 700;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                border: 1px solid transparent;
              }
              .transactions-pdf-type--credit {
                background: rgba(22, 163, 74, 0.08);
                color: var(--clover-positive);
                border-color: rgba(22, 163, 74, 0.16);
              }
              .transactions-pdf-type--debit {
                background: rgba(239, 68, 68, 0.08);
                color: var(--clover-negative);
                border-color: rgba(239, 68, 68, 0.16);
              }
              .transactions-pdf-type--transfer {
                background: rgba(100, 116, 139, 0.1);
                color: var(--clover-neutral);
                border-color: rgba(100, 116, 139, 0.18);
              }
              .positive {
                color: var(--clover-positive);
              }
              .negative {
                color: var(--clover-negative);
              }
              .neutral {
                color: var(--clover-neutral);
              }
              .footer {
                display: flex;
                justify-content: space-between;
                gap: 12px;
                padding: 14px 20px 20px;
                color: var(--clover-muted);
                font-size: 11px;
              }
              @media print {
                body {
                  background: white;
                }
                .page {
                  padding: 0;
                }
                .sheet {
                  border: none;
                  border-radius: 0;
                  box-shadow: none;
                }
                .summary-grid {
                  background: white;
                }
              }
            </style>
          </head>
          <body>
            <div class="page">
              <section class="sheet">
                <header class="hero">
                  <p class="hero__eyebrow">Clover</p>
                  <h1 class="hero__title">${escapeHtml(exportTitle)}</h1>
                  <div class="hero__meta">
                    <span class="hero__pill">${escapeHtml(workspace?.name ?? "Selected workspace")}</span>
                    <span class="hero__pill">${escapeHtml(String(exportedCount))} transaction${exportedCount === 1 ? "" : "s"}</span>
                    <span class="hero__pill">PDF export</span>
                  </div>
                </header>
                <section class="summary-grid">
                  ${summaryCards
                    .map(
                      (card) => `
                        <div class="summary-card">
                          <span class="summary-card__label">${escapeHtml(card.label)}</span>
                          <span class="summary-card__value">${escapeHtml(card.value)}</span>
                        </div>
                      `
                    )
                    .join("")}
                </section>
                <div class="content">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Merchant</th>
                        <th>Account</th>
                        <th>Category</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Warning</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${rows || `<tr><td colspan="7">No transactions to print.</td></tr>`}
                    </tbody>
                  </table>
                </div>
                <footer class="footer">
                  <span>Generated ${escapeHtml(new Date().toLocaleString("en-PH"))}</span>
                  <span>Clover transactions</span>
                </footer>
              </section>
            </div>
          </body>
        </html>
      `);
      report.document.close();
      report.focus();
      window.setTimeout(() => {
        report.print();
      }, 250);
      capturePostHogClientEvent("report_exported", {
        workspace_id: selectedWorkspaceId || null,
        export_format: "pdf",
        row_count: exportRows.length,
        selected_count: selectedTransactionIds.length,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to export transactions.");
    }
  };

  const netCashFlow = transactionsSummary.income - transactionsSummary.spending;
  const warningTransactionCount = transactionsSummary.review;
  const hasReviewItems = warningTransactionCount > 0;
  const dateFilterLabel = getDateFilterLabel(dateFilterMode, dateFilterAnchor, customStart, customEnd);
  const headerMenuTitle =
    headerMenuOpen === "name"
      ? "Sort by name"
      : headerMenuOpen === "date"
        ? "Filter date"
        : headerMenuOpen === "account"
          ? "Filter account"
          : headerMenuOpen === "category"
            ? "Filter category"
          : headerMenuOpen === "amount"
            ? "Sort by amount"
            : "";
  const headerMenuPanel = headerMenuOpen && headerMenuPosition ? (
    <div
      className="transactions-column-menu glass"
      ref={headerMenuRef}
      style={{
        top: `${headerMenuPosition.top}px`,
        left: `${headerMenuPosition.left}px`,
        width: `${headerMenuPosition.width}px`,
      }}
      role="dialog"
      aria-label={headerMenuTitle}
    >
      <div className="transactions-column-menu__head">
        <div>
          <p className="eyebrow">Transactions</p>
          <h4>{headerMenuTitle}</h4>
        </div>
        <button className="icon-button" type="button" onClick={closeHeaderMenu} aria-label={`Close ${headerMenuTitle.toLowerCase()}`}>
          ×
        </button>
      </div>

      {headerMenuOpen === "name" ? (
        <div className="transactions-column-menu__section">
          <div className="transactions-column-menu__sort">
            {[
              ["asc", "A-Z"],
              ["desc", "Z-A"],
            ].map(([direction, label]) => (
              <button
                key={direction}
                type="button"
                className={`button button-secondary button-small transactions-column-menu__button ${
                  sortField === "name" && sortDirection === direction ? "is-active" : ""
                }`}
                onClick={() => {
                  setSortField("name");
                  setSortDirection(direction as TransactionSortDirection);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="transactions-column-menu__hint">Sort names alphabetically.</div>
        </div>
      ) : null}

      {headerMenuOpen === "date" ? (
        <div className="transactions-column-menu__section">
          <div className="transactions-column-menu__sort">
            {[
              ["desc", "Newest"],
              ["asc", "Oldest"],
            ].map(([direction, label]) => (
              <button
                key={direction}
                type="button"
                className={`button button-secondary button-small transactions-column-menu__button ${
                  sortField === "date" && sortDirection === direction ? "is-active" : ""
                }`}
                onClick={() => {
                  setSortField("date");
                  setSortDirection(direction as TransactionSortDirection);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="transactions-column-menu__options">
            {[
              ["ltd", "Lifetime"],
              ["day", "Today"],
              ["week", "This week"],
              ["month", "This month"],
              ["quarter", "This quarter"],
              ["year", "This year"],
              ["custom", "Custom range"],
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={`pill pill-interactive transactions-filter-pill ${
                  dateFilterMode === mode ? "pill-is-selected" : ""
                }`}
                onClick={() => applyDateFilterMode(mode as DateFilterMode)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="transactions-column-menu__fields">
            <label className="transactions-column-menu__field">
              <span>Start</span>
              <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
            </label>
            <label className="transactions-column-menu__field">
              <span>End</span>
              <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
            </label>
          </div>
          <div className="transactions-column-menu__hint">Use the start and end dates to filter the table inline.</div>
        </div>
      ) : null}

      {headerMenuOpen === "account" ? (
        <div className="transactions-column-menu__section">
          <div className="transactions-column-menu__sort">
            {[
              ["asc", "A-Z"],
              ["desc", "Z-A"],
            ].map(([direction, label]) => (
              <button
                key={direction}
                type="button"
                className={`button button-secondary button-small transactions-column-menu__button ${
                  sortField === "account" && sortDirection === direction ? "is-active" : ""
                }`}
                onClick={() => {
                  setSortField("account");
                  setSortDirection(direction as TransactionSortDirection);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <MultiSelectFilterGroup
            label="Accounts"
            options={accounts.map((account) => ({
              value: account.id,
              label: getAccountDisplayName(account),
            }))}
            selected={accountFilters}
            onToggle={(value) => setAccountFilters((current) => toggleFilterValue(current, value))}
            onClear={() => setAccountFilters([])}
          />
        </div>
      ) : null}

      {headerMenuOpen === "category" ? (
        <div className="transactions-column-menu__section">
          <div className="transactions-column-menu__sort">
            {[
              ["asc", "A-Z"],
              ["desc", "Z-A"],
            ].map(([direction, label]) => (
              <button
                key={direction}
                type="button"
                className={`button button-secondary button-small transactions-column-menu__button ${
                  sortField === "category" && sortDirection === direction ? "is-active" : ""
                }`}
                onClick={() => {
                  setSortField("category");
                  setSortDirection(direction as TransactionSortDirection);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <MultiSelectFilterGroup
            label="Categories"
            options={categories.map((category) => ({
              value: category.id,
              label: category.name,
            }))}
            selected={categoryFilters}
            onToggle={(value) => setCategoryFilters((current) => toggleFilterValue(current, value))}
            onClear={() => setCategoryFilters([])}
          />
        </div>
      ) : null}

      {headerMenuOpen === "amount" ? (
        <div className="transactions-column-menu__section">
          <div className="transactions-column-menu__sort">
            {[
              ["asc", "Ascending"],
              ["desc", "Descending"],
            ].map(([direction, label]) => (
              <button
                key={direction}
                type="button"
                className={`button button-secondary button-small transactions-column-menu__button ${
                  sortField === "amount" && sortDirection === direction ? "is-active" : ""
                }`}
                onClick={() => {
                  setSortField("amount");
                  setSortDirection(direction as TransactionSortDirection);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <MultiSelectFilterGroup
            label="Show amounts for"
            options={[
              { value: "debit", label: "Debits" },
              { value: "credit", label: "Credits" },
              { value: "transfer", label: "Transfers" },
            ]}
            selected={typeFilters}
            onToggle={(value) => setTypeFilters((current) => toggleTypedFilterValue(current, value as TransactionTypeFilter))}
            onClear={() => setTypeFilters([])}
          />
          <div className="transactions-column-menu__fields">
            <label className="transactions-column-menu__field">
              <span>Min amount</span>
              <input
                type="number"
                inputMode="decimal"
                value={amountMin}
                onChange={(event) => setAmountMin(event.target.value)}
                placeholder="0.00"
              />
            </label>
            <label className="transactions-column-menu__field">
              <span>Max amount</span>
              <input
                type="number"
                inputMode="decimal"
                value={amountMax}
                onChange={(event) => setAmountMax(event.target.value)}
                placeholder="0.00"
              />
            </label>
          </div>
          <div className="transactions-column-menu__hint">Filter amounts by a specific range.</div>
        </div>
      ) : null}

      <div className="form-actions form-actions--compact">
        <button
          className="button button-secondary"
          type="button"
          onClick={() => {
            if (headerMenuOpen === "date") {
              setDateFilterMode("ltd");
              setDateFilterAnchor(todayIso);
              setCustomStart("");
              setCustomEnd("");
            } else if (headerMenuOpen === "account") {
              setAccountFilters([]);
            } else if (headerMenuOpen === "category") {
              setCategoryFilters([]);
            } else if (headerMenuOpen === "amount") {
              setAmountMin("");
              setAmountMax("");
            } else if (headerMenuOpen === "name") {
              setSortField("date");
              setSortDirection("desc");
            }
            closeHeaderMenu();
          }}
        >
          Reset
        </button>
        <button className="button button-primary" type="button" onClick={closeHeaderMenu}>
          Done
        </button>
      </div>
    </div>
  ) : null;
  const isTableLoading = Boolean(selectedWorkspaceId) && !isWorkspaceDataReady && transactions.length === 0;
  const transactionsShellActions = (
    <div className="transactions-shell-actions" style={transactionsShellActionsStyle}>
      <label
        className="transactions-toolbar-search"
        style={isCompactViewport ? transactionsToolbarSearchCompactStyle : transactionsToolbarSearchStyle}
      >
        <span className="transactions-toolbar-search__icon" aria-hidden="true">
          <ActionIcon name="search" />
        </span>
        <span className="sr-only">Search transactions</span>
        <input
          ref={searchInputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          aria-label="Search transactions"
          aria-keyshortcuts="/"
          style={isCompactViewport ? { width: "auto", opacity: 1 } : undefined}
        />
      </label>

      <CurrencySelector
        value={currencyFilter}
        onChange={(next) => setCurrencyFilter(next && next.toLowerCase() !== "all" ? formatCurrencyCode(next) : "")}
        options={workspaceCurrencyCodes}
        includeAllOption
        allLabel="All currencies"
        ariaLabel="Filter transactions by currency"
        className="transactions-currency-filter"
        buttonClassName="transactions-currency-filter__button transactions-action-button transactions-toolbar-chip"
        menuClassName="transactions-currency-filter__menu"
        optionClassName="transactions-currency-filter__option"
        menuAlignment="end"
        showChevron={false}
      />

      <div className="transactions-add-menu" id="transactions-add-menu" ref={addMenuRef} style={transactionsMenuStyle}>
        <button
          className="button button-primary button-small transactions-action-button transactions-toolbar-add transactions-add-menu__toggle"
          style={toolbarAddStyle}
          type="button"
          onClick={() => {
            openAddMenu();
          }}
          title="Add transaction (A)"
          aria-expanded={addMenuOpen}
          aria-label="Add transaction"
          aria-keyshortcuts="a"
        >
          <span className="button-icon" aria-hidden="true">
            <ActionIcon name="plus" />
          </span>
          {!isCompactViewport ? <span>Add</span> : null}
          {!isCompactViewport ? (
            <span className="button-icon" aria-hidden="true">
              <ActionIcon name="chevron-down" />
            </span>
          ) : null}
        </button>
        {addMenuOpen && addMenuPortalStyle && typeof document !== "undefined"
          ? createPortal(
              <div
                ref={addMenuPanelRef}
                className="transactions-add-menu__panel transactions-add-menu__panel--portal"
                style={addMenuPortalStyle}
              >
                <button
                  className="transactions-add-menu__item"
                  type="button"
                  onClick={() => {
                    setAddMenuOpen(false);
                    void openManualAdd();
                  }}
                >
                  Add transaction
                </button>
                <button
                  className="transactions-add-menu__item"
                  type="button"
                  onClick={() => {
                    openImportFiles();
                  }}
                >
                  Import files
                </button>
              </div>,
              document.body
            )
          : null}
      </div>
    </div>
  );

  useEffect(() => {
    if (!selectedWorkspaceId || !isWorkspaceDataReady) {
      return;
    }

    const updatedAt = persistTransactionsWorkspaceCache(selectedWorkspaceId, {
      accounts,
      categories,
      transactions,
      imports,
      page: transactionsPage,
      pageSize: transactionsPageSize,
      totalCount: transactionsSummary.totalCount,
      currencyCodes: workspaceCurrencyCodes,
      summary: transactionsSummary,
    });
    markTransactionsHydrated(selectedWorkspaceId, updatedAt);
  }, [accounts, categories, imports, isWorkspaceDataReady, selectedWorkspaceId, transactions, transactionsPage, transactionsPageSize, transactionsSummary, workspaceCurrencyCodes]);

  useEffect(() => {
    if (!importOpen || !pendingImportSummary || pendingImportSummary.optimistic) {
      return;
    }

    const settledAccountId = resolvePersistedImportedAccountId(pendingImportSummary, accounts);
    const targetAccountId = settledAccountId ?? pendingImportSummary.accountId ?? pendingImportSummary.optimisticAccountId ?? null;
    if (!targetAccountId || targetAccountId.startsWith("optimistic-")) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setImportOpen(false);
      setPendingImportSummary(null);
    }, 250);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [importOpen, pendingImportSummary, accounts, transactions]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1100px)");
    const updateViewport = () => setIsCompactViewport(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);

    return () => {
      mediaQuery.removeEventListener("change", updateViewport);
    };
  }, []);

  return (
    <CloverShell active="transactions" title="Transactions" actions={transactionsShellActions}>
      <PageFileDropZone
        enabled={true}
        title="Drop statement files anywhere"
        onFilesDropped={(files) => openImportFiles(files, true)}
      />
      <section className={`transactions-layout ${summaryOpen ? "transactions-layout--summary-open" : ""}`} style={transactionsLayoutStyle}>
        <div className="transactions-main-panel">
          {showFinalizingNotice ? (
            <div className="transactions-status-line" role="status" aria-live="polite">
              <div className="transactions-status-line__meta">
                <span className={`pill ${finalizingNeedsReview ? "pill-neutral" : "pill-neutral"}`}>
                  {finalizingNoticeState.label}
                </span>
                <span className="panel-muted">
                  {finalizingNeedsReview
                    ? `Clover couldn't finalize automatically for ${finalizingTransactionCount} visible transaction${finalizingTransactionCount === 1 ? "" : "s"}; please review.`
                    : `Clover is enriching names and categories for ${finalizingTransactionCount} visible transaction${finalizingTransactionCount === 1 ? "" : "s"} · ${finalizingNoticeState.detail}.`}
                </span>
              </div>
              <button
                type="button"
                className="icon-button transactions-status-line__dismiss"
                onClick={dismissFinalizingStatusNotice}
                aria-label="Dismiss status notice"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          ) : null}
      {filterOpen ? (
            <div className="transactions-inline-filters glass">
              <div className="transactions-inline-filters__head">
                <div>
                  <span className="transactions-context-strip__label">Filters</span>
                  <p className="transactions-inline-filters__copy">Refine the list without leaving Transactions.</p>
                </div>
                <button className="icon-button" type="button" onClick={toggleFiltersPanel} aria-label="Close filters">
                  ×
                </button>
              </div>
              <div className="form-grid">
                <MultiSelectFilterGroup
                  label="Categories"
                  options={categories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  }))}
                  selected={categoryFilters}
                  onToggle={(value) => setCategoryFilters((current) => toggleFilterValue(current, value))}
                  onClear={() => setCategoryFilters([])}
                />
                <MultiSelectFilterGroup
                  label="Accounts"
                  options={accounts.map((account) => ({
                    value: account.id,
                    label: getAccountDisplayName(account),
                  }))}
                  selected={accountFilters}
                  onToggle={(value) => setAccountFilters((current) => toggleFilterValue(current, value))}
                  onClear={() => setAccountFilters([])}
                />
                <MultiSelectFilterGroup
                  label="Types"
                  options={[
                    { value: "debit", label: "Debit" },
                    { value: "credit", label: "Credit" },
                    { value: "transfer", label: "Transfer" },
                  ]}
                  selected={typeFilters}
                  onToggle={(value) => setTypeFilters((current) => toggleTypedFilterValue(current, value as TransactionTypeFilter))}
                  onClear={() => setTypeFilters([])}
                />
              </div>
              <div className="form-actions">
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => {
                    clearAllTransactionFilters();
                    capturePostHogClientEvent("report_filtered", {
                      workspace_id: selectedWorkspaceId || null,
                      view: "transactions",
                      action: "filters_reset",
                    });
                  }}
                >
                  Reset
                </button>
                <button
                  className="button button-primary"
                  type="button"
                  onClick={() => {
                    capturePostHogClientEvent("report_filtered", {
                      workspace_id: selectedWorkspaceId || null,
                      view: "transactions",
                      action: "filters_applied",
                      filter_type_count: typeFilters.length,
                      filter_category_count: categoryFilters.length,
                      filter_account_count: accountFilters.length,
                      query_length: query.trim().length,
                    });
                    setFilterOpen(false);
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          ) : null}

          {hasSelectedTransactions ? (
            <div className="transactions-status-line transactions-selection-bar" role="status" aria-live="polite">
              <div className="transactions-status-line__meta">
                <span className="pill pill-neutral">{selectedTransactionIds.length} selected</span>
              </div>
              <div className="transactions-status-line__meta">
                <div className="transactions-selection-menu" ref={selectionActionsMenuRef}>
                  <button
                    className="button button-secondary button-small transactions-action-button transactions-selection-menu__toggle"
                    type="button"
                    onClick={() => setSelectionMenuOpen((current) => !current)}
                    aria-expanded={selectionMenuOpen}
                    aria-label="Selected transactions actions"
                  >
                    <span>Actions</span>
                    <span className="button-icon" aria-hidden="true">
                      <ActionIcon name="chevron-down" />
                    </span>
                  </button>
                  <div className="transactions-selection-menu__panel" hidden={!selectionMenuOpen}>
                    <button
                      className="transactions-selection-menu__item"
                      type="button"
                      onClick={() => {
                        setSelectionMenuOpen(false);
                        openBulkEdit();
                      }}
                    >
                      Bulk edit
                    </button>
                    <button
                      className="transactions-selection-menu__item transactions-selection-menu__item--danger"
                      type="button"
                      onClick={() => {
                        setSelectionMenuOpen(false);
                        setBulkDeleteConfirmOpen(true);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <button
                  className="button button-secondary button-small transactions-action-button"
                  type="button"
                  onClick={clearSelection}
                  disabled={isSaving || isApplyingHistory}
                >
                  Clear
                </button>
              </div>
            </div>
          ) : null}

          {bulkDeleteConfirmOpen ? (
            <div
              className="modal-backdrop modal-backdrop--transactions-content"
              role="presentation"
              onClick={() => setBulkDeleteConfirmOpen(false)}
            >
              <section
                className="modal-card glass"
                role="dialog"
                aria-modal="true"
                aria-labelledby="bulk-delete-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="modal-head">
                  <div>
                    <p className="eyebrow">Delete transactions</p>
                    <h4 id="bulk-delete-title">
                      Delete {selectedTransactionIds.length} selected transaction{selectedTransactionIds.length === 1 ? "" : "s"}?
                    </h4>
                    <p className="modal-copy">This cannot be undone.</p>
                  </div>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => setBulkDeleteConfirmOpen(false)}
                    aria-label="Close delete confirmation"
                  >
                    ×
                  </button>
                </div>
                <div className="modal-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => setBulkDeleteConfirmOpen(false)}
                    disabled={isSaving}
                  >
                    Cancel
                  </button>
                  <button
                    className="button button-danger"
                    type="button"
                    onClick={() => void deleteSelectedTransactions()}
                    disabled={isSaving}
                  >
                    {isSaving ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </section>
            </div>
          ) : null}

          {headerMenuPanel}

          {!isCompactViewport ? (
            <>
            <div className="line-item-header" role="row" aria-label="Transaction columns">
              <label className="line-item-header-cell line-item-header-cell--select line-item-header-cell--select-all">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(event) => {
                    const shouldSelect = event.target.checked;
                    setSelectedTransactionIds((current) => {
                      const next = new Set(current);
                      if (shouldSelect) {
                        desktopPageTransactionIds.forEach((transactionId) => next.add(transactionId));
                      } else {
                        desktopPageTransactionIds.forEach((transactionId) => next.delete(transactionId));
                      }
                      return Array.from(next);
                    });
                  }}
                  aria-label="Select all transactions on this page"
                />
              </label>
              <span className="line-item-header-cell line-item-header-cell--icon" aria-hidden="true" />
              <button
                className="line-item-header-cell line-item-header-cell--name"
                type="button"
                onClick={(event) => openHeaderMenu("name", event)}
                aria-expanded={headerMenuOpen === "name"}
              >
                Name
              </button>
              <button
                className="line-item-header-cell"
                type="button"
                onClick={(event) => openHeaderMenu("date", event)}
                aria-expanded={headerMenuOpen === "date"}
              >
                Date
              </button>
              <button
                className="line-item-header-cell"
                type="button"
                onClick={(event) => openHeaderMenu("account", event)}
                aria-expanded={headerMenuOpen === "account"}
              >
                Account
              </button>
              <button
                className="line-item-header-cell"
                type="button"
                onClick={(event) => openHeaderMenu("category", event)}
                aria-expanded={headerMenuOpen === "category"}
              >
                Category
              </button>
              <button
                className="line-item-header-cell line-item-header-cell--amount"
                type="button"
                onClick={(event) => openHeaderMenu("amount", event)}
                aria-expanded={headerMenuOpen === "amount"}
              >
                Amount
              </button>
              <span className="line-item-header-cell line-item-header-cell--spacer" aria-hidden="true" />
              <span className="line-item-header-cell line-item-header-cell--spacer" aria-hidden="true" />
            </div>

            <div
              className={`table-wrap transactions-table-wrap${!hasVisibleTransactions && !isTableLoading ? " transactions-table-wrap--empty" : ""}`}
              aria-busy={isTableLoading}
            >
            {transactionsLoadFailed ? (
              <div className="empty-state transactions-empty-state--table">
                <strong>Couldn&apos;t load transactions.</strong>
                <p>Your transactions may still be there, but Clover could not reach the latest workspace data. Try again before importing or editing.</p>
                <button className="button button-primary button-small" type="button" onClick={() => selectedWorkspaceId && void loadTransactionsPage(selectedWorkspaceId)}>
                  Retry
                </button>
              </div>
            ) : isTableLoading ? (
              <div className="transactions-loading-state" role="status" aria-live="polite" aria-label="Loading transactions">
                <div className="transactions-loading-header">
                  <span className="skeleton-block skeleton-block--checkbox" />
                  <span className="skeleton-block skeleton-block--icon" />
                  <span className="skeleton-block skeleton-block--name" />
                  <span className="skeleton-block skeleton-block--date" />
                  <span className="skeleton-block skeleton-block--account" />
                  <span className="skeleton-block skeleton-block--category" />
                  <span className="skeleton-block skeleton-block--amount" />
                  <span className="skeleton-block skeleton-block--chevron" />
                  <span className="skeleton-block skeleton-block--warning" />
                </div>
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="transactions-loading-row">
                    <span className="skeleton-block skeleton-block--checkbox" />
                    <span className="skeleton-block skeleton-block--icon" />
                    <span className="transactions-loading-name">
                      <span className="skeleton-block skeleton-block--line skeleton-block--line-long" />
                      <span className="skeleton-block skeleton-block--line skeleton-block--line-short" />
                    </span>
                    <span className="skeleton-block skeleton-block--date" />
                    <span className="skeleton-block skeleton-block--account" />
                    <span className="skeleton-block skeleton-block--category" />
                    <span className="skeleton-block skeleton-block--amount" />
                    <span className="skeleton-block skeleton-block--chevron" />
                    <span className="skeleton-block skeleton-block--warning" />
                  </div>
                ))}
              </div>
            ) : transactionsSummary.totalCount > 0 ? (
              desktopPageTransactions.map((transaction, index) => {
                const warningReason = warningReasonFor(transaction);
                const amount = Number(transaction.amount);
                const categoryValue = transaction.categoryId ?? otherCategoryId;
                const accountInstitution = transaction.institution ?? accountInstitutionById.get(transaction.accountId) ?? null;
                const categoryLabel =
                  getEffectiveTransactionCategoryName({
                    categoryName: transaction.categoryName ?? categories.find((category) => category.id === categoryValue)?.name ?? null,
                    rawPayload: transaction.rawPayload as never,
                    merchantRaw: transaction.merchantRaw,
                    merchantClean: transaction.merchantClean,
                    institution: accountInstitution,
                    source: transaction.source ?? null,
                    type: transaction.type,
                  }) ??
                  guessCategoryName(transaction.merchantClean ?? transaction.merchantRaw, transaction.type) ??
                  "Other";
                const effectiveType = coerceTransactionTypeFromCategoryName(categoryLabel, transaction.type);
                const isTransferTransaction = effectiveType === "transfer";
                const amountToneClass = isTransferTransaction ? "neutral" : effectiveType === "income" ? "positive" : "negative";
                const accountDisplayName = accountNameById.get(transaction.accountId) ?? transaction.accountName;
                const accountBrand = accountBrandById.get(transaction.accountId) ?? getAccountBrand({
                  institution: accountInstitution,
                  name: accountDisplayName,
                  type: effectiveType === "transfer" ? "bank" : effectiveType === "income" ? "bank" : "other",
                });
                const merchantSummary = summarizeTransactionMerchantText(
                  transaction.merchantClean ?? transaction.merchantRaw,
                  accountInstitution
                );
                const sourceClass =
                  transaction.source === "manual"
                    ? "line-item--manual"
                    : transaction.source === "upload"
                      ? "line-item--imported"
                      : "line-item--other";
                return (
                  <div
                    key={transaction.id}
                    ref={(node) => {
                      if (node) {
                        transactionRowRefs.current.set(transaction.id, node);
                        return;
                      }

                      transactionRowRefs.current.delete(transaction.id);
                    }}
                    className={`line-item ${sourceClass} ${transaction.isExcluded ? "is-muted" : ""} ${
                      selectedTransactionIds.includes(transaction.id) ? "is-selected" : ""
                    }`}
                    tabIndex={0}
                    aria-label={`${merchantSummary}, ${formatDate(transaction.date)}, ${categoryLabel}, ${formatTransactionAmount(amount, transaction.currency)}`}
                    onKeyDown={(event) => handleTransactionRowKeyDown(event, transaction, index)}
                  >
                    <label className="transaction-select-cell">
                      <input
                        type="checkbox"
                        checked={selectedTransactionIds.includes(transaction.id)}
                        onChange={(event) => toggleSelectedTransaction(transaction.id, event.target.checked)}
                        aria-label={`Select ${transaction.merchantRaw}`}
                      />
                    </label>
                    <div className="transaction-category-icon-cell" aria-hidden="true">
                      <CategoryBrandMark categoryName={categoryLabel} size={24} radius={8} />
                    </div>
                    <div className="transaction-name-cell">
                      <InlineEditableCell
                        value={transaction.merchantClean ?? transaction.merchantRaw}
                        displayValue={merchantSummary}
                        ariaLabel={`Edit name for ${transaction.merchantRaw}`}
                        kind="text"
                        className="transaction-inline-edit transaction-inline-edit--name"
                        onCommit={(value) => commitInlineEdit(transaction, "name", value)}
                      />
                    </div>
                    <div className="transaction-date-cell">
                      <InlineEditableCell
                        value={transaction.date.slice(0, 10)}
                        displayValue={formatDate(transaction.date)}
                        ariaLabel={`Edit date for ${transaction.merchantRaw}`}
                        kind="date"
                        className="transaction-inline-edit transaction-inline-edit--date"
                        onCommit={(value) => commitInlineEdit(transaction, "date", value)}
                      />
                    </div>
                    <div className="transaction-account-cell">
                      <AccountBrandMark accountBrand={accountBrand} label={accountDisplayName} />
                      <InlineEditableCell
                        value={transaction.accountId}
                        displayValue={accountDisplayName}
                        ariaLabel={`Edit account for ${transaction.merchantRaw}`}
                        kind="select"
                        className="transaction-inline-edit transaction-inline-edit--select"
                        options={accounts.map((account) => ({
                          value: account.id,
                          label: getAccountDisplayName(account),
                        }))}
                        onCommit={(value) => commitInlineEdit(transaction, "accountId", value)}
                      />
                    </div>
                    <div className="transaction-category-cell">
                      <InlineEditableCell
                        value={categoryValue}
                        displayValue={categoryLabel}
                        ariaLabel={`Edit category for ${transaction.merchantRaw}`}
                        kind="select"
                        className="transaction-inline-edit transaction-inline-edit--select"
                        options={categories.map((category) => ({
                          value: category.id,
                          label: category.name,
                        }))}
                        onCommit={(value) => commitInlineEdit(transaction, "categoryId", value)}
                      />
                    </div>
                    <div className={`transaction-amount-cell ${amountToneClass}`}>
                      <InlineEditableCell
                        value={transaction.amount}
                        displayValue={formatTransactionAmount(amount, transaction.currency)}
                        ariaLabel={`Edit amount for ${transaction.merchantRaw}`}
                        kind="number"
                        className={`transaction-inline-edit transaction-inline-edit--amount ${amountToneClass}`}
                        onCommit={(value) => commitInlineEdit(transaction, "amount", value)}
                      />
                    </div>
                    <div className="transaction-notes-cell">
                      <button
                        type="button"
                        className="transaction-note-button transaction-note-button--plain"
                        onClick={() => openTransactionDetail(transaction)}
                        aria-label={`Open details for ${transaction.merchantRaw}`}
                      >
                        <ActionIcon name="chevron-right" />
                      </button>
                    </div>
                    <div className="transaction-warning-cell">
                      {warningReason ? (
                        <div
                          className={`transaction-warning-wrap ${
                            activeWarningTransactionId === transaction.id ? "is-open" : ""
                          }`}
                          ref={(node) => {
                            if (node) {
                              warningPopoverRefs.current.set(transaction.id, node);
                              return;
                            }

                            warningPopoverRefs.current.delete(transaction.id);
                          }}
                        >
                          <button
                            type="button"
                            className="warning-chip"
                            title={warningReason}
                            aria-label={warningReason}
                            aria-expanded={activeWarningTransactionId === transaction.id}
                            onClick={() =>
                              setActiveWarningTransactionId((current) => (current === transaction.id ? null : transaction.id))
                            }
                          >
                            <span className="warning-mark warning-mark--small" aria-hidden="true" />
                          </button>
                          <div className="transaction-warning-popover" role="tooltip" aria-label={warningReason}>
                            <p className="transaction-warning-popover__reason">{warningReason}</p>
                            <div className="transaction-warning-popover__actions">
                              <button
                                type="button"
                                className="button button-primary button-small"
                                onClick={() =>
                                  resolveTransactionWarning(
                                    transaction,
                                    {
                                      isExcluded: false,
                                      isTransfer: false,
                                      reviewStatus: "confirmed",
                                    },
                                    "Transaction kept.",
                                    "accepted"
                                  )
                                }
                              >
                                Keep
                              </button>
                              <button
                                type="button"
                                className="button button-secondary button-small"
                                onClick={() => void deleteWarningTransaction(transaction)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })
            ) : transactionsSummary.totalCount === 0 ? (
              <EmptyDataCta
                className="transactions-empty-state--table"
                eyebrow=""
                title="It is quiet in here"
                copy="Add your first transaction or import files to bring rows in."
                illustration={transactionsEmptyStateIllustration}
                illustrationAlt=""
                importHref="/transactions?import=1"
                accountHref="/accounts"
                transactionHref="/transactions?manual=1"
                actions={
                  <>
                    <button className="button button-primary button-small" type="button" onClick={() => openManualAdd()}>
                      Add transaction
                    </button>
                    <button className="button button-secondary button-small transactions-empty-state__import" type="button" onClick={() => openImportFiles()}>
                      Import files
                    </button>
                  </>
                }
              />
            ) : !hasVisibleTransactions ? (
              <div className="empty-state">No transactions match the current filters.</div>
            ) : null}
          </div>
            </>
          ) : null}

          {isCompactViewport ? (
          <div
            className={`transactions-mobile-view${!hasVisibleTransactions && !isTableLoading ? " transactions-table-wrap--empty" : ""}`}
          >
            {transactionsLoadFailed ? (
              <div className="empty-state transactions-empty-state--table">
                <strong>Couldn&apos;t load transactions.</strong>
                <p>Your transactions may still be there. Retry to refresh the latest workspace data.</p>
                <button className="button button-primary button-small" type="button" onClick={() => selectedWorkspaceId && void loadTransactionsPage(selectedWorkspaceId)}>
                  Retry
                </button>
              </div>
            ) : isTableLoading ? (
              <div className="transactions-mobile-list" role="status" aria-live="polite" aria-label="Loading transactions">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="transactions-mobile-simple-row transactions-mobile-simple-row--loading">
                    <span className="skeleton-block skeleton-block--line skeleton-block--line-long" />
                    <span className="skeleton-block skeleton-block--amount" />
                    <span className="skeleton-block skeleton-block--chevron" />
                  </div>
                ))}
              </div>
            ) : transactionsSummary.totalCount > 0 ? (
              <div className="transactions-mobile-list">
                {mobileTransactionGroups.map((group) => (
                  <section key={group.date} className="transactions-mobile-date-group">
                    <div className="transactions-mobile-date-divider">
                      <span>{`-------${group.label}-------`}</span>
                    </div>
                    <div className="transactions-mobile-date-group__rows">
                      {group.transactions.map((transaction) => {
                        const amount = Number(transaction.amount);
                        const categoryValue = transaction.categoryId ?? otherCategoryId;
                        const accountInstitution = transaction.institution ?? accountInstitutionById.get(transaction.accountId) ?? null;
                        const categoryLabel =
                          getEffectiveTransactionCategoryName({
                            categoryName: transaction.categoryName ?? categories.find((category) => category.id === categoryValue)?.name ?? null,
                            rawPayload: transaction.rawPayload as never,
                            merchantRaw: transaction.merchantRaw,
                            merchantClean: transaction.merchantClean,
                            institution: accountInstitution,
                            source: transaction.source ?? null,
                            type: transaction.type,
                          }) ??
                          guessCategoryName(transaction.merchantClean ?? transaction.merchantRaw, transaction.type) ??
                          "Other";
                        const effectiveType = coerceTransactionTypeFromCategoryName(categoryLabel, transaction.type);
                        const isTransferTransaction = effectiveType === "transfer";
                        const amountToneClass = isTransferTransaction ? "neutral" : effectiveType === "income" ? "positive" : "negative";
                        const merchantSummary =
                          transaction.merchantClean?.trim() ||
                          summarizeTransactionMerchantText(transaction.merchantClean ?? transaction.merchantRaw);
                        const accountDisplayName = accountNameById.get(transaction.accountId) ?? transaction.accountName;
                        const accountBrand = accountBrandById.get(transaction.accountId) ?? getAccountBrand({
                          institution: accountInstitution,
                          name: accountDisplayName,
                          type: effectiveType === "transfer" ? "bank" : effectiveType === "income" ? "bank" : "other",
                        });

                        return (
                          <article
                            key={transaction.id}
                            ref={(node) => {
                              if (node) {
                                transactionRowRefs.current.set(transaction.id, node);
                                return;
                              }

                              transactionRowRefs.current.delete(transaction.id);
                            }}
                            className={`transactions-mobile-simple-row${transaction.isExcluded ? " is-muted" : ""}`}
                            tabIndex={0}
                            role="button"
                            aria-label={`${merchantSummary}, ${formatDate(transaction.date)}, ${formatTransactionAmount(
                              amount,
                              transaction.currency
                            )}`}
                            onClick={() => openTransactionDetail(transaction)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                openTransactionDetail(transaction);
                              }
                            }}
                          >
                            <div className="transactions-mobile-simple-row__name">
                              <CategoryBrandMark
                                categoryName={categoryLabel}
                                size={24}
                                radius={8}
                                className="transactions-mobile-simple-row__category-icon"
                              />
                              <span className="transactions-mobile-simple-row__name-main">{merchantSummary}</span>
                            </div>
                            <div className={`transactions-mobile-simple-row__amount-group ${amountToneClass}`}>
                              <span className="transactions-mobile-simple-row__account-brand" aria-hidden="true">
                                <AccountBrandMark accountBrand={accountBrand} label={accountDisplayName} />
                              </span>
                              <span className="transactions-mobile-simple-row__amount">{formatTransactionAmount(amount, transaction.currency)}</span>
                            </div>
                            <button
                              type="button"
                              className="transactions-mobile-simple-row__detail transactions-mobile-simple-row__detail--plain"
                              onClick={(event) => {
                                event.stopPropagation();
                                openTransactionDetail(transaction);
                              }}
                              aria-label={`Open details for ${transaction.merchantRaw}`}
                            >
                              <ActionIcon name="chevron-right" />
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
                {hasMoreMobileTransactions ? (
                  <div
                    ref={mobileLoadMoreRef}
                    className={`transactions-mobile-load-more${isMobileLoadingMore ? " is-loading" : ""}`}
                    aria-live="polite"
                  >
                    {isMobileLoadingMore ? <span className="transactions-mobile-load-more__spinner" aria-hidden="true" /> : null}
                    <span>{isMobileLoadingMore ? "Loading more transactions…" : "Scroll for more"}</span>
                  </div>
                ) : null}
              </div>
            ) : transactionsSummary.totalCount === 0 ? (
              <EmptyDataCta
                className="transactions-empty-state--table"
                eyebrow=""
                title="It is quiet in here"
                copy="Add your first transaction or import files to bring rows in."
                illustration={transactionsEmptyStateIllustration}
                illustrationAlt=""
                importHref="/transactions?import=1"
                accountHref="/accounts"
                transactionHref="/transactions?manual=1"
                actions={
                  <>
                    <button className="button button-primary button-small" type="button" onClick={() => openManualAdd()}>
                      Add transaction
                    </button>
                    <button className="button button-secondary button-small transactions-empty-state__import" type="button" onClick={() => openImportFiles()}>
                      Import files
                    </button>
                  </>
                }
              />
            ) : !hasVisibleTransactions ? (
              <div className="empty-state">No transactions match the current filters.</div>
            ) : null}
          </div>
          ) : null}

          {!isCompactViewport ? (
            <div className="transactions-footer" style={{ ...transactionsFooterStyle, marginTop: "auto" }}>
              <div className="table-footer__summary">
                {transactionsSummary.totalCount > 0 ? (
                  <span className="pill pill-subtle">Showing filtered {currentPageLabel}</span>
                ) : null}
                {warningTransactionCount > 0 ? (
                  <button
                    type="button"
                    className="warning-summary-button"
                    title={`${warningTransactionCount} transaction${warningTransactionCount === 1 ? "" : "s"} have a warning. Open the first one.`}
                    onClick={() => {
                      if (firstReviewTransaction) {
                        openTransactionReview(firstReviewTransaction, transactionsSummary.firstReviewTransactionIndex);
                      }
                    }}
                    aria-label={
                      firstReviewTransaction
                        ? `${warningTransactionCount} transaction${warningTransactionCount === 1 ? "" : "s"} have a warning. Open the first one: ${firstReviewTransaction.merchantRaw}`
                        : `${warningTransactionCount} transaction${warningTransactionCount === 1 ? "" : "s"} have a warning`
                    }
                  >
                    <span className="warning-mark warning-mark--small" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              <div className="transactions-pagination" aria-label="Transaction pages">
                <div className="transactions-pagination__nav">
                  <button
                    className="button button-secondary button-small transactions-action-button"
                    type="button"
                    onClick={() => setTransactionsPage((current) => Math.max(1, current - 1))}
                    disabled={currentTransactionPage <= 1}
                  >
                    Prev
                  </button>
                  {paginationPages.map((page, index) =>
                    page === "ellipsis" ? (
                      <span key={`ellipsis-${index}`} className="transactions-pagination__ellipsis" aria-hidden="true">
                        …
                      </span>
                    ) : (
                      <button
                        key={page}
                        className={`button button-secondary button-small transactions-action-button transactions-pagination__page ${
                          page === currentTransactionPage ? "is-active" : ""
                        }`}
                        type="button"
                        onClick={() => setTransactionsPage(page)}
                        aria-current={page === currentTransactionPage ? "page" : undefined}
                      >
                        {page}
                      </button>
                    )
                  )}
                  <button
                    className="button button-secondary button-small transactions-action-button"
                    type="button"
                    onClick={() => setTransactionsPage((current) => Math.min(totalTransactionPages, current + 1))}
                    disabled={currentTransactionPage >= totalTransactionPages}
                  >
                    Next
                  </button>
                </div>
                <label className="transactions-pagination__size">
                  <span>Rows</span>
                  <select
                    value={transactionsPageSize}
                    onChange={(event) => {
                      setTransactionsPageSize(Number(event.target.value));
                      setTransactionsPage(1);
                    }}
                    aria-label="Rows per page"
                  >
                    {[25, 50, 100, 200].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="transactions-footer-snapshot" aria-label="Cash flow snapshot for all filtered transactions">
                <div className="transactions-footer-snapshot__metrics">
                  <div className="transactions-footer-snapshot__metric">
                    <span className="transactions-footer-snapshot__metric-label">Spending</span>
                    <span className="transactions-footer-snapshot__metric-value negative">
                      {formatTransactionAggregate(transactionsSummary.spending, visibleTransactions)}
                    </span>
                  </div>
                  <div className="transactions-footer-snapshot__metric">
                    <span className="transactions-footer-snapshot__metric-label">Transfers</span>
                    <span className="transactions-footer-snapshot__metric-value">
                      {formatTransactionAggregate(transactionsSummary.transfers, visibleTransactions)}
                    </span>
                  </div>
                  <div className="transactions-footer-snapshot__metric transactions-footer-snapshot__metric--net" style={transactionsFooterNetMetricStyle}>
                    <span className="transactions-footer-snapshot__metric-label">Net cash flow</span>
                    <span className={`transactions-footer-snapshot__metric-value ${netCashFlow >= 0 ? "positive" : "negative"}`}>
                      {formatTransactionAggregate(netCashFlow, visibleTransactions)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <aside
          className={`transactions-summary-panel glass ${summaryOpen ? "" : "is-hidden"}`}
          aria-label="Transaction summary"
          hidden={isCompactViewport}
        >
          <div className="transactions-summary-panel__head">
            <p className="eyebrow">Summary</p>
            <h4>Overview</h4>
          </div>

          <dl className="transactions-summary-list">
            <div>
              <dt>Total transactions</dt>
              <dd>{transactionsSummary.totalCount}</dd>
            </div>
            <div>
              <dt>Income</dt>
              <dd className="positive">{formatTransactionAggregate(transactionsSummary.income, visibleTransactions)}</dd>
            </div>
            <div>
              <dt>Spending</dt>
              <dd className="negative">{formatTransactionAggregate(transactionsSummary.spending, visibleTransactions)}</dd>
            </div>
            <div>
              <dt>Transfers</dt>
              <dd>{formatTransactionAggregate(transactionsSummary.transfers, visibleTransactions)}</dd>
            </div>
            <div>
              <dt>Net cash flow</dt>
              <dd className={netCashFlow >= 0 ? "positive" : "negative"}>{formatTransactionAggregate(netCashFlow, visibleTransactions)}</dd>
            </div>
            <div>
              <dt>Review items</dt>
              <dd>{transactionsSummary.review}</dd>
            </div>
            <div>
              <dt>Top category</dt>
              <dd>{transactionsSummary.topCategory ? `${transactionsSummary.topCategory[0]} · ${formatTransactionAggregate(transactionsSummary.topCategory[1], visibleTransactions)}` : "—"}</dd>
            </div>
            <div>
              <dt>Top source</dt>
              <dd>{transactionsSummary.topAccount ? `${transactionsSummary.topAccount[0]} · ${formatTransactionAggregate(transactionsSummary.topAccount[1], visibleTransactions)}` : "—"}</dd>
            </div>
            <div>
              <dt>First transaction</dt>
              <dd>{transactionsSummary.firstTransactionDate ? formatDate(transactionsSummary.firstTransactionDate) : "—"}</dd>
            </div>
            <div>
              <dt>Last transaction</dt>
              <dd>{transactionsSummary.lastTransactionDate ? formatDate(transactionsSummary.lastTransactionDate) : "—"}</dd>
            </div>
          </dl>

        </aside>
      </section>

      {bulkEditOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setBulkEditOpen(false)}>
          <section
            className="modal-card modal-card--manual glass"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-edit-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Transactions</p>
                <h4 id="bulk-edit-title">Bulk edit</h4>
                <p className="modal-copy">{selectedTransactionIds.length} selected · apply the same changes to all rows.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setBulkEditOpen(false)} aria-label="Close bulk edit">
                ×
              </button>
            </div>

            <form className="manual-form" onSubmit={applyBulkEdit}>
              <div className="form-grid transactions-bulk-grid">
                <label>
                  Category
                  <select value={bulkEditForm.categoryId} onChange={(event) => setBulkEditForm((current) => ({ ...current, categoryId: event.target.value }))}>
                    <option value="">Leave unchanged</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Account
                  <select value={bulkEditForm.accountId} onChange={(event) => setBulkEditForm((current) => ({ ...current, accountId: event.target.value }))}>
                    <option value="">Leave unchanged</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {getAccountDisplayName(account)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Type
                  <select value={bulkEditForm.type} onChange={(event) => setBulkEditForm((current) => ({ ...current, type: event.target.value as BulkEditForm["type"] }))}>
                    <option value="">Leave unchanged</option>
                    <option value="debit">Debit</option>
                    <option value="credit">Credit</option>
                  </select>
                </label>
              </div>

              <div className="form-actions">
                <button className="button button-secondary" type="button" onClick={() => setBulkEditOpen(false)}>
                  Cancel
                </button>
                <button className="button button-primary" type="submit" disabled={isSaving}>
                  {isSaving ? "Saving..." : "Apply changes"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {manualOpen ? (
        <div className="modal-backdrop modal-backdrop--centered-mobile" role="presentation" onClick={() => setManualOpen(false)}>
          <section
            className="modal-card modal-card--manual glass"
            style={manualModalStyle}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-transaction-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Transactions</p>
                <h4 id="add-transaction-title">Add transaction</h4>
              </div>
              <button className="icon-button" type="button" onClick={() => setManualOpen(false)} aria-label="Close add transaction dialog">
                ×
              </button>
            </div>

            <form onSubmit={saveManualTransaction}>
              <div className="manual-form-layout manual-form-layout--compact">
                <div className="transactions-manual-type-toggle" role="group" aria-label="Transaction type">
                  <button
                    type="button"
                    className={`transactions-manual-type-toggle__button ${manualForm.type === "debit" ? "is-active" : ""}`}
                    onClick={() => setManualForm((current) => ({ ...current, type: "debit" }))}
                    aria-pressed={manualForm.type === "debit"}
                  >
                    <span className="transactions-manual-type-symbol" aria-hidden="true">
                      −
                    </span>
                    <span>Debit</span>
                  </button>
                  <button
                    type="button"
                    className={`transactions-manual-type-toggle__button ${manualForm.type === "credit" ? "is-active" : ""}`}
                    onClick={() => setManualForm((current) => ({ ...current, type: "credit" }))}
                    aria-pressed={manualForm.type === "credit"}
                  >
                    <span className="transactions-manual-type-symbol" aria-hidden="true">
                      +
                    </span>
                    <span>Credit</span>
                  </button>
                </div>

                <div className="transactions-manual-row transactions-manual-row--name">
                  <label className="transactions-manual-field transactions-manual-field--embedded-label transactions-manual-name-field">
                    <span className="transactions-manual-field__label">Name</span>
                    <input
                      ref={manualNameInputRef}
                      value={manualForm.merchantRaw}
                      onChange={(event) => setManualForm((current) => ({ ...current, merchantRaw: event.target.value }))}
                      placeholder="Lunch in Makati"
                      required
                    />
                  </label>
                </div>

                <div className="transactions-manual-row transactions-manual-row--money">
                  <label className="transactions-manual-field transactions-manual-field--embedded-label transactions-manual-money-row__currency">
                    <span className="transactions-manual-field__label">Currency</span>
                    <CurrencySelector
                      value={manualForm.currency}
                      onChange={(value) => setManualForm((current) => ({ ...current, currency: value }))}
                      options={currencyCatalogCodes}
                      ariaLabel="Select transaction currency"
                      className="transactions-manual-currency"
                      buttonClassName="transactions-manual-currency__button"
                      menuClassName="transactions-manual-currency__menu"
                      optionClassName="transactions-manual-currency__option"
                      menuAlignment="end"
                      showChevron={false}
                      portalMenu
                    />
                  </label>
                  <label className="transactions-manual-field transactions-manual-field--embedded-label transactions-manual-money-row__amount">
                    <span className="transactions-manual-field__label">Amount</span>
                    <input
                      type="number"
                      step="0.01"
                      value={manualForm.amount}
                      onChange={(event) => setManualForm((current) => ({ ...current, amount: event.target.value }))}
                      placeholder="0.00"
                      required
                    />
                  </label>
                </div>

                <div className="transactions-manual-inline-row transactions-manual-inline-row--account">
                  <span className="transactions-manual-inline-row__icon transactions-manual-inline-row__icon--account" aria-hidden="true">
                    <AccountBrandMark accountBrand={manualSelectedAccountBrand} label={manualSelectedAccount ? getAccountDisplayName(manualSelectedAccount) : "Cash"} />
                  </span>
                  <label className="transactions-manual-field transactions-manual-field--embedded-label transactions-manual-inline-row__field">
                    <span className="transactions-manual-field__label">Account</span>
                    <div className="transactions-manual-picker">
                      <div className="transactions-manual-picker__control">
                        <button
                          type="button"
                          className="transactions-manual-picker__button transactions-manual-picker__button--plain"
                          aria-expanded={manualAccountMenuOpen}
                          onClick={() => {
                            setManualCategoryMenuOpen(false);
                            setManualAccountMenuOpen((current) => !current);
                          }}
                        >
                          <span className="transactions-manual-picker__text">
                            {manualSelectedAccount ? getAccountDisplayName(manualSelectedAccount) : "Cash"}
                          </span>
                          <span className="transactions-manual-picker__chevron" aria-hidden="true">
                            <ActionIcon name="chevron-down" />
                          </span>
                        </button>
                        {manualAccountMenuOpen ? (
                          <div className="transactions-manual-picker__menu" role="listbox" aria-label="Choose account">
                            {accounts.map((account) => {
                              const accountDisplayName = getAccountDisplayName(account);

                              return (
                                <button
                                  key={account.id}
                                  type="button"
                                  className={`transactions-manual-picker__option ${
                                    account.id === manualForm.accountId ? "is-selected" : ""
                                  }`}
                                  onClick={() => {
                                    setManualForm((current) => ({ ...current, accountId: account.id }));
                                    setManualAccountMenuOpen(false);
                                  }}
                                >
                                  <span className="transactions-manual-picker__option-text">
                                    <strong>{accountDisplayName}</strong>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </label>
                </div>

                <div className="transactions-manual-inline-row transactions-manual-inline-row--category">
                  <span className="transactions-manual-inline-row__icon transactions-manual-inline-row__icon--category" aria-hidden="true">
                    <CategoryBrandMark
                      categoryName={manualSelectedCategory?.name ?? "Other"}
                      size="100%"
                      radius={18}
                      className="transactions-manual-inline-row__icon-badge"
                    />
                  </span>
                  <label className="transactions-manual-field transactions-manual-field--embedded-label transactions-manual-inline-row__field">
                    <span className="transactions-manual-field__label">Category</span>
                    <div className="transactions-manual-picker">
                      <div className="transactions-manual-picker__control">
                        <button
                          type="button"
                          className="transactions-manual-picker__button transactions-manual-picker__button--plain"
                          aria-expanded={manualCategoryMenuOpen}
                          onClick={() => {
                            setManualAccountMenuOpen(false);
                            setManualCategoryMenuOpen((current) => !current);
                          }}
                        >
                          <span className="transactions-manual-picker__text">{manualSelectedCategory?.name ?? "Other"}</span>
                          <span className="transactions-manual-picker__chevron" aria-hidden="true">
                            <ActionIcon name="chevron-down" />
                          </span>
                        </button>
                        {manualCategoryMenuOpen ? (
                          <div className="transactions-manual-picker__menu" role="listbox" aria-label="Choose category">
                            {categories.map((category) => (
                              <button
                                key={category.id}
                                type="button"
                                className={`transactions-manual-picker__option ${
                                  category.id === manualSelectedCategoryId ? "is-selected" : ""
                                }`}
                                onClick={() => {
                                  setManualCategoryTouched(true);
                                  setManualForm((current) => ({ ...current, categoryId: category.id }));
                                  setManualCategoryMenuOpen(false);
                                }}
                              >
                                <span className="transactions-manual-picker__option-text">
                                  <strong>{category.name}</strong>
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </label>
                </div>

                <label className="transactions-manual-field transactions-manual-field--embedded-label">
                  <span className="transactions-manual-field__label">Date</span>
                  <input
                    type="date"
                    value={manualForm.date}
                    onChange={(event) => setManualForm((current) => ({ ...current, date: event.target.value }))}
                    required
                  />
                </label>

                {manualMoreOpen ? (
                  <button
                    type="button"
                    className="transactions-manual-more"
                    onClick={() => setManualMoreOpen((current) => !current)}
                    aria-expanded={manualMoreOpen}
                  >
                    <span>{manualMoreOpen ? "Less" : "More"}</span>
                    <span className={`transactions-manual-more__chevron ${manualMoreOpen ? "is-open" : ""}`} aria-hidden="true">
                      <ActionIcon name="chevron-down" />
                    </span>
                  </button>
                ) : (
                  <div className="manual-form-actions manual-form-actions--closed">
                    <button
                      type="button"
                      className="transactions-manual-more"
                      onClick={() => setManualMoreOpen((current) => !current)}
                      aria-expanded={manualMoreOpen}
                    >
                      <span>{manualMoreOpen ? "Less" : "More"}</span>
                      <span className={`transactions-manual-more__chevron ${manualMoreOpen ? "is-open" : ""}`} aria-hidden="true">
                        <ActionIcon name="chevron-down" />
                      </span>
                    </button>
                    <div className="manual-form-actions__right">
                      <button
                        className="transactions-manual-add-another"
                        type="submit"
                        data-submit-mode="add-another"
                        disabled={isSaving}
                      >
                        Add another
                      </button>
                      <button className="button button-primary" type="submit" data-submit-mode="close" disabled={isSaving}>
                        {isSaving ? "Saving..." : "Add transaction"}
                      </button>
                    </div>
                  </div>
                )}

                {manualMoreOpen ? (
                  <>
                    <div className="manual-more-panel manual-more-panel--compact">
                      <label className="transactions-manual-field transactions-manual-field--embedded-label">
                        <span className="transactions-manual-field__label">Notes</span>
                        <textarea
                          value={manualForm.description}
                          onChange={(event) => setManualForm((current) => ({ ...current, description: event.target.value }))}
                          placeholder="Optional note or review context"
                        />
                      </label>

                      <div className="manual-more-panel__receipt-line-items">
                        <div className="manual-more-panel__section-head">
                          <span>Receipt line items</span>
                        </div>

                        {manualForm.receiptLineItems.length === 0 ? (
                          <p className="field-help field-help--compact">
                            Optional. Add item lines if you want the receipt breakdown to follow the transaction.
                          </p>
                        ) : null}

                        {manualForm.receiptLineItems.length > 0 ? (
                          <div className="manual-receipt-table" role="table" aria-label="Receipt line items">
                            <div className="manual-receipt-table__header" role="row">
                              <span role="columnheader">Item</span>
                              <span role="columnheader">Price</span>
                              <span aria-hidden="true" />
                            </div>

                            {manualForm.receiptLineItems.map((lineItem, index) => (
                              <div key={index} className="manual-receipt-table__row" role="row">
                                <label className="manual-receipt-table__cell" role="cell">
                                  <span className="sr-only">Item</span>
                                  <input
                                    value={lineItem.description}
                                    onChange={(event) =>
                                      setManualForm((current) => ({
                                        ...current,
                                        receiptLineItems: current.receiptLineItems.map((entry, entryIndex) =>
                                          entryIndex === index ? { ...entry, description: event.target.value } : entry
                                        ),
                                      }))
                                    }
                                    placeholder="Coffee"
                                  />
                                </label>
                                <label className="manual-receipt-table__cell manual-receipt-table__cell--price" role="cell">
                                  <span className="sr-only">Price</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={lineItem.amount}
                                    onChange={(event) =>
                                      setManualForm((current) => ({
                                        ...current,
                                        receiptLineItems: current.receiptLineItems.map((entry, entryIndex) =>
                                          entryIndex === index ? { ...entry, amount: event.target.value } : entry
                                        ),
                                      }))
                                    }
                                    placeholder="0.00"
                                  />
                                </label>
                                <button
                                  type="button"
                                  className="manual-receipt-table__remove"
                                  onClick={() =>
                                    setManualForm((current) => ({
                                      ...current,
                                      receiptLineItems: current.receiptLineItems.filter((_, entryIndex) => entryIndex !== index),
                                    }))
                                  }
                                  aria-label="Remove line item"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        <button
                          type="button"
                          className="manual-receipt-table__add-floater"
                          onClick={() =>
                            setManualForm((current) => ({
                              ...current,
                              receiptLineItems: [...current.receiptLineItems, createEmptyReceiptLineItem()],
                            }))
                          }
                          aria-label="Add receipt line item"
                        >
                          +
                        </button>

                        {manualReceiptLineItemHasValues ? (
                          <div className="field-help">
                            <div>Line-item total: {formatTransactionAmount(manualReceiptLineItemTotal, manualForm.currency)}</div>
                            {manualReceiptLineItemMismatch ? (
                              <div>Line items do not match the transaction amount yet.</div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="manual-form-actions manual-form-actions--expanded">
                      <div className="manual-form-actions__right">
                        <button
                          className="transactions-manual-add-another"
                          type="submit"
                          data-submit-mode="add-another"
                          disabled={isSaving}
                        >
                          Add another
                        </button>
                        <button className="button button-primary" type="submit" data-submit-mode="close" disabled={isSaving}>
                          {isSaving ? "Saving..." : "Add transaction"}
                        </button>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {selectedTransaction ? (
        <div className="modal-backdrop modal-backdrop--transaction-detail" role="presentation" onClick={closeTransactionDetail}>
          <section
            className="modal-card modal-card--wide transaction-drawer transaction-drawer--sidepanel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="transaction-notes-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head transaction-drawer__head">
              <div className="transaction-drawer__head-title">
                <button
                  className="icon-button transaction-drawer__back-button"
                  type="button"
                  onClick={closeTransactionDetail}
                  aria-label="Back to transactions"
                >
                  <ActionIcon name="chevron-left" />
                </button>
                <div>
                  <p className="eyebrow">Transaction details</p>
                  <h4 id="transaction-notes-title">{detailTransactionSummary || selectedTransaction.merchantRaw}</h4>
                  {hasDistinctDetailRawName ? <p className="transaction-drawer__merchant-raw">{detailTransactionRawName}</p> : null}
                </div>
              </div>
              <button className="icon-button transaction-drawer__close-button" type="button" onClick={closeTransactionDetail} aria-label="Close transaction details">
                ×
              </button>
            </div>

            <div className="transaction-drawer-form transaction-drawer-form--single">
              <label>
                Name
                <input
                  value={detailDraft?.merchantClean ?? selectedTransaction.merchantClean ?? selectedTransaction.merchantRaw}
                  onChange={(event) =>
                    setDetailDraft((current) => (current ? { ...current, merchantClean: event.target.value } : current))
                  }
                  placeholder="Merchant or payee"
                />
              </label>

              <label>
                Date
                <input
                  type="date"
                  value={detailDraft?.date ?? todayIso}
                  onChange={(event) => setDetailDraft((current) => (current ? { ...current, date: event.target.value } : current))}
                />
              </label>

              <label>
                Amount
                <input
                  type="number"
                  step="0.01"
                  value={detailDraft?.amount ?? selectedTransaction.amount}
                  onChange={(event) => setDetailDraft((current) => (current ? { ...current, amount: event.target.value } : current))}
                />
              </label>

              <label>
                <span className="transactions-manual-type-label">
                  <span>Type</span>
                </span>
                <div className="transactions-manual-type-control transaction-drawer-type-control">
                  <span className="transactions-manual-type-symbol" aria-hidden="true">
                    {(detailDraft?.type ?? (selectedTransaction.type === "income" ? "credit" : "debit")) === "credit" ? "+" : "-"}
                  </span>
                  <select
                    value={detailDraft?.type ?? (selectedTransaction.type === "income" ? "credit" : "debit")}
                    onChange={(event) =>
                      setDetailDraft((current) =>
                        current
                          ? {
                              ...current,
                              type: event.target.value as TransactionDetailDraft["type"],
                            }
                          : current
                      )
                    }
                  >
                    <option value="debit">Debit</option>
                    <option value="credit">Credit</option>
                  </select>
                </div>
              </label>

              <label>
                <span className="transaction-drawer-field-label">
                  <span>Account</span>
                </span>
                <div className="transaction-drawer-select">
                  <span className="transaction-drawer-select__icon" aria-hidden="true">
                    {detailSelectedAccountBrand ? (
                      <AccountBrandMark
                        accountBrand={detailSelectedAccountBrand}
                        label={detailSelectedAccount?.name ?? "Account"}
                      />
                    ) : null}
                  </span>
                  <select
                    value={detailDraft?.accountId ?? ""}
                    onChange={(event) => setDetailDraft((current) => (current ? { ...current, accountId: event.target.value } : current))}
                  >
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {getAccountDisplayName(account)}
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              <label>
                <span className="transaction-drawer-field-label">
                  <span>Category</span>
                </span>
                <div className="transaction-drawer-select">
                  <span className="transaction-drawer-select__icon" aria-hidden="true">
                    <CategoryBrandMark categoryName={detailSelectedCategory?.name ?? "Other"} size={24} radius={8} className="transaction-drawer-category-icon" />
                  </span>
                  <select
                    value={detailDraft?.categoryId ?? otherCategoryId}
                    onChange={(event) => setDetailDraft((current) => (current ? { ...current, categoryId: event.target.value } : current))}
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              <label className="transaction-drawer-form__currency">
                <span className="sr-only">Currency</span>
                <CurrencySelector
                  value={detailDraft?.currency ?? selectedTransaction.currency}
                  onChange={(value) => setDetailDraft((current) => (current ? { ...current, currency: value } : current))}
                  options={currencyCatalogCodes}
                  ariaLabel="Select transaction currency"
                  className="transaction-drawer-form__currency-selector"
                  buttonClassName="transaction-drawer-form__currency-button"
                  menuClassName="transaction-drawer-form__currency-menu"
                  optionClassName="transaction-drawer-form__currency-option"
                  menuAlignment="end"
                />
                <span className="field-help">Change this if the transaction should display in a different currency than the account.</span>
              </label>

              <label className="transaction-drawer-form__notes">
                Notes
                <textarea
                  value={detailDraft?.description ?? ""}
                  onChange={(event) => setDetailDraft((current) => (current ? { ...current, description: event.target.value } : current))}
                  placeholder="Optional note or review context"
                />
              </label>

              <details className="transaction-drawer-audit">
                <summary>How Clover read this</summary>
                <div className="transaction-drawer-audit__grid">
                  <div>
                    <span>Source</span>
                    <strong>{selectedTransaction.importFileId ? "Imported statement" : selectedTransaction.source ?? "Manual"}</strong>
                  </div>
                  <div>
                    <span>Raw name</span>
                    <strong>{selectedTransaction.merchantRaw}</strong>
                  </div>
                  <div>
                    <span>Normalized name</span>
                    <strong>{selectedTransaction.merchantClean ?? selectedTransaction.merchantRaw}</strong>
                  </div>
                  <div>
                    <span>Category</span>
                    <strong>{detailSelectedCategory?.name ?? selectedTransaction.categoryName ?? "Other"}</strong>
                  </div>
                </div>
                <pre>{formatAuditPayloadPreview(selectedTransaction.normalizedPayload ?? selectedTransaction.rawPayload)}</pre>
              </details>

              {selectedTransactionReceiptLineItems.length > 0 ? (
                <div className="transaction-drawer-receipt-lines">
                  <div className="transaction-drawer-receipt-lines__head">
                    <span className="transaction-drawer-field-label">
                      <span>Receipt line items</span>
                    </span>
                    <span className="field-help">
                      {formatTransactionAmount(
                        selectedTransactionReceiptLineItems.reduce(
                          (total, item) => total + (getReceiptLineItemComputedAmount(item) ?? 0),
                          0
                        ),
                        selectedTransaction.currency
                      )}
                    </span>
                  </div>
                  <div className="transaction-drawer-receipt-lines__list">
                    {selectedTransactionReceiptLineItems.map((lineItem, index) => {
                      const lineAmount = getReceiptLineItemComputedAmount(lineItem);
                      return (
                        <div key={`${lineItem.description}-${index}`} className="transaction-drawer-receipt-line">
                          <div className="transaction-drawer-receipt-line__meta">
                            <strong>{lineItem.description}</strong>
                            <span className="field-help">
                              {[
                                lineItem.quantity !== null && lineItem.quantity !== undefined ? `Qty ${lineItem.quantity}` : null,
                                lineItem.unitPrice !== null && lineItem.unitPrice !== undefined
                                  ? (() => {
                                      const unitPrice = parseReceiptLineItemNumber(lineItem.unitPrice);
                                      return unitPrice !== null
                                        ? `Unit ${formatTransactionAmount(unitPrice, selectedTransaction.currency)}`
                                        : `Unit ${lineItem.unitPrice}`;
                                    })()
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </div>
                          <span className="transaction-drawer-receipt-line__amount">
                            {lineAmount !== null
                              ? formatTransactionAmount(lineAmount, selectedTransaction.currency)
                              : lineItem.amount ?? "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="transaction-drawer-split-bill">
              {selectedTransaction.splitBill ? (
                <Link className="button button-secondary button-small" href={`/split-bill/${selectedTransaction.splitBill.id}`} prefetch={false}>
                  Open In Split Bills
                </Link>
              ) : (
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={() => {
                    setTransactionSplitBillError(null);
                    setTransactionSplitBillOpen((current) => !current);
                  }}
                >
                  {transactionSplitBillOpen ? "Hide Split Bills" : "Add To Split Bills"}
                </button>
              )}
              {transactionSplitBillError ? <p className="field-help field-help--compact transaction-drawer-split-bill__error">{transactionSplitBillError}</p> : null}
              {transactionSplitBillOpen && !selectedTransaction.splitBill ? (
                <SplitBillTransactionLinkFields
                  workspaceId={selectedTransaction.workspaceId}
                  draft={transactionSplitBillDraft}
                  onChange={setTransactionSplitBillDraft}
                  open={transactionSplitBillOpen}
                  title="Add transaction to Split Bills"
                  helperText="Choose a group or add names. The split bill will be created from this transaction."
                  actionLabel="Create split bill"
                  onAction={createTransactionSplitBill}
                  actionBusy={transactionSplitBillSaving}
                  actionDisabled={!transactionSplitBillDraft.groupId.trim() && transactionSplitBillDraft.participantNames.length === 0}
                />
              ) : null}
            </div>

            {selectedTransactionWarningReason ? (
              <div className="detail-warning-box detail-warning-box--compact transaction-drawer-warning">
                <div className="detail-warning-box__header">
                  <span className="detail-warning-box__icon" aria-hidden="true">
                    <span className="warning-mark warning-mark--small" aria-hidden="true" />
                  </span>
                  <strong>Review warning</strong>
                  <span className="detail-warning-box__reason">{selectedTransactionWarningReason}</span>
                </div>
                <div className="detail-warning-actions detail-warning-actions--compact">
                  <button
                    className="button button-primary button-small"
                    type="button"
                    onClick={() => {
                      resolveTransactionWarning(
                        selectedTransaction,
                        {
                          isExcluded: false,
                          isTransfer: false,
                          reviewStatus: "confirmed",
                        },
                        "Transaction kept.",
                        "accepted"
                      );
                    }}
                  >
                    Keep
                  </button>
                  <button
                    className="button button-secondary button-small detail-warning-delete"
                    type="button"
                    onClick={() => {
                      setTransactionDeleteConfirmOpen(true);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : null}

            <div className="form-actions detail-actions">
              {!selectedTransactionWarningReason ? (
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setTransactionDeleteConfirmOpen(true)}
                >
                  Delete transaction
                </button>
              ) : null}
              {transactionDeleteConfirmOpen ? (
                <div className="detail-warning-box transaction-delete-confirm">
                  <p>
                    <strong>Delete transaction:</strong> This cannot be undone.
                  </p>
                  <div className="detail-warning-actions detail-warning-actions--compact">
                    <button
                      className="button button-secondary button-small"
                      type="button"
                      onClick={() => setTransactionDeleteConfirmOpen(false)}
                      disabled={isSaving}
                    >
                      Cancel
                    </button>
                    <button className="button button-danger button-small" type="button" onClick={() => void confirmDeleteTransaction()} disabled={isSaving}>
                      {isSaving ? "Deleting..." : "Delete transaction"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {merchantRenameSuggestion ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setMerchantRenameSuggestion(null)}>
          <section
            className="modal-card modal-card--wide glass"
            role="dialog"
            aria-modal="true"
            aria-labelledby="merchant-rename-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Merchant cleanup</p>
                <h4 id="merchant-rename-title">Apply this cleaner name everywhere?</h4>
                <p className="modal-copy">
                  You changed <strong>{merchantRenameSuggestion.sourceMerchantRaw}</strong> to{" "}
                  <strong>{merchantRenameSuggestion.targetMerchantClean}</strong>. There{" "}
                  {merchantRenameSuggestion.matchingTransactionIds.length === 1 ? "is 1 other matching transaction" : `are ${merchantRenameSuggestion.matchingTransactionIds.length} other matching transactions`}{" "}
                  with the same statement label.
                </p>
              </div>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => {
                    capturePostHogClientEvent("ai_suggestion_rejected", {
                      workspace_id: selectedWorkspaceId || null,
                      suggestion_type: "merchant_rename",
                      source_transaction_id: merchantRenameSuggestion.sourceTransactionId,
                      source_merchant_raw: merchantRenameSuggestion.sourceMerchantRaw,
                      target_merchant_clean: merchantRenameSuggestion.targetMerchantClean,
                      transaction_account: null,
                    });
                    capturePostHogClientEvent("merchant_rule_reverted", {
                      workspace_id: selectedWorkspaceId || null,
                      suggestion_type: "merchant_rename",
                      source_transaction_id: merchantRenameSuggestion.sourceTransactionId,
                      source_merchant_raw: merchantRenameSuggestion.sourceMerchantRaw,
                      target_merchant_clean: merchantRenameSuggestion.targetMerchantClean,
                    });
                    capturePostHogClientEvent("merchant_rule_deleted", {
                      workspace_id: selectedWorkspaceId || null,
                      suggestion_type: "merchant_rename",
                      source_transaction_id: merchantRenameSuggestion.sourceTransactionId,
                      source_merchant_raw: merchantRenameSuggestion.sourceMerchantRaw,
                      target_merchant_clean: merchantRenameSuggestion.targetMerchantClean,
                    });
                    setMerchantRenameSuggestion(null);
                  }}
                  aria-label="Close merchant rename suggestion"
                >
                ×
              </button>
            </div>

            <div className="detail-warning-box">
              <p>
                If you accept, Clover will update the matching transactions to use{" "}
                <strong>{merchantRenameSuggestion.targetMerchantClean}</strong> as the bold name, while keeping the raw
                statement text in gray for reference.
              </p>
            </div>

            <div className="form-actions detail-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  capturePostHogClientEvent("ai_suggestion_rejected", {
                    workspace_id: selectedWorkspaceId || null,
                    suggestion_type: "merchant_rename",
                    source_transaction_id: merchantRenameSuggestion.sourceTransactionId,
                    source_merchant_raw: merchantRenameSuggestion.sourceMerchantRaw,
                    target_merchant_clean: merchantRenameSuggestion.targetMerchantClean,
                    transaction_account: null,
                  });
                  capturePostHogClientEvent("merchant_rule_reverted", {
                    workspace_id: selectedWorkspaceId || null,
                    suggestion_type: "merchant_rename",
                    source_transaction_id: merchantRenameSuggestion.sourceTransactionId,
                    source_merchant_raw: merchantRenameSuggestion.sourceMerchantRaw,
                    target_merchant_clean: merchantRenameSuggestion.targetMerchantClean,
                  });
                  capturePostHogClientEvent("merchant_rule_deleted", {
                    workspace_id: selectedWorkspaceId || null,
                    suggestion_type: "merchant_rename",
                    source_transaction_id: merchantRenameSuggestion.sourceTransactionId,
                    source_merchant_raw: merchantRenameSuggestion.sourceMerchantRaw,
                    target_merchant_clean: merchantRenameSuggestion.targetMerchantClean,
                  });
                  setMerchantRenameSuggestion(null);
                }}
                disabled={merchantRenameBusy}
              >
                Ignore
              </button>
              <button
                className="button button-primary"
                type="button"
                onClick={() => void applyMerchantRenameSuggestion()}
                disabled={merchantRenameBusy}
              >
                {merchantRenameBusy ? "Applying..." : `Apply to ${merchantRenameSuggestion.matchingTransactionIds.length} more`}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <ImportFilesModal
        open={importOpen}
        workspaceId={selectedWorkspaceId}
        accounts={accounts}
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
          const importedAccountKey = normalizeImportedAccountKey(summary.accountName, summary.institution, summary.accountNumber ?? null, summary.accountType ?? null);
          const previewTransactions = summary.previewTransactions ?? [];
          const importedAccountId = summary.accountId ?? summary.optimisticAccountId ?? null;
          let nextAccountsSnapshot: Account[] | null = null;

          flushSync(() => {
            setIsWorkspaceDataReady(true);

            if (optimisticAccount) {
              setAccounts((current) =>
                (nextAccountsSnapshot = current.filter((account) => {
                  if (summary.optimisticAccountId && account.id === summary.optimisticAccountId) {
                    return false;
                  }

                  if (account.source === "upload") {
                    return normalizeImportedAccountKey(account.name, account.institution, account.accountNumber, account.type) !== importedAccountKey;
                  }

                  return true;
                }))
              );
            } else {
              setAccounts((current) => {
                nextAccountsSnapshot = current;
                return current;
              });
            }

            if (importedAccountId) {
              setTransactions((current) => {
                if (previewTransactions.length === 0) {
                  return current;
                }
                return mergeImportedPreviewTransactions(current, previewTransactions);
              });
            } else if (previewTransactions.length > 0) {
              setTransactions((current) => mergeImportedPreviewTransactions(current, previewTransactions));
            }

            if (optimisticAccount) {
              setAccounts((current) => {
                const next = mergeOptimisticImportedAccount(current, optimisticAccount);
                nextAccountsSnapshot = next;
                return next;
              });
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

          if (!selectedWorkspaceId) {
            return;
          }

          const shouldRefreshAfterImport = Boolean(settledAccountId);
          if (shouldRefreshAfterImport) {
            setImportRefreshInFlight(true);
            try {
              await loadWorkspaceMetadata(selectedWorkspaceId, { skipImports: true, background: true });
              await loadTransactionsPage(selectedWorkspaceId, { background: true });
            } finally {
              setImportRefreshInFlight(false);
            }
          }
          setMessage("Import complete. Accounts and Transactions are updated.");
        }}
      />
      <PlanLimitNudge payload={planLimitNudge} onDismiss={() => setPlanLimitNudge(null)} />
    </CloverShell>
  );
}
