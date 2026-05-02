"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "next/navigation";
import { CloverShell, useCloverChrome } from "@/components/clover-shell";
import { CloverLoadingScreen } from "@/components/clover-loading-screen";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { CurrencySelector } from "@/components/currency-selector";
import { EmptyDataCta } from "@/components/empty-data-cta";
import { PlanLimitNudge } from "@/components/plan-limit-nudge";
import { PageFileDropZone } from "@/components/page-file-drop-zone";
import {
  analyticsOnceKey,
  capturePostHogClientEvent,
  capturePostHogClientEventOnce,
} from "@/components/posthog-analytics";
import type { UploadInsightsSummary } from "@/components/upload-insights-toast";
import { getAccountBrand } from "@/lib/account-brand";
import { guessCategoryName, inferAccountTypeFromStatement } from "@/lib/import-parser";
import { humanizeMerchantText, summarizeMerchantText } from "@/lib/merchant-labels";
import { buildTransactionQuerySearchParams } from "@/lib/transaction-query";
import { readSelectedWorkspaceId } from "@/lib/workspace-selection";
import { chooseWorkspaceId, persistSelectedWorkspaceId, selectedWorkspaceKey } from "@/lib/workspace-selection";
import {
  applyOptimisticWorkspaceTransactionDeletion,
  mergeImportedWorkspaceTransactions,
  normalizeImportedAccountKey,
} from "@/lib/workspace-cache";
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
  type: "bank" | "wallet" | "credit_card" | "cash" | "investment" | "other";
  currency: string;
  source?: string;
  balance?: string | null;
};

const buildOptimisticImportedAccount = (summary: UploadInsightsSummary): Account | null => {
  const optimisticAccountId = summary.accountId ?? summary.optimisticAccountId ?? null;
  if (!optimisticAccountId || !summary.accountName) {
    return null;
  }

  return {
    id: optimisticAccountId,
    name: summary.accountName,
    institution: summary.institution,
    accountNumber: summary.accountNumber ?? null,
    type: summary.accountType ?? inferAccountTypeFromStatement(summary.institution, summary.accountName, "bank"),
    currency: "PHP",
    balance: summary.balance,
  };
};

const transactionsEmptyStateIllustration = "/illustrations/clover-transactions-search-3d.png";

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
    const accountKey = normalizeImportedAccountKey(account.name, account.institution, account.accountNumber, account.type);
    const optimistic = currentAccounts.find((currentAccount) => {
      if (currentAccount.source !== "upload") {
        return false;
      }

      return (
        normalizeImportedAccountKey(currentAccount.name, currentAccount.institution, currentAccount.accountNumber, currentAccount.type) ===
        accountKey
      );
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
    return !fetchedById.has(account.id) && !fetchedByKey.has(accountKey);
  });

  return [...preservedCurrentAccounts, ...optimisticAccounts, ...mergedFetchedAccounts];
};

const accountMatchesTransaction = (transaction: Transaction, account: Account) =>
  transaction.accountId === account.id;

type Category = {
  id: string;
  name: string;
  type: "income" | "expense" | "transfer";
};

