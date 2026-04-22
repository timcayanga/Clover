"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { ImportFilesModal } from "@/components/import-files-modal";
import {
  analyticsOnceKey,
  capturePostHogClientEvent,
  capturePostHogClientEventOnce,
} from "@/components/posthog-analytics";
import type { UploadInsightsSummary } from "@/components/upload-insights-toast";
import { inferAccountTypeFromStatement } from "@/lib/import-parser";
import { useOnboardingAccess } from "@/lib/use-onboarding-access";
import { readSelectedWorkspaceId } from "@/lib/workspace-selection";
import { chooseWorkspaceId, persistSelectedWorkspaceId } from "@/lib/workspace-selection";

type Workspace = {
  id: string;
  name: string;
  type: string;
};

type Account = {
  id: string;
  name: string;
  institution: string | null;
  type: "bank" | "wallet" | "credit_card" | "cash" | "investment" | "other";
  currency: string;
  source?: string;
  balance?: string | null;
};

const buildOptimisticImportedAccount = (summary: UploadInsightsSummary): Account | null => {
  if (!summary.accountId || !summary.accountName) {
    return null;
  }

  return {
    id: summary.accountId,
    name: summary.accountName,
    institution: summary.institution,
    type: inferAccountTypeFromStatement(summary.institution, summary.accountName, "bank"),
    currency: "PHP",
    balance: summary.balance,
  };
};

const mergeAccountsWithOptimisticImports = (fetchedAccounts: Account[], currentAccounts: Account[]) => {
  const fetchedById = new Map(fetchedAccounts.map((account) => [account.id, account] as const));
  const mergedFetchedAccounts = fetchedAccounts.map((account) => {
    const optimistic = currentAccounts.find((currentAccount) => currentAccount.id === account.id && currentAccount.source === "upload");
    if (!optimistic) {
      return account;
    }

    return {
      ...account,
      balance: account.balance ?? optimistic.balance,
      source: optimistic.source ?? account.source,
    };
  });

  const optimisticAccounts = currentAccounts.filter((account) => {
    if (account.source !== "upload") {
      return false;
    }

    return !fetchedById.has(account.id);
  });

  return [...optimisticAccounts, ...mergedFetchedAccounts];
};

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
  updatedAt: number;
};

type TransactionsWorkspaceCacheState = {
  selectedWorkspaceId: string;
  snapshots: Record<string, TransactionsWorkspaceCacheSnapshot>;
};

type DateFilterMode = "ltd" | "day" | "week" | "month" | "quarter" | "year" | "custom";

type ManualTransactionForm = {
  date: string;
  accountId: string;
  categoryId: string;
  amount: string;
  type: "debit" | "credit";
  merchantRaw: string;
  description: string;
};

type BulkEditForm = {
  accountId: string;
  categoryId: string;
  type: "" | "income" | "expense" | "transfer";
  description: string;
  isExcluded: "" | "include" | "exclude";
  isTransfer: "" | "true" | "false";
};

type TransactionDetailDraft = {
  merchantRaw: string;
  merchantClean: string;
  date: string;
  accountId: string;
  categoryId: string;
  amount: string;
  type: "debit" | "credit";
  description: string;
  isExcluded: boolean;
  isTransfer: boolean;
};

type EditableTransactionField = "name" | "date" | "accountId" | "categoryId" | "amount";

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

type MerchantRenameSuggestion = {
  sourceTransactionId: string;
  sourceMerchantRaw: string;
  targetMerchantClean: string;
  matchingTransactionIds: string[];
};

type UpdateTransactionOptions = {
  recordHistory?: boolean;
  historyBefore?: Transaction | null;
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const todayIso = new Date().toISOString().slice(0, 10);
const transactionsWorkspaceCacheKey = "clover.transactions.workspace-cache.v1";

const createEmptyManualForm = (accountId = "", categoryId = ""): ManualTransactionForm => ({
  date: todayIso,
  accountId,
  categoryId,
  amount: "",
  type: "debit",
  merchantRaw: "",
  description: "",
});

const getOtherCategoryId = (categoryList: Category[]) =>
  categoryList.find((category) => category.name.trim().toLowerCase() === "other")?.id ?? "";

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
      return "/category-icons/financial.svg";
    case "gifts & donations":
      return "/category-icons/gift.svg";
    case "business":
      return "/category-icons/business.svg";
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

const dateMatchesFilter = (dateValue: string, mode: DateFilterMode, anchor: string, customStart: string, customEnd: string) => {
  const date = dateValue.slice(0, 10);
  if (mode === "ltd") {
    return true;
  }
  if (mode === "day") {
    return date === anchor.slice(0, 10);
  }
  if (mode === "week") {
    return date >= startOfWeekIso(anchor) && date <= endOfWeekIso(anchor);
  }
  if (mode === "month") {
    return date >= startOfMonthIso(anchor) && date <= endOfMonthIso(anchor);
  }
  if (mode === "quarter") {
    return date >= startOfQuarterIso(anchor) && date <= endOfQuarterIso(anchor);
  }
  if (mode === "year") {
    return date >= startOfYearIso(anchor) && date <= endOfYearIso(anchor);
  }
  if (mode === "custom") {
    if (!customStart && !customEnd) {
      return true;
    }
    if (customStart && date < customStart) {
      return false;
    }
    if (customEnd && date > customEnd) {
      return false;
    }
    return true;
  }
  return true;
};

const createEmptyBulkEditForm = (): BulkEditForm => ({
  accountId: "",
  categoryId: "",
  type: "",
  description: "",
  isExcluded: "",
  isTransfer: "",
});

const normalizeFilterValue = (value: string) => value.trim().toLowerCase();

const toggleFilterValue = (values: string[], value: string) =>
  values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];

const toggleTypedFilterValue = <T extends string>(values: T[], value: T) =>
  values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];

const splitMerchantFilters = (value: string) =>
  value
    .split(/[,;\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const readTransactionsWorkspaceCache = (): TransactionsWorkspaceCacheState | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(transactionsWorkspaceCacheKey);
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
            Array.isArray(snapshot.imports)
          );
        })
      ) as Record<string, TransactionsWorkspaceCacheSnapshot>,
    };
  } catch {
    return null;
  }
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
  if (typeof window === "undefined" || !workspaceId) {
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

  window.localStorage.setItem(transactionsWorkspaceCacheKey, JSON.stringify(nextState));
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

const normalizeMerchantGroupKey = (value: string) =>
  value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const humanizeTransactionMerchantText = (value: string) => {
  const normalized = value.replace(/\u00a0/g, " ").trim();
  if (!normalized) {
    return "";
  }

  return normalized
    .replace(/fundtransfer/gi, "Fund Transfer")
    .replace(/interestearned/gi, "Interest Earned")
    .replace(/taxwithheld/gi, "Tax Withheld")
    .replace(/instapaytransferfee/gi, "InstaPay Transfer Fee")
    .replace(/transfertootherbank/gi, "Transfer to Other Bank")
    .replace(/transferfrom/gi, "Transfer from")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/\s*:\s*/g, ": ")
    .replace(/\s+/g, " ")
    .trim();
};

const summarizeTransactionMerchantText = (value: string) => {
  const humanized = humanizeTransactionMerchantText(value);
  const compact = humanized.replace(/[^a-z0-9]+/gi, "").toLowerCase();

  if (/^billspaymentto\b/i.test(humanized) || compact.startsWith("billspaymentto")) {
    return "Bills Payment";
  }
  if (compact.includes("fundtransfer")) return "Fund Transfer";
  if (compact.includes("interestearned")) return "Interest Earned";
  if (compact.includes("taxwithheld")) return "Tax Withheld";
  if (compact.includes("instapaytransferfee")) return "InstaPay Transfer Fee";
  if (compact.includes("transfertootherbank")) return "Transfer to Other Bank";
  if (/^(cash in|cash out|payment to|received|sent|transfer to|transfer from)\b/i.test(humanized)) {
    return humanized.split(/\s+/).slice(0, 3).join(" ");
  }

  return humanized;
};

