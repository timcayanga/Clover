"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { CloverLoadingScreen } from "@/components/clover-loading-screen";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { FinancialAccountCard } from "@/components/financial-account-card";
import { getAccountCardName } from "@/lib/account-display";
import { getAccountBrand } from "@/lib/account-brand";
import { getCategoryIconSrc, getCategoryIconTone } from "@/lib/category-icons";
import { getInvestmentAssetBrand } from "@/lib/investment-assets";
import { deriveReconciledBalance } from "@/lib/account-balance";
import { formatCurrencyAmount } from "@/lib/currency-format";
import { extractAccountIdFromPathSegment, getAccountPath } from "@/lib/account-path";
import { buildTransactionQuerySearchParams } from "@/lib/transaction-query";
import { guessCategoryName } from "@/lib/import-parser";
import { getEffectiveTransactionCategoryName, getEffectiveTransactionMerchantName } from "@/lib/transaction-display";
import { readSelectedWorkspaceId } from "@/lib/workspace-selection";
import {
  applyOptimisticWorkspaceTransactionDeletion,
  applyOptimisticWorkspaceAccountDeletion,
  clearDeletedWorkspaceAccount,
  clearDeletingWorkspaceAccount,
  getCachedAccountsWorkspace,
  getCachedTransactionsWorkspace,
  getDeletedWorkspaceAccountIds,
  getDeletingWorkspaceAccountIds,
  findCachedImportedAccount,
  findCachedTransactionsForAccount,
  deriveCachedCategoriesFromTransactions,
  markDeletedWorkspaceAccount,
  normalizeImportedAccountKey,
  mergeImportedWorkspaceTransactions,
} from "@/lib/workspace-cache";
import {
  getInvestmentFieldConfigs,
  canTrackInvestmentDividends,
  canTrackInvestmentPurchaseHistory,
  getInvestmentSubtypeLabel,
  type InvestmentSubtype,
  isFixedIncomeInvestmentSubtype,
  isMarketInvestmentSubtype,
} from "@/lib/investments";
import {
  isLiabilityAccountType,
} from "@/lib/account-types";

type Account = {
  id: string;
  workspaceId: string;
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
  type: string;
  currency: string;
  source: string;
  balance: string | null;
  favorite?: boolean;
  updatedAt: string;
  createdAt: string;
};

type Transaction = {
  id: string;
  accountId: string;
  categoryId: string | null;
  amount: string;
  currency?: string | null;
  type: "income" | "expense" | "transfer";
  date: string;
  merchantRaw: string;
  merchantClean: string | null;
  categoryName: string | null;
  description: string | null;
  isExcluded: boolean;
  source?: string | null;
  importFileId?: string | null;
  rawPayload?: unknown;
};

type Category = {
  id: string;
  name: string;
  type: "income" | "expense" | "transfer";
};

type AccountTransactionSortField = "name" | "date" | "category" | "amount";
type AccountTransactionSortDirection = "asc" | "desc";

type EditableTransactionField = "name" | "date" | "categoryId" | "amount";

type InlineEditableCellProps = {
  value: string;
  displayValue: string;
  ariaLabel: string;
  kind: "text" | "date" | "number" | "select";
  onCommit: (value: string) => Promise<void> | void;
  options?: Array<{ value: string; label: string }>;
  className?: string;
};

type TransactionDetailDraft = {
  merchantClean: string;
  date: string;
  categoryId: string;
  amount: string;
  currency: string;
  type: "debit" | "credit" | "transfer";
  description: string;
  isExcluded: boolean;
};

type ImportFile = {
  id: string;
  fileName: string;
  status: string;
  uploadedAt: string;
  accountId?: string | null;
};

const normalizeCategoryName = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

type StatementCheckpoint = {
  id: string;
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

type InvestmentEditDraft = {
  name: string;
  institution: string;
  investmentSubtype: InvestmentSubtype;
  investmentSymbol: string;
  investmentQuantity: string;
  investmentCostBasis: string;
  investmentPrincipal: string;
  investmentStartDate: string;
  investmentMaturityDate: string;
  investmentInterestRate: string;
  investmentMaturityValue: string;
  balance: string;
};

type InvestmentPurchase = {
  id: string;
  accountId: string;
  purchasedAt: string;
  quantity: string | null;
  totalCost: string | null;
  currency: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type InvestmentDividend = {
  id: string;
  accountId: string;
  paidAt: string;
  amount: string | null;
  currency: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

const TRANSACTION_PAGE_SIZE = 25;

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const parseAmount = (value: string | null | undefined) => Number(value ?? 0);

const normalizeAccountBalance = (type: Account["type"] | null | undefined, value: number) =>
  isLiabilityAccountType(type) ? -Math.abs(value) : Math.abs(value);

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

function ActionIcon({ name }: { name: "warning" | "chevron-right" | "star" | "star-filled" }) {
  if (name === "warning") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3.75 20 19H4l8-15.25Z" />
        <path d="M12 9v4.75" />
        <path d="M12 16.5h.01" />
      </svg>
    );
  }

  if (name === "chevron-right") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
        <path d="m8 5 5 5-5 5" />
      </svg>
    );
  }

  if (name === "star") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12 3.2 2.9 5.87 6.48.94-4.69 4.57 1.11 6.45L12 17.95l-5.8 3.08 1.11-6.45-4.69-4.57 6.48-.94L12 3.2Z" />
      </svg>
    );
  }

  if (name === "star-filled") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="m12 3.2 2.9 5.87 6.48.94-4.69 4.57 1.11 6.45L12 17.95l-5.8 3.08 1.11-6.45-4.69-4.57 6.48-.94L12 3.2Z" />
      </svg>
    );
  }

  return null;
}

const parseNullableNumber = (value: string | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const serializeInvestmentEditDraft = (account: Account): InvestmentEditDraft => ({
  name: account.name,
  institution: account.institution ?? "",
  investmentSubtype: account.investmentSubtype ?? "other",
  investmentSymbol: account.investmentSymbol ?? "",
  investmentQuantity: account.investmentQuantity ?? "",
  investmentCostBasis: account.investmentCostBasis ?? "",
  investmentPrincipal: account.investmentPrincipal ?? "",
  investmentStartDate: account.investmentStartDate ? account.investmentStartDate.slice(0, 10) : "",
  investmentMaturityDate: account.investmentMaturityDate ? account.investmentMaturityDate.slice(0, 10) : "",
  investmentInterestRate: account.investmentInterestRate ?? "",
  investmentMaturityValue: account.investmentMaturityValue ?? "",
  balance: account.balance ?? "",
});

const buildInvestmentDraftSyncKey = (account: Account) =>
  [
    account.id,
    account.name,
    account.institution ?? "",
    account.investmentSubtype ?? "",
    account.investmentSymbol ?? "",
    account.investmentQuantity ?? "",
    account.investmentCostBasis ?? "",
    account.investmentPrincipal ?? "",
    account.investmentStartDate ?? "",
    account.investmentMaturityDate ?? "",
    account.investmentInterestRate ?? "",
    account.investmentMaturityValue ?? "",
    account.balance ?? "",
    account.currency,
    account.type,
    account.source,
  ].join("|");

const formatAccountAmount = (value: number, currency?: string | null) => formatCurrencyAmount(value, currency ?? "PHP");

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return `rgba(14, 165, 183, ${alpha})`;
  }

  const parsed = Number.parseInt(normalized, 16);
  const red = (parsed >> 16) & 255;
  const green = (parsed >> 8) & 255;
  const blue = parsed & 255;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const formatNullableDate = (value: string | null | undefined) => (value ? formatDate(value) : "Not set");

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
      pendingLabel: "portfolio snapshot",
    };
  }

  if (rawDocumentType === "account_detail") {
    return {
      label: "Latest account snapshot",
      pendingLabel: "account snapshot",
    };
  }

  if (rawDocumentType === "receipt" || rawDocumentType === "notes") {
    return {
      label: "Latest image checkpoint",
      pendingLabel: "image checkpoint",
    };
  }

  return {
    label: "Latest statement checkpoint",
    pendingLabel: "statement",
  };
};

const buildImportSummaries = (transactions: Transaction[], importFiles: ImportFile[]) => {
  const importFileNames = new Map(importFiles.map((importFile) => [importFile.id, importFile.fileName] as const));
  const groups = new Map<string, { key: string; count: number; latestDate: string; label: string }>();

  for (const transaction of transactions) {
    if (transaction.merchantRaw === "Beginning balance") {
      continue;
    }

    if (transaction.source !== "upload" && !transaction.importFileId) {
      continue;
    }

    const key = transaction.importFileId ?? `${transaction.accountId}:${transaction.date.slice(0, 10)}`;
    const current = groups.get(key);
    groups.set(
      key,
      current
        ? {
            ...current,
            count: current.count + 1,
            latestDate: new Date(transaction.date) > new Date(current.latestDate) ? transaction.date : current.latestDate,
          }
        : {
            key,
            count: 1,
            latestDate: transaction.date,
            label:
              (transaction.importFileId ? importFileNames.get(transaction.importFileId) : null) ??
              "Uploaded statement",
          }
    );
  }

  return Array.from(groups.values()).sort((left, right) => new Date(right.latestDate).getTime() - new Date(left.latestDate).getTime());
};

const getTransactionSortLabel = (transaction: Transaction) =>
  getEffectiveTransactionMerchantName({
    merchantClean: transaction.merchantClean,
    merchantRaw: transaction.merchantRaw,
    rawPayload: transaction.rawPayload as never,
  }) ?? "Transaction";

const createDetailDraft = (transaction: Transaction): TransactionDetailDraft => ({
  merchantClean:
    getEffectiveTransactionMerchantName({
      merchantClean: transaction.merchantClean,
      merchantRaw: transaction.merchantRaw,
      rawPayload: transaction.rawPayload as never,
    }) ?? transaction.merchantRaw,
  date: transaction.date.slice(0, 10),
  categoryId: transaction.categoryId ?? "",
  amount: transaction.amount,
  currency: transaction.currency ?? "PHP",
  type: transaction.type === "income" ? "credit" : transaction.type === "transfer" ? "transfer" : "debit",
  description: transaction.description ?? "",
  isExcluded: transaction.isExcluded,
});

const detailDraftTypeToTransactionType = (type: TransactionDetailDraft["type"]) =>
  type === "credit" ? "income" : type === "transfer" ? "transfer" : "expense";

const getDisplayTransactionCategoryName = (
  transaction: Transaction,
  categories: Category[],
  institution?: string | null
) => {
  const categoryById =
    transaction.categoryId && transaction.categoryId.trim()
      ? categories.find((category) => category.id === transaction.categoryId)?.name ?? null
      : null;
  return (
    getEffectiveTransactionCategoryName({
      categoryName: categoryById ?? transaction.categoryName,
      rawPayload: transaction.rawPayload as never,
      merchantRaw: transaction.merchantRaw,
      merchantClean: transaction.merchantClean,
      description: transaction.description ?? null,
      institution,
      type: transaction.type,
    }) ??
    guessCategoryName(
      getEffectiveTransactionMerchantName({
        merchantClean: transaction.merchantClean,
        merchantRaw: transaction.merchantRaw,
        institution,
      }) || transaction.description || transaction.merchantRaw,
      transaction.type
    ) ??
    "Other"
  );
};

const getTransactionSortFieldValue = (transaction: Transaction, field: AccountTransactionSortField) => {
  switch (field) {
    case "name":
      return getTransactionSortLabel(transaction);
    case "date":
      return new Date(transaction.date).getTime();
    case "category":
      return transaction.categoryName?.trim() || "Other";
    case "amount":
      return Number(transaction.amount);
    default:
      return "";
  }
};

export default function AccountDetailPage() {
  useEffect(() => {
    document.title = "Clover | Account";
    document.body.classList.add("account-detail-page");

    return () => {
      document.body.classList.remove("account-detail-page");
    };
  }, []);

  return <AccountDetailPageContent />;
}