type Transaction = {
  id: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  reviewStatus?: "pending_review" | "suggested" | "confirmed" | "edited" | "rejected" | "duplicate_skipped";
  date: string;
  amount: string;
  currency: string;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  description?: string | null;
  isTransfer: boolean;
  isExcluded: boolean;
  source?: string | null;
  importFileId?: string | null;
  warningReason?: string | null;
  rawPayload?: unknown;
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

const isResolvedReviewStatus = (status: Transaction["reviewStatus"]) =>
  status === "confirmed" || status === "rejected" || status === "duplicate_skipped";

const getCategoryIconSrc = (categoryName: string | null | undefined) => {
  switch (normalizeCategoryName(categoryName)) {
    case "income":
      return "/category-icons/income.svg";
    case "food & dining":
      return "/category-icons/food.svg";
    case "transport":
      return "/category-icons/transport.svg";
    case "housing":
      return "/category-icons/housing.svg";
    case "bills & utilities":
    case "utilities":
      return "/category-icons/utilities.svg";
    case "travel & lifestyle":
      return "/category-icons/travel.svg";
    case "entertainment":
      return "/category-icons/entertainment.svg";
    case "shopping":
      return "/category-icons/shopping.svg";
    case "health & wellness":
      return "/category-icons/health.svg";
    case "education":
      return "/category-icons/education.svg";
    case "financial":
      return "/category-icons/financial.png";
    case "gifts & donations":
      return "/category-icons/gift.svg";
    case "business":
      return "/category-icons/business.png";
    case "transfers":
      return "/category-icons/transfer.svg";
    case "other":
      return "/category-icons/other.svg";
    case "groceries":
      return "/category-icons/groceries.svg";
    case "medical":
      return "/category-icons/medical.svg";
    case "salary":
      return "/category-icons/salary.svg";
    case "investments":
    case "investment":
      return "/category-icons/investments.svg";
    default:
      return "/category-icons/default.svg";
  }
};

const getCategoryIconTone = (categoryName: string | null | undefined) => {
  switch (normalizeCategoryName(categoryName)) {
    case "income":
    case "salary":
      return { backgroundColor: "rgba(34, 197, 94, 0.14)", borderColor: "rgba(34, 197, 94, 0.24)" };
    case "food & dining":
    case "groceries":
      return { backgroundColor: "rgba(249, 115, 22, 0.14)", borderColor: "rgba(249, 115, 22, 0.24)" };
    case "transport":
      return { backgroundColor: "rgba(59, 130, 246, 0.14)", borderColor: "rgba(59, 130, 246, 0.24)" };
    case "housing":
      return { backgroundColor: "rgba(168, 85, 247, 0.14)", borderColor: "rgba(168, 85, 247, 0.24)" };
    case "bills & utilities":
    case "utilities":
      return { backgroundColor: "rgba(14, 165, 233, 0.14)", borderColor: "rgba(14, 165, 233, 0.24)" };
    case "travel & lifestyle":
      return { backgroundColor: "rgba(236, 72, 153, 0.14)", borderColor: "rgba(236, 72, 153, 0.24)" };
    case "entertainment":
      return { backgroundColor: "rgba(245, 158, 11, 0.14)", borderColor: "rgba(245, 158, 11, 0.24)" };
    case "shopping":
      return { backgroundColor: "rgba(244, 63, 94, 0.14)", borderColor: "rgba(244, 63, 94, 0.24)" };
    case "health & wellness":
    case "medical":
      return { backgroundColor: "rgba(20, 184, 166, 0.14)", borderColor: "rgba(20, 184, 166, 0.24)" };
    case "education":
      return { backgroundColor: "rgba(234, 179, 8, 0.14)", borderColor: "rgba(234, 179, 8, 0.24)" };
    case "financial":
      return { backgroundColor: "rgba(37, 99, 235, 0.14)", borderColor: "rgba(37, 99, 235, 0.24)" };
    case "gifts & donations":
      return { backgroundColor: "rgba(190, 24, 93, 0.14)", borderColor: "rgba(190, 24, 93, 0.24)" };
    case "business":
      return { backgroundColor: "rgba(100, 116, 139, 0.14)", borderColor: "rgba(100, 116, 139, 0.24)" };
    case "transfers":
      return { backgroundColor: "rgba(6, 182, 212, 0.14)", borderColor: "rgba(6, 182, 212, 0.24)" };
    case "other":
      return { backgroundColor: "rgba(148, 163, 184, 0.14)", borderColor: "rgba(148, 163, 184, 0.24)" };
    case "investments":
    case "investment":
      return { backgroundColor: "rgba(124, 58, 237, 0.14)", borderColor: "rgba(124, 58, 237, 0.24)" };
    default:
      return { backgroundColor: "rgba(3, 168, 192, 0.10)", borderColor: "rgba(3, 168, 192, 0.18)" };
  }
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
    <button type="button" className={className} onClick={openEditor} aria-label={ariaLabel}>
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

const downloadTextFile = (filename: string, contents: string, mimeType: string) => {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
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
  return cache?.snapshots[workspaceId] ?? null;
};

const persistTransactionsWorkspaceCache = (
  workspaceId: string,
  snapshot: Omit<TransactionsWorkspaceCacheSnapshot, "workspaceId" | "updatedAt">
) => {
  const localStorageRef = getLocalStorage();
  const sessionStorageRef = getSessionStorage();
  if ((!localStorageRef && !sessionStorageRef) || !workspaceId) {
    return;
  }

  const cache = readTransactionsWorkspaceCache();
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
  if (receiptDetails && Array.isArray(receiptDetails.lineItems)) {
    candidateSources.push(receiptDetails.lineItems);
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

const humanizeTransactionMerchantText = (value: string) => humanizeMerchantText(value);

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
        (warningReason === "Possible duplicate" ? -8 : 0) +
        (warningReason === "Needs category review" ? -20 : 0) +
        (hasWarning && warningReason !== "Possible duplicate" ? -4 : 0)
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

const createDetailDraft = (transaction: Transaction): TransactionDetailDraft => ({
  merchantRaw: transaction.merchantRaw,
  merchantClean: transaction.merchantClean ?? transaction.merchantRaw,
  date: transaction.date.slice(0, 10),
  accountId: transaction.accountId,
  categoryId: transaction.categoryId ?? "",
  amount: transaction.amount,
  currency: transaction.currency,
  type: transaction.type === "income" ? "credit" : "debit",
  description: normalizeTransactionNotes(transaction.description),
  isExcluded: transaction.isExcluded,
  isTransfer: transaction.isTransfer,
});

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
    | "more";
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
  const searchParams = useSearchParams();
  const urlSearchParams = useMemo(() => searchParams ?? new URLSearchParams(), [searchParams]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const manualNameInputRef = useRef<HTMLInputElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
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
  const [currencyFilter, setCurrencyFilter] = useState("PHP");
  const [sortField, setSortField] = useState<TransactionSortField>("date");
  const [sortDirection, setSortDirection] = useState<TransactionSortDirection>("desc");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [accountFilters, setAccountFilters] = useState<string[]>([]);
  const [typeFilters, setTypeFilters] = useState<Array<"debit" | "credit">>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [message, setMessage] = useState("Select a workspace to review transactions.");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
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
  const [hasInitialTransactionsLoaded, setHasInitialTransactionsLoaded] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [workspaceCurrencyCodes, setWorkspaceCurrencyCodes] = useState<string[]>(() => ["PHP"]);
  const [undoStack, setUndoStack] = useState<TransactionHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<TransactionHistoryEntry[]>([]);
  const [isApplyingHistory, setIsApplyingHistory] = useState(false);
  const [merchantRenameSuggestion, setMerchantRenameSuggestion] = useState<MerchantRenameSuggestion | null>(null);
  const currencyCatalogCodes = useMemo(() => getCurrencyCatalogCodes(), []);

  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);
  const [merchantRenameBusy, setMerchantRenameBusy] = useState(false);
  const [manualCategoryTouched, setManualCategoryTouched] = useState(false);
  const [manualMoreOpen, setManualMoreOpen] = useState(false);
  const [manualAccountMenuOpen, setManualAccountMenuOpen] = useState(false);
  const [manualCategoryMenuOpen, setManualCategoryMenuOpen] = useState(false);
  const transactionRowRefs = useRef(new Map<string, HTMLElement>());
  const warningPopoverRefs = useRef(new Map<string, HTMLDivElement | null>());
  const selectionActionsMenuRef = useRef<HTMLDivElement | null>(null);
  const transactionsLoadRequestRef = useRef(0);
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

  const workspace = workspaces.find((entry) => entry.id === selectedWorkspaceId) ?? null;
  const workspaceTransactionCount = transactions.length;
  const otherCategoryId = useMemo(() => getOtherCategoryId(categories), [categories]);
  const accountInstitutionById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.institution ?? null] as const)),
    [accounts]
  );
  const accountNameById = useMemo(() => new Map(accounts.map((account) => [account.id, account.name] as const)), [accounts]);
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
  const manualSelectedAccountBrand = useMemo(
    () =>
      manualSelectedAccount
        ? getAccountBrand({
            name: manualSelectedAccount.name,
            institution: manualSelectedAccount.institution,
            type: manualSelectedAccount.type,
          })
        : null,
    [manualSelectedAccount]
  );
  const manualSelectedCategoryId = manualForm.categoryId || otherCategoryId;
  const manualSelectedCategory = useMemo(
    () => categories.find((category) => category.id === manualSelectedCategoryId) ?? null,
    [categories, manualSelectedCategoryId]
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
    const response = await fetch("/api/workspaces");
    if (!response.ok) return;
    const data = await response.json();
    const items = Array.isArray(data.workspaces) ? data.workspaces : [];
    setWorkspaces(items);
    setSelectedWorkspaceId((current) => {
      return chooseWorkspaceId(items, current);
    });
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
        fetch(`/api/accounts?workspaceId=${encodeURIComponent(workspaceId)}`),
        fetch(`/api/categories?workspaceId=${encodeURIComponent(workspaceId)}`),
        options?.skipImports ? Promise.resolve(null) : fetch(`/api/imports?workspaceId=${encodeURIComponent(workspaceId)}`),
      ]);

      if (accountsResponse.ok) {
        const payload = await accountsResponse.json();
        const fetchedAccounts = Array.isArray(payload.accounts) ? (payload.accounts as Account[]) : [];
        setAccounts((current) => mergeAccountsWithOptimisticImports(fetchedAccounts, current));
      }

      if (categoriesResponse.ok) {
        const payload = await categoriesResponse.json();
        setCategories(Array.isArray(payload.categories) ? payload.categories : []);
      }

      if (importResponse && importResponse.ok) {
        const payload = await importResponse.json();
        setImports(Array.isArray(payload.importFiles) ? payload.importFiles : []);
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
      includeAll?: boolean;
      pageOverride?: number;
      pageSizeOverride?: number;
      summaryMode?: "light" | "full";
    }
  ) => {
    const requestId = ++transactionsLoadRequestRef.current;

    if (!workspaceId) {
      setTransactions([]);
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
        pageSize: options?.includeAll ? "all" : options?.pageSizeOverride ?? transactionsPageSize,
      }
    );
    searchParams.set("summaryMode", options?.summaryMode ?? (options?.background ? "full" : "light"));

    try {
      const response = await fetch(`/api/transactions?${searchParams?.toString() ?? ""}`);
      if (!response.ok) {
        throw new Error("Unable to load transactions.");
      }

      if (requestId !== transactionsLoadRequestRef.current) {
        return;
      }

      const payload = await response.json();
      const fetchedTransactions = Array.isArray(payload.transactions) ? payload.transactions : [];
      const mergedTransactions = mergeImportedWorkspaceTransactions(transactionsRef.current, fetchedTransactions);
      const responseCurrencyCodes = Array.isArray(payload.currencyCodes)
        ? payload.currencyCodes.map((value: unknown) => formatCurrencyCode(String(value ?? ""))).filter(Boolean)
        : [];
      const workspaceCurrencyCodesFromData = getWorkspaceCurrencyCodes(
        mergedTransactions.length > 0 ? mergedTransactions : fetchedTransactions
      );
      const nextCurrencyCodes = responseCurrencyCodes.length > 0 ? responseCurrencyCodes : workspaceCurrencyCodesFromData;
      setWorkspaceCurrencyCodes(nextCurrencyCodes);
      setTransactions(mergedTransactions);
      setTransactionsSummary(
        payload.summary && typeof payload.summary === "object"
          ? {
              totalCount:
                typeof payload.totalCount === "number"
                  ? Math.max(payload.totalCount, mergedTransactions.length)
                  : typeof payload.summary.totalCount === "number"
                    ? Math.max(payload.summary.totalCount, mergedTransactions.length)
                    : fetchedTransactions.length,
              income: typeof payload.summary.income === "number" ? payload.summary.income : 0,
              spending: typeof payload.summary.spending === "number" ? payload.summary.spending : 0,
              transfers: typeof payload.summary.transfers === "number" ? payload.summary.transfers : 0,
              review: typeof payload.summary.review === "number" ? payload.summary.review : 0,
              currencyCodes: nextCurrencyCodes,
              topCategory: Array.isArray(payload.summary.topCategory) ? payload.summary.topCategory : null,
              topAccount: Array.isArray(payload.summary.topAccount) ? payload.summary.topAccount : null,
              firstTransactionDate:
                typeof payload.summary.firstTransactionDate === "string" ? payload.summary.firstTransactionDate : null,
              lastTransactionDate:
                typeof payload.summary.lastTransactionDate === "string" ? payload.summary.lastTransactionDate : null,
              firstReviewTransaction:
                payload.summary.firstReviewTransaction && typeof payload.summary.firstReviewTransaction === "object"
                  ? (payload.summary.firstReviewTransaction as Transaction)
                  : null,
              firstReviewTransactionIndex:
                typeof payload.summary.firstReviewTransactionIndex === "number"
                  ? payload.summary.firstReviewTransactionIndex
                  : null,
            }
          : {
              totalCount:
                typeof payload.totalCount === "number"
                  ? Math.max(payload.totalCount, mergedTransactions.length)
                  : mergedTransactions.length,
              income: 0,
              spending: 0,
              transfers: 0,
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

      if (!options?.background && (options?.summaryMode ?? "light") === "light" && Number(payload.totalCount ?? 0) > 0) {
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

      if (!options?.background) {
        setMessage("Unable to load transactions.");
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

    setAccounts(cachedSnapshot.accounts);
    setCategories(cachedSnapshot.categories);
    setTransactions(cachedSnapshot.transactions);
    setImports(cachedSnapshot.imports);
    const cachedCurrencyCodes = cachedSnapshot.summary?.currencyCodes ?? cachedSnapshot.currencyCodes ?? getWorkspaceCurrencyCodes(cachedSnapshot.transactions);
    setTransactionsSummary(
      cachedSnapshot.summary
        ? {
            ...cachedSnapshot.summary,
            currencyCodes: cachedSnapshot.summary.currencyCodes ?? cachedCurrencyCodes,
          }
        : {
            totalCount: cachedSnapshot.totalCount ?? cachedSnapshot.transactions.length,
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
            accountLimit: Number(payload.user.accountLimit ?? 5),
            monthlyUploadLimit: Number(payload.user.monthlyUploadLimit ?? 10),
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

  useEffect(() => {
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
      setIsWorkspaceDataReady(true);
      setHasInitialTransactionsLoaded(true);
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
  }, [selectedWorkspaceId]);

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

      if (!hydrateWorkspaceFromCache(activeWorkspaceId)) {
        setIsWorkspaceDataReady(false);
        void loadWorkspaceMetadata(activeWorkspaceId, { skipImports: true, background: true });
        void loadTransactionsPage(activeWorkspaceId, { background: true });
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [loadTransactionsPage, loadWorkspaceMetadata, selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      return;
    }

    void loadTransactionsPage(selectedWorkspaceId);
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
    transactionsPage,
    transactionsPageSize,
  ]);

  useEffect(() => {
    if (!addMenuOpen && !downloadMenuOpen && !selectionMenuOpen && !activeWarningTransactionId && !headerMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (
        addMenuRef.current?.contains(target) ||
        downloadMenuRef.current?.contains(target) ||
        selectionActionsMenuRef.current?.contains(target) ||
        headerMenuRef.current?.contains(target) ||
        (activeWarningTransactionId ? warningPopoverRefs.current.get(activeWarningTransactionId)?.contains(target) : false)
      ) {
        return;
      }

      setAddMenuOpen(false);
      setDownloadMenuOpen(false);
      setSelectionMenuOpen(false);
      setActiveWarningTransactionId(null);
      setHeaderMenuOpen(null);
      setHeaderMenuPosition(null);
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setAddMenuOpen(false);
        setDownloadMenuOpen(false);
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
  }, [activeWarningTransactionId, addMenuOpen, downloadMenuOpen, headerMenuOpen, selectionMenuOpen]);

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
    setDownloadMenuOpen(false);
    setSelectionMenuOpen(false);
    setHeaderMenuOpen(null);
    setHeaderMenuPosition(null);
  };

  const openAddMenu = () => {
    flushSync(() => {
      setDownloadMenuOpen(false);
      setSelectionMenuOpen(false);
      setHeaderMenuOpen(null);
      setHeaderMenuPosition(null);
      setAddMenuOpen((current) => !current);
    });
  };

  const openDownloadMenu = () => {
    flushSync(() => {
      setAddMenuOpen(false);
      setSelectionMenuOpen(false);
      setHeaderMenuOpen(null);
      setHeaderMenuPosition(null);
      setDownloadMenuOpen((current) => !current);
    });
  };

  const openImportFiles = (files: File[] | null = null, backgroundOnly = false) => {
    flushSync(() => {
      closeChrome();
      setPendingImportSummary(null);
      closeToolbarMenus();
      setImportBackgroundOnly(backgroundOnly);
      setImportSeedFiles(files && files.length > 0 ? files : null);
      setImportOpen(true);
    });
  };

  useEffect(() => {
    const active = manualOpen || (importOpen && !importBackgroundOnly);
    document.body.toggleAttribute("data-clover-page-modal", active);

    return () => {
      document.body.removeAttribute("data-clover-page-modal");
    };
  }, [addMenuOpen, downloadMenuOpen, importBackgroundOnly, importOpen, manualOpen]);

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
      setCurrencyFilter("PHP");
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
    setCurrencyFilter(currencyFromUrl ? formatCurrencyCode(currencyFromUrl) : "PHP");
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
  const totalTransactionPages = Math.max(1, Math.ceil(transactionsSummary.totalCount / Math.max(transactionsPageSize, 1)));
  const currentTransactionPage = Math.min(transactionsPage, totalTransactionPages);
  const pageStartIndex = (currentTransactionPage - 1) * transactionsPageSize;
  const pageEndIndex = pageStartIndex + transactionsPageSize;
  const visibleTransactions = useMemo(() => transactions.filter((transaction) => !transaction.isExcluded), [transactions]);
  const hasVisibleTransactions = transactionsSummary.totalCount > 0;
  const visibleTransactionIds = useMemo(() => visibleTransactions.map((transaction) => transaction.id), [visibleTransactions]);
  const allVisibleSelected =
    visibleTransactionIds.length > 0 && visibleTransactionIds.every((transactionId) => selectedTransactionIds.includes(transactionId));
  const someVisibleSelected = visibleTransactionIds.some((transactionId) => selectedTransactionIds.includes(transactionId));

  const currentPageLabel = useMemo(() => {
    if (transactionsSummary.totalCount === 0) {
      return "0 of 0";
    }

    return `${pageStartIndex + 1}-${Math.min(pageEndIndex, transactionsSummary.totalCount)} of ${transactionsSummary.totalCount}`;
  }, [pageEndIndex, pageStartIndex, transactionsSummary.totalCount]);

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

  const activeFilterCount = useMemo(() => {
    let count = 0;

    if (query.trim()) {
      count += 1;
    }

    if (currencyFilter.trim().toUpperCase() !== "PHP") {
      count += 1;
    }

    if (dateFilterMode !== "ltd") {
      count += 1;
    }

    count += categoryFilters.length;
    count += expandedAccountFilters.length;
    count += typeFilters.length;
    if (amountMin.trim() || amountMax.trim()) {
      count += 1;
    }

    return count;
  }, [accountFilters.length, amountMax, amountMin, categoryFilters.length, currencyFilter, dateFilterMode, expandedAccountFilters.length, query, typeFilters.length]);

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
        return null;
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
      focusTransactionRow(visibleTransactions[index + 1]?.id);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusTransactionRow(visibleTransactions[index - 1]?.id);
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

    if (warningReasonFor(transaction) === "Possible duplicate" && outcome === "rejected") {
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
    setActiveWarningTransactionId(null);
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
    const menuWidth = field === "category" ? 380 : field === "amount" ? 340 : field === "date" ? 360 : 320;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));
    setAddMenuOpen(false);
    setDownloadMenuOpen(false);
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
    setCurrencyFilter("PHP");
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

        if (addMenuOpen || downloadMenuOpen) {
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
    downloadMenuOpen,
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
    type: transaction.type,
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
    const accountNames = new Map(accounts.map((account) => [account.id, account.name] as const));
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

  const fetchAllTransactionsForExport = async () => {
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

  const downloadCsv = async () => {
    try {
      const exportRows = await fetchAllTransactionsForExport();
      const header = ["Name", "Date", "Account", "Category", "Amount", "Type", "Notes", "Warning"];
      const rows = exportRows.map((transaction) => [
        summarizeTransactionMerchantText(
          transaction.merchantClean ?? transaction.merchantRaw,
          accountInstitutionById.get(transaction.accountId) ?? null
        ),
        formatDate(transaction.date),
        transaction.accountName,
        transaction.categoryName ?? "Other",
        transaction.amount,
        transaction.type === "income" ? "Credit" : "Debit",
        transaction.description ?? "",
        warningReasonFor(transaction) ?? "",
      ]);

      const csv = [header, ...rows]
        .map((row) =>
          row
            .map((cell) => `"${String(cell).replaceAll("\"", '""')}"`)
            .join(",")
        )
        .join("\n");

      capturePostHogClientEvent("report_exported", {
        workspace_id: selectedWorkspaceId || null,
        export_format: "csv",
        row_count: exportRows.length,
        selected_count: selectedTransactionIds.length,
      });
      downloadTextFile("clover-transactions.csv", csv, "text/csv;charset=utf-8;");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to export transactions.");
    }
  };

  const downloadPdf = async () => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const exportRows = await fetchAllTransactionsForExport();
      const report = window.open("", "_blank", "width=1280,height=900");
      if (!report) {
        window.print();
        return;
      }

      const rows = exportRows
        .map((transaction) => {
          const warningReason = warningReasonFor(transaction);
          const amount = Number(transaction.amount);
          const categoryValue = transaction.categoryId ?? otherCategoryId;
          const categoryLabel = transaction.categoryName ?? categories.find((category) => category.id === categoryValue)?.name ?? "Other";
          const categoryIconSrc = new URL(
            getCategoryIconSrc(categoryLabel),
            window.location.origin
          ).toString();
          const categoryTone = getCategoryIconTone(categoryLabel);
          const accountInstitution = accountInstitutionById.get(transaction.accountId) ?? null;
          const merchantSummary = summarizeTransactionMerchantText(
            transaction.merchantClean ?? transaction.merchantRaw,
            accountInstitution
          );
          const merchantDisplay = humanizeTransactionMerchantText(transaction.merchantRaw);

          return `
            <tr>
              <td class="icon-cell">
                <span
                  class="category-icon"
                  style="background: ${categoryTone.backgroundColor}; border-color: ${categoryTone.borderColor};"
                >
                  <img src="${escapeHtml(categoryIconSrc)}" alt="" />
                </span>
              </td>
              <td>
                <div class="name-cell">
                  <div class="name-cell__summary">${escapeHtml(merchantSummary)}</div>
                  ${merchantDisplay.toLowerCase() !== merchantSummary.toLowerCase() ? `<div class="name-cell__subtext">${escapeHtml(merchantDisplay)}</div>` : ""}
                </div>
              </td>
              <td>${escapeHtml(formatDate(transaction.date))}</td>
              <td>${escapeHtml(transaction.accountName)}</td>
              <td>${escapeHtml(categoryLabel)}</td>
              <td class="${transaction.type === "income" ? "positive" : "negative"}">${escapeHtml(
                formatTransactionAmount(amount, transaction.currency)
              )}</td>
              <td>${escapeHtml(warningReason ?? "")}</td>
            </tr>
          `;
        })
        .join("");

      report.document.write(`
        <html>
          <head>
            <title>Transactions</title>
            <style>
              @page { size: auto; margin: 14mm; }
              body {
                font-family: Arial, sans-serif;
                color: #111827;
                margin: 0;
                padding: 0;
              }
              .page {
                padding: 0;
              }
              h1 {
                font-size: 20px;
                margin: 0 0 8px;
              }
              .meta {
                color: #6b7280;
                font-size: 12px;
                margin-bottom: 18px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                table-layout: fixed;
              }
              tbody tr:nth-child(even) {
                background: #f8fafc;
              }
              th, td {
                text-align: left;
                vertical-align: top;
                padding: 9px 8px;
                border-bottom: 1px solid var(--stroke);
                font-size: 11px;
                word-break: break-word;
              }
              td.icon-cell {
                width: 46px;
                padding-right: 0;
              }
              .category-icon {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 26px;
                height: 26px;
                border-radius: 999px;
                border: 1px solid transparent;
                overflow: hidden;
              }
              .category-icon img {
                width: 14px;
                height: 14px;
                display: block;
              }
              .name-cell {
                display: grid;
                gap: 2px;
              }
              .name-cell__summary {
                font-size: 12px;
                font-weight: 700;
                line-height: 1.25;
              }
              .name-cell__subtext {
                font-size: 9px;
                color: #9ca3af;
                line-height: 1.2;
                letter-spacing: -0.01em;
              }
              th {
                font-size: 10px;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: #6b7280;
              }
              .positive {
                color: #16a34a;
              }
              .negative {
                color: #ef4444;
              }
            </style>
          </head>
          <body>
            <div class="page">
              <h1>Transactions</h1>
              <div class="meta">${escapeHtml(transactions.length.toString())} transaction${
                transactions.length === 1 ? "" : "s"
              }</div>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Date</th>
                    <th>Account</th>
                    <th>Category</th>
                    <th>Amount</th>
                    <th>Warning</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows || `<tr><td colspan="6">No transactions to print.</td></tr>`}
                </tbody>
              </table>
            </div>
            <script>
              window.onload = () => window.print();
            </script>
          </body>
        </html>
      `);
      report.document.close();
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
              label: account.name,
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
  const isTableLoading = false;
  const transactionsShellActions = (
    <div className="transactions-shell-actions" style={transactionsShellActionsStyle}>
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
        <div className="transactions-add-menu__panel" hidden={!addMenuOpen}>
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
        </div>
      </div>

      {isCompactViewport ? (
        <div className={`transactions-toolbar-search transactions-toolbar-search--mobile${mobileSearchOpen ? " is-open" : ""}`}>
          <button
            type="button"
            className="transactions-toolbar-search__button"
            onClick={() => {
              setMobileSearchOpen(true);
              window.requestAnimationFrame(() => {
                searchInputRef.current?.focus();
              });
            }}
            aria-label="Search transactions"
          >
            <span className="transactions-toolbar-search__icon" aria-hidden="true">
              <ActionIcon name="search" />
            </span>
          </button>
          {mobileSearchOpen ? (
            <>
              <span className="sr-only">Search transactions</span>
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                aria-label="Search transactions"
                aria-keyshortcuts="/"
                onBlur={() => {
                  if (!query.trim()) {
                    setMobileSearchOpen(false);
                  }
                }}
              />
            </>
          ) : null}
        </div>
      ) : (
        <label className="transactions-toolbar-search" style={transactionsToolbarSearchStyle}>
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
          />
        </label>
      )}

      <button
        className="button button-secondary button-small transactions-action-button transactions-toolbar-chip"
        style={toolbarChipStyle}
        type="button"
        title={dateFilterLabel}
        onClick={(event) => openHeaderMenu("date", event)}
        aria-label="Open date filter"
        aria-expanded={headerMenuOpen === "date"}
        >
          <span className="button-icon" aria-hidden="true">
            <ActionIcon name="calendar" />
          </span>
          {!isCompactViewport ? <span>Date</span> : null}
        </button>

      <CurrencySelector
        value={currencyFilter}
        onChange={(next) => setCurrencyFilter(formatCurrencyCode(next || "PHP"))}
        options={workspaceCurrencyCodes}
        ariaLabel="Filter transactions by currency"
        className="transactions-currency-filter"
        buttonClassName="transactions-currency-filter__button transactions-action-button transactions-toolbar-chip"
        menuClassName="transactions-currency-filter__menu"
        optionClassName="transactions-currency-filter__option"
        menuAlignment="end"
      />

      <button
        className="button button-secondary button-small transactions-action-button transactions-toolbar-chip"
        style={toolbarChipStyle}
        type="button"
        title={activeFilterCount > 0 ? `Filters (F) · ${activeFilterCount} active` : "Filters (F)"}
        onClick={toggleFiltersPanel}
        aria-label={activeFilterCount > 0 ? `Open filters, ${activeFilterCount} active` : "Open filters"}
        aria-expanded={filterOpen}
        aria-keyshortcuts="f"
        >
        <span className="button-icon" aria-hidden="true">
          <ActionIcon name="filters" />
        </span>
        {!isCompactViewport ? <span>Filters</span> : null}
        {activeFilterCount > 0 ? <span className="transactions-filter-count-badge">{activeFilterCount}</span> : null}
      </button>

      <div className="transactions-download-menu" id="transactions-download-menu" ref={downloadMenuRef} style={transactionsMenuStyle}>
        <button
          className="button button-secondary button-small transactions-action-button transactions-toolbar-chip transactions-download-menu__toggle"
          style={toolbarChipStyle}
          type="button"
          aria-haspopup="menu"
          aria-expanded={downloadMenuOpen}
          onClick={() => {
            openDownloadMenu();
          }}
          title="Download"
          aria-label="Download transactions"
        >
          <span className="button-icon" aria-hidden="true">
            <ActionIcon name="download" />
          </span>
          {!isCompactViewport ? <span>Download</span> : null}
          {!isCompactViewport ? (
            <span className="button-icon" aria-hidden="true">
              <ActionIcon name="chevron-down" />
            </span>
          ) : null}
        </button>
        <div className="transactions-download-menu__panel" hidden={!downloadMenuOpen}>
          <button
            className="transactions-download-menu__item"
            type="button"
            onClick={() => {
              closeToolbarMenus();
              downloadCsv();
            }}
          >
            CSV
          </button>
          <button
            className="transactions-download-menu__item"
            type="button"
            onClick={() => {
              closeToolbarMenus();
              downloadPdf();
            }}
          >
            PDF
          </button>
        </div>
      </div>
    </div>
  );

  useEffect(() => {
    if (!selectedWorkspaceId || !isWorkspaceDataReady) {
      return;
    }

    persistTransactionsWorkspaceCache(selectedWorkspaceId, {
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
  }, [accounts, categories, imports, isWorkspaceDataReady, selectedWorkspaceId, transactions, transactionsPage, transactionsPageSize, transactionsSummary, workspaceCurrencyCodes]);

  useEffect(() => {
    if (!importOpen || !pendingImportSummary || pendingImportSummary.optimistic) {
      return;
    }

    const targetAccountId = pendingImportSummary.accountId ?? pendingImportSummary.optimisticAccountId ?? null;
    if (!targetAccountId) {
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

  useEffect(() => {
    if (!isCompactViewport) {
      setMobileSearchOpen(false);
    }
  }, [isCompactViewport]);

  if (!hasInitialTransactionsLoaded) {
    return <CloverLoadingScreen label="transactions" />;
  }

  return (
    <CloverShell active="transactions" title="Transactions" actions={transactionsShellActions}>
      <PageFileDropZone
        enabled={true}
        title="Drop statement files anywhere"
        onFilesDropped={(files) => openImportFiles(files, true)}
      />
      <section className={`transactions-layout ${summaryOpen ? "transactions-layout--summary-open" : ""}`} style={transactionsLayoutStyle}>
        <div className="transactions-main-panel">
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
                    label: account.name,
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
                  ]}
                  selected={typeFilters}
                  onToggle={(value) => setTypeFilters((current) => toggleTypedFilterValue(current, value as "debit" | "credit"))}
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
                        visibleTransactionIds.forEach((transactionId) => next.add(transactionId));
                      } else {
                        visibleTransactionIds.forEach((transactionId) => next.delete(transactionId));
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
            {isTableLoading ? (
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
              visibleTransactions.map((transaction, index) => {
                const warningReason = warningReasonFor(transaction);
                const amount = Number(transaction.amount);
                const isPositive = transaction.type === "income";
                const amountToneClass = isPositive ? "positive" : "negative";
                const categoryValue = transaction.categoryId ?? otherCategoryId;
                const categoryLabel = transaction.categoryName ?? categories.find((category) => category.id === categoryValue)?.name ?? "Other";
                const accountInstitution = accountInstitutionById.get(transaction.accountId) ?? null;
                const merchantSummary = summarizeTransactionMerchantText(
                  transaction.merchantClean ?? transaction.merchantRaw,
                  accountInstitution
                );
                const merchantDisplay = humanizeTransactionMerchantText(transaction.merchantRaw);
                const showMerchantSubtext = merchantDisplay && merchantDisplay.toLowerCase() !== merchantSummary.toLowerCase();
                const sourceClass =
                  transaction.source === "manual"
                    ? "line-item--manual"
                    : transaction.source === "upload"
                      ? "line-item--imported"
                      : "line-item--other";
                const rowStateClass = warningReason ? "line-item--warning" : "line-item--clear";
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
                    className={`line-item ${sourceClass} ${rowStateClass} ${transaction.isExcluded ? "is-muted" : ""} ${
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
                      <span className="transaction-category-icon" style={getCategoryIconTone(categoryLabel)}>
                        <img src={getCategoryIconSrc(categoryLabel)} alt="" aria-hidden="true" />
                      </span>
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
                      {showMerchantSubtext ? <small className="transaction-subtext">{merchantDisplay}</small> : null}
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
                      <InlineEditableCell
                        value={transaction.accountId}
                        displayValue={transaction.accountName}
                        ariaLabel={`Edit account for ${transaction.merchantRaw}`}
                        kind="select"
                        className="transaction-inline-edit transaction-inline-edit--select"
                        options={accounts.map((account) => ({
                          value: account.id,
                          label: account.name,
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
                        className="button button-secondary button-small transaction-note-button"
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
            ) : !hasVisibleTransactions ? (
              <EmptyDataCta
                className="transactions-empty-state--table"
                eyebrow="No results"
                title="No transactions match the current filters."
                copy="Clear one filter or widen the date range to bring rows back."
                illustration={transactionsEmptyStateIllustration}
                illustrationAlt=""
                importHref="/transactions?import=1"
                accountHref="/accounts"
                transactionHref="/transactions?manual=1"
                actions={
                  <>
                    <button className="button button-primary button-small" type="button" onClick={clearAllTransactionFilters}>
                      Clear filters
                    </button>
                    <button className="button button-secondary button-small transactions-empty-state__import" type="button" onClick={() => openImportFiles()}>
                      Import files
                    </button>
                  </>
                }
              />
            ) : (
              <div className="empty-state">No transactions match the current filters. Clear one filter or widen the date range to bring rows back.</div>
            )}
          </div>
            </>
          ) : null}

          {isCompactViewport ? (
          <div
            className={`transactions-mobile-view${!hasVisibleTransactions && !isTableLoading ? " transactions-table-wrap--empty" : ""}`}
          >
            {isTableLoading ? (
              <div className="transactions-mobile-table" role="status" aria-live="polite" aria-label="Loading transactions">
                <div className="transactions-mobile-table__head">
                  <span />
                  <span />
                  <span>Name</span>
                  <span>Amount</span>
                  <span />
                  <span />
                </div>
                <div className="transactions-mobile-table__body transactions-mobile-table__body--loading">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="transactions-mobile-row transactions-mobile-row--loading">
                      <span className="skeleton-block skeleton-block--checkbox" />
                      <span className="skeleton-block skeleton-block--icon" />
                      <span className="transactions-mobile-row__name">
                        <span className="skeleton-block skeleton-block--line skeleton-block--line-long" />
                        <span className="skeleton-block skeleton-block--line skeleton-block--line-short" />
                      </span>
                      <span className="skeleton-block skeleton-block--amount" />
                      <span className="skeleton-block skeleton-block--chevron" />
                      <span className="skeleton-block skeleton-block--warning" />
                    </div>
                  ))}
                </div>
              </div>
            ) : transactionsSummary.totalCount > 0 ? (
              <div className="transactions-mobile-table">
                <div className="transactions-mobile-table__head">
                  <span />
                  <span />
                  <span>Name</span>
                  <span>Amount</span>
                  <span />
                  <span />
                </div>
                <div className="transactions-mobile-table__body">
                  {visibleTransactions.map((transaction, index) => {
                    const warningReason = warningReasonFor(transaction);
                    const amount = Number(transaction.amount);
                    const isPositive = transaction.type === "income";
                    const amountToneClass = isPositive ? "positive" : "negative";
                    const categoryValue = transaction.categoryId ?? otherCategoryId;
                    const categoryLabel =
                      transaction.categoryName ?? categories.find((category) => category.id === categoryValue)?.name ?? "Other";
                    const accountInstitution = accountInstitutionById.get(transaction.accountId) ?? null;
                    const merchantSummary = summarizeTransactionMerchantText(
                      transaction.merchantClean ?? transaction.merchantRaw,
                      accountInstitution
                    );
                    const merchantDisplay = humanizeTransactionMerchantText(transaction.merchantRaw);
                    const showMerchantSubtext = merchantDisplay && merchantDisplay.toLowerCase() !== merchantSummary.toLowerCase();
                    const transactionAccount = accounts.find((account) => account.id === transaction.accountId) ?? null;
                    const transactionAccountBrand = transactionAccount
                      ? getAccountBrand({
                          name: transactionAccount.name,
                          institution: transactionAccount.institution,
                          type: transactionAccount.type,
                        })
                      : null;

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
                        className={`transactions-mobile-row ${transaction.isExcluded ? "is-muted" : ""} ${
                          selectedTransactionIds.includes(transaction.id) ? "is-selected" : ""
                        }`}
                        tabIndex={0}
                        aria-label={`${merchantSummary}, ${formatDate(transaction.date)}, ${categoryLabel}, ${formatTransactionAmount(
                          amount,
                          transaction.currency
                        )}`}
                        onKeyDown={(event) => handleTransactionRowKeyDown(event, transaction, index)}
                      >
                        <label className="transaction-select-cell transactions-mobile-row__select">
                          <input
                            type="checkbox"
                            checked={selectedTransactionIds.includes(transaction.id)}
                            onChange={(event) => toggleSelectedTransaction(transaction.id, event.target.checked)}
                            aria-label={`Select ${transaction.merchantRaw}`}
                          />
                        </label>
                        <span className="transactions-mobile-row__icon" aria-hidden="true">
                          {transactionAccountBrand ? (
                            <AccountBrandMark accountBrand={transactionAccountBrand} label={transaction.accountName} />
                          ) : (
                            <span className="transactions-mobile-row__icon-fallback">?</span>
                          )}
                        </span>
                        <div className="transactions-mobile-row__name">
                          <InlineEditableCell
                            value={transaction.merchantClean ?? transaction.merchantRaw}
                            displayValue={merchantSummary}
                            ariaLabel={`Edit name for ${transaction.merchantRaw}`}
                            kind="text"
                            className="transaction-inline-edit transaction-inline-edit--name transactions-mobile-row__name-edit"
                            onCommit={(value) => commitInlineEdit(transaction, "name", value)}
                          />
                          {showMerchantSubtext ? <small className="transaction-subtext">{merchantDisplay}</small> : null}
                        </div>
                        <div className={`transaction-amount-cell ${amountToneClass} transactions-mobile-row__amount`}>
                          <InlineEditableCell
                            value={transaction.amount}
                            displayValue={formatTransactionAmount(amount, transaction.currency)}
                            ariaLabel={`Edit amount for ${transaction.merchantRaw}`}
                            kind="number"
                            className={`transaction-inline-edit transaction-inline-edit--amount ${amountToneClass} transactions-mobile-row__amount-edit`}
                            onCommit={(value) => commitInlineEdit(transaction, "amount", value)}
                          />
                        </div>
                        <button
                          type="button"
                          className="icon-button transactions-mobile-row__detail"
                          onClick={() => openTransactionDetail(transaction)}
                          aria-label={`Open details for ${transaction.merchantRaw}`}
                        >
                          <ActionIcon name="chevron-right" />
                        </button>
                        {warningReason ? (
                          <div
                            className={`transaction-warning-wrap transactions-mobile-row__warning-wrap ${
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
                              className="warning-chip transactions-mobile-row__warning"
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
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : !hasVisibleTransactions ? (
              <EmptyDataCta
                className="transactions-empty-state--table"
                eyebrow="No results"
                title="No transactions match the current filters."
                copy="Clear one filter or widen the date range to bring rows back."
                illustration={transactionsEmptyStateIllustration}
                illustrationAlt=""
                importHref="/transactions?import=1"
                accountHref="/accounts"
                transactionHref="/transactions?manual=1"
                actions={
                  <>
                    <button className="button button-primary button-small" type="button" onClick={clearAllTransactionFilters}>
                      Clear filters
                    </button>
                    <button className="button button-secondary button-small transactions-empty-state__import" type="button" onClick={() => openImportFiles()}>
                      Import files
                    </button>
                  </>
                }
              />
            ) : (
              <div className="empty-state">No transactions match the current filters. Clear one filter or widen the date range to bring rows back.</div>
            )}
          </div>
          ) : null}

          <div className="transactions-footer" style={{ ...transactionsFooterStyle, marginTop: "auto" }}>
            <div className="table-footer__summary">
              <span className="pill pill-neutral">{transactionsSummary.totalCount} transactions</span>
              {transactionsSummary.totalCount > 0 ? (
                <span className="pill pill-subtle">Showing {currentPageLabel}</span>
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
            <div className="transactions-footer-snapshot" aria-label="Cash flow snapshot">
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

          <button className="transactions-summary-panel__download" type="button" onClick={downloadCsv}>
            Download CSV
          </button>
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
                        {account.name}
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
            className="modal-card modal-card--wide glass"
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
                  <button
                    type="button"
                    className="transactions-manual-type-help"
                    title="Debit means money leaving this account. Credit means money coming in."
                    aria-label="Debit means money leaving this account. Credit means money coming in."
                  >
                    i
                  </button>
                </div>

                <label className="manual-form-layout__full">
                  Name
                  <input
                    ref={manualNameInputRef}
                    value={manualForm.merchantRaw}
                    onChange={(event) => setManualForm((current) => ({ ...current, merchantRaw: event.target.value }))}
                    placeholder="Lunch in Makati"
                    required
                  />
                </label>

                <button
                  type="button"
                  className="transactions-manual-category-button"
                  onClick={() => setManualMoreOpen(true)}
                  aria-label="Open more transaction details"
                  aria-expanded={manualMoreOpen}
                  title="Open more transaction details"
                >
                  <span className="transactions-manual-category-button__icon" aria-hidden="true" style={getCategoryIconTone(manualSelectedCategory?.name ?? "Other")}>
                    <img src={getCategoryIconSrc(manualSelectedCategory?.name ?? "Other")} alt="" aria-hidden="true" />
                  </span>
                </button>

                <div className="manual-form-compact-row">
                  <button
                    type="button"
                    className="transactions-manual-account-button"
                    aria-label="Open more transaction details"
                    aria-expanded={manualMoreOpen}
                    title="Open more transaction details"
                    onClick={() => setManualMoreOpen(true)}
                  >
                    {manualSelectedAccountBrand ? (
                      <span className="transactions-manual-account-button__brand">
                        <AccountBrandMark
                          accountBrand={manualSelectedAccountBrand}
                          label={manualSelectedAccount?.name ?? "Selected account"}
                        />
                      </span>
                    ) : (
                      <span className="transactions-manual-account-button__fallback">?</span>
                    )}
                  </button>

                  <label className="manual-form-layout__currency manual-form-compact-row__currency">
                    <span className="sr-only">Currency</span>
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
                    />
                  </label>

                  <label className="manual-form-layout__amount manual-form-compact-row__amount">
                    Amount
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

                {manualMoreOpen ? (
                  <div className="manual-more-panel manual-more-panel--compact">
                    <label>
                      Date
                      <input
                        type="date"
                        value={manualForm.date}
                        onChange={(event) => setManualForm((current) => ({ ...current, date: event.target.value }))}
                        required
                      />
                    </label>

                    <div className="manual-more-panel__split">
                      <div className="transactions-manual-picker">
                        <span className="transactions-manual-picker__label">Account</span>
                        <div className="transactions-manual-picker__control">
                          <button
                            type="button"
                            className="transactions-manual-picker__button"
                            aria-expanded={manualAccountMenuOpen}
                            onClick={() => {
                              setManualCategoryMenuOpen(false);
                              setManualAccountMenuOpen((current) => !current);
                            }}
                          >
                            {manualSelectedAccountBrand ? (
                              <span className="transactions-manual-picker__brand">
                                <AccountBrandMark
                                  accountBrand={manualSelectedAccountBrand}
                                  label={manualSelectedAccount?.name ?? "Selected account"}
                                />
                              </span>
                            ) : (
                              <span className="transactions-manual-picker__fallback">?</span>
                            )}
                            <span className="transactions-manual-picker__text">{manualSelectedAccount?.name ?? "Cash"}</span>
                            <span className="transactions-manual-picker__chevron" aria-hidden="true">
                              <ActionIcon name="chevron-down" />
                            </span>
                          </button>
                          {manualAccountMenuOpen ? (
                            <div className="transactions-manual-picker__menu" role="listbox" aria-label="Choose account">
                              {accounts.map((account) => {
                                const accountBrand = getAccountBrand({
                                  name: account.name,
                                  institution: account.institution,
                                  type: account.type,
                                });

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
                                    <span className="transactions-manual-picker__brand">
                                      <AccountBrandMark accountBrand={accountBrand} label={account.name} />
                                    </span>
                                    <span className="transactions-manual-picker__option-text">
                                      <strong>{account.name}</strong>
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="transactions-manual-picker">
                        <span className="transactions-manual-picker__label">Category</span>
                        <div className="transactions-manual-picker__control">
                          <button
                            type="button"
                            className="transactions-manual-picker__button"
                            aria-expanded={manualCategoryMenuOpen}
                            onClick={() => {
                              setManualAccountMenuOpen(false);
                              setManualCategoryMenuOpen((current) => !current);
                            }}
                          >
                            <span
                              className="transaction-category-icon transactions-manual-picker__category-icon"
                              style={getCategoryIconTone(manualSelectedCategory?.name ?? "Other")}
                            >
                              <img src={getCategoryIconSrc(manualSelectedCategory?.name ?? "Other")} alt="" aria-hidden="true" />
                            </span>
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
                                  <span
                                    className="transaction-category-icon transactions-manual-picker__category-icon"
                                    style={getCategoryIconTone(category.name)}
                                  >
                                    <img src={getCategoryIconSrc(category.name)} alt="" aria-hidden="true" />
                                  </span>
                                  <span className="transactions-manual-picker__option-text">
                                    <strong>{category.name}</strong>
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <label className="manual-form-layout__full">
                      Notes
                      <textarea
                        value={manualForm.description}
                        onChange={(event) => setManualForm((current) => ({ ...current, description: event.target.value }))}
                        placeholder="Optional note or review context"
                      />
                    </label>

                    <div className="manual-more-panel__receipt-line-items">
                      <div className="manual-more-panel__section-head">
                        <span>Receipt line items</span>
                        <button
                          type="button"
                          className="button button-secondary button-small"
                          onClick={() =>
                            setManualForm((current) => ({
                              ...current,
                              receiptLineItems: [...current.receiptLineItems, createEmptyReceiptLineItem()],
                            }))
                          }
                        >
                          Add line item
                        </button>
                      </div>

                      {manualForm.receiptLineItems.length === 0 ? (
                        <p className="field-help">
                          Optional. Add item lines if you want the receipt breakdown to follow the transaction.
                        </p>
                      ) : null}

                      {manualForm.receiptLineItems.map((lineItem, index) => (
                        <div key={index} className="manual-receipt-line-item">
                          <div className="manual-receipt-line-item__fields">
                            <label>
                              Item
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
                            <label>
                              Qty
                              <input
                                type="number"
                                step="0.01"
                                value={lineItem.quantity}
                                onChange={(event) =>
                                  setManualForm((current) => ({
                                    ...current,
                                    receiptLineItems: current.receiptLineItems.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, quantity: event.target.value } : entry
                                    ),
                                  }))
                                }
                                placeholder="1"
                              />
                            </label>
                            <label>
                              Unit price
                              <input
                                type="number"
                                step="0.01"
                                value={lineItem.unitPrice}
                                onChange={(event) =>
                                  setManualForm((current) => ({
                                    ...current,
                                    receiptLineItems: current.receiptLineItems.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, unitPrice: event.target.value } : entry
                                    ),
                                  }))
                                }
                                placeholder="0.00"
                              />
                            </label>
                            <label>
                              Amount
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
                          </div>
                          <button
                            type="button"
                            className="button button-secondary button-small"
                            onClick={() =>
                              setManualForm((current) => ({
                                ...current,
                                receiptLineItems: current.receiptLineItems.filter((_, entryIndex) => entryIndex !== index),
                              }))
                            }
                          >
                            Remove
                          </button>
                        </div>
                      ))}

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
                ) : null}
              </div>

              <div className="manual-form-actions">
                <div className="manual-form-actions__left">
                  <button
                    type="button"
                    className="button button-secondary button-small transactions-manual-more"
                    onClick={() => setManualMoreOpen((current) => !current)}
                    aria-expanded={manualMoreOpen}
                  >
                    <span>{manualMoreOpen ? "Less" : "More"}</span>
                    <ActionIcon name="chevron-down" />
                  </button>
                  <button
                    className="button button-secondary button-small"
                    type="submit"
                    data-submit-mode="add-another"
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Add another"}
                  </button>
                </div>
                <div className="manual-form-actions__right">
                  <button className="button button-primary" type="submit" data-submit-mode="close" disabled={isSaving}>
                    {isSaving ? "Saving..." : "Add transaction"}
                  </button>
                </div>
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
                  <h4 id="transaction-notes-title">{detailDraft?.merchantClean || detailDraft?.merchantRaw || selectedTransaction.merchantRaw}</h4>
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
                  <button
                    className="transactions-manual-type-help"
                    type="button"
                    title="Debit means money leaving the account. Credit means money coming in."
                    aria-label="Type help"
                  >
                    i
                  </button>
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
                        {account.name}
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
                    <span className="transaction-category-icon transaction-drawer-category-icon" style={getCategoryIconTone(detailSelectedCategory?.name ?? "Other")}>
                      <img src={getCategoryIconSrc(detailSelectedCategory?.name ?? "Other")} alt="" aria-hidden="true" />
                    </span>
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
          const previewTransactions = summary.previewTransactions ?? [];
          const optimisticAccount = buildOptimisticImportedAccount(summary);
          const importedAccountId = summary.accountId ?? summary.optimisticAccountId ?? null;
          const importedAccountKey = normalizeImportedAccountKey(summary.accountName, summary.institution, summary.accountNumber ?? null, summary.accountType ?? null);

          setPendingImportSummary(summary);

          flushSync(() => {
            setIsWorkspaceDataReady(true);

            if (summary.optimisticAccountId) {
              setAccounts((current) =>
                current.filter((account) => {
                  if (account.id === summary.optimisticAccountId) {
                    return false;
                  }

                  if (account.source === "upload") {
                    return normalizeImportedAccountKey(account.name, account.institution, account.accountNumber, account.type) !== importedAccountKey;
                  }

                  return true;
                })
              );
            }

            if (importedAccountId) {
              setTransactions((current) => {
                const withoutImportedPlaceholders = current.filter(
                  (transaction) => !(transaction.source === "upload" && transaction.accountId === importedAccountId)
                );
                return mergeImportedPreviewTransactions(withoutImportedPlaceholders, previewTransactions);
              });
            } else if (previewTransactions.length > 0) {
              setTransactions((current) => mergeImportedPreviewTransactions(current, previewTransactions));
            }

            if (optimisticAccount) {
              setAccounts((current) => {
                const withoutMatchingUploads = current.filter((account) => {
                  if (account.source !== "upload") {
                    return true;
                  }

                  return normalizeImportedAccountKey(account.name, account.institution, account.accountNumber, account.type) !== importedAccountKey;
                });
                const existingIndex = current.findIndex((account) => account.id === optimisticAccount.id);
                if (existingIndex >= 0) {
                  return withoutMatchingUploads.map((account) =>
                    account.id === optimisticAccount.id
                      ? {
                          ...account,
                          ...optimisticAccount,
                          balance: optimisticAccount.balance ?? account.balance,
                        }
                      : account
                  );
                }
                return [optimisticAccount, ...withoutMatchingUploads];
              });
            }
          });

          if (!selectedWorkspaceId) {
            return;
          }

          if (!summary.optimistic) {
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