const createDetailDraft = (transaction: Transaction): TransactionDetailDraft => ({
  merchantRaw: transaction.merchantRaw,
  merchantClean: transaction.merchantClean ?? "",
  date: transaction.date.slice(0, 10),
  accountId: transaction.accountId,
  categoryId: transaction.categoryId ?? "",
  amount: transaction.amount,
  type: transaction.type === "income" ? "credit" : "debit",
  description: normalizeTransactionNotes(transaction.description),
  isExcluded: transaction.isExcluded,
  isTransfer: transaction.isTransfer,
});

const detailDraftTypeToTransactionType = (type: TransactionDetailDraft["type"]) => (type === "credit" ? "income" : "expense");

const toolbarChipStyle = {
  backgroundColor: "#f2f5f7",
  borderColor: "#b8c0c5",
  color: "#111111",
  boxShadow: "none",
} as const;

const toolbarAddStyle = {
  backgroundColor: "#03a8c0",
  borderColor: "#03a8c0",
  color: "#ffffff",
  boxShadow: "none",
} as const;

function ActionIcon({
  name,
}: {
  name: "plus" | "chevron-down" | "chevron-right" | "undo" | "redo" | "search" | "calendar" | "filters" | "summary" | "save" | "download";
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

export default function TransactionsPage() {
  const onboardingStatus = useOnboardingAccess();

  useEffect(() => {
    document.title = "Clover | Transactions";
  }, []);

  if (onboardingStatus !== "ready") {
    return (
      <CloverShell
        active="transactions"
        title="Checking your setup..."
        kicker="One moment"
        subtitle="We’re confirming your onboarding status before opening Transactions."
        showTopbar={false}
      >
        <section className="empty-state">Checking your setup...</section>
      </CloverShell>
    );
  }

  return <TransactionsPageContent />;
}

function TransactionsPageContent() {
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(() => readSelectedWorkspaceId());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [imports, setImports] = useState<ImportFile[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [accountFilters, setAccountFilters] = useState<string[]>([]);
  const [typeFilters, setTypeFilters] = useState<Array<"debit" | "credit">>([]);
  const [merchantFilters, setMerchantFilters] = useState<string[]>([]);
  const [merchantFilterInput, setMerchantFilterInput] = useState("");
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [message, setMessage] = useState("Select a workspace to review transactions.");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [detailDraft, setDetailDraft] = useState<TransactionDetailDraft | null>(null);
  const [transactionDeleteConfirmOpen, setTransactionDeleteConfirmOpen] = useState(false);
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>("ltd");
  const [dateFilterAnchor, setDateFilterAnchor] = useState(todayIso);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [bulkEditForm, setBulkEditForm] = useState<BulkEditForm>(createEmptyBulkEditForm());
  const [manualForm, setManualForm] = useState<ManualTransactionForm>(createEmptyManualForm());
  const [isSaving, setIsSaving] = useState(false);
  const [isWorkspacesLoaded, setIsWorkspacesLoaded] = useState(false);
  const [isWorkspaceDataReady, setIsWorkspaceDataReady] = useState(false);
  const [undoStack, setUndoStack] = useState<TransactionHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<TransactionHistoryEntry[]>([]);
  const [isApplyingHistory, setIsApplyingHistory] = useState(false);
  const [merchantRenameSuggestion, setMerchantRenameSuggestion] = useState<MerchantRenameSuggestion | null>(null);
  const [merchantRenameBusy, setMerchantRenameBusy] = useState(false);
  const transactionRowRefs = useRef(new Map<string, HTMLDivElement>());

  const workspace = workspaces.find((entry) => entry.id === selectedWorkspaceId) ?? null;
  const otherCategoryId = useMemo(() => getOtherCategoryId(categories), [categories]);

  const loadWorkspaces = async () => {
    try {
      const response = await fetch("/api/workspaces");
      if (!response.ok) return;
      const data = await response.json();
      const items = Array.isArray(data.workspaces) ? data.workspaces : [];
      setWorkspaces(items);
      setSelectedWorkspaceId((current) => {
        return chooseWorkspaceId(items, current);
      });
    } finally {
      setIsWorkspacesLoaded(true);
    }
  };

  const loadWorkspaceData = async (workspaceId: string, options?: { skipMetadata?: boolean }) => {
    if (!workspaceId) {
      setAccounts([]);
      setCategories([]);
      setTransactions([]);
      setImports([]);
      setIsWorkspaceDataReady(true);
      return;
    }

    const transactionsResponse = await fetch(`/api/transactions?workspaceId=${encodeURIComponent(workspaceId)}`);

    if (transactionsResponse.ok) {
      const payload = await transactionsResponse.json();
      setTransactions(Array.isArray(payload.transactions) ? payload.transactions : []);
    }

    setIsWorkspaceDataReady(true);

    if (options?.skipMetadata) {
      const accountsResponse = await fetch(`/api/accounts?workspaceId=${encodeURIComponent(workspaceId)}`);

      if (accountsResponse.ok) {
        const payload = await accountsResponse.json();
        const fetchedAccounts = Array.isArray(payload.accounts) ? (payload.accounts as Account[]) : [];
        setAccounts((current) => mergeAccountsWithOptimisticImports(fetchedAccounts, current));
      }

      return;
    }

    const [accountsResponse, categoriesResponse, importResponse] = await Promise.all([
      fetch(`/api/accounts?workspaceId=${encodeURIComponent(workspaceId)}`),
      fetch(`/api/categories?workspaceId=${encodeURIComponent(workspaceId)}`),
      fetch(`/api/imports?workspaceId=${encodeURIComponent(workspaceId)}`),
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

    if (importResponse.ok) {
      const payload = await importResponse.json();
      setImports(Array.isArray(payload.importFiles) ? payload.importFiles : []);
    }
  };

  useEffect(() => {
    void loadWorkspaces();
  }, []);

  useEffect(() => {
    persistSelectedWorkspaceId(selectedWorkspaceId);
  }, [selectedWorkspaceId]);

  useEffect(() => {
    let active = true;

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
      setIsWorkspaceDataReady(true);
      return () => {
        active = false;
      };
    }

    const cachedSnapshot = getCachedTransactionsWorkspace(selectedWorkspaceId);
    if (cachedSnapshot) {
      setAccounts(cachedSnapshot.accounts);
      setCategories(cachedSnapshot.categories);
      setTransactions(cachedSnapshot.transactions);
      setImports(cachedSnapshot.imports);
      setIsWorkspaceDataReady(true);
    } else {
      setAccounts([]);
      setCategories([]);
      setTransactions([]);
      setImports([]);
      setIsWorkspaceDataReady(false);
    }

    void (async () => {
      await loadWorkspaceData(selectedWorkspaceId);
      if (active) {
        setIsWorkspaceDataReady(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (!addMenuOpen && !downloadMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (addMenuRef.current?.contains(target) || downloadMenuRef.current?.contains(target)) {
        return;
      }

      setAddMenuOpen(false);
      setDownloadMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAddMenuOpen(false);
        setDownloadMenuOpen(false);
        setImportOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [addMenuOpen, downloadMenuOpen]);

  const closeToolbarMenus = () => {
    setAddMenuOpen(false);
    setDownloadMenuOpen(false);
  };

  const openAddMenu = () => {
    setDownloadMenuOpen(false);
    setAddMenuOpen((current) => !current);
  };

  const openDownloadMenu = () => {
    setAddMenuOpen(false);
    setDownloadMenuOpen((current) => !current);
  };

  const openImportFiles = () => {
    closeToolbarMenus();
    setImportOpen(true);
  };

  useEffect(() => {
    if (searchParams.get("import") === "1") {
      setImportOpen(true);
      window.history.replaceState({}, "", "/transactions");
    }
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("manual") === "1") {
      setManualOpen(true);
      window.history.replaceState({}, "", "/transactions");
    }
  }, [searchParams]);

  const ensureDefaultAccount = async (workspaceId: string) => {
    const preferredAccount = accounts.find((account) => account.type !== "cash" && account.type !== "other" && account.type !== "investment");
    if (preferredAccount) {
      return preferredAccount.id;
    }

    if (accounts.length > 0) {
      return accounts[0].id;
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

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      if (transaction.merchantRaw === "Beginning balance" || transaction.description === "Beginning balance") {
        return false;
      }

      const term = query.trim().toLowerCase();
      const matchesQuery =
        !term ||
        transaction.merchantRaw.toLowerCase().includes(term) ||
        (transaction.merchantClean ?? "").toLowerCase().includes(term) ||
        (transaction.description ?? "").toLowerCase().includes(term);
      const matchesCategory =
        categoryFilters.length === 0 ||
        (transaction.categoryId ? categoryFilters.includes(transaction.categoryId) : false);
      const matchesAccount = accountFilters.length === 0 || accountFilters.includes(transaction.accountId);
      const transactionFilterType = transaction.type === "income" ? "credit" : "debit";
      const matchesType = typeFilters.length === 0 || typeFilters.includes(transactionFilterType);
      const merchantValue = normalizeFilterValue(`${transaction.merchantClean ?? transaction.merchantRaw} ${transaction.description ?? ""}`);
      const matchesMerchant =
        merchantFilters.length === 0 ||
        merchantFilters.some((merchantFilter) => merchantValue.includes(normalizeFilterValue(merchantFilter)));
      const matchesDate = dateMatchesFilter(transaction.date, dateFilterMode, dateFilterAnchor, customStart, customEnd);
      return matchesQuery && matchesCategory && matchesAccount && matchesType && matchesMerchant && matchesDate;
    });
  }, [
    transactions,
    query,
    categoryFilters,
    accountFilters,
    typeFilters,
    merchantFilters,
    dateFilterMode,
    dateFilterAnchor,
    customStart,
    customEnd,
  ]);
  const hasVisibleTransactions = useMemo(
    () =>
      transactions.some(
        (transaction) => transaction.merchantRaw !== "Beginning balance" && transaction.description !== "Beginning balance"
      ),
    [transactions]
  );

  const filteredTransactionIds = useMemo(() => filteredTransactions.map((transaction) => transaction.id), [filteredTransactions]);
  const allVisibleSelected = filteredTransactionIds.length > 0 && filteredTransactionIds.every((transactionId) => selectedTransactionIds.includes(transactionId));
  const someVisibleSelected = filteredTransactionIds.some((transactionId) => selectedTransactionIds.includes(transactionId));

  useEffect(() => {
    if (!selectAllRef.current) {
      return;
    }

    selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [allVisibleSelected, someVisibleSelected]);

  const duplicateLookup = useMemo(() => {
    const counts = new Map<string, number>();

    for (const transaction of filteredTransactions) {
      const signature = [
        transaction.date.slice(0, 10),
        Number(transaction.amount).toFixed(2),
        (transaction.merchantClean ?? transaction.merchantRaw).trim().toLowerCase(),
      ].join("|");

      counts.set(signature, (counts.get(signature) ?? 0) + 1);
    }

    return counts;
  }, [filteredTransactions]);

  const totals = useMemo(() => {
    return filteredTransactions.reduce(
      (accumulator, transaction) => {
        const amount = Math.abs(Number(transaction.amount));
        const signature = [
          transaction.date.slice(0, 10),
          Number(transaction.amount).toFixed(2),
          (transaction.merchantClean ?? transaction.merchantRaw).trim().toLowerCase(),
        ].join("|");
        const hasReviewIssue =
          transaction.isExcluded ||
          transaction.isTransfer ||
          !transaction.categoryId ||
          (duplicateLookup.get(signature) ?? 0) > 1;

        if (transaction.isExcluded) {
          if (hasReviewIssue) {
            accumulator.review += 1;
          }
          return accumulator;
        }

        if (transaction.type === "income") {
          accumulator.income += amount;
        } else {
          accumulator.expense += amount;
        }

        if (hasReviewIssue) {
          accumulator.review += 1;
        }

        return accumulator;
      },
      { income: 0, expense: 0, review: 0 }
    );
  }, [filteredTransactions, duplicateLookup]);

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

  const summaryData = useMemo(() => {
    const topCategories = new Map<string, number>();
    const topAccounts = new Map<string, number>();

    for (const transaction of filteredTransactions) {
      const amount = Math.abs(Number(transaction.amount));
      const categoryName = transaction.categoryName ?? "Other";
      topCategories.set(categoryName, (topCategories.get(categoryName) ?? 0) + amount);
      topAccounts.set(transaction.accountName, (topAccounts.get(transaction.accountName) ?? 0) + amount);
    }

    const topCategory = Array.from(topCategories.entries()).sort((a, b) => b[1] - a[1])[0];
    const topAccount = Array.from(topAccounts.entries()).sort((a, b) => b[1] - a[1])[0];
    const sortedDates = [...filteredTransactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const firstTransaction = sortedDates[0];
    const lastTransaction = sortedDates[sortedDates.length - 1];

    return {
      topCategory,
      topAccount,
      firstTransaction,
      lastTransaction,
    };
  }, [filteredTransactions]);

  const reviewTransactionCount = useMemo(
    () =>
      filteredTransactions.reduce((count, transaction) => {
        if (isResolvedReviewStatus(transaction.reviewStatus) || transaction.isExcluded || !transaction.categoryId) {
          return count;
        }

        const signature = [
          transaction.date.slice(0, 10),
          Number(transaction.amount).toFixed(2),
          (transaction.merchantClean ?? transaction.merchantRaw).trim().toLowerCase(),
        ].join("|");

        return (duplicateLookup.get(signature) ?? 0) > 1 ? count + 1 : count;
      }, 0),
    [filteredTransactions, duplicateLookup]
  );

  const warningReasonFor = (transaction: Transaction) => {
    if (isResolvedReviewStatus(transaction.reviewStatus)) {
      return null;
    }

    const signature = [
      transaction.date.slice(0, 10),
      Number(transaction.amount).toFixed(2),
      (transaction.merchantClean ?? transaction.merchantRaw).trim().toLowerCase(),
    ].join("|");

    if (transaction.isExcluded) {
      return "Ignored from totals";
    }

    if (!transaction.categoryId) {
      return "Needs category review";
    }

    if ((duplicateLookup.get(signature) ?? 0) > 1) {
      return "Possible duplicate";
    }

    return null;
  };

  const isReviewableTransaction = (transaction: Transaction) => {
    if (isResolvedReviewStatus(transaction.reviewStatus)) {
      return false;
    }

    if (transaction.isExcluded) {
      return false;
    }

    if (!transaction.categoryId) {
      return true;
    }

    const signature = [
      transaction.date.slice(0, 10),
      Number(transaction.amount).toFixed(2),
      (transaction.merchantClean ?? transaction.merchantRaw).trim().toLowerCase(),
    ].join("|");

    return (duplicateLookup.get(signature) ?? 0) > 1;
  };

  const firstReviewTransaction = useMemo(
    () => filteredTransactions.find((transaction) => isReviewableTransaction(transaction)) ?? null,
    [filteredTransactions, duplicateLookup]
  );

  const warningTransactionCount = useMemo(
    () => filteredTransactions.filter((transaction) => warningReasonFor(transaction) !== null).length,
    [filteredTransactions, duplicateLookup]
  );

  const nextReviewTransactionAfter = (transactionId: string) => {
    const startIndex = filteredTransactions.findIndex((transaction) => transaction.id === transactionId);
    const start = startIndex >= 0 ? startIndex + 1 : 0;
    const ordered = [...filteredTransactions.slice(start), ...filteredTransactions.slice(0, start)];
    return ordered.find((transaction) => isReviewableTransaction(transaction)) ?? null;
  };

  const openTransactionDetail = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setTransactionDeleteConfirmOpen(false);
    setDetailDraft({
      ...createDetailDraft(transaction),
      categoryId: transaction.categoryId ?? otherCategoryId,
    });
  };

  const openTransactionReview = (transaction: Transaction) => {
    openTransactionDetail(transaction);
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
    const row = transactionRowRefs.current.get(transaction.id);
    if (row) {
      window.requestAnimationFrame(() => {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
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

    if (nextReviewTransaction) {
      window.requestAnimationFrame(() => {
        openTransactionReview(nextReviewTransaction);
      });
      return;
    }

    closeTransactionDetail();
  };

  const closeTransactionDetail = () => {
    setSelectedTransaction(null);
    setDetailDraft(null);
    setTransactionDeleteConfirmOpen(false);
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
    setTransactions((current) => current.filter((entry) => entry.id !== transactionId));
    setSelectedTransactionIds((current) => current.filter((entryId) => entryId !== transactionId));
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

  const openManualAdd = async () => {
    setAddMenuOpen(false);

    if (!selectedWorkspaceId) {
      setMessage("Choose a workspace first.");
      return;
    }

    try {
      const accountId = await ensureDefaultAccount(selectedWorkspaceId);
      setManualForm(createEmptyManualForm(accountId, getOtherCategoryId(categories)));
      setManualOpen(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to prepare transaction form.");
    }
  };

  const saveManualTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedWorkspaceId) {
      setMessage("Choose a workspace first.");
      return;
    }

    setIsSaving(true);
    try {
      const accountId = manualForm.accountId || (await ensureDefaultAccount(selectedWorkspaceId));
      const categoryId = manualForm.categoryId || getOtherCategoryId(categories) || undefined;

      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          accountId,
          categoryId: categoryId ?? null,
          date: manualForm.date,
          amount: manualForm.amount,
          currency: "PHP",
          type: manualForm.type === "credit" ? "income" : "expense",
          merchantRaw: manualForm.merchantRaw,
          merchantClean: null,
          description: manualForm.description.trim() || null,
          isTransfer: false,
          isExcluded: false,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to create transaction.");
      }

      const payload = await response.json();
      const created = payload.transaction as Transaction;
      setTransactions((current) => [created, ...current]);
      setUndoStack([]);
      setRedoStack([]);
      setManualOpen(false);
      setMessage(`Transaction "${created.merchantRaw}" added.`);
    } catch (error) {
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
      });
      capturePostHogClientEvent("transaction_merged", {
        workspace_id: selectedWorkspaceId || null,
        source_transaction_id: merchantRenameSuggestion.sourceTransactionId,
        target_merchant_clean: merchantRenameSuggestion.targetMerchantClean,
        merged_count: transactionsToUpdate.length,
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
        isExcluded: patch.isExcluded ?? current.isExcluded,
        isTransfer: patch.isTransfer ?? current.isTransfer,
      };
    });
  };

  const deleteTransaction = async (transactionId: string) => {
    const response = await fetch(`/api/transactions/${transactionId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("Unable to delete transaction.");
    }

    syncAfterTransactionRemoval(transactionId);
  };

  const confirmDeleteTransaction = async () => {
    if (!selectedTransaction) {
      return;
    }

    setIsSaving(true);
    try {
      await deleteTransaction(selectedTransaction.id);
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

    const payloads = selected.map((transaction) => ({
      transaction,
      payload: {
        accountId: bulkEditForm.accountId || undefined,
        categoryId: bulkEditForm.categoryId || undefined,
        type: bulkEditForm.type || undefined,
        description: bulkEditForm.description ? bulkEditForm.description : undefined,
        isExcluded:
          bulkEditForm.isExcluded === ""
            ? undefined
            : bulkEditForm.isExcluded === "exclude",
        isTransfer:
          bulkEditForm.isTransfer === ""
            ? undefined
            : bulkEditForm.isTransfer === "true",
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
          ...(payload.type ? { type: payload.type as Transaction["type"] } : {}),
          ...(payload.description !== undefined ? { description: payload.description ?? null } : {}),
          ...(payload.isExcluded !== undefined ? { isExcluded: payload.isExcluded } : {}),
          ...(payload.isTransfer !== undefined ? { isTransfer: payload.isTransfer } : {}),
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
        }
      } finally {
        setIsSaving(false);
      }
    })();
  };

  const bulkUpdateSelectedTransactions = async (payloadFactory: (transaction: Transaction) => Record<string, unknown>) => {
    if (!selectedTransactionIds.length) {
      setMessage("Select transactions first.");
      return;
    }

    setIsSaving(true);
    const selected = selectedTransactionIds
      .map((transactionId) => transactions.find((entry) => entry.id === transactionId))
      .filter((entry): entry is Transaction => Boolean(entry));
    const originalTransactions = new Map(selected.map((transaction) => [transaction.id, transaction] as const));
    const payloads = selected.map((transaction) => ({
      transaction,
      payload: payloadFactory(transaction),
    }));

    applyTransactionPatchesLocally(
      payloads.map(({ transaction, payload }) => {
        const patch: Partial<Transaction> = {};

        if (Object.prototype.hasOwnProperty.call(payload, "isExcluded")) {
          patch.isExcluded = Boolean(payload.isExcluded);
        }

        if (Object.prototype.hasOwnProperty.call(payload, "isTransfer")) {
          patch.isTransfer = Boolean(payload.isTransfer);
        }

        if (Object.prototype.hasOwnProperty.call(payload, "accountId") && typeof payload.accountId === "string") {
          patch.accountId = payload.accountId;
          patch.accountName = accounts.find((account) => account.id === payload.accountId)?.name ?? transaction.accountName;
        }

        if (Object.prototype.hasOwnProperty.call(payload, "categoryId")) {
          const categoryId = typeof payload.categoryId === "string" ? payload.categoryId : null;
          patch.categoryId = categoryId;
          patch.categoryName = categories.find((category) => category.id === categoryId)?.name ?? transaction.categoryName;
        }

        if (Object.prototype.hasOwnProperty.call(payload, "type") && typeof payload.type === "string") {
          patch.type = payload.type as Transaction["type"];
        }

        if (Object.prototype.hasOwnProperty.call(payload, "description")) {
          patch.description = typeof payload.description === "string" ? payload.description : null;
        }

        return {
          transactionId: transaction.id,
          patch,
        };
      })
    );

    setUndoStack([]);
    setRedoStack([]);
    setMessage(`${selected.length} transaction${selected.length === 1 ? "" : "s"} updated.`);

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
        }
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

    const count = selectedTransactionIds.length;
    setIsSaving(true);
    try {
      await Promise.all(selectedTransactionIds.map((transactionId) => deleteTransaction(transactionId)));
      clearSelection();
      setBulkDeleteConfirmOpen(false);
      setUndoStack([]);
      setRedoStack([]);
      setMessage(`${count} transaction${count === 1 ? "" : "s"} deleted.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete transactions.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveDetailDraft = async () => {
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
      setMessage("Transaction details updated.");
      closeTransactionDetail();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update transaction.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveView = () => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      "clover.transactions.view",
      JSON.stringify({
        query,
        categoryFilters,
        accountFilters,
        typeFilters,
        merchantFilters,
      })
    );
    capturePostHogClientEvent("report_filtered", {
      workspace_id: selectedWorkspaceId || null,
      view: "transactions",
      filter_type_count: typeFilters.length,
      filter_category_count: categoryFilters.length,
      filter_account_count: accountFilters.length,
      filter_merchant_count: merchantFilters.length,
      query_length: query.trim().length,
      date_filter_mode: dateFilterMode,
    });
    setMessage("Current view saved.");
  };

  const addMerchantFilters = (value: string) => {
    const next = splitMerchantFilters(value);
    if (!next.length) {
      return;
    }

    setMerchantFilters((current) => {
      const merged = new Set(current);
      next.forEach((merchant) => merged.add(merchant));
      return Array.from(merged);
    });
    setMerchantFilterInput("");
  };

  const downloadCsv = () => {
    const header = ["Name", "Date", "Account", "Category", "Amount", "Type", "Notes", "Warning"];
    const rows = filteredTransactions.map((transaction) => [
      transaction.merchantClean ?? transaction.merchantRaw,
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
      row_count: filteredTransactions.length,
      selected_count: selectedTransactionIds.length,
    });
    downloadTextFile("clover-transactions.csv", csv, "text/csv;charset=utf-8;");
  };

  const downloadPdf = () => {
    if (typeof window !== "undefined") {
      const report = window.open("", "_blank", "width=1280,height=900");
      if (!report) {
        window.print();
        return;
      }

      const rows = filteredTransactions
        .map((transaction) => {
          const warningReason = warningReasonFor(transaction);
          const amount = Number(transaction.amount);
          const categoryValue = transaction.categoryId ?? otherCategoryId;
          const categoryLabel = categories.find((category) => category.id === categoryValue)?.name ?? "Other";
          const categoryIconSrc = new URL(
            getCategoryIconSrc(transaction.categoryName ?? categoryLabel),
            window.location.origin
          ).toString();
          const categoryTone = getCategoryIconTone(transaction.categoryName ?? categoryLabel);

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
                  <div class="name-cell__summary">${escapeHtml(
                    summarizeTransactionMerchantText(transaction.merchantClean ?? transaction.merchantRaw)
                  )}</div>
                  ${
                    humanizeTransactionMerchantText(transaction.merchantRaw).toLowerCase() !==
                    summarizeTransactionMerchantText(transaction.merchantClean ?? transaction.merchantRaw).toLowerCase()
                      ? `<div class="name-cell__subtext">${escapeHtml(humanizeTransactionMerchantText(transaction.merchantRaw))}</div>`
                      : ""
                  }
                </div>
              </td>
              <td>${escapeHtml(formatDate(transaction.date))}</td>
              <td>${escapeHtml(transaction.accountName)}</td>
              <td>${escapeHtml(categoryLabel)}</td>
              <td class="${transaction.type === "income" ? "positive" : "negative"}">${escapeHtml(
                currencyFormatter.format(amount)
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
                border-bottom: 1px solid #e5e7eb;
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
              <div class="meta">${escapeHtml(filteredTransactions.length.toString())} transaction${
                filteredTransactions.length === 1 ? "" : "s"
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
        row_count: filteredTransactions.length,
        selected_count: selectedTransactionIds.length,
      });
    }
  };

  const netGain = totals.income - totals.expense;
  const hasReviewItems = warningTransactionCount > 0;
  const dateFilterLabel = getDateFilterLabel(dateFilterMode, dateFilterAnchor, customStart, customEnd);
  const isTableLoading = !selectedWorkspaceId ? !isWorkspacesLoaded : !isWorkspaceDataReady;
  const hasSelectedTransactions = selectedTransactionIds.length > 0;

  useEffect(() => {
    if (!selectedWorkspaceId || !isWorkspaceDataReady) {
      return;
    }

    persistTransactionsWorkspaceCache(selectedWorkspaceId, {
      accounts,
      categories,
      transactions,
      imports,
    });
  }, [selectedWorkspaceId, isWorkspaceDataReady, accounts, categories, transactions, imports]);

  return (
    <CloverShell active="transactions" title="Transactions" showTopbar={false}>
      <section className={`transactions-layout ${summaryOpen ? "transactions-layout--summary-open" : ""}`}>
        <div className="glass table-panel table-panel--full transactions-table-panel transactions-main-panel">
          <div className="transactions-topbar">
            <div className="transactions-toolbar-row transactions-toolbar-row--top">
              <div className="transactions-toolbar-spacer" aria-hidden="true" />
              <div className="transactions-toolbar-group transactions-toolbar-group--right">
                <button
                  className="button button-secondary button-small transactions-action-button transactions-toolbar-chip transactions-search-trigger"
                  style={toolbarChipStyle}
                  type="button"
                  onClick={() => searchInputRef.current?.focus()}
                  title="Search"
                  aria-label="Search transactions"
                >
                  <span className="button-icon" aria-hidden="true">
                    <ActionIcon name="search" />
                  </span>
                  <span>Search</span>
                </button>
                <button
                  className="button button-secondary button-small transactions-action-button transactions-toolbar-chip"
                  style={toolbarChipStyle}
                  type="button"
                  title={dateFilterLabel}
                  onClick={() => setDateFilterOpen(true)}
                  aria-label="Open date filter"
                >
                  <span className="button-icon" aria-hidden="true">
                    <ActionIcon name="calendar" />
                  </span>
                  <span>Date</span>
                </button>
                <button
                  className="button button-secondary button-small transactions-action-button transactions-toolbar-chip"
                  style={toolbarChipStyle}
                  type="button"
                  title="Filters"
                  onClick={() => setFilterOpen(true)}
                  aria-label="Open filters"
                >
                  <span className="button-icon" aria-hidden="true">
                    <ActionIcon name="filters" />
                  </span>
                  <span>Filters</span>
                </button>
                <button
                  className="button button-secondary button-small transactions-action-button transactions-toolbar-chip transactions-summary-toggle-button"
                  style={toolbarChipStyle}
                  type="button"
                  aria-pressed={summaryOpen}
                  onClick={() => setSummaryOpen((current) => !current)}
                  title="Summary"
                  aria-label="Summary"
                >
                  <span className="button-icon" aria-hidden="true">
                    <ActionIcon name="summary" />
                  </span>
                </button>
              </div>
            </div>

            <div className="transactions-toolbar-row transactions-toolbar-row--bottom">
              <div className="transactions-toolbar-group transactions-toolbar-group--left">
                <div className="transactions-add-menu" id="transactions-add-menu" ref={addMenuRef}>
                  <button
                    className="button button-primary button-small transactions-action-button transactions-toolbar-add transactions-add-menu__toggle"
                    style={toolbarAddStyle}
                    type="button"
                    onClick={() => {
                      openAddMenu();
                    }}
                    aria-expanded={addMenuOpen}
                    aria-label="Add transaction"
                  >
                    <span className="button-icon" aria-hidden="true">
                      <ActionIcon name="plus" />
                    </span>
                    <span>Add</span>
                    <span className="button-icon" aria-hidden="true">
                      <ActionIcon name="chevron-down" />
                    </span>
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
                <button
                  className="button button-secondary button-small transactions-action-button transactions-toolbar-chip"
                  style={toolbarChipStyle}
                  type="button"
                  title="Undo"
                  disabled={!undoStack.length || isSaving || isApplyingHistory}
                  onClick={() => {
                    void undoLastChange();
                  }}
                  aria-label="Undo last change"
                >
                  <span className="button-icon" aria-hidden="true">
                    <img src="/undo.svg" alt="" aria-hidden="true" />
                  </span>
                  <span>Undo</span>
                </button>
                <button
                  className="button button-secondary button-small transactions-action-button transactions-toolbar-chip"
                  style={toolbarChipStyle}
                  type="button"
                  title="Redo"
                  disabled={!redoStack.length || isSaving || isApplyingHistory}
                  onClick={() => {
                    void redoLastChange();
                  }}
                  aria-label="Redo last change"
                >
                  <span className="button-icon" aria-hidden="true">
                    <img src="/redo.svg" alt="" aria-hidden="true" />
                  </span>
                  <span>Redo</span>
                </button>
              </div>

              <div className="transactions-toolbar-group transactions-toolbar-group--right">
                <button
                  className="button button-secondary button-small transactions-action-button transactions-toolbar-chip"
                  style={toolbarChipStyle}
                  type="button"
                  onClick={saveView}
                  title="Save view"
                  aria-label="Save current view"
                >
                  <span className="button-icon" aria-hidden="true">
                    <ActionIcon name="save" />
                  </span>
                  <span>Save View</span>
                </button>
                <div className="transactions-download-menu" id="transactions-download-menu" ref={downloadMenuRef}>
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
                    <span>Download</span>
                    <span className="button-icon" aria-hidden="true">
                      <ActionIcon name="chevron-down" />
                    </span>
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
            </div>
          </div>

          {hasSelectedTransactions ? (
            <div className="transactions-status-line transactions-selection-bar" role="status" aria-live="polite">
              <div className="transactions-status-line__meta">
                <span className="pill pill-neutral">{selectedTransactionIds.length} selected</span>
                <span className="transactions-selection-bar__text">Choose what you want to do with the selected transactions.</span>
              </div>
              <div className="transactions-status-line__meta">
                <button
                  className="button button-secondary button-small transactions-action-button"
                  type="button"
                  onClick={openBulkEdit}
                  disabled={isSaving || isApplyingHistory}
                >
                  Bulk edit
                </button>
                <button
                  className="button button-secondary button-small transactions-action-button"
                  type="button"
                  onClick={() => {
                    void bulkUpdateSelectedTransactions(() => ({ isExcluded: true }));
                  }}
                  disabled={isSaving}
                >
                  Ignore
                </button>
                <button
                  className="button button-secondary button-small transactions-action-button"
                  type="button"
                  onClick={() => {
                    void bulkUpdateSelectedTransactions(() => ({ isExcluded: false }));
                  }}
                  disabled={isSaving}
                >
                  Include
                </button>
                <button
                  className="button button-secondary button-small transactions-action-button transactions-selection-bar__danger"
                  type="button"
                  onClick={() => setBulkDeleteConfirmOpen(true)}
                  disabled={isSaving}
                >
                  Delete
                </button>
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
            <div className="modal-backdrop" role="presentation" onClick={() => setBulkDeleteConfirmOpen(false)}>
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
                      filteredTransactionIds.forEach((transactionId) => next.add(transactionId));
                    } else {
                      filteredTransactionIds.forEach((transactionId) => next.delete(transactionId));
                    }
                    return Array.from(next);
                  });
                }}
                aria-label="Select all visible transactions"
              />
            </label>
            <span className="line-item-header-cell line-item-header-cell--icon" aria-hidden="true" />
            <button className="line-item-header-cell line-item-header-cell--name" type="button">
              Name
            </button>
            <button className="line-item-header-cell" type="button">
              Date
            </button>
            <button className="line-item-header-cell" type="button">
              Account
            </button>
            <button className="line-item-header-cell" type="button">
              Category
            </button>
            <button className="line-item-header-cell line-item-header-cell--amount" type="button">
              Amount
            </button>
            <span className="line-item-header-cell line-item-header-cell--spacer" aria-hidden="true" />
            <span className="line-item-header-cell line-item-header-cell--spacer" aria-hidden="true" />
          </div>

          <div className="table-wrap transactions-table-wrap" aria-busy={isTableLoading}>
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
            ) : filteredTransactions.length > 0 ? (
              filteredTransactions.map((transaction) => {
                const warningReason = warningReasonFor(transaction);
                const amount = Number(transaction.amount);
                const isPositive = transaction.type === "income";
                const amountToneClass = isPositive ? "positive" : "negative";
                const categoryValue = transaction.categoryId ?? otherCategoryId;
                const categoryLabel = categories.find((category) => category.id === categoryValue)?.name ?? "Other";
                const merchantSummary = summarizeTransactionMerchantText(transaction.merchantClean ?? transaction.merchantRaw);
                const merchantDisplay = humanizeTransactionMerchantText(transaction.merchantRaw);
                const showMerchantSubtext = merchantDisplay && merchantDisplay.toLowerCase() !== merchantSummary.toLowerCase();
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
                    className={`line-item ${transaction.isExcluded ? "is-muted" : ""} ${
                      selectedTransactionIds.includes(transaction.id) ? "is-selected" : ""
                    }`}
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
                      <span className="transaction-category-icon" style={getCategoryIconTone(transaction.categoryName ?? categoryLabel)}>
                        <img src={getCategoryIconSrc(transaction.categoryName ?? categoryLabel)} alt="" aria-hidden="true" />
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
                        displayValue={currencyFormatter.format(amount)}
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
                        <button
                          type="button"
                          className="warning-chip"
                          title={warningReason}
                          aria-label={warningReason}
                          onClick={() => openTransactionDetail(transaction)}
                        >
                          <span className="warning-mark warning-mark--small" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            ) : !hasVisibleTransactions ? (
              <div className="transactions-empty-state">
                <p className="transactions-empty-state__eyebrow">It is quiet in here</p>
                <h3>No transactions yet</h3>
                <p className="transactions-empty-state__copy">
                  Add your first transaction to get the dashboard moving and start building your categories.
                </p>
                <div className="transactions-empty-state__actions">
                  <button className="button button-primary" type="button" onClick={() => void openManualAdd()}>
                    Add transaction
                  </button>
                  <button className="button button-secondary" type="button" onClick={() => openImportFiles()}>
                    Import files
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-state">No transactions match the current filters.</div>
            )}
          </div>

          <div className="transactions-footer">
            <div className="table-footer__summary">
              <span className="pill pill-neutral">{filteredTransactions.length} transactions</span>
          {warningTransactionCount > 0 ? (
                <button
                  type="button"
                  className="warning-summary-button"
                  title={`${warningTransactionCount} transaction${warningTransactionCount === 1 ? "" : "s"} have a warning. Open the first one.`}
                  onClick={() => {
                    if (firstReviewTransaction) {
                      openTransactionReview(firstReviewTransaction);
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
            <span className={`pill transactions-net-pill ${netGain >= 0 ? "is-positive" : "is-negative"}`}>
              {netGain >= 0 ? "Net gain" : "Net loss"} {currencyFormatter.format(Math.abs(netGain))}
            </span>
          </div>
        </div>

        <aside className={`transactions-summary-panel glass ${summaryOpen ? "" : "is-hidden"}`} aria-label="Transaction summary">
          <div className="transactions-summary-panel__head">
            <p className="eyebrow">Summary</p>
            <h4>Overview</h4>
          </div>

          <dl className="transactions-summary-list">
            <div>
              <dt>Total transactions</dt>
              <dd>{filteredTransactions.length}</dd>
            </div>
            <div>
              <dt>Income</dt>
              <dd className="positive">{currencyFormatter.format(totals.income)}</dd>
            </div>
            <div>
              <dt>Spending</dt>
              <dd className="negative">{currencyFormatter.format(totals.expense)}</dd>
            </div>
            <div>
              <dt>Net</dt>
              <dd className={netGain >= 0 ? "positive" : "negative"}>{currencyFormatter.format(netGain)}</dd>
            </div>
            <div>
              <dt>Review items</dt>
              <dd>{totals.review}</dd>
            </div>
            <div>
              <dt>Top category</dt>
              <dd>{summaryData.topCategory ? `${summaryData.topCategory[0]} · ${currencyFormatter.format(summaryData.topCategory[1])}` : "—"}</dd>
            </div>
            <div>
              <dt>Top source</dt>
              <dd>{summaryData.topAccount ? `${summaryData.topAccount[0]} · ${currencyFormatter.format(summaryData.topAccount[1])}` : "—"}</dd>
            </div>
            <div>
              <dt>First transaction</dt>
              <dd>{summaryData.firstTransaction ? formatDate(summaryData.firstTransaction.date) : "—"}</dd>
            </div>
            <div>
              <dt>Last transaction</dt>
              <dd>{summaryData.lastTransaction ? formatDate(summaryData.lastTransaction.date) : "—"}</dd>
            </div>
          </dl>

          <button className="transactions-summary-panel__download" type="button" onClick={downloadCsv}>
            Download CSV
          </button>
        </aside>
      </section>

      {dateFilterOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setDateFilterOpen(false)}>
          <section
            className="modal-card modal-card--wide date-filter-card glass"
            role="dialog"
            aria-modal="true"
            aria-labelledby="date-filter-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Transactions</p>
                <h4 id="date-filter-title">Date filter</h4>
                <p className="modal-copy">{dateFilterLabel}</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setDateFilterOpen(false)} aria-label="Close date filter">
                ×
              </button>
            </div>

            <div className="date-filter-tabs" role="tablist" aria-label="Date filter mode">
              {[
                ["ltd", "Lifetime"],
                ["day", "Today"],
                ["week", "Week"],
                ["month", "Month"],
                ["quarter", "Quarter"],
                ["year", "Year"],
                ["custom", "Custom"],
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  className={`date-filter-tab ${dateFilterMode === mode ? "is-active" : ""}`}
                  type="button"
                  onClick={() => setDateFilterMode(mode as DateFilterMode)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="date-filter-panel">
              {dateFilterMode === "ltd" ? (
                <div className="date-filter-empty">Lifetime to date includes every transaction up to today.</div>
              ) : null}
              {dateFilterMode === "day" ? (
                <label className="date-filter-field">
                  <span>On</span>
                  <input type="date" value={dateFilterAnchor} onChange={(event) => setDateFilterAnchor(event.target.value)} />
                </label>
              ) : null}
              {dateFilterMode === "week" ? (
                <div className="date-filter-fields date-filter-fields--two">
                  <label className="date-filter-field">
                    <span>Anchor</span>
                    <input type="date" value={dateFilterAnchor} onChange={(event) => setDateFilterAnchor(event.target.value)} />
                  </label>
                  <div className="date-filter-empty">
                    {formatDate(startOfWeekIso(dateFilterAnchor))} - {formatDate(endOfWeekIso(dateFilterAnchor))}
                  </div>
                </div>
              ) : null}
              {dateFilterMode === "month" ? (
                <div className="date-filter-fields date-filter-fields--two">
                  <label className="date-filter-field">
                    <span>Anchor</span>
                    <input type="date" value={dateFilterAnchor} onChange={(event) => setDateFilterAnchor(event.target.value)} />
                  </label>
                  <div className="date-filter-empty">
                    {formatDate(startOfMonthIso(dateFilterAnchor))} - {formatDate(endOfMonthIso(dateFilterAnchor))}
                  </div>
                </div>
              ) : null}
              {dateFilterMode === "quarter" ? (
                <div className="date-filter-fields date-filter-fields--two">
                  <label className="date-filter-field">
                    <span>Anchor</span>
                    <input type="date" value={dateFilterAnchor} onChange={(event) => setDateFilterAnchor(event.target.value)} />
                  </label>
                  <div className="date-filter-empty">
                    {formatDate(startOfQuarterIso(dateFilterAnchor))} - {formatDate(endOfQuarterIso(dateFilterAnchor))}
                  </div>
                </div>
              ) : null}
              {dateFilterMode === "year" ? (
                <div className="date-filter-fields date-filter-fields--two">
                  <label className="date-filter-field">
                    <span>Anchor</span>
                    <input type="date" value={dateFilterAnchor} onChange={(event) => setDateFilterAnchor(event.target.value)} />
                  </label>
                  <div className="date-filter-empty">
                    {formatDate(startOfYearIso(dateFilterAnchor))} - {formatDate(endOfYearIso(dateFilterAnchor))}
                  </div>
                </div>
              ) : null}
              {dateFilterMode === "custom" ? (
                <div className="date-filter-fields date-filter-fields--two">
                  <label className="date-filter-field">
                    <span>Start</span>
                    <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
                  </label>
                  <label className="date-filter-field">
                    <span>End</span>
                    <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
                  </label>
                </div>
              ) : null}
            </div>

            <div className="form-actions date-filter-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  setDateFilterMode("ltd");
                  setDateFilterAnchor(todayIso);
                  setCustomStart("");
                  setCustomEnd("");
                  capturePostHogClientEvent("report_filtered", {
                    workspace_id: selectedWorkspaceId || null,
                    view: "transactions",
                    action: "date_filter_reset",
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
                    action: "date_filter_applied",
                    date_filter_mode: dateFilterMode,
                  });
                  setDateFilterOpen(false);
                }}
              >
                Done
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {filterOpen ? (
        <div className="modal-backdrop modal-backdrop--soft" role="presentation" onClick={() => setFilterOpen(false)}>
          <section
            className="modal-card modal-card--wide glass"
            role="dialog"
            aria-modal="true"
            aria-labelledby="transaction-filters-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Transactions</p>
                <h4 id="transaction-filters-title">Filters</h4>
                <p className="modal-copy">Refine what appears in the transaction review table.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setFilterOpen(false)} aria-label="Close filters">
                ×
              </button>
            </div>

            <div className="form-grid">
              <label className="span-2">
                Search
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by merchant, note, or alias"
                />
              </label>
              <MerchantFilterGroup
                merchants={merchantFilters}
                input={merchantFilterInput}
                onInputChange={setMerchantFilterInput}
                onAddMerchants={addMerchantFilters}
                onRemoveMerchant={(merchant) => setMerchantFilters((current) => current.filter((entry) => entry !== merchant))}
                onClear={() => {
                  setMerchantFilters([]);
                  setMerchantFilterInput("");
                }}
              />
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
                  setQuery("");
                  setCategoryFilters([]);
                  setAccountFilters([]);
                  setTypeFilters([]);
                  setMerchantFilters([]);
                  setMerchantFilterInput("");
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
                    filter_merchant_count: merchantFilters.length,
                    query_length: query.trim().length,
                  });
                  setFilterOpen(false);
                }}
              >
                Done
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {bulkEditOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setBulkEditOpen(false)}>
          <section
            className="modal-card modal-card--wide glass"
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
              <div className="form-grid">
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
                  Type
                  <select
                    value={bulkEditForm.type}
                    onChange={(event) => setBulkEditForm((current) => ({ ...current, type: event.target.value as BulkEditForm["type"] }))}
                  >
                    <option value="">Leave unchanged</option>
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                    <option value="transfer">Transfer</option>
                  </select>
                </label>
                <label>
                  Review state
                  <select
                    value={bulkEditForm.isExcluded}
                    onChange={(event) =>
                      setBulkEditForm((current) => ({ ...current, isExcluded: event.target.value as BulkEditForm["isExcluded"] }))
                    }
                  >
                    <option value="">Leave unchanged</option>
                    <option value="include">Include in totals</option>
                    <option value="exclude">Ignore in totals</option>
                  </select>
                </label>
                <label>
                  Transfer state
                  <select
                    value={bulkEditForm.isTransfer}
                    onChange={(event) =>
                      setBulkEditForm((current) => ({ ...current, isTransfer: event.target.value as BulkEditForm["isTransfer"] }))
                    }
                  >
                    <option value="">Leave unchanged</option>
                    <option value="true">Mark as transfer</option>
                    <option value="false">Clear transfer</option>
                  </select>
                </label>
                <label className="span-2">
                  Notes
                  <textarea
                    value={bulkEditForm.description}
                    onChange={(event) => setBulkEditForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Leave blank to keep existing notes"
                  />
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
        <div className="modal-backdrop" role="presentation" onClick={() => setManualOpen(false)}>
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
                <p className="modal-copy">Add a manual transaction or keep it as a quick review note.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setManualOpen(false)} aria-label="Close add transaction dialog">
                ×
              </button>
            </div>

            <form onSubmit={saveManualTransaction}>
              <div className="form-grid">
                <label>
                  Name
                  <input
                    value={manualForm.merchantRaw}
                    onChange={(event) => setManualForm((current) => ({ ...current, merchantRaw: event.target.value }))}
                    placeholder="Merchant or payee"
                    required
                  />
                </label>
                <label>
                  Date
                  <input
                    type="date"
                    value={manualForm.date}
                    onChange={(event) => setManualForm((current) => ({ ...current, date: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Account
                  <select
                    value={manualForm.accountId}
                    onChange={(event) => setManualForm((current) => ({ ...current, accountId: event.target.value }))}
                  >
                    <option value="">Choose account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Category
                  <select
                    value={manualForm.categoryId}
                    onChange={(event) => setManualForm((current) => ({ ...current, categoryId: event.target.value }))}
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
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
                <label>
                  Type
                  <select
                    value={manualForm.type}
                    onChange={(event) =>
                      setManualForm((current) => ({
                        ...current,
                        type: event.target.value as ManualTransactionForm["type"],
                      }))
                    }
                  >
                    <option value="debit">Debit</option>
                    <option value="credit">Credit</option>
                  </select>
                </label>
                <label className="span-2">
                  Notes
                  <textarea
                    value={manualForm.description}
                    onChange={(event) => setManualForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Optional note or review context"
                  />
                </label>
              </div>

              <div className="form-actions">
                <button className="button button-secondary" type="button" onClick={() => setManualOpen(false)}>
                  Cancel
                </button>
                <button className="button button-primary" type="submit" disabled={isSaving}>
                  {isSaving ? "Saving..." : "Add transaction"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {selectedTransaction ? (
        <div className="modal-backdrop" role="presentation" onClick={closeTransactionDetail}>
          <section
            className="modal-card modal-card--wide transaction-drawer glass"
            role="dialog"
            aria-modal="true"
            aria-labelledby="transaction-notes-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Transaction details</p>
                <h4 id="transaction-notes-title">{detailDraft?.merchantClean || detailDraft?.merchantRaw || selectedTransaction.merchantRaw}</h4>
                <p className="modal-copy">Edit the transaction, add notes, and resolve warnings in one place.</p>
              </div>
              <button className="icon-button" type="button" onClick={closeTransactionDetail} aria-label="Close notes dialog">
                ×
              </button>
            </div>

            <div className="form-grid transaction-drawer-grid">
              <label>
                Date
                <input
                  type="date"
                  value={detailDraft?.date ?? todayIso}
                  onChange={(event) => setDetailDraft((current) => (current ? { ...current, date: event.target.value } : current))}
                />
              </label>
              <label>
                Account
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
              </label>
              <label>
                Category
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
                Type
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
              </label>
              <label className="span-2">
                Notes
                <textarea
                  value={detailDraft?.description ?? ""}
                  onChange={(event) => setDetailDraft((current) => (current ? { ...current, description: event.target.value } : current))}
                  placeholder="Optional context, receipt notes, or review comments"
                />
              </label>
            </div>

            {warningReasonFor(selectedTransaction) ? (
              <div className="detail-warning-box">
                <div className="detail-warning-box__header">
                  <span className="detail-warning-box__icon" aria-hidden="true">
                    <span className="warning-mark warning-mark--small" aria-hidden="true" />
                  </span>
                  <strong>Review warning</strong>
                </div>
                <p>
                  <strong>Warning:</strong> {warningReasonFor(selectedTransaction)}
                </p>
                <div className="detail-warning-actions">
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
                        "Warning accepted.",
                        "accepted"
                      );
                    }}
                  >
                    Accept
                  </button>
                  <button
                    className="button button-secondary button-small detail-warning-delete"
                    type="button"
                    onClick={() => {
                      resolveTransactionWarning(
                        selectedTransaction,
                        {
                          isExcluded: true,
                          isTransfer: selectedTransaction.isTransfer,
                          reviewStatus: "rejected",
                        },
                        "Transaction ignored.",
                        "rejected"
                      );
                    }}
                  >
                    Ignore
                  </button>
                </div>
              </div>
            ) : null}

            <div className="form-actions detail-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  resolveTransactionWarning(
                    selectedTransaction,
                    {
                      isExcluded: true,
                      isTransfer: selectedTransaction.isTransfer,
                      reviewStatus: "rejected",
                    },
                    "Transaction ignored.",
                    "rejected"
                  );
                }}
              >
                Ignore
              </button>
              {transactionDeleteConfirmOpen ? (
                <div className="detail-warning-box transaction-delete-confirm">
                  <p>
                    <strong>Delete transaction:</strong> This cannot be undone.
                  </p>
                  <div className="detail-warning-actions">
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
              ) : (
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setTransactionDeleteConfirmOpen(true)}
                  disabled={isSaving}
                >
                  Delete transaction
                </button>
              )}
              <button className="button button-primary" type="button" disabled={isSaving} onClick={saveDetailDraft}>
                {isSaving ? "Saving..." : "Save changes"}
              </button>
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
        defaultAccountId={accounts[0]?.id ?? null}
        onClose={() => setImportOpen(false)}
        onImported={async (summary) => {
          if (summary.optimistic) {
            const optimisticAccount = buildOptimisticImportedAccount(summary);
            if (optimisticAccount) {
              setAccounts((current) => {
                const existingIndex = current.findIndex((account) => account.id === optimisticAccount.id);
                if (existingIndex >= 0) {
                  return current.map((account) => (account.id === optimisticAccount.id ? { ...account, ...optimisticAccount } : account));
                }
                return [optimisticAccount, ...current];
              });
            }
            return;
          }

          if (summary.optimisticAccountId) {
            setAccounts((current) => current.filter((account) => account.id !== summary.optimisticAccountId));
          }

          if (!selectedWorkspaceId) {
            return;
          }

          const optimisticAccount = buildOptimisticImportedAccount(summary);
          if (optimisticAccount) {
            setAccounts((current) => {
              const existingIndex = current.findIndex((account) => account.id === optimisticAccount.id);
              if (existingIndex >= 0) {
                return current.map((account) => (account.id === optimisticAccount.id ? { ...account, ...optimisticAccount } : account));
              }
              return [optimisticAccount, ...current];
            });
          }
          window.setTimeout(() => {
            void loadWorkspaceData(selectedWorkspaceId, { skipMetadata: true });
          }, 0);
          setMessage("Import complete. Accounts and Transactions are updated.");
        }}
      />
    </CloverShell>
  );
}