function AccountDetailPageContent() {
  const router = useRouter();
  const params = useParams<{ accountId: string }>();
  const accountPathSegment = params?.accountId ?? "";
  const accountId = extractAccountIdFromPathSegment(accountPathSegment);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionTotalCount, setTransactionTotalCount] = useState(0);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsLoadingMore, setTransactionsLoadingMore] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [importFiles, setImportFiles] = useState<ImportFile[]>([]);
  const [checkpoints, setCheckpoints] = useState<StatementCheckpoint[]>([]);
  const [message, setMessage] = useState("Loading account history...");
  const [deleteAction, setDeleteAction] = useState<"activity" | "account" | null>(null);
  const [deleteBusy, setDeleteBusy] = useState<false | "activity" | "account">(false);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const [transactionSortField, setTransactionSortField] = useState<AccountTransactionSortField>("date");
  const [transactionSortDirection, setTransactionSortDirection] = useState<AccountTransactionSortDirection>("desc");
  const [accountEditDraft, setAccountEditDraft] = useState({ name: "", accountNumber: "" });
  const [accountIdentityEditorOpen, setAccountIdentityEditorOpen] = useState(false);
  const [accountEditSaveState, setAccountEditSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const stableBalanceRef = useRef<string | null>(null);
  const accountInvestmentDraftSyncKeyRef = useRef<string | null>(null);
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [detailDraft, setDetailDraft] = useState<TransactionDetailDraft | null>(null);
  const [isSavingTransactionDetail, setIsSavingTransactionDetail] = useState(false);
  const [investmentEditDraft, setInvestmentEditDraft] = useState<InvestmentEditDraft | null>(null);
  const [investmentAutosaveState, setInvestmentAutosaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [investmentPurchases, setInvestmentPurchases] = useState<InvestmentPurchase[]>([]);
  const [investmentDividends, setInvestmentDividends] = useState<InvestmentDividend[]>([]);
  const [purchaseDraft, setPurchaseDraft] = useState({
    purchasedAt: "",
    quantity: "",
    totalCost: "",
    currency: "PHP",
    note: "",
  });
  const [dividendDraft, setDividendDraft] = useState({
    paidAt: "",
    amount: "",
    currency: "PHP",
    note: "",
  });
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [dividendBusy, setDividendBusy] = useState(false);
  const [purchaseDeleteBusy, setPurchaseDeleteBusy] = useState<string | null>(null);
  const [dividendDeleteBusy, setDividendDeleteBusy] = useState<string | null>(null);
  const [hasInitialDataLoaded, setHasInitialDataLoaded] = useState(false);
  const loadedAccountIdRef = useRef<string | null>(null);
  const selectAllTransactionsRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 960px)");
    const syncViewport = () => setIsMobileViewport(mediaQuery.matches);

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);

    return () => {
      mediaQuery.removeEventListener("change", syncViewport);
    };
  }, []);

  useEffect(() => {
    document.title = account?.type === "investment" ? "Clover | Asset Details" : "Clover | Account";
  }, [account?.type]);

  useEffect(() => {
    if (!account) {
      setAccountEditDraft({ name: "", accountNumber: "" });
      setAccountIdentityEditorOpen(false);
      setAccountEditSaveState("idle");
      loadedAccountIdRef.current = null;
      return;
    }

    if (loadedAccountIdRef.current !== account.id) {
      loadedAccountIdRef.current = account.id;
      setAccountEditDraft({
        name: account.name ?? "",
        accountNumber: account.accountNumber ?? "",
      });
      setAccountIdentityEditorOpen(false);
    }
  }, [account?.accountNumber, account?.id, account?.name]);

  useEffect(() => {
    let cancelled = false;
    const fallbackRenderTimer = window.setTimeout(() => {
      if (!cancelled) {
        setHasInitialDataLoaded(true);
      }
    }, 5000);

    const load = async () => {
      const selectedWorkspaceId = readSelectedWorkspaceId();
      const activeWorkspaceId = selectedWorkspaceId ?? "";
      const cachedAccountsWorkspace = getCachedAccountsWorkspace(activeWorkspaceId);
      const cachedTransactionsWorkspace = getCachedTransactionsWorkspace(activeWorkspaceId);
      const cachedTransactionsForAccount = findCachedTransactionsForAccount(accountId, {
        optimisticAccountId: cachedAccountLookup?.account?.optimisticAccountId ?? null,
        name: cachedAccountLookup?.account?.name ?? null,
        institution: cachedAccountLookup?.account?.institution ?? null,
        accountNumber: cachedAccountLookup?.account?.accountNumber ?? null,
        type: cachedAccountLookup?.account?.type ?? null,
      });
      const cachedTransactionsForAccountRows = Array.isArray(cachedTransactionsForAccount?.transactions)
        ? (cachedTransactionsForAccount.transactions as Transaction[])
        : [];
      const derivedCachedCategories = deriveCachedCategoriesFromTransactions(
        cachedTransactionsForAccountRows.length > 0
          ? cachedTransactionsForAccountRows
          : (cachedTransactionsWorkspace?.transactions as Transaction[] | undefined) ?? []
      ) as Category[];
      const cachedCategories = Array.isArray(cachedTransactionsWorkspace?.categories) && cachedTransactionsWorkspace.categories.length > 0
        ? (cachedTransactionsWorkspace.categories as Category[])
        : derivedCachedCategories;
      const cachedAccountLookup = findCachedImportedAccount(accountId);
      const cachedWorkspaceId = cachedAccountLookup?.workspaceId ?? activeWorkspaceId;
      const cachedTransactionWorkspaceAccount = Array.isArray(cachedTransactionsWorkspace?.accounts)
        ? ((cachedTransactionsWorkspace.accounts as Account[]).find((entry) => {
            const entryId = typeof entry.id === "string" ? entry.id : "";
            const optimisticId = typeof (entry as { optimisticAccountId?: string | null }).optimisticAccountId === "string"
              ? ((entry as { optimisticAccountId?: string | null }).optimisticAccountId ?? "")
              : "";

            if (entryId === accountId || optimisticId === accountId) {
              return true;
            }

            return (
              normalizeImportedAccountKey(entry.name, entry.institution, entry.accountNumber, entry.type) ===
              normalizeImportedAccountKey(
                cachedAccountLookup?.account?.name ?? null,
                cachedAccountLookup?.account?.institution ?? null,
                cachedAccountLookup?.account?.accountNumber ?? null,
                cachedAccountLookup?.account?.type ?? null
              )
            );
          }) ?? null)
        : null;
      let cachedTransactions: Transaction[] = [];
      let cachedImportFiles: ImportFile[] = [];
      let cachedCheckpoints: StatementCheckpoint[] = [];
      const cachedAccountEntry = (cachedAccountsWorkspace?.accounts.find((entry) => {
        const entryId = typeof entry.id === "string" ? entry.id : "";
        const optimisticId = typeof entry.optimisticAccountId === "string" ? entry.optimisticAccountId : "";
        return entryId === accountId || optimisticId === accountId;
      }) ?? cachedTransactionWorkspaceAccount ?? cachedAccountLookup?.account) as Account | undefined;
      let cachedAccount = cachedAccountEntry
        ? ({
            ...cachedAccountEntry,
            workspaceId: cachedWorkspaceId,
          } as Account)
        : null;
      let accountTransactionsLookup: ReturnType<typeof findCachedTransactionsForAccount> | null = null;
      const resolvePersistedImportedAccount = async (baseAccount: Account) => {
        const identityKey = normalizeImportedAccountKey(
          baseAccount.name,
          baseAccount.institution,
          baseAccount.accountNumber,
          baseAccount.type
        );

        const findReplacementInSnapshot = (snapshot?: { accounts?: unknown[] } | null) => {
          const accounts = Array.isArray(snapshot?.accounts) ? (snapshot.accounts as Account[]) : [];
          return (
            accounts.find((entry) => {
              if (!entry?.id || entry.id === accountId || entry.id.startsWith("optimistic-")) {
                return false;
              }

              return (
                normalizeImportedAccountKey(entry.name, entry.institution, entry.accountNumber, entry.type) === identityKey
              );
            }) ?? null
          );
        };

        const cachedReplacement =
          findReplacementInSnapshot(cachedAccountsWorkspace) ??
          (cachedWorkspaceId && cachedWorkspaceId !== activeWorkspaceId
            ? findReplacementInSnapshot(getCachedAccountsWorkspace(cachedWorkspaceId))
            : null);

        if (cachedReplacement) {
          return cachedReplacement;
        }

        if (!baseAccount.workspaceId) {
          return null;
        }

        for (let attempt = 0; attempt < 5; attempt += 1) {
          try {
            const response = await fetch(`/api/accounts?workspaceId=${encodeURIComponent(baseAccount.workspaceId)}`);
            if (response.ok) {
              const payload = (await response.json()) as { accounts?: Account[] } | null;
              const fetchedAccounts = Array.isArray(payload?.accounts) ? payload.accounts : [];
              const replacement =
                fetchedAccounts.find((entry) => {
                  if (!entry?.id || entry.id === accountId || entry.id.startsWith("optimistic-")) {
                    return false;
                  }

                  return (
                    normalizeImportedAccountKey(entry.name, entry.institution, entry.accountNumber, entry.type) === identityKey
                  );
                }) ?? null;

              if (replacement) {
                return replacement;
              }
            }
          } catch {
            // Keep polling briefly; upload-backed accounts can settle a moment later.
          }

          await new Promise((resolve) => setTimeout(resolve, 750));
        }

        return null;
      };
      if (
        !cachedAccount &&
        (getDeletingWorkspaceAccountIds(cachedWorkspaceId).includes(accountId) ||
          getDeletedWorkspaceAccountIds(cachedWorkspaceId).includes(accountId))
      ) {
        router.replace("/accounts");
        return;
      }

      if (cachedAccount) {
        if (!cancelled) {
          accountTransactionsLookup = findCachedTransactionsForAccount(cachedAccount.id, cachedAccount);
          cachedTransactions = (accountTransactionsLookup?.transactions as Transaction[] | undefined) ?? [];
          if (cachedTransactions.length === 0 && Array.isArray(cachedTransactionsWorkspace?.transactions)) {
            cachedTransactions = mergeImportedWorkspaceTransactions(
              [],
              (cachedTransactionsWorkspace.transactions as Transaction[]).filter((transaction) => transaction.accountId === cachedAccount.id)
            );
          }
          cachedImportFiles = Array.isArray(cachedTransactionsWorkspace?.imports)
            ? (cachedTransactionsWorkspace.imports as ImportFile[]).filter((importFile) => {
                return !importFile.accountId || importFile.accountId === cachedAccount.id;
              })
            : [];
          cachedCheckpoints = Array.isArray(cachedAccountsWorkspace?.statementCheckpoints)
            ? (cachedAccountsWorkspace.statementCheckpoints as StatementCheckpoint[]).filter(
                (checkpoint) => checkpoint.accountId === cachedAccount.id
              )
            : [];
          setAccount(cachedAccount);
          setTransactions(cachedTransactions);
          setImportFiles(cachedImportFiles);
          setCategories(cachedCategories);
          setTransactionPage(1);
          setTransactionTotalCount(accountTransactionsLookup?.totalCount ?? cachedTransactions.length);
          setTransactionsError(null);
          setTransactionsLoading(false);
          setMessage("");
          setHasInitialDataLoaded(true);
          setCheckpoints(cachedCheckpoints);
        }
        const canonicalPath = getAccountPath(cachedAccount);
        if (!cancelled && canonicalPath !== `/accounts/${accountPathSegment}`) {
          router.replace(canonicalPath);
        }
      }

      if (cachedAccount && accountId.startsWith("optimistic-")) {
        const replacementAccount = await resolvePersistedImportedAccount(cachedAccount);
        if (replacementAccount) {
          cachedAccount = replacementAccount;
          const replacementTransactionsLookup = findCachedTransactionsForAccount(replacementAccount.id, replacementAccount);
          const replacementTransactions = (replacementTransactionsLookup?.transactions as Transaction[] | undefined) ?? [];
          const replacementPath = getAccountPath(replacementAccount);

          if (!cancelled) {
            setAccount(replacementAccount);
            if (replacementTransactions.length > 0) {
              setTransactions(mergeImportedWorkspaceTransactions([], replacementTransactions));
              setTransactionTotalCount(
                replacementTransactionsLookup?.totalCount ?? replacementTransactions.length
              );
              setTransactionsError(null);
              setTransactionsLoading(false);
              setHasInitialDataLoaded(true);
            }
            if (replacementPath !== `/accounts/${accountPathSegment}`) {
              router.replace(replacementPath);
            }
          }
        }
      }

      try {
        const resolvedAccountId = cachedAccount?.id && !cachedAccount.id.startsWith("optimistic-") ? cachedAccount.id : accountId;
        const accountPromise = fetch(`/api/accounts/${resolvedAccountId}`);
        const checkpointsPromise = fetch(`/api/accounts/${resolvedAccountId}/statement-checkpoints`);

        const accountResponse = await accountPromise;
        if (!accountResponse.ok) {
          if (cachedAccount) {
            // Keep the cached imported account usable even if the live lookup is still
            // settling or temporarily unavailable. This avoids trapping the page on the
            // loading screen when the optimistic import has already produced usable rows.
            if (!cancelled) {
              setAccount(cachedAccount);
              setTransactions(cachedTransactions);
              setImportFiles(cachedImportFiles);
              setCategories(cachedCategories);
              setTransactionPage(1);
              setTransactionTotalCount(accountTransactionsLookup?.totalCount ?? cachedTransactions.length);
              setTransactionsError(null);
              setTransactionsLoading(false);
              setMessage("");
              setHasInitialDataLoaded(true);
              setCheckpoints(cachedCheckpoints);
            }

            const replacementAccount = await resolvePersistedImportedAccount(cachedAccount);
            if (replacementAccount && !cancelled) {
              router.replace(getAccountPath(replacementAccount));
            }
            return;
          }
          throw new Error("Unable to load this account.");
        }

        const accountPayload = await accountResponse.json();
        const nextAccount = accountPayload.account as Account | undefined;
        if (!nextAccount || cancelled) {
          if (getDeletedWorkspaceAccountIds(selectedWorkspaceId ?? "").includes(accountId)) {
            router.replace("/accounts");
          }
          return;
        }

        const mergedAccount =
          cachedAccount && nextAccount.id === cachedAccount.id
            ? ({
                ...nextAccount,
                source: cachedAccount.source ?? nextAccount.source,
                balance:
                  nextAccount.balance && Number(nextAccount.balance) !== 0
                    ? nextAccount.balance
                    : cachedAccount.balance ?? nextAccount.balance,
              } as Account)
            : nextAccount;
        setAccount(mergedAccount);
        if (mergedAccount.type === "investment") {
          void Promise.all([
            fetch(`/api/accounts/${mergedAccount.id}/investment-purchases`),
            fetch(`/api/accounts/${mergedAccount.id}/investment-dividends`),
          ])
            .then(async ([purchaseResponse, dividendResponse]) => {
              if (!cancelled) {
                if (purchaseResponse.ok) {
                  const purchasePayload = (await purchaseResponse.json()) as { purchases?: InvestmentPurchase[] } | null;
                  setInvestmentPurchases(Array.isArray(purchasePayload?.purchases) ? purchasePayload.purchases : []);
                } else {
                  setInvestmentPurchases([]);
                }

                if (dividendResponse.ok) {
                  const dividendPayload = (await dividendResponse.json()) as { dividends?: InvestmentDividend[] } | null;
                  setInvestmentDividends(Array.isArray(dividendPayload?.dividends) ? dividendPayload.dividends : []);
                } else {
                  setInvestmentDividends([]);
                }

                setPurchaseDraft((current) => ({
                  ...current,
                  currency: mergedAccount.currency ?? "PHP",
                }));
                setDividendDraft((current) => ({
                  ...current,
                  currency: mergedAccount.currency ?? "PHP",
                }));
              }
            })
            .catch(() => {
              if (!cancelled) {
                setInvestmentPurchases([]);
                setInvestmentDividends([]);
              }
            });
        } else {
          setInvestmentPurchases([]);
          setInvestmentDividends([]);
        }

        if (!cancelled) {
          setHasInitialDataLoaded(true);
        }

        const canonicalPath = getAccountPath(mergedAccount);
        if (!cancelled && canonicalPath !== `/accounts/${accountPathSegment}`) {
          router.replace(canonicalPath);
        }

        const transactionsSearchParams = buildTransactionQuerySearchParams(
          mergedAccount.workspaceId,
          {
            accountIds: [mergedAccount.id],
          },
          {
            page: 1,
            pageSize: TRANSACTION_PAGE_SIZE,
          }
        );
        transactionsSearchParams.set("summaryMode", "light");
        const transactionsPromise = fetch(`/api/transactions?${transactionsSearchParams.toString()}`);

        void Promise.all([
          fetch(`/api/imports?workspaceId=${nextAccount.workspaceId}`),
          fetch(`/api/categories?workspaceId=${encodeURIComponent(nextAccount.workspaceId)}`),
        ])
          .then(async ([importsResponse, categoriesResponse]) => {
            if (cancelled) {
              return;
            }

            if (importsResponse.ok) {
              const importsPayload = (await importsResponse.json()) as { importFiles?: ImportFile[] } | null;
              setImportFiles(
                Array.isArray(importsPayload?.importFiles)
                  ? importsPayload.importFiles.filter((importFile) => !importFile.accountId || importFile.accountId === nextAccount.id)
                  : []
              );
            } else {
              setImportFiles([]);
            }

            if (categoriesResponse.ok) {
              const categoriesPayload = (await categoriesResponse.json()) as { categories?: Category[] } | null;
              const nextCategories =
                Array.isArray(categoriesPayload?.categories) && categoriesPayload.categories.length > 0
                  ? categoriesPayload.categories
                  : cachedCategories;
              setCategories(nextCategories);
            } else {
              setCategories((current) => (current.length > 0 ? current : cachedCategories));
            }
          })
          .catch(() => {
            if (!cancelled) {
              setImportFiles([]);
              setCategories((current) => (current.length > 0 ? current : cachedCategories));
            }
          });

        void transactionsPromise
          .then(async (response) => {
            if (!response.ok || cancelled) {
              if (!cancelled && !response.ok) {
                if (cachedTransactions.length > 0) {
                  setTransactions(cachedTransactions);
                  setTransactionTotalCount(Math.max(cachedTransactions.length, accountTransactionsLookup?.totalCount ?? cachedTransactions.length));
                  setTransactionsError(null);
                  setMessage("");
                } else {
                  setTransactionsError("Unable to load account transactions.");
                }
                setTransactionsLoading(false);
                setHasInitialDataLoaded(true);
              }
              return;
            }

            const transactionsPayload = (await response.json()) as {
              transactions?: Transaction[];
              page?: number;
              totalCount?: number;
            } | null;

            if (!cancelled) {
              const nextTransactions = Array.isArray(transactionsPayload?.transactions)
                ? transactionsPayload.transactions
                : [];
              const mergedTransactions =
                nextTransactions.length > 0
                  ? mergeImportedWorkspaceTransactions(cachedTransactions.length > 0 ? cachedTransactions : [], nextTransactions)
                  : cachedTransactions.length > 0
                    ? cachedTransactions
                    : [];
              setTransactions(mergedTransactions);
              setTransactionPage(typeof transactionsPayload?.page === "number" ? transactionsPayload.page : 1);
              setTransactionTotalCount(
                typeof transactionsPayload?.totalCount === "number" && transactionsPayload.totalCount > 0
                  ? Math.max(transactionsPayload.totalCount, mergedTransactions.length)
                  : Math.max(mergedTransactions.length, cachedTransactions.length)
              );
              setTransactionsError(null);
              setTransactionsLoading(false);
              setMessage("");
              setHasInitialDataLoaded(true);
            }
          })
          .catch(() => {
            if (!cancelled) {
              if (cachedTransactions.length > 0) {
                setTransactions((current) => (current.length > 0 ? current : cachedTransactions));
                setTransactionTotalCount(Math.max(cachedTransactions.length, accountTransactionsLookup?.totalCount ?? cachedTransactions.length));
                setTransactionsError(null);
                setMessage("");
              } else {
                setTransactionsError("Unable to load account transactions.");
              }
              setTransactionsLoading(false);
              setHasInitialDataLoaded(true);
            }
          });

        void checkpointsPromise
          .then(async (response) => {
            if (!response.ok || cancelled) {
              return;
            }

            const checkpointsPayload = (await response.json()) as { checkpoints?: StatementCheckpoint[] } | null;
            if (!cancelled) {
              setCheckpoints(Array.isArray(checkpointsPayload?.checkpoints) ? checkpointsPayload!.checkpoints : []);
            }
          })
          .catch(() => null);
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Unable to load this account.");
          setTransactionsLoading(false);
          setHasInitialDataLoaded(true);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackRenderTimer);
    };
  }, [accountId]);

  const accountCheckpointKey = useMemo(
    () => normalizeImportedAccountKey(account?.name, account?.institution, account?.accountNumber, account?.type),
    [account?.accountNumber, account?.institution, account?.name, account?.type]
  );

  const latestCheckpoint = useMemo(() => {
    if (checkpoints.length === 0) {
      return null;
    }

    const matchingCheckpoints = checkpoints.filter((checkpoint) => {
      if (checkpoint.accountId === accountId) {
        return true;
      }

      const checkpointKey = normalizeImportedAccountKey(
        typeof checkpoint.sourceMetadata?.accountName === "string" ? checkpoint.sourceMetadata.accountName : null,
        typeof checkpoint.sourceMetadata?.institution === "string" ? checkpoint.sourceMetadata.institution : null,
        typeof checkpoint.sourceMetadata?.accountNumber === "string" ? checkpoint.sourceMetadata.accountNumber : null,
        typeof (checkpoint.sourceMetadata as Record<string, unknown> | null | undefined)?.accountType === "string"
          ? ((checkpoint.sourceMetadata as Record<string, unknown>).accountType as string)
          : null
      );
      return checkpointKey === accountCheckpointKey;
    });

    return matchingCheckpoints.sort((left, right) => {
      const leftTime = Math.max(
        left.statementEndDate ? new Date(left.statementEndDate).getTime() : 0,
        new Date(left.createdAt).getTime()
      );
      const rightTime = Math.max(
        right.statementEndDate ? new Date(right.statementEndDate).getTime() : 0,
        new Date(right.createdAt).getTime()
      );
      return rightTime - leftTime;
    })[0] ?? null;
  }, [accountCheckpointKey, accountId, checkpoints]);

  const investmentSubtype = account?.investmentSubtype ?? null;
  const investmentSymbol = account?.investmentSymbol?.trim() || null;
  const investmentQuantity = useMemo(() => parseNullableNumber(account?.investmentQuantity), [account?.investmentQuantity]);
  const investmentCostBasis = useMemo(() => parseNullableNumber(account?.investmentCostBasis), [account?.investmentCostBasis]);
  const investmentPrincipal = useMemo(() => parseNullableNumber(account?.investmentPrincipal), [account?.investmentPrincipal]);
  const investmentInterestRate = useMemo(() => parseNullableNumber(account?.investmentInterestRate), [account?.investmentInterestRate]);
  const investmentMaturityValue = useMemo(() => parseNullableNumber(account?.investmentMaturityValue), [account?.investmentMaturityValue]);
  const investmentStartDate = account?.investmentStartDate ?? null;
  const investmentMaturityDate = account?.investmentMaturityDate ?? null;
  const investmentEditingFieldConfigs = useMemo(
    () => getInvestmentFieldConfigs(investmentEditDraft?.investmentSubtype ?? investmentSubtype),
    [investmentEditDraft?.investmentSubtype, investmentSubtype]
  );
  const investmentPurchaseValue = useMemo(
    () => {
      if (investmentPurchases.length > 0) {
        return investmentPurchases.reduce((sum, purchase) => sum + parseAmount(purchase.totalCost), 0);
      }

      return investmentCostBasis ?? (isFixedIncomeInvestmentSubtype(investmentSubtype) ? investmentPrincipal : null);
    },
    [investmentCostBasis, investmentPrincipal, investmentPurchases, investmentSubtype]
  );
  const investmentDividendTotal = useMemo(
    () => investmentDividends.reduce((sum, dividend) => sum + parseAmount(dividend.amount), 0),
    [investmentDividends]
  );
  const latestCheckpointFamily = latestCheckpoint ? getCheckpointDocumentFamily(latestCheckpoint) : null;
  const canShowInvestmentPurchases = account?.type === "investment" || canTrackInvestmentPurchaseHistory(investmentSubtype);
  const canShowInvestmentDividends = canTrackInvestmentDividends(investmentSubtype);

  useEffect(() => {
    if (account?.type !== "investment") {
      setInvestmentEditDraft(null);
      accountInvestmentDraftSyncKeyRef.current = null;
      return;
    }

    const nextSyncKey = buildInvestmentDraftSyncKey(account);
    if (accountInvestmentDraftSyncKeyRef.current === nextSyncKey) {
      return;
    }

    accountInvestmentDraftSyncKeyRef.current = nextSyncKey;
    setInvestmentEditDraft(serializeInvestmentEditDraft(account));
  }, [account]);

  useEffect(() => {
    if (account?.type === "investment") {
      setPurchaseDraft((current) => ({
        ...current,
        currency: account.currency ?? current.currency ?? "PHP",
      }));
      setDividendDraft((current) => ({
        ...current,
        currency: account.currency ?? current.currency ?? "PHP",
      }));
    }
  }, [account?.currency, account?.type]);

  const importSummaries = useMemo(
    () => buildImportSummaries(transactions, importFiles),
    [importFiles, transactions]
  );
  const cachedImportedAccount = useMemo(
    () => (account ? (findCachedImportedAccount(account.id)?.account as Account | null) ?? null : null),
    [account]
  );
  const cachedImportedBalance = typeof cachedImportedAccount?.balance === "string" ? cachedImportedAccount.balance.trim() : "";

  const accountBrand = useMemo(
    () => {
      if (account?.type === "investment") {
        return getInvestmentAssetBrand({
          symbol: account.investmentSymbol,
          name: account.name,
          subtype: account.investmentSubtype,
          currency: account.currency,
          institution: account.institution,
        });
      }

      return getAccountBrand({
        institution: account?.institution ?? null,
        name: account?.name ?? null,
        type: account?.type ?? null,
      });
    },
    [account?.currency, account?.institution, account?.investmentSubtype, account?.investmentSymbol, account?.name, account?.type]
  );

  const accountBrandStyles = useMemo(
    () =>
      ({
        "--account-accent": accountBrand.accent,
        "--account-accent-soft": hexToRgba(accountBrand.accent, 0.18),
        "--account-accent-faint": hexToRgba(accountBrand.accent, 0.08),
      }) as CSSProperties,
    [accountBrand.accent]
  );

  const currentBalance = useMemo(
    () => {
      const checkpoint = latestCheckpoint;
      const checkpointBalance =
        checkpoint?.endingBalance !== null && checkpoint?.endingBalance !== undefined
          ? String(checkpoint.endingBalance)
          : null;
      const currentAccountBalance = parseAmount(account?.balance ?? cachedImportedBalance ?? null);
      const currentAccountBalanceIsNonZero =
        currentAccountBalance !== null && Number.isFinite(currentAccountBalance) && currentAccountBalance !== 0;
      const shouldPreserveImportedBalance =
        account?.source === "upload" &&
        (!checkpoint ||
          checkpoint.status !== "reconciled" ||
          checkpointBalance === null);

      const reconciledValue = checkpointBalance && !(shouldPreserveImportedBalance && currentAccountBalanceIsNonZero)
        ? checkpointBalance
        : shouldPreserveImportedBalance
          ? account?.balance ?? cachedImportedBalance ?? null
          : deriveReconciledBalance({
              balance: account?.balance ?? cachedImportedBalance ?? null,
              transactions,
              checkpoints: checkpoint ? [checkpoint] : [],
            });

      return normalizeAccountBalance(account?.type ?? null, parseAmount(reconciledValue));
    },
    [account?.balance, account?.source, account?.type, cachedImportedBalance, latestCheckpoint, transactions]
  );
  const checkpointBalance = latestCheckpoint?.endingBalance !== null && latestCheckpoint?.endingBalance !== undefined
    ? String(latestCheckpoint.endingBalance)
    : null;
  const hasLoadedTransactions = transactions.some((transaction) => transaction.accountId === account.id);
  const accountCardNumber = account
    ? formatCardAccountNumber(account.accountNumber ?? latestCheckpoint?.sourceMetadata?.accountNumber ?? null)
    : "";
  const accountCardName = account
    ? getAccountCardName({
        name: account.type === "investment" ? accountEditDraft.name || account.name : accountEditDraft.name || account.name,
        institution: account.institution,
        accountNumber: account.accountNumber ?? latestCheckpoint?.sourceMetadata?.accountNumber ?? null,
        type: account.type,
        source: account.source,
      })
    : "Account";
  const liveCardNumber = formatCardAccountNumber(accountEditDraft.accountNumber || accountCardNumber);
  const hasMeaningfulBalance = (value: string | null | undefined) => {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) {
      return false;
    }

    const numeric = Number(normalized);
    return Number.isFinite(numeric) && numeric !== 0;
  };
  const hasVisibleBalance = hasMeaningfulBalance(account?.balance);
  const isPendingBalance =
    account?.source === "upload" &&
    !hasVisibleBalance &&
    !hasMeaningfulBalance(checkpointBalance) &&
    !hasLoadedTransactions &&
    (!latestCheckpoint || latestCheckpoint.status !== "reconciled");
  const stableDisplayBalance = useMemo(() => {
    const candidates = [stableBalanceRef.current, cachedImportedBalance, account?.balance, checkpointBalance, String(currentBalance)];
    for (const candidate of candidates) {
      const normalized = typeof candidate === "string" ? candidate.trim() : "";
      if (!hasMeaningfulBalance(normalized)) {
        continue;
      }

      return normalized;
    }

    return String(currentBalance);
  }, [account?.balance, cachedImportedBalance, checkpointBalance, currentBalance]);
  useEffect(() => {
    if (!account || account.source !== "upload") {
      stableBalanceRef.current = null;
      return;
    }

    const candidates = [account.balance, checkpointBalance, String(currentBalance), stableBalanceRef.current];
    for (const candidate of candidates) {
      const normalized = typeof candidate === "string" ? candidate.trim() : "";
      if (!normalized || Number(normalized) === 0) {
        continue;
      }

      stableBalanceRef.current = normalized;
      return;
    }
  }, [account, currentBalance, checkpointBalance]);

  const displayBalance =
    isPendingBalance && hasMeaningfulBalance(checkpointBalance)
      ? checkpointBalance
      : !hasMeaningfulBalance(account?.balance) && stableDisplayBalance
        ? stableDisplayBalance
        : currentBalance.toString();
  const investmentGainLoss = useMemo(() => {
    if (account?.type !== "investment" || investmentPurchaseValue === null) {
      return null;
    }

    return currentBalance - investmentPurchaseValue;
  }, [account?.type, currentBalance, investmentPurchaseValue]);

  const selectedWorkspaceId = readSelectedWorkspaceId();
  const deletingAccountIds = useMemo(
    () => new Set(getDeletingWorkspaceAccountIds(account?.workspaceId ?? selectedWorkspaceId ?? "")),
    [account?.workspaceId, selectedWorkspaceId]
  );

  const visibleTransactions = useMemo(
    () => {
      const filtered = transactions.filter((transaction) => transaction.merchantRaw !== "Beginning balance");
      const directionMultiplier = transactionSortDirection === "asc" ? 1 : -1;

      return [...filtered].sort((left, right) => {
        const leftValue =
          transactionSortField === "category"
            ? getDisplayTransactionCategoryName(left, categories, account?.institution)
            : getTransactionSortFieldValue(left, transactionSortField);
        const rightValue =
          transactionSortField === "category"
            ? getDisplayTransactionCategoryName(right, categories, account?.institution)
            : getTransactionSortFieldValue(right, transactionSortField);

        if (typeof leftValue === "number" && typeof rightValue === "number") {
          return (leftValue - rightValue) * directionMultiplier;
        }

        return String(leftValue).localeCompare(String(rightValue), undefined, { sensitivity: "base", numeric: true }) * directionMultiplier;
      });
    },
    [account?.institution, categories, transactions, transactionSortDirection, transactionSortField]
  );
  const mobileTransactionGroups = useMemo(() => {
    const groups: Array<{ date: string; label: string; transactions: Transaction[] }> = [];

    for (const transaction of visibleTransactions) {
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
  }, [visibleTransactions]);
  const categoryOptions = useMemo(
    () => [{ value: "", label: "Other" }, ...categories.map((category) => ({ value: category.id, label: category.name }))],
    [categories]
  );
  const detailSelectedCategory = useMemo(
    () => categories.find((category) => category.id === (detailDraft?.categoryId ?? "")) ?? null,
    [categories, detailDraft?.categoryId]
  );

  const hasMoreTransactions = transactionTotalCount > transactions.length;
  const hasVisibleTransactions = visibleTransactions.length > 0;
  const visibleTransactionIds = useMemo(() => visibleTransactions.map((transaction) => transaction.id), [visibleTransactions]);
  const allVisibleSelected =
    visibleTransactionIds.length > 0 && visibleTransactionIds.every((transactionId) => selectedTransactionIds.includes(transactionId));
  const someVisibleSelected = visibleTransactionIds.some((transactionId) => selectedTransactionIds.includes(transactionId));

  useEffect(() => {
    if (!selectAllTransactionsRef.current) {
      return;
    }

    selectAllTransactionsRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [allVisibleSelected, someVisibleSelected]);

  useEffect(() => {
    setSelectedTransactionIds((current) => current.filter((transactionId) => transactions.some((transaction) => transaction.id === transactionId)));
    setBulkDeleteConfirmOpen(false);
  }, [transactions]);

  const toggleTransactionSelection = (transactionId: string, selected: boolean) => {
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

  const toggleAllVisibleTransactions = (selected: boolean) => {
    setSelectedTransactionIds((current) => {
      const next = new Set(current);
      if (selected) {
        visibleTransactionIds.forEach((transactionId) => next.add(transactionId));
      } else {
        visibleTransactionIds.forEach((transactionId) => next.delete(transactionId));
      }

      return Array.from(next);
    });
  };

  const openBulkDeleteConfirm = () => {
    if (selectedTransactionIds.length === 0) {
      return;
    }

    setBulkDeleteConfirmOpen(true);
  };

  const loadMoreTransactions = async () => {
    if (!account || transactionsLoadingMore || !hasMoreTransactions) {
      return;
    }

    const nextPage = transactionPage + 1;
    setTransactionsLoadingMore(true);
    try {
      const searchParams = buildTransactionQuerySearchParams(
        account.workspaceId,
        {
          accountIds: [account.id],
        },
        {
          page: nextPage,
          pageSize: TRANSACTION_PAGE_SIZE,
        }
      );
      searchParams.set("summaryMode", "light");
      const response = await fetch(`/api/transactions?${searchParams.toString()}`);
      if (!response.ok) {
        throw new Error("Unable to load more transactions.");
      }

      const payload = (await response.json()) as { transactions?: Transaction[]; page?: number; totalCount?: number } | null;
      const nextTransactions = Array.isArray(payload?.transactions) ? payload.transactions : [];
      setTransactions((current) => [...current, ...nextTransactions]);
      setTransactionPage(typeof payload?.page === "number" ? payload.page : nextPage);
      if (typeof payload?.totalCount === "number") {
        setTransactionTotalCount(payload.totalCount);
      }
    } catch (error) {
      setTransactionsError(error instanceof Error ? error.message : "Unable to load more transactions.");
    } finally {
      setTransactionsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!selectedTransaction) {
      return;
    }

    const nextSelectedTransaction = transactions.find((entry) => entry.id === selectedTransaction.id) ?? null;
    if (!nextSelectedTransaction) {
      setSelectedTransaction(null);
      setDetailDraft(null);
      return;
    }

    setSelectedTransaction(nextSelectedTransaction);
  }, [selectedTransaction, transactions]);

  const updateTransaction = async (transactionId: string, body: Record<string, unknown>) => {
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
    setTransactions((current) => current.map((entry) => (entry.id === updated.id ? { ...entry, ...updated } : entry)));
    setSelectedTransaction((current) => (current?.id === updated.id ? { ...current, ...updated } : current));
    setDetailDraft((current) => (current && selectedTransaction?.id === updated.id ? createDetailDraft({ ...updated }) : current));
    return updated;
  };

  const commitInlineEdit = async (transaction: Transaction, field: EditableTransactionField, value: string) => {
    if (field === "name") {
      await updateTransaction(transaction.id, {
        merchantClean: value.trim() || null,
      });
      setMessage("Transaction updated.");
      return;
    }

    if (field === "date") {
      await updateTransaction(transaction.id, {
        date: value,
      });
      setMessage("Transaction updated.");
      return;
    }

    if (field === "categoryId") {
      await updateTransaction(transaction.id, {
        categoryId: value || null,
      });
      setMessage("Transaction updated.");
      return;
    }

    await updateTransaction(transaction.id, {
      amount: value,
    });
    setMessage("Transaction updated.");
  };

  const openTransactionDetail = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setDetailDraft(createDetailDraft(transaction));
  };

  const closeTransactionDetail = () => {
    setSelectedTransaction(null);
    setDetailDraft(null);
  };

  const persistDetailDraft = async () => {
    if (!selectedTransaction || !detailDraft) {
      return;
    }

    setIsSavingTransactionDetail(true);
    try {
      await updateTransaction(selectedTransaction.id, {
        merchantClean: detailDraft.merchantClean.trim() || null,
        date: detailDraft.date,
        categoryId: detailDraft.categoryId || null,
        amount: detailDraft.amount,
        currency: detailDraft.currency.trim().toUpperCase() || selectedTransaction.currency || account?.currency || "PHP",
        type: detailDraftTypeToTransactionType(detailDraft.type),
        description: detailDraft.description.trim() || null,
        isExcluded: detailDraft.isExcluded,
      });
      setMessage("Transaction details updated.");
      closeTransactionDetail();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update transaction.");
    } finally {
      setIsSavingTransactionDetail(false);
    }
  };

  const deleteTransactionRemote = async (transactionId: string) => {
    const response = await fetch(`/api/transactions/${transactionId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("Unable to delete transaction.");
    }
  };

  const deleteSelectedTransactions = async () => {
    if (!account || selectedTransactionIds.length === 0) {
      return;
    }

    const transactionIds = [...selectedTransactionIds];
    const count = transactionIds.length;
    setBulkDeleteBusy(true);
    try {
      await Promise.all(transactionIds.map((transactionId) => deleteTransactionRemote(transactionId)));
      transactionIds.forEach((transactionId) => applyOptimisticWorkspaceTransactionDeletion(account.workspaceId, transactionId));
      const transactionIdSet = new Set(transactionIds);
      setTransactions((current) => current.filter((entry) => !transactionIdSet.has(entry.id)));
      setTransactionTotalCount((current) => Math.max(0, current - count));
      setSelectedTransactionIds([]);
      setBulkDeleteConfirmOpen(false);
      setMessage(`${count} transaction${count === 1 ? "" : "s"} deleted.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete transaction.");
    } finally {
      setBulkDeleteBusy(false);
    }
  };

  const clearAccountActivity = async () => {
    if (!account) {
      return;
    }

    const workspaceId = account.workspaceId;
    const transactionsToDelete = visibleTransactions;
    const purchasesToDelete = account.type === "investment" ? investmentPurchases : [];
    const dividendsToDelete = account.type === "investment" ? investmentDividends : [];

    setDeleteBusy("activity");
    try {
      if (transactionsToDelete.length > 0) {
        await Promise.all(transactionsToDelete.map((transaction) => deleteTransactionRemote(transaction.id)));
        for (const transaction of transactionsToDelete) {
          applyOptimisticWorkspaceTransactionDeletion(workspaceId, transaction.id);
        }
      }

      if (account.type === "investment") {
        if (purchasesToDelete.length > 0) {
          await Promise.all(
            purchasesToDelete.map((purchase) =>
              fetch(`/api/accounts/${account.id}/investment-purchases/${purchase.id}`, {
                method: "DELETE",
              }).then((response) => {
                if (!response.ok) {
                  throw new Error("Unable to delete asset history.");
                }
              })
            )
          );
        }

        if (dividendsToDelete.length > 0) {
          await Promise.all(
            dividendsToDelete.map((dividend) =>
              fetch(`/api/accounts/${account.id}/investment-dividends/${dividend.id}`, {
                method: "DELETE",
              }).then((response) => {
                if (!response.ok) {
                  throw new Error("Unable to delete asset history.");
                }
              })
            )
          );
        }

        const resetResponse = await fetch(`/api/accounts/${account.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            name: account.name,
            institution: account.institution,
            investmentSubtype: account.investmentSubtype,
            investmentSymbol: account.investmentSymbol,
            investmentQuantity: null,
            investmentCostBasis: null,
            investmentPrincipal: null,
            investmentStartDate: account.investmentStartDate,
            investmentMaturityDate: account.investmentMaturityDate,
            investmentInterestRate: account.investmentInterestRate,
            investmentMaturityValue: null,
            type: "investment",
            currency: account.currency,
            source: account.source,
            balance: 0,
          }),
        });

        if (!resetResponse.ok) {
          throw new Error("Unable to reset this asset after deletion.");
        }

        const payload = (await resetResponse.json()) as { account?: Account } | null;
        if (payload?.account) {
          setAccount(payload.account);
        } else {
          setAccount((current) =>
            current
              ? {
                  ...current,
                  balance: "0",
                  investmentQuantity: null,
                  investmentCostBasis: null,
                  investmentPrincipal: null,
                  investmentMaturityValue: null,
                }
              : current
          );
        }
      } else {
        setAccount((current) => (current ? { ...current, balance: "0" } : current));
      }

      setTransactions((current) => current.filter((transaction) => transaction.merchantRaw === "Beginning balance"));
      setTransactionTotalCount(0);
      setTransactionPage(1);
      setImportFiles([]);
      setCheckpoints([]);
      setInvestmentPurchases([]);
      setInvestmentDividends([]);
      setDeleteAction(null);
      setMessage(account.type === "investment" ? "Asset history deleted." : "Transactions deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : account.type === "investment" ? "Unable to delete asset history." : "Unable to delete transactions.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const updateInvestmentSummaryFromPurchase = (totalCost: string, direction: "add" | "subtract") => {
    const delta = Number(totalCost);
    if (!Number.isFinite(delta)) {
      return;
    }

    setAccount((current) => {
      if (!current || current.type !== "investment") {
        return current;
      }

      const summaryField = isFixedIncomeInvestmentSubtype(current.investmentSubtype) ? "investmentPrincipal" : "investmentCostBasis";
      const currentValue = Number(summaryField === "investmentPrincipal" ? current.investmentPrincipal ?? 0 : current.investmentCostBasis ?? 0);
      const nextValue = Math.max(0, direction === "add" ? currentValue + delta : currentValue - delta);

      return summaryField === "investmentPrincipal"
        ? { ...current, investmentPrincipal: nextValue.toString() }
        : { ...current, investmentCostBasis: nextValue.toString() };
    });
  };

  const createInvestmentPurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!account || account.type !== "investment") {
      return;
    }

    if (!purchaseDraft.purchasedAt || !purchaseDraft.totalCost) {
      setMessage("Purchase date and total cost are required.");
      return;
    }

    setPurchaseBusy(true);
    try {
      const response = await fetch(`/api/accounts/${account.id}/investment-purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchasedAt: purchaseDraft.purchasedAt,
          quantity: purchaseDraft.quantity || null,
          totalCost: purchaseDraft.totalCost,
          currency: purchaseDraft.currency || account.currency,
          note: purchaseDraft.note || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to add purchase.");
      }

      const payload = (await response.json()) as { purchase?: InvestmentPurchase } | null;
      if (payload?.purchase) {
        setInvestmentPurchases((current) => [payload.purchase as InvestmentPurchase, ...current]);
        updateInvestmentSummaryFromPurchase(String(payload.purchase.totalCost ?? purchaseDraft.totalCost), "add");
      }

      setPurchaseDraft({
        purchasedAt: "",
        quantity: "",
        totalCost: "",
        currency: account.currency,
        note: "",
      });
      setMessage("Purchase added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add purchase.");
    } finally {
      setPurchaseBusy(false);
    }
  };

  const deleteInvestmentPurchase = async (purchase: InvestmentPurchase) => {
    if (!account) {
      return;
    }

    setPurchaseDeleteBusy(purchase.id);
    try {
      const response = await fetch(`/api/accounts/${account.id}/investment-purchases/${purchase.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Unable to delete purchase.");
      }

      setInvestmentPurchases((current) => current.filter((entry) => entry.id !== purchase.id));
      updateInvestmentSummaryFromPurchase(String(purchase.totalCost ?? 0), "subtract");
      setMessage("Purchase deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete purchase.");
    } finally {
      setPurchaseDeleteBusy(null);
    }
  };

  const createInvestmentDividend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!account || account.type !== "investment") {
      return;
    }

    if (!dividendDraft.paidAt || !dividendDraft.amount) {
      setMessage("Dividend date and amount are required.");
      return;
    }

    setDividendBusy(true);
    try {
      const response = await fetch(`/api/accounts/${account.id}/investment-dividends`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paidAt: dividendDraft.paidAt,
          amount: dividendDraft.amount,
          currency: dividendDraft.currency || account.currency,
          note: dividendDraft.note || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to add dividend.");
      }

      const payload = (await response.json()) as { dividend?: InvestmentDividend } | null;
      if (payload?.dividend) {
        setInvestmentDividends((current) => [payload.dividend as InvestmentDividend, ...current]);
      }

      setDividendDraft({
        paidAt: "",
        amount: "",
        currency: account.currency,
        note: "",
      });
      setMessage("Dividend added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add dividend.");
    } finally {
      setDividendBusy(false);
    }
  };

  const deleteInvestmentDividend = async (dividend: InvestmentDividend) => {
    if (!account) {
      return;
    }

    setDividendDeleteBusy(dividend.id);
    try {
      const response = await fetch(`/api/accounts/${account.id}/investment-dividends/${dividend.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Unable to delete dividend.");
      }

      setInvestmentDividends((current) => current.filter((entry) => entry.id !== dividend.id));
      setMessage("Dividend deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete dividend.");
    } finally {
      setDividendDeleteBusy(null);
    }
  };

  const updateInvestmentEditDraft = (key: keyof InvestmentEditDraft, value: string) => {
    setInvestmentEditDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const toggleFavoriteAccount = async () => {
    if (!account || favoriteSaving) {
      return;
    }

    const previousFavorite = Boolean(account.favorite);
    const nextFavorite = !previousFavorite;
    setFavoriteSaving(true);
    setAccount((current) => (current ? { ...current, favorite: nextFavorite } : current));

    try {
      const response = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: account.workspaceId,
          favorite: nextFavorite,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to update favorite account.");
      }

      const payload = await response.json();
      if (payload.account) {
        setAccount(payload.account as Account);
      }
    } catch (error) {
      setAccount((current) => (current ? { ...current, favorite: previousFavorite } : current));
      setMessage(error instanceof Error ? error.message : "Unable to update favorite account.");
    } finally {
      setFavoriteSaving(false);
    }
  };

  useEffect(() => {
    if (!account || account.type === "investment") {
      setAccountEditSaveState("idle");
      return;
    }

    const nextName = accountEditDraft.name.trim();
    const nextAccountNumber = accountEditDraft.accountNumber.trim();
    const currentName = account.name.trim();
    const currentAccountNumber = (account.accountNumber ?? "").trim();
    const hasChanges = nextName !== currentName || nextAccountNumber !== currentAccountNumber;

    if (!hasChanges) {
      setAccountEditSaveState("idle");
      return;
    }

    setAccountEditSaveState("saving");
    const timeout = window.setTimeout(() => {
      void fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: account.workspaceId,
          name: nextName || account.name,
          institution: account.institution,
          accountNumber: nextAccountNumber || null,
          type: account.type,
          currency: account.currency,
          source: account.source,
          balance: account.balance,
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Unable to update account details.");
          }

          const payload = await response.json();
          if (payload.account) {
            const nextAccount = payload.account as Account;
            setAccount(nextAccount);
            const canonicalPath = getAccountPath(nextAccount);
            if (canonicalPath !== `/accounts/${accountPathSegment}`) {
              router.replace(canonicalPath);
            }
          }

          setAccountEditSaveState("saved");
        })
        .catch((error) => {
          setAccountEditSaveState("error");
          setMessage(error instanceof Error ? error.message : "Unable to update account details.");
        });
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [account, accountEditDraft, accountPathSegment, router]);

  useEffect(() => {
    if (!account || account.type !== "investment" || !investmentEditDraft) {
      setInvestmentAutosaveState("idle");
      return;
    }

    const currentSnapshot = serializeInvestmentEditDraft(account);
    const hasChanges = Object.keys(currentSnapshot).some((key) => {
      const draftKey = key as keyof InvestmentEditDraft;
      return investmentEditDraft[draftKey] !== currentSnapshot[draftKey];
    });

    if (!hasChanges) {
      setInvestmentAutosaveState("idle");
      return;
    }

    setInvestmentAutosaveState("saving");
    const timeout = window.setTimeout(() => {
      const isMarket = isMarketInvestmentSubtype(investmentEditDraft.investmentSubtype);
      const isFixedIncome = isFixedIncomeInvestmentSubtype(investmentEditDraft.investmentSubtype);
      void fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: account.workspaceId,
          name: investmentEditDraft.name.trim(),
          institution: investmentEditDraft.institution.trim() || null,
          investmentSubtype: investmentEditDraft.investmentSubtype,
          investmentSymbol: isMarket || investmentEditDraft.investmentSubtype === "other" ? investmentEditDraft.investmentSymbol.trim() || null : null,
          investmentQuantity: isMarket ? parseNullableNumber(investmentEditDraft.investmentQuantity) : null,
          investmentCostBasis:
            isMarket || investmentEditDraft.investmentSubtype === "other"
              ? parseNullableNumber(investmentEditDraft.investmentCostBasis)
              : null,
          investmentPrincipal: isFixedIncome ? parseNullableNumber(investmentEditDraft.investmentPrincipal) : null,
          investmentStartDate: isFixedIncome ? investmentEditDraft.investmentStartDate || null : null,
          investmentMaturityDate: isFixedIncome ? investmentEditDraft.investmentMaturityDate || null : null,
          investmentInterestRate: isFixedIncome ? parseNullableNumber(investmentEditDraft.investmentInterestRate) : null,
          investmentMaturityValue: isFixedIncome ? parseNullableNumber(investmentEditDraft.investmentMaturityValue) : null,
          type: "investment",
          currency: account.currency,
          source: account.source,
          balance: parseNullableNumber(investmentEditDraft.balance),
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Unable to update asset.");
          }

          const payload = await response.json();
          if (payload.account) {
            setAccount(payload.account as Account);
          }

          setInvestmentAutosaveState("saved");
        })
        .catch((error) => {
          setInvestmentAutosaveState("error");
          setMessage(error instanceof Error ? error.message : "Unable to update asset.");
        });
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [account, investmentEditDraft]);

  const deleteAccount = async () => {
    if (!accountId) {
      return;
    }

    setDeleteBusy("account");
    try {
      const workspaceId = account?.workspaceId ?? selectedWorkspaceId ?? readSelectedWorkspaceId() ?? null;
      if (workspaceId) {
        clearDeletingWorkspaceAccount(workspaceId, accountId);
        markDeletedWorkspaceAccount(workspaceId, accountId);
        applyOptimisticWorkspaceAccountDeletion(workspaceId, accountId);
      }

      router.replace("/accounts");
      void fetch(`/api/accounts/${accountId}`, {
        method: "DELETE",
        keepalive: true,
      }).catch(() => {
        if (workspaceId) {
          clearDeletedWorkspaceAccount(workspaceId, accountId);
          clearDeletingWorkspaceAccount(workspaceId, accountId);
        }
      });
    } catch (error) {
      const workspaceId = account?.workspaceId ?? selectedWorkspaceId ?? readSelectedWorkspaceId() ?? null;
      if (workspaceId) {
        clearDeletedWorkspaceAccount(workspaceId, accountId);
        clearDeletingWorkspaceAccount(workspaceId, accountId);
      }
      setMessage(error instanceof Error ? error.message : "Unable to delete account.");
      setDeleteAction(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  if (!hasInitialDataLoaded) {
    return <CloverLoadingScreen label="account details" />;
  }

  const mobileBackAction = (
    <button className="button button-secondary button-small accounts-detail__mobile-back" type="button" onClick={() => router.push("/accounts")}>
      Back to Accounts
    </button>
  );

  return (
    <CloverShell
      active="accounts"
      title={account?.name ?? "Account"}
      kicker={account?.type === "investment" ? "Asset history" : "Account history"}
      subtitle={
        account?.type === "investment"
          ? "View the full history for a single investment asset."
          : "View the full statement history for a single account."
      }
      actions={isMobileViewport ? mobileBackAction : undefined}
      hideCompactBarKickerAndSubtitleOnMobile
      showTopbar={false}
    >
      <section className="accounts-detail__panel" style={accountBrandStyles}>
        {!isMobileViewport ? (
          <div className="accounts-detail__header">
            <div className="actions accounts-detail__desktop-actions">
              <button className="button button-secondary" type="button" onClick={() => router.push("/accounts")}>
                Back to Accounts
              </button>
            </div>
          </div>
        ) : null}

        {account ? (
          <div className="accounts-detail__hero">
            {isPendingBalance ? (
              <div className="accounts-detail__loading-chip-wrap">
                <span className="accounts-summary-chip is-neutral">Loading</span>
                <p className="panel-muted">Clover is still reading this {latestCheckpointFamily?.pendingLabel ?? "statement"} and filling in the rest.</p>
              </div>
            ) : null}

            <div className="accounts-detail__hero-card-row">
              <FinancialAccountCard
                className="accounts-detail__hero-card"
                accountBrand={accountBrand}
                name={accountCardName}
                accountNumber={liveCardNumber}
                amount={isPendingBalance ? "Loading..." : formatAccountAmount(Math.abs(parseAmount(displayBalance)), account.currency)}
                showChevron={false}
                onOpen={
                  account.type === "investment"
                    ? undefined
                    : () => {
                        setAccountIdentityEditorOpen((open) => !open);
                      }
                }
              />

              <button
                className={`icon-button accounts-detail__favorite-toggle${account.favorite ? " is-active" : ""}`}
                type="button"
                onClick={() => void toggleFavoriteAccount()}
                aria-pressed={Boolean(account.favorite)}
                aria-label={account.favorite ? "Remove account from favorites" : "Mark account as favorite"}
                disabled={favoriteSaving}
              >
                <ActionIcon name={account.favorite ? "star-filled" : "star"} />
              </button>
            </div>

            {account.type !== "investment" && accountIdentityEditorOpen ? (
              <div className="accounts-detail__account-identity-editor accounts-detail__account-identity-editor--inline">
                <p className="accounts-detail__account-identity-editor-title">Edit account details</p>
                <div className="accounts-detail__account-identity-editor-body">
                  <div className="accounts-inline-edit__grid">
                    <label>
                      Name
                      <input value={accountEditDraft.name} onChange={(event) => setAccountEditDraft((current) => ({ ...current, name: event.target.value }))} />
                    </label>
                    <label>
                      Account number
                      <input
                        value={accountEditDraft.accountNumber}
                        onChange={(event) => setAccountEditDraft((current) => ({ ...current, accountNumber: event.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="accounts-inline-edit__actions">
                    <span className="accounts-detail__autosave-state">
                      {accountEditSaveState === "saving"
                        ? "Saving..."
                        : accountEditSaveState === "saved"
                          ? "Saved"
                          : accountEditSaveState === "error"
                            ? "Needs attention"
                            : ""}
                    </span>
                    <button className="button button-secondary button-small" type="button" onClick={() => setAccountIdentityEditorOpen(false)}>
                      Close
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {account?.type === "investment" ? (
          <div className="accounts-detail__investment glass" style={{ marginTop: 20 }}>
            <div className="accounts-detail__reconciliation-head">
              <div>
                <p className="eyebrow">Asset details</p>
                <h3>Portfolio snapshot</h3>
              </div>
              <div className="accounts-detail__transactions-actions">
                <span className="accounts-detail__autosave-state">
                  {investmentAutosaveState === "saving"
                    ? "Saving..."
                    : investmentAutosaveState === "saved"
                      ? "Saved"
                      : investmentAutosaveState === "error"
                        ? "Needs attention"
                        : "Autosaves as you edit"}
                </span>
              </div>
            </div>
            <div className="accounts-detail__investment-summary">
              <div className="status-card">
                <div className="panel-muted">Subtype</div>
                <strong>{getInvestmentSubtypeLabel(investmentSubtype)}</strong>
              </div>
              <div className="status-card">
                <div className="panel-muted">Current value</div>
                <strong>{formatAccountAmount(currentBalance, account.currency)}</strong>
              </div>
              <div className="status-card">
                <div className="panel-muted">Purchase value / principal</div>
                <strong>{investmentPurchaseValue === null ? "Not set" : formatAccountAmount(investmentPurchaseValue, account.currency)}</strong>
              </div>
              <div className="status-card">
                <div className="panel-muted">Dividends</div>
                <strong>{formatAccountAmount(investmentDividendTotal, account.currency)}</strong>
              </div>
              <div className="status-card">
                <div className="panel-muted">Gain / loss</div>
                <strong>{investmentGainLoss === null ? "Not set" : formatAccountAmount(investmentGainLoss, account.currency)}</strong>
              </div>
            </div>

            {investmentEditDraft ? (
              <div className="accounts-inline-edit" style={{ marginTop: 16 }}>
                <div className="accounts-inline-edit__grid">
                  <label>
                    Holding name
                    <input value={investmentEditDraft.name} onChange={(event) => updateInvestmentEditDraft("name", event.target.value)} />
                  </label>
                  <label>
                    Institution
                    <input value={investmentEditDraft.institution} onChange={(event) => updateInvestmentEditDraft("institution", event.target.value)} />
                  </label>
                  <label>
                    Investment subtype
                    <select
                      value={investmentEditDraft.investmentSubtype}
                      onChange={(event) => {
                        const nextSubtype = event.target.value as InvestmentSubtype;
                        setInvestmentEditDraft((current) =>
                          current
                            ? {
                                ...current,
                                investmentSubtype: nextSubtype,
                              }
                            : current
                        );
                      }}
                    >
                      {["stock", "etf", "mutual_fund", "money_market_fund", "uitf", "reit", "crypto", "bond", "time_deposit", "other"].map((subtype) => (
                        <option key={subtype} value={subtype}>
                          {getInvestmentSubtypeLabel(subtype)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Current value / balance
                    <input value={investmentEditDraft.balance} onChange={(event) => updateInvestmentEditDraft("balance", event.target.value)} inputMode="decimal" />
                  </label>
                  {investmentEditingFieldConfigs.map((field) => (
                    <label key={field.key}>
                      {field.label}
                      {field.type === "date" ? (
                        <input
                          type="date"
                          value={
                            field.key === "investmentStartDate"
                              ? investmentEditDraft.investmentStartDate
                              : investmentEditDraft.investmentMaturityDate
                          }
                          onChange={(event) => updateInvestmentEditDraft(field.key as keyof InvestmentEditDraft, event.target.value)}
                        />
                      ) : (
                        <input
                          value={
                            field.key === "investmentSymbol"
                              ? investmentEditDraft.investmentSymbol
                              : field.key === "investmentQuantity"
                                ? investmentEditDraft.investmentQuantity
                                : field.key === "investmentCostBasis"
                                  ? investmentEditDraft.investmentCostBasis
                                  : field.key === "investmentPrincipal"
                                    ? investmentEditDraft.investmentPrincipal
                                    : field.key === "investmentInterestRate"
                                      ? investmentEditDraft.investmentInterestRate
                                      : investmentEditDraft.investmentMaturityValue
                          }
                          onChange={(event) => updateInvestmentEditDraft(field.key as keyof InvestmentEditDraft, event.target.value)}
                          inputMode={field.inputMode}
                          placeholder={field.placeholder}
                        />
                      )}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {canShowInvestmentPurchases ? (
              <div className="accounts-detail__history-stack" style={{ marginTop: 20 }}>
              <section className="accounts-detail__history-section glass">
                <div className="accounts-detail__reconciliation-head">
                  <div>
                    <p className="eyebrow">Purchases</p>
                    <h4>Purchase history</h4>
                  </div>
                </div>
                <form className="accounts-detail__history-form" onSubmit={createInvestmentPurchase}>
                  <label>
                    Date
                    <input
                      type="date"
                      value={purchaseDraft.purchasedAt}
                      onChange={(event) => setPurchaseDraft((current) => ({ ...current, purchasedAt: event.target.value }))}
                    />
                  </label>
                  <label>
                    Units / shares
                    <input
                      inputMode="decimal"
                      value={purchaseDraft.quantity}
                      onChange={(event) => setPurchaseDraft((current) => ({ ...current, quantity: event.target.value }))}
                    />
                  </label>
                  <label>
                    Total cost
                    <input
                      inputMode="decimal"
                      value={purchaseDraft.totalCost}
                      onChange={(event) => setPurchaseDraft((current) => ({ ...current, totalCost: event.target.value }))}
                    />
                  </label>
                  <label>
                    Currency
                    <input
                      value={purchaseDraft.currency}
                      onChange={(event) => setPurchaseDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                    />
                  </label>
                  <label className="accounts-detail__history-form-note">
                    Note
                    <input
                      value={purchaseDraft.note}
                      onChange={(event) => setPurchaseDraft((current) => ({ ...current, note: event.target.value }))}
                    />
                  </label>
                  <button className="button button-primary button-small" type="submit" disabled={purchaseBusy}>
                    {purchaseBusy ? "Adding..." : "Add purchase"}
                  </button>
                </form>
                {investmentPurchases.length > 0 ? (
                  <div className="accounts-detail__history-table" role="table" aria-label="Purchase history">
                    <div className="accounts-detail__history-row accounts-detail__history-row--header" role="row">
                      <div role="columnheader">Date</div>
                      <div role="columnheader">Units</div>
                      <div role="columnheader">Total cost</div>
                      <div role="columnheader">Currency</div>
                      <div role="columnheader">Note</div>
                      <div role="columnheader" aria-hidden="true" />
                    </div>
                    {investmentPurchases.map((purchase) => (
                      <div key={purchase.id} className="accounts-detail__history-row" role="row">
                        <div role="cell">{formatNullableDate(purchase.purchasedAt)}</div>
                        <div role="cell">{purchase.quantity ?? "—"}</div>
                        <div role="cell">{purchase.totalCost === null ? "—" : formatAccountAmount(Number(purchase.totalCost), purchase.currency)}</div>
                        <div role="cell">{purchase.currency}</div>
                        <div role="cell">{purchase.note ?? "—"}</div>
                        <div role="cell">
                          <button
                            className="button button-secondary button-small"
                            type="button"
                            onClick={() => void deleteInvestmentPurchase(purchase)}
                            disabled={purchaseDeleteBusy === purchase.id}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="panel-muted" style={{ marginTop: 12 }}>
                    No purchases logged yet.
                  </p>
                )}
              </section>

              {canShowInvestmentDividends ? (
                <section className="accounts-detail__history-section glass">
                  <div className="accounts-detail__reconciliation-head">
                    <div>
                      <p className="eyebrow">Dividends</p>
                      <h4>Dividend history</h4>
                    </div>
                  </div>
                  <form className="accounts-detail__history-form" onSubmit={createInvestmentDividend}>
                    <label>
                      Date
                      <input
                        type="date"
                        value={dividendDraft.paidAt}
                        onChange={(event) => setDividendDraft((current) => ({ ...current, paidAt: event.target.value }))}
                      />
                    </label>
                    <label>
                      Amount
                      <input
                        inputMode="decimal"
                        value={dividendDraft.amount}
                        onChange={(event) => setDividendDraft((current) => ({ ...current, amount: event.target.value }))}
                      />
                    </label>
                    <label>
                      Currency
                      <input
                        value={dividendDraft.currency}
                        onChange={(event) => setDividendDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                      />
                    </label>
                    <label className="accounts-detail__history-form-note">
                      Note
                      <input
                        value={dividendDraft.note}
                        onChange={(event) => setDividendDraft((current) => ({ ...current, note: event.target.value }))}
                      />
                    </label>
                    <button className="button button-primary button-small" type="submit" disabled={dividendBusy}>
                      {dividendBusy ? "Adding..." : "Add dividend"}
                    </button>
                  </form>
                  {investmentDividends.length > 0 ? (
                    <div className="accounts-detail__history-table" role="table" aria-label="Dividend history">
                      <div className="accounts-detail__history-row accounts-detail__history-row--header" role="row">
                        <div role="columnheader">Date</div>
                        <div role="columnheader">Amount</div>
                        <div role="columnheader">Currency</div>
                        <div role="columnheader">Note</div>
                        <div role="columnheader" aria-hidden="true" />
                      </div>
                      {investmentDividends.map((dividend) => (
                        <div key={dividend.id} className="accounts-detail__history-row" role="row">
                          <div role="cell">{formatNullableDate(dividend.paidAt)}</div>
                          <div role="cell">{dividend.amount === null ? "—" : formatAccountAmount(Number(dividend.amount), dividend.currency)}</div>
                          <div role="cell">{dividend.currency}</div>
                          <div role="cell">{dividend.note ?? "—"}</div>
                          <div role="cell">
                            <button
                              className="button button-secondary button-small"
                              type="button"
                              onClick={() => void deleteInvestmentDividend(dividend)}
                              disabled={dividendDeleteBusy === dividend.id}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="panel-muted" style={{ marginTop: 12 }}>
                      No dividends logged yet.
                    </p>
                  )}
                </section>
              ) : null}
            </div>
            ) : null}
          </div>
        ) : null}

        <div className="accounts-detail__transactions glass" style={{ marginTop: 24 }}>
          <div className="accounts-detail__reconciliation-head">
            <div>
              <h3>Transactions</h3>
            </div>
            <div className="accounts-detail__transactions-actions">
              <span className="accounts-summary-chip is-neutral">{`${visibleTransactions.length} of ${transactionTotalCount} loaded`}</span>
              {selectedTransactionIds.length > 0 ? (
                <>
                  <span className="accounts-summary-chip is-neutral">{`${selectedTransactionIds.length} selected`}</span>
                  <button className="button button-secondary button-small" type="button" onClick={openBulkDeleteConfirm}>
                    Delete selected
                  </button>
                </>
              ) : null}
            </div>
          </div>
          {transactionsError ? (
            <p className="panel-muted">{transactionsError}</p>
          ) : hasVisibleTransactions ? (
            <>
              {!isMobileViewport ? (
                <div className="accounts-detail__transaction-list accounts-detail__transaction-list--compact" aria-label="Transaction history">
                  <div className="line-item-header" role="row" aria-label="Transaction columns">
                    <label className="line-item-header-cell line-item-header-cell--select line-item-header-cell--select-all">
                      <input
                        ref={selectAllTransactionsRef}
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={(event) => toggleAllVisibleTransactions(event.target.checked)}
                        aria-label="Select all loaded transactions"
                      />
                    </label>
                    <span className="line-item-header-cell line-item-header-cell--icon" aria-hidden="true" />
                    <button
                      className="line-item-header-cell line-item-header-cell--name"
                      type="button"
                      onClick={() => {
                        if (transactionSortField === "name") {
                          setTransactionSortDirection((current) => (current === "asc" ? "desc" : "asc"));
                          return;
                        }

                        setTransactionSortField("name");
                        setTransactionSortDirection("desc");
                      }}
                      aria-label={`Sort by name${transactionSortField === "name" ? ` (${transactionSortDirection})` : ""}`}
                    >
                      Name{transactionSortField === "name" ? (transactionSortDirection === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                    <button
                      className="line-item-header-cell"
                      type="button"
                      onClick={() => {
                        if (transactionSortField === "date") {
                          setTransactionSortDirection((current) => (current === "asc" ? "desc" : "asc"));
                          return;
                        }

                        setTransactionSortField("date");
                        setTransactionSortDirection("desc");
                      }}
                      aria-label={`Sort by date${transactionSortField === "date" ? ` (${transactionSortDirection})` : ""}`}
                    >
                      Date{transactionSortField === "date" ? (transactionSortDirection === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                    <button
                      className="line-item-header-cell"
                      type="button"
                      onClick={() => {
                        if (transactionSortField === "category") {
                          setTransactionSortDirection((current) => (current === "asc" ? "desc" : "asc"));
                          return;
                        }

                        setTransactionSortField("category");
                        setTransactionSortDirection("desc");
                      }}
                      aria-label={`Sort by category${transactionSortField === "category" ? ` (${transactionSortDirection})` : ""}`}
                    >
                      Category{transactionSortField === "category" ? (transactionSortDirection === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                    <button
                      className="line-item-header-cell line-item-header-cell--amount"
                      type="button"
                      onClick={() => {
                        if (transactionSortField === "amount") {
                          setTransactionSortDirection((current) => (current === "asc" ? "desc" : "asc"));
                          return;
                        }

                        setTransactionSortField("amount");
                        setTransactionSortDirection("desc");
                      }}
                      aria-label={`Sort by amount${transactionSortField === "amount" ? ` (${transactionSortDirection})` : ""}`}
                    >
                      Amount{transactionSortField === "amount" ? (transactionSortDirection === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                    <span className="line-item-header-cell line-item-header-cell--spacer" aria-hidden="true" />
                    <span className="line-item-header-cell line-item-header-cell--spacer" aria-hidden="true" />
                  </div>
                  {visibleTransactions.map((transaction) => {
                    const amount = Number(transaction.amount);
                    const amountToneClass = transaction.type === "transfer" ? "neutral" : transaction.type === "income" ? "positive" : "negative";
                    const categoryValue = transaction.categoryId ?? "";
                    const categoryLabel = getDisplayTransactionCategoryName(transaction, categories, account?.institution);
                    const normalizedName =
                      getEffectiveTransactionMerchantName({
                        merchantClean: transaction.merchantClean,
                        merchantRaw: transaction.merchantRaw,
                        rawPayload: transaction.rawPayload as never,
                      }) ?? "Transaction";

                    return (
                      <div
                        key={transaction.id}
                        className={`line-item ${transaction.isExcluded ? "is-muted" : ""} ${
                          selectedTransactionIds.includes(transaction.id) ? "is-selected" : ""
                        }`}
                      >
                        <label className="transaction-select-cell">
                          <input
                            type="checkbox"
                            checked={selectedTransactionIds.includes(transaction.id)}
                            onChange={(event) => toggleTransactionSelection(transaction.id, event.target.checked)}
                            aria-label={`Select ${normalizedName}`}
                          />
                        </label>
                        <div className="transaction-category-icon-cell" aria-hidden="true">
                          <span className="transaction-category-icon" style={getCategoryIconTone(categoryLabel)}>
                            <img src={getCategoryIconSrc(categoryLabel)} alt="" aria-hidden="true" />
                          </span>
                        </div>
                        <div className="transaction-name-cell">
                          <InlineEditableCell
                            value={transaction.merchantClean ?? ""}
                            displayValue={normalizedName}
                            ariaLabel={`Edit name for ${normalizedName}`}
                            kind="text"
                            className="transaction-inline-edit transaction-inline-edit--name"
                            onCommit={(value) => commitInlineEdit(transaction, "name", value)}
                          />
                        </div>
                        <div className="transaction-date-cell">
                          <InlineEditableCell
                            value={transaction.date.slice(0, 10)}
                            displayValue={formatDate(transaction.date)}
                            ariaLabel={`Edit date for ${normalizedName}`}
                            kind="date"
                            className="transaction-inline-edit transaction-inline-edit--date"
                            onCommit={(value) => commitInlineEdit(transaction, "date", value)}
                          />
                        </div>
                        <div className="transaction-category-cell">
                          <InlineEditableCell
                            value={categoryValue}
                            displayValue={categoryLabel}
                            ariaLabel={`Edit category for ${normalizedName}`}
                            kind="select"
                            className="transaction-inline-edit transaction-inline-edit--select"
                            options={categoryOptions}
                            onCommit={(value) => commitInlineEdit(transaction, "categoryId", value)}
                          />
                        </div>
                        <div className={`transaction-amount-cell ${amountToneClass}`}>
                          <InlineEditableCell
                            value={transaction.amount}
                            displayValue={formatAccountAmount(amount, transaction.currency ?? account?.currency ?? "PHP")}
                            ariaLabel={`Edit amount for ${normalizedName}`}
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
                            aria-label={`Open details for ${normalizedName}`}
                          >
                            <ActionIcon name="chevron-right" />
                          </button>
                        </div>
                        <div className="transaction-warning-cell" aria-hidden="true" />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="transactions-mobile-view">
                  <div className="transactions-mobile-list">
                    {mobileTransactionGroups.map((group) => (
                      <section key={group.date} className="transactions-mobile-date-group">
                        <div className="transactions-mobile-date-divider">
                          <span>{`-------${group.label}-------`}</span>
                        </div>
                        <div className="transactions-mobile-date-group__rows">
                          {group.transactions.map((transaction) => {
                            const amount = Number(transaction.amount);
                            const categoryLabel = getDisplayTransactionCategoryName(transaction, categories, account?.institution);
                            const isTransferTransaction =
                              transaction.type === "transfer" || normalizeCategoryName(categoryLabel) === "transfers";
                            const amountToneClass = isTransferTransaction ? "neutral" : transaction.type === "income" ? "positive" : "negative";
                            const normalizedName =
                              getEffectiveTransactionMerchantName({
                                merchantClean: transaction.merchantClean,
                                merchantRaw: transaction.merchantRaw,
                                rawPayload: transaction.rawPayload as never,
                              }) ?? "Transaction";

                            return (
                              <article
                                key={transaction.id}
                                className={`transactions-mobile-simple-row${transaction.isExcluded ? " is-muted" : ""}`}
                                tabIndex={0}
                                role="button"
                                aria-label={`${normalizedName}, ${formatDate(transaction.date)}, ${formatAccountAmount(
                                  amount,
                                  transaction.currency ?? account?.currency ?? "PHP"
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
                                  <span className="transactions-mobile-simple-row__category-icon" aria-hidden="true">
                                    <img src={getCategoryIconSrc(categoryLabel)} alt="" aria-hidden="true" />
                                  </span>
                                  <span className="transactions-mobile-simple-row__name-main">{normalizedName}</span>
                                </div>
                                <div className={`transactions-mobile-simple-row__amount-group ${amountToneClass}`}>
                                  <span className="transactions-mobile-simple-row__account-brand" aria-hidden="true">
                                    <AccountBrandMark accountBrand={accountBrand} label={accountCardName} />
                                  </span>
                                  <span className="transactions-mobile-simple-row__amount">
                                    {formatAccountAmount(amount, transaction.currency ?? account?.currency ?? "PHP")}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="transactions-mobile-simple-row__detail transactions-mobile-simple-row__detail--plain"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openTransactionDetail(transaction);
                                  }}
                                  aria-label={`Open details for ${normalizedName}`}
                                >
                                  <ActionIcon name="chevron-right" />
                                </button>
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
              )}
              {bulkDeleteConfirmOpen ? (
                <div className="detail-warning-box accounts-detail__transaction-delete-confirm" style={{ marginTop: 16 }}>
                  <div className="detail-warning-box__header">
                    <span className="detail-warning-box__icon" aria-hidden="true">
                      <ActionIcon name="warning" />
                    </span>
                    <strong>
                      Delete {selectedTransactionIds.length} selected transaction{selectedTransactionIds.length === 1 ? "" : "s"}?
                    </strong>
                  </div>
                  <p>This will remove the selected transactions from this account and from your transactions list.</p>
                  <div className="detail-warning-actions">
                    <button
                      className="button button-secondary button-small"
                      type="button"
                      onClick={() => setBulkDeleteConfirmOpen(false)}
                      disabled={bulkDeleteBusy}
                    >
                      Cancel
                    </button>
                    <button
                      className="button button-danger button-small"
                      type="button"
                      onClick={() => void deleteSelectedTransactions()}
                      disabled={bulkDeleteBusy || selectedTransactionIds.length === 0}
                    >
                      {bulkDeleteBusy ? "Deleting..." : "Yes, delete selected"}
                    </button>
                  </div>
                </div>
              ) : null}
              {hasMoreTransactions ? (
                <div className="accounts-detail__transactions-more">
                  <button className="button button-secondary button-small" type="button" onClick={() => void loadMoreTransactions()} disabled={transactionsLoadingMore}>
                    {transactionsLoadingMore ? "Loading more..." : "Load more transactions"}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <p className="panel-muted">No transactions are linked to this account yet.</p>
          )}
        </div>

        {selectedTransaction ? (
          <div className="modal-backdrop modal-backdrop--transaction-detail" role="presentation" onClick={closeTransactionDetail}>
            <section
              className="modal-card modal-card--wide transaction-drawer transaction-drawer--sidepanel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="account-transaction-detail-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-head transaction-drawer__head">
                <div className="transaction-drawer__head-title">
                  <button
                    className="icon-button transaction-drawer__back-button"
                    type="button"
                    onClick={closeTransactionDetail}
                    aria-label="Back to account details"
                  >
                    ‹
                  </button>
                  <div>
                    <p className="eyebrow">Transaction details</p>
                    <h4 id="account-transaction-detail-title">
                      {detailDraft?.merchantClean?.trim() || selectedTransaction.merchantClean || selectedTransaction.merchantRaw}
                    </h4>
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
                    onChange={(event) => setDetailDraft((current) => (current ? { ...current, merchantClean: event.target.value } : current))}
                    placeholder="Normalized transaction name"
                  />
                </label>

                <label>
                  Date
                  <input
                    type="date"
                    value={detailDraft?.date ?? selectedTransaction.date.slice(0, 10)}
                    onChange={(event) => setDetailDraft((current) => (current ? { ...current, date: event.target.value } : current))}
                  />
                </label>

                <label>
                  Category
                  <div className="transaction-drawer-select">
                    <span className="transaction-drawer-select__icon" aria-hidden="true">
                      <span className="transaction-category-icon transaction-drawer-category-icon" style={getCategoryIconTone(detailSelectedCategory?.name ?? "Other")}>
                        <img src={getCategoryIconSrc(detailSelectedCategory?.name ?? "Other")} alt="" aria-hidden="true" />
                      </span>
                    </span>
                    <select
                      value={detailDraft?.categoryId ?? ""}
                      onChange={(event) => setDetailDraft((current) => (current ? { ...current, categoryId: event.target.value } : current))}
                    >
                      <option value="">Other</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
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
                  <div className="transactions-manual-type-control transaction-drawer-type-control">
                    <span className="transactions-manual-type-symbol" aria-hidden="true">
                      {(detailDraft?.type ?? (selectedTransaction.type === "income" ? "credit" : selectedTransaction.type === "transfer" ? "transfer" : "debit")) === "credit"
                        ? "+"
                        : (detailDraft?.type ?? (selectedTransaction.type === "income" ? "credit" : selectedTransaction.type === "transfer" ? "transfer" : "debit")) === "transfer"
                          ? "↔"
                          : "-"}
                    </span>
                    <select
                      value={detailDraft?.type ?? (selectedTransaction.type === "income" ? "credit" : selectedTransaction.type === "transfer" ? "transfer" : "debit")}
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
                      <option value="transfer">Transfer</option>
                    </select>
                  </div>
                </label>

                <label className="transaction-drawer-form__notes">
                  Notes
                  <textarea
                    value={detailDraft?.description ?? ""}
                    onChange={(event) => setDetailDraft((current) => (current ? { ...current, description: event.target.value } : current))}
                    placeholder="Optional note"
                  />
                </label>

                <label
                  className="transaction-drawer-form__notes"
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
                >
                  <span className="transaction-drawer-field-label" style={{ marginBottom: 0 }}>
                    <span>Exclude from totals</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={detailDraft?.isExcluded ?? selectedTransaction.isExcluded}
                    onChange={(event) => setDetailDraft((current) => (current ? { ...current, isExcluded: event.target.checked } : current))}
                    style={{ width: 16, height: 16, margin: 0, flex: "0 0 auto" }}
                  />
                </label>

                <div className="detail-warning-actions">
                  <button className="button button-secondary button-small" type="button" onClick={closeTransactionDetail} disabled={isSavingTransactionDetail}>
                    Cancel
                  </button>
                  <button className="button button-primary button-small" type="button" onClick={() => void persistDetailDraft()} disabled={isSavingTransactionDetail}>
                    {isSavingTransactionDetail ? "Saving..." : "Save changes"}
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {importSummaries.length > 0 ? (
          <div className="accounts-detail__imports glass" style={{ marginTop: 20 }}>
            <div className="accounts-detail__reconciliation-head">
              <div>
                <p className="eyebrow">Imports</p>
                <h3>Recent import batches</h3>
              </div>
            </div>
            <div className="accounts-detail__imports-list">
              {importSummaries.slice(0, 3).map((summary) => (
                <div key={summary.key} className="accounts-detail__import-row">
                  <div>
                    <strong>{summary.label}</strong>
                    <span>{summary.count} rows · {formatDate(summary.latestDate)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {deleteAction ? (
          <div className="detail-warning-box accounts-detail__delete-confirm" style={{ marginTop: 20 }}>
            <div className="detail-warning-box__header">
              <span className="detail-warning-box__icon" aria-hidden="true">
                <ActionIcon name="warning" />
              </span>
              <strong>
                {deleteAction === "activity"
                  ? account?.type === "investment"
                    ? "Delete this asset history?"
                    : "Delete this account's transactions?"
                  : account?.type === "investment"
                    ? "Delete this asset?"
                    : "Delete this account?"}
              </strong>
            </div>
            {deleteAction === "activity" ? (
              <>
                <p>
                  {account?.type === "investment" ? (
                    <>
                      This will clear the linked activity and holdings for <strong>{account?.name ?? "this asset"}</strong> while keeping the asset itself in Clover.
                    </>
                  ) : (
                    <>
                      This will remove all linked transactions for <strong>{account?.name ?? "this account"}</strong> and reset its running balance.
                    </>
                  )}
                </p>
                <p>
                  {account?.type === "investment"
                    ? "You can add new purchases, dividends, or imports again later."
                    : "You can still add new transactions or re-import this account later if needed."}
                </p>
              </>
            ) : (
              <>
                <p>
                  This will remove <strong>{account?.name ?? "this account"}</strong> from Clover and also delete any linked transactions
                  {account?.type === "investment" ? " and asset history" : ""}.
                </p>
                <p>If you still need it later, you can always add it again or re-import its files.</p>
              </>
            )}
            <div className="detail-warning-actions">
              <button
                className="button button-secondary button-small"
                type="button"
                onClick={() => setDeleteAction(null)}
                disabled={Boolean(deleteBusy)}
              >
                Cancel
              </button>
              <button
                className="button button-danger button-small"
                type="button"
                onClick={() => void (deleteAction === "activity" ? clearAccountActivity() : deleteAccount())}
                disabled={Boolean(deleteBusy)}
              >
                {deleteBusy === "activity"
                  ? account?.type === "investment"
                    ? "Deleting assets..."
                    : "Deleting transactions..."
                  : deleteBusy === "account"
                    ? account?.type === "investment"
                      ? "Deleting asset..."
                      : "Deleting account..."
                    : deleteAction === "activity"
                      ? account?.type === "investment"
                        ? "Yes, delete assets"
                        : "Yes, delete transactions"
                      : account?.type === "investment"
                        ? "Yes, delete asset"
                        : "Yes, delete account"}
              </button>
            </div>
          </div>
        ) : (
          <div className="accounts-detail__footer-actions" style={{ marginTop: 20 }}>
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() => setDeleteAction("activity")}
              disabled={Boolean(deleteBusy)}
            >
              {account?.type === "investment" ? "Delete Assets" : "Delete Transactions"}
            </button>
            <button
              className="button button-danger button-small accounts-drawer__delete"
              type="button"
              onClick={() => setDeleteAction("account")}
              disabled={Boolean(deleteBusy)}
            >
              {account?.type === "investment" ? "Delete Asset" : "Delete Account"}
            </button>
          </div>
        )}
      </section>
    </CloverShell>
  );
}
