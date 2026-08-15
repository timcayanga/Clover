"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { CloverLoadingScreen } from "@/components/clover-loading-screen";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { CategoryBrandMark } from "@/components/category-brand-mark";
import { CurrencySelector } from "@/components/currency-selector";
import { FinancialAccountCard } from "@/components/financial-account-card";
import { MobileSwipeDelete } from "@/components/mobile-swipe-delete";
import { SplitBillTransactionLinkFields } from "@/components/split-bill-transaction-link-fields";
import { formatUploadAccountDisplayName, getAccountCardName, getAccountDisplayName } from "@/lib/account-display";
import { getAccountBrand } from "@/lib/account-brand";
import { getInvestmentAssetBrand } from "@/lib/investment-assets";
import { deriveReconciledBalance, normalizeAccountBalanceSign, type BalanceLikeTransaction } from "@/lib/account-balance";
import { formatCurrencyAmount } from "@/lib/currency-format";
import { extractAccountIdFromPathSegment, getAccountPath } from "@/lib/account-path";
import { buildTransactionQuerySearchParams } from "@/lib/transaction-query";
import { guessCategoryName } from "@/lib/import-parser";
import { getEffectiveTransactionCategoryName, getEffectiveTransactionMerchantName } from "@/lib/transaction-display";
import { coerceTransactionTypeFromCategoryName } from "@/lib/transaction-directions";
import { getTransactionDisplayType } from "@/lib/transaction-display-type";
import { getTransactionReviewReasons } from "@/lib/transaction-review-reasons";
import { getCurrencyCatalogCodes } from "@/lib/currencies";
import { MOBILE_LAYOUT_MEDIA_QUERY } from "@/lib/responsive-layout";
import { createSplitBillFromTransaction, type SplitBillTransactionLinkDraft } from "@/lib/split-bill-transaction-link";
import {
  buildTransactionCategoryUpdatedMessage,
  resolveTransactionCategoryChange,
} from "@/lib/transaction-category-feedback";
import { hasTransactionDetailDraftChanges } from "@/lib/transaction-detail-draft-changes";
import {
  buildTransactionDetailDraft,
  type TransactionDetailDraftValue,
} from "@/lib/transaction-detail-draft";
import { buildTransactionUpdatePayload } from "@/lib/transaction-update-payload";
import {
  createEmptyReceiptLineItem,
  getManualReceiptLineItemTotal,
  getReceiptLineItemComputedAmount,
  parseReceiptLineItemsFromPayload,
  receiptLineItemToDraft,
} from "@/lib/receipt-line-items";
import {
  getTransactionParsedNoteValue,
  getTransactionUserNoteValue,
  normalizeTransactionNoteValue,
} from "@/lib/transaction-notes";
import { fetchJsonOnce } from "@/lib/request-dedupe";
import { clearImportActivity, getCompletedImportActivitySummary, readImportActivity, subscribeImportActivity } from "@/lib/import-activity";
import { subscribeImportedSummary } from "@/lib/imported-summary-events";
import {
  buildFinalizingNoticeDismissalKey,
  dismissFinalizingNotice,
  isFinalizingNoticeDismissed,
} from "@/lib/finalizing-notice-dismissal";
import { readSelectedWorkspaceId } from "@/lib/workspace-selection";
import {
  applyOptimisticWorkspaceTransactionDeletion,
  applyOptimisticWorkspaceTransactionUpsert,
  applyOptimisticWorkspaceAccountDeletion,
  accountsWorkspaceCacheKey,
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
  transactionsWorkspaceCacheKey,
  workspaceCacheUpdatedEventName,
  type WorkspaceCacheUpdatedEventDetail,
  findBestImportedAccountMatch as findBestImportedAccountIdentityMatch,
  mergeImportedWorkspaceTransactions,
  type ImportedWorkspaceTransaction,
} from "@/lib/workspace-cache";
import {
  getInvestmentFieldConfigs,
  canTrackInvestmentDividends,
  canTrackInvestmentPurchaseHistory,
  getInvestmentPurchaseSummaryLabel,
  getInvestmentSubtypeLabel,
  SORTED_INVESTMENT_SUBTYPES,
  type InvestmentSubtype,
  isFixedIncomeInvestmentSubtype,
  isMarketInvestmentSubtype,
} from "@/lib/investments";
import { uploadSummaryMatchesImportedAccount } from "@/lib/imported-account-ui";
import {
  ACCOUNT_TYPE_SECTIONS,
  formatAccountTypeLabel,
  isLiabilityAccountType,
  isSupportedAccountType,
  type SupportedAccountType,
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
  type: SupportedAccountType;
  currency: string;
  source: string;
  balance: string | null;
  creditLimit?: string | null;
  creditLimitSource?: string | null;
  creditLimitUpdatedAt?: string | null;
  creditPeriodStart?: string | null;
  creditPeriodEnd?: string | null;
  transactionCount?: number | null;
  favorite?: boolean;
  updatedAt: string;
  createdAt: string;
};

type Transaction = {
  id: string;
  workspaceId?: string;
  accountId: string;
  accountName?: string | null;
  categoryId: string | null;
  amount: string;
  currency?: string | null;
  type: "income" | "expense" | "transfer";
  date: string;
  merchantRaw: string;
  merchantClean: string | null;
  categoryName: string | null;
  reviewStatus?: "pending_review" | "suggested" | "confirmed" | "edited" | "rejected" | "duplicate_skipped" | null;
  parserConfidence?: number | null;
  categoryConfidence?: number | null;
  accountMatchConfidence?: number | null;
  duplicateConfidence?: number | null;
  transferConfidence?: number | null;
  description: string | null;
  isExcluded: boolean;
  isTransfer?: boolean;
  institution?: string | null;
  accountNumber?: string | null;
  source?: string | null;
  importFileId?: string | null;
  warningReason?: string | null;
  splitBill?: { id: string; title: string } | null;
  rawPayload?: unknown;
  normalizedPayload?: unknown;
};

const accountNumbersMayMatch = (left?: string | null, right?: string | null, requireExactMatch = false) => {
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

  const leftLastFour = leftDigits.slice(-4);
  const rightLastFour = rightDigits.slice(-4);
  return leftLastFour.length === 4 && rightLastFour.length === 4 && leftLastFour === rightLastFour;
};

const uploadSummaryMatchesAccount = (
  summary: NonNullable<ReturnType<typeof getCompletedImportActivitySummary>>,
  account: Account
) => {
  return uploadSummaryMatchesImportedAccount(summary, account);
};

const buildImportedSummaryDedupKey = (
  summary: NonNullable<ReturnType<typeof getCompletedImportActivitySummary>>
) => {
  const previewCount = Array.isArray(summary.previewTransactions) ? summary.previewTransactions.length : 0;
  const previewIds = Array.isArray(summary.previewTransactions)
    ? summary.previewTransactions
        .map((transaction) => transaction.id)
        .filter((value) => typeof value === "string" && value.trim().length > 0)
        .slice(0, 5)
        .join("|")
    : "";

  return [
    summary.fileName,
    summary.accountId ?? "",
    summary.optimisticAccountId ?? "",
    String(summary.rowsImported ?? 0),
    String(previewCount),
    previewIds,
  ].join("::");
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

type TransactionDetailDraft = TransactionDetailDraftValue;

type ReceiptLineItemDraft = {
  description: string;
  quantity: string;
  currency: string;
  unitPrice: string;
  amount: string;
};

type ReceiptLineItem = {
  description: string;
  quantity?: string | null;
  currency?: string | null;
  unitPrice?: string | null;
  amount?: string | null;
};

type TransactionReviewChip = {
  label: string;
  tone: "clear" | "warn" | "danger" | "neutral";
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

const normalizeCategoryName = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";
const ENRICHMENT_JOB_ACTIVE_STALE_MS = 10 * 60 * 1000;

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

const getEnrichmentNoticeState = (importFiles: ImportFile[]) => {
  const activeJobs = importFiles.filter(isActiveEnrichmentJob);
  if (activeJobs.length === 0) {
    const failedJobs = importFiles.filter(isFailedEnrichmentJob);
    return {
      label: failedJobs.length > 0 ? "Review needed" : "Review suggested",
      detail: failedJobs.length > 0 ? "couldn't finalize automatically; please review" : "some details may need a quick look",
      needsReview: true,
    };
  }

  const remainingRows = activeJobs.reduce((total, importFile) => {
      const totalRows = Number(importFile.enrichmentJob?.totalRows ?? 0);
      const processedRows = Number(importFile.enrichmentJob?.processedRows ?? 0);
      return total + Math.max(0, totalRows - processedRows);
    }, 0);
  if (remainingRows <= 0) {
    return {
      label: "Enriching data",
      detail: "finishing now",
      needsReview: false,
    };
  }

  return {
    label: "Enriching data",
    detail: "cleaning up names and categories",
    needsReview: false,
  };
};

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
    creditLimit?: number | string | null;
    paymentDueDate?: string | null;
    totalAmountDue?: number | string | null;
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

const formatDateInputValue = (value: Date | string | null | undefined) => {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getNextMonthlyDate = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const next = new Date(parsed);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  while (next.getTime() < today.getTime()) {
    const targetDay = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    next.setDate(Math.min(targetDay, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  }

  return next;
};

const parseAmount = (value: string | null | undefined) => Number(value ?? 0);

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

const parseBalanceInput = (value: string) => {
  const normalized = value.replace(/[₱,\s]/g, "").trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
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
const formatTransactionAmount = (value: number, currency?: string | null) => formatCurrencyAmount(value, currency ?? "PHP");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getRawPayloadTextCandidate = (rawPayload: unknown, keys: string[]) => {
  if (!isRecord(rawPayload)) {
    return "";
  }

  for (const key of keys) {
    const candidate = rawPayload[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
};

const getTransactionUserNote = (
  transaction:
    | Pick<Transaction, "description" | "source" | "importFileId" | "normalizedPayload">
    | null
    | undefined
) =>
  getTransactionUserNoteValue({
    normalizedPayload: transaction?.normalizedPayload,
    description: transaction?.description,
    source: transaction?.source,
    importFileId: transaction?.importFileId,
  });

const getTransactionParsedNote = (
  transaction:
    | Pick<Transaction, "rawPayload" | "normalizedPayload" | "description" | "merchantRaw" | "merchantClean" | "source" | "importFileId">
    | null
    | undefined
) =>
  getTransactionParsedNoteValue({
    rawPayload: transaction?.rawPayload,
    normalizedPayload: transaction?.normalizedPayload,
    description: transaction?.description,
    merchantRaw: transaction?.merchantRaw,
    merchantClean: transaction?.merchantClean,
    source: transaction?.source,
    importFileId: transaction?.importFileId,
  });

const normalizeConfidenceScore = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const score = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(score)));
};

const getConfidenceLabel = (value: number) => {
  if (value >= 85) {
    return "High";
  }

  if (value >= 65) {
    return "Medium";
  }

  return "Needs review";
};

const getTransactionConfidenceScore = (transaction: Transaction, warningReason: string | null) => {
  const confidenceSignals = [
    normalizeConfidenceScore(transaction.parserConfidence),
    normalizeConfidenceScore(transaction.categoryConfidence),
    normalizeConfidenceScore(transaction.accountMatchConfidence),
    transaction.type === "transfer" ? normalizeConfidenceScore(transaction.transferConfidence) : null,
  ].filter((value): value is number => typeof value === "number");

  if (confidenceSignals.length > 0) {
    return Math.round(confidenceSignals.reduce((sum, value) => sum + value, 0) / confidenceSignals.length);
  }

  const sourceBoost = transaction.source === "manual" ? 6 : transaction.source === "upload" ? 0 : -4;
  const hasWarning = Boolean(warningReason);
  const isDuplicateWarning = warningReason === "Review similar transaction";
  const values = [
    Math.max(40, Math.min(98, (transaction.merchantClean?.trim() ? 88 : 74) + sourceBoost + (transaction.merchantRaw.trim() ? 4 : -10))),
    Math.max(40, Math.min(98, (transaction.accountId ? 92 : 58) + sourceBoost + (transaction.accountName ? 2 : -6))),
    Math.max(20, Math.min(98, (!transaction.categoryId ? 28 : 86) + sourceBoost + (isDuplicateWarning ? -8 : 0) + (hasWarning ? -4 : 0))),
  ];
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
};

const getTransactionReviewChips = (transaction: Transaction, warningReason: string | null): TransactionReviewChip[] => {
  const confidenceScore = getTransactionConfidenceScore(transaction, warningReason);
  const reviewReasons = getTransactionReviewReasons(transaction);
  const chips: TransactionReviewChip[] = [];

  if (confidenceScore >= 85 && reviewReasons.length === 0) {
    chips.push({ label: "High confidence", tone: "clear" });
  }

  for (const reason of reviewReasons) {
    chips.push({
      label: reason,
      tone:
        reason === "Review similar transaction"
          ? "danger"
          : reason === "Ignored from totals" || reason === "Could not identify merchant"
            ? "neutral"
            : "warn",
    });
  }

  if (chips.length === 0) {
    chips.push({ label: getConfidenceLabel(confidenceScore), tone: confidenceScore >= 85 ? "clear" : "neutral" });
  }

  return chips;
};

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

const createDetailDraft = (
  transaction: Transaction,
  options: { categoryId?: string | null; type?: Transaction["type"] } = {}
): TransactionDetailDraft => {
  const categoryName =
    getEffectiveTransactionCategoryName({
      categoryName: transaction.categoryName ?? null,
      rawPayload: transaction.rawPayload as never,
      merchantRaw: transaction.merchantRaw,
      merchantClean: transaction.merchantClean,
      source: transaction.source ?? null,
      type: transaction.type,
    }) ?? transaction.categoryName ?? null;
  const effectiveType =
    options.type ??
    coerceTransactionTypeFromCategoryName(
      categoryName,
      transaction.type,
      transaction.amount,
      transaction.isTransfer
    );

  return buildTransactionDetailDraft(transaction, {
    merchantClean:
      getEffectiveTransactionMerchantName({
        merchantClean: transaction.merchantClean,
        merchantRaw: transaction.merchantRaw,
        rawPayload: transaction.rawPayload as never,
      }) ?? transaction.merchantRaw,
    effectiveType,
    categoryId: options.categoryId,
    currencyFallback: "PHP",
  });
};

const getDisplayTransactionCategoryName = (
  transaction: Transaction,
  categories: Category[],
  institution?: string | null
) => {
  const categoryById =
    transaction.categoryId && transaction.categoryId.trim()
      ? categories.find((category) => category.id === transaction.categoryId)?.name ?? null
      : null;
  const categoryName = getEffectiveTransactionCategoryName({
    categoryName: categoryById ?? transaction.categoryName,
    rawPayload: transaction.rawPayload as never,
    merchantRaw: transaction.merchantRaw,
    merchantClean: transaction.merchantClean,
    description: transaction.description ?? null,
    institution,
    source: transaction.source ?? null,
    type: transaction.type,
  });
  const effectiveType = coerceTransactionTypeFromCategoryName(
    categoryName,
    transaction.type,
    transaction.amount,
    transaction.isTransfer
  );
  return (
    categoryName ??
    guessCategoryName(
      getEffectiveTransactionMerchantName({
        merchantClean: transaction.merchantClean,
        merchantRaw: transaction.merchantRaw,
        institution,
      }) || transaction.description || transaction.merchantRaw,
      effectiveType
    ) ??
    "Other"
  );
};

const getCategoryIdByName = (categories: Category[], categoryName: string) =>
  categories.find((category) => category.name.trim().toLowerCase() === categoryName.trim().toLowerCase())?.id ?? "";

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
  const [accountTypeEditorOpen, setAccountTypeEditorOpen] = useState(false);
  const [accountTypeSaveState, setAccountTypeSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [balanceEditorOpen, setBalanceEditorOpen] = useState(false);
  const [balanceAdjustmentOpen, setBalanceAdjustmentOpen] = useState(false);
  const [balanceAdjustmentMode, setBalanceAdjustmentMode] = useState<"add" | "remove">("add");
  const [balanceAdjustmentAmount, setBalanceAdjustmentAmount] = useState("");
  const [balanceAdjustmentSaving, setBalanceAdjustmentSaving] = useState(false);
  const [balanceAdjustmentError, setBalanceAdjustmentError] = useState<string | null>(null);
  const [balanceDraft, setBalanceDraft] = useState("");
  const [balanceSaveState, setBalanceSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [creditLimitDraft, setCreditLimitDraft] = useState("");
  const [creditLimitSaveState, setCreditLimitSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const stableBalanceRef = useRef<string | null>(null);
  const balanceInputRef = useRef<HTMLInputElement | null>(null);
  const accountInvestmentDraftSyncKeyRef = useRef<string | null>(null);
  const creditSettingsBaselineRef = useRef("");
  const creditSettingsAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [workspaceAccounts, setWorkspaceAccounts] = useState<Account[]>([]);
  const [mergeDirection, setMergeDirection] = useState<"into_other" | "into_current" | null>(null);
  const [mergeAccountId, setMergeAccountId] = useState("");
  const [mergeBusy, setMergeBusy] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [detailDraft, setDetailDraft] = useState<TransactionDetailDraft | null>(null);
  const [isSavingTransactionDetail, setIsSavingTransactionDetail] = useState(false);
  const [transactionDeleteConfirmOpen, setTransactionDeleteConfirmOpen] = useState(false);
  const [transactionSplitBillOpen, setTransactionSplitBillOpen] = useState(false);
  const [transactionSplitBillDraft, setTransactionSplitBillDraft] = useState<SplitBillTransactionLinkDraft>({
    groupId: "",
    participantNames: [],
  });
  const [transactionSplitBillSaving, setTransactionSplitBillSaving] = useState(false);
  const [transactionSplitBillError, setTransactionSplitBillError] = useState<string | null>(null);
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
  const [cacheRefreshTick, setCacheRefreshTick] = useState(0);
  const [importActivitySnapshot, setImportActivitySnapshot] = useState(() => readImportActivity());
  const handledImportedSummaryKeysRef = useRef(new Set<string>());
  const loadedAccountIdRef = useRef<string | null>(null);
  const selectAllTransactionsRef = useRef<HTMLInputElement | null>(null);
  const currencyCatalogCodes = useMemo(() => getCurrencyCatalogCodes(), []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(MOBILE_LAYOUT_MEDIA_QUERY);
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
    setImportActivitySnapshot(readImportActivity());
    return subscribeImportActivity(() => {
      setImportActivitySnapshot(readImportActivity());
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const shouldReactToCacheKey = (key: string | null) =>
      key === accountsWorkspaceCacheKey ||
      key === transactionsWorkspaceCacheKey ||
      key === "clover.selected-workspace-id.v1";

    const triggerRefresh = () => {
      setCacheRefreshTick((current) => current + 1);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) {
        return;
      }

      if (!shouldReactToCacheKey(event.key)) {
        return;
      }

      triggerRefresh();
    };

    const handleWorkspaceCacheUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<WorkspaceCacheUpdatedEventDetail>;
      if (!shouldReactToCacheKey(customEvent.detail?.key ?? null)) {
        return;
      }

      triggerRefresh();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(workspaceCacheUpdatedEventName, handleWorkspaceCacheUpdated as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(workspaceCacheUpdatedEventName, handleWorkspaceCacheUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    return subscribeImportedSummary(({ workspaceId, summary }) => {
      if (!account || workspaceId !== account.workspaceId || !uploadSummaryMatchesAccount(summary, account)) {
        return;
      }

      const summaryKey = buildImportedSummaryDedupKey(summary);
      if (handledImportedSummaryKeysRef.current.has(summaryKey)) {
        return;
      }

      handledImportedSummaryKeysRef.current.add(summaryKey);
      if (handledImportedSummaryKeysRef.current.size > 40) {
        const [oldestKey] = handledImportedSummaryKeysRef.current;
        if (oldestKey) {
          handledImportedSummaryKeysRef.current.delete(oldestKey);
        }
      }

      const previewTransactions = summary.previewTransactions ?? [];
      if (previewTransactions.length === 0) {
        return;
      }

      setTransactions((current) =>
        mergeImportedWorkspaceTransactions(current, previewTransactions as ImportedWorkspaceTransaction[])
      );
      setTransactionTotalCount((current) =>
        Math.max(current, Number(summary.rowsImported ?? 0) || previewTransactions.length)
      );
      setTransactionsLoading(false);
      setHasInitialDataLoaded(true);
    });
  }, [account]);

  useEffect(() => {
    if (!account?.workspaceId) {
      setWorkspaceAccounts([]);
      return;
    }

    let cancelled = false;

    const loadWorkspaceAccounts = async () => {
      const cachedWorkspaceAccounts = getCachedAccountsWorkspace(account.workspaceId)?.accounts;
      if (!cancelled && Array.isArray(cachedWorkspaceAccounts)) {
        setWorkspaceAccounts(cachedWorkspaceAccounts as Account[]);
      }

      try {
        const response = await fetchJsonOnce<{ accounts?: Account[] }>({
          key: `account-detail:workspace-accounts:${account.workspaceId}`,
          route: "account-detail.workspace-accounts",
          workspaceId: account.workspaceId,
          detail: "background",
          input: `/api/accounts?workspaceId=${encodeURIComponent(account.workspaceId)}`,
        });

        if (!response.ok || cancelled) {
          return;
        }

        setWorkspaceAccounts(Array.isArray(response.json?.accounts) ? (response.json.accounts as Account[]) : []);
      } catch {
        if (!cancelled && !Array.isArray(cachedWorkspaceAccounts)) {
          setWorkspaceAccounts([]);
        }
      }
    };

    void loadWorkspaceAccounts();

    return () => {
      cancelled = true;
    };
  }, [account?.workspaceId]);

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
      const cachedAccountLookup = findCachedImportedAccount(accountId, activeWorkspaceId);
      const cachedImportedAccount = cachedAccountLookup?.account as
        | {
            optimisticAccountId?: string | null;
            name?: string | null;
            institution?: string | null;
            accountNumber?: string | null;
            type?: string | null;
            currency?: string | null;
          }
        | null
        | undefined;
      const cachedTransactionsForAccount = findCachedTransactionsForAccount(accountId, {
        workspaceId: activeWorkspaceId,
        optimisticAccountId: cachedImportedAccount?.optimisticAccountId ?? null,
        name: cachedImportedAccount?.name ?? null,
        institution: cachedImportedAccount?.institution ?? null,
        accountNumber: cachedImportedAccount?.accountNumber ?? null,
        type: cachedImportedAccount?.type ?? null,
        currency: cachedImportedAccount?.currency ?? null,
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
              normalizeImportedAccountKey(entry.name, entry.institution, entry.accountNumber, entry.type, entry.currency) ===
              normalizeImportedAccountKey(
                cachedImportedAccount?.name ?? null,
                cachedImportedAccount?.institution ?? null,
                cachedImportedAccount?.accountNumber ?? null,
                cachedImportedAccount?.type ?? null,
                cachedImportedAccount?.currency ?? null
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
      const pendingImportStatuses = new Set(["processing", "queued", "staged", "pending"]);
      const hasPendingImportSettlement = () =>
        Array.isArray(cachedTransactionsWorkspace?.imports) &&
        (cachedTransactionsWorkspace.imports as ImportFile[]).some((importFile) => {
          const status = String(importFile.status ?? "").trim().toLowerCase();
          if (!pendingImportStatuses.has(status)) {
            return false;
          }

          const importAccountId = typeof importFile.accountId === "string" ? importFile.accountId.trim() : "";
          if (!importAccountId) {
            return false;
          }

          return (
            importAccountId === accountId ||
            importAccountId === (cachedImportedAccount?.optimisticAccountId ?? "") ||
            importAccountId === (cachedTransactionWorkspaceAccount?.id ?? "")
          );
        });
      const resolvePersistedImportedAccount = async (baseAccount: Account) => {
        const findReplacementInSnapshot = (snapshot?: { accounts?: unknown[] } | null) => {
          const accounts = Array.isArray(snapshot?.accounts) ? (snapshot.accounts as Account[]) : [];
          return (
            findBestImportedAccountIdentityMatch(
              accounts.filter((entry) => entry?.id && entry.id !== accountId && !entry.id.startsWith("optimistic-")),
              baseAccount
            ) ?? null
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

        const importStillSettling = hasPendingImportSettlement();
        const shouldResolveCompletedUploadAccount =
          baseAccount.source === "upload" || baseAccount.id.startsWith("optimistic-") || accountId.startsWith("optimistic-");
        if (!importStillSettling && !shouldResolveCompletedUploadAccount) {
          return null;
        }

        const retryDelays = importStillSettling ? [900, 1800, 3000] : [0];
        for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
          try {
            const response = await fetchJsonOnce<{ accounts?: Account[] }>({
              key: `account-detail:accounts:${baseAccount.workspaceId}`,
              route: "account-detail.accounts",
              workspaceId: baseAccount.workspaceId,
              detail: importStillSettling ? "import-settlement" : "completed-upload-resolution",
              input: `/api/accounts?workspaceId=${encodeURIComponent(baseAccount.workspaceId)}`,
            });
            if (response.ok) {
              const fetchedAccounts = Array.isArray(response.json?.accounts) ? response.json.accounts : [];
              const replacement = findBestImportedAccountIdentityMatch(
                fetchedAccounts.filter((entry) => entry?.id && entry.id !== accountId && !entry.id.startsWith("optimistic-")),
                baseAccount
              );

              if (replacement) {
                return replacement;
              }
            }
          } catch {
            // Keep polling briefly; upload-backed accounts can settle a moment later.
          }

          if (retryDelays[attempt] > 0) {
            await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
          }
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

      const activeCachedAccount = cachedAccount;
      if (activeCachedAccount) {
        if (!cancelled) {
          accountTransactionsLookup = findCachedTransactionsForAccount(activeCachedAccount.id, activeCachedAccount);
          cachedTransactions = (accountTransactionsLookup?.transactions as Transaction[] | undefined) ?? [];
          if (cachedTransactions.length === 0 && Array.isArray(cachedTransactionsWorkspace?.transactions)) {
            cachedTransactions = mergeImportedWorkspaceTransactions(
              [],
              (cachedTransactionsWorkspace.transactions as ImportedWorkspaceTransaction[]).filter(
                (transaction) => transaction.accountId === activeCachedAccount.id
              )
            );
          }
          cachedImportFiles = Array.isArray(cachedTransactionsWorkspace?.imports)
            ? (cachedTransactionsWorkspace.imports as ImportFile[]).filter((importFile) => {
                return !importFile.accountId || importFile.accountId === activeCachedAccount.id;
              })
            : [];
          cachedCheckpoints = Array.isArray(cachedAccountsWorkspace?.statementCheckpoints)
            ? (cachedAccountsWorkspace.statementCheckpoints as StatementCheckpoint[]).filter(
                (checkpoint) => checkpoint.accountId === activeCachedAccount.id
              )
            : [];
          setAccount(activeCachedAccount);
          setTransactions(cachedTransactions);
          setImportFiles(cachedImportFiles);
          setCategories(cachedCategories);
          setTransactionPage(1);
          setTransactionTotalCount(accountTransactionsLookup?.totalCount ?? cachedTransactions.length);
          setTransactionsError(null);
          setTransactionsLoading(cachedTransactions.length === 0);
          setMessage("");
          setHasInitialDataLoaded(true);
          setCheckpoints(cachedCheckpoints);
        }
        const canonicalPath = getAccountPath(activeCachedAccount);
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
        if (!cachedAccount && accountId.startsWith("optimistic-")) {
          if (!cancelled) {
            setTransactions([]);
            setTransactionTotalCount(0);
            setTransactionsError(null);
            setTransactionsLoading(false);
            setMessage("Clover is still linking this imported account. You can keep using Clover while the details page gets ready.");
            setHasInitialDataLoaded(true);
          }
          return;
        }

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
                  typeof nextAccount.balance === "string" && nextAccount.balance.trim()
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

        const resolvedCachedTransactionsLookup = findCachedTransactionsForAccount(mergedAccount.id, mergedAccount);
        const resolvedCachedTransactions = (resolvedCachedTransactionsLookup?.transactions as Transaction[] | undefined) ?? [];
        if (!cancelled && resolvedCachedTransactions.length > 0 && transactions.length === 0) {
          const mergedCachedTransactions = mergeImportedWorkspaceTransactions([], resolvedCachedTransactions);
          setTransactions(mergedCachedTransactions);
          setTransactionTotalCount(
            resolvedCachedTransactionsLookup?.totalCount ?? mergedCachedTransactions.length
          );
          setTransactionsError(null);
          setTransactionsLoading(false);
        }

        const canonicalPath = getAccountPath(mergedAccount);
        if (!cancelled && canonicalPath !== `/accounts/${accountPathSegment}`) {
          router.replace(canonicalPath);
        }

        const transactionsSearchParams = new URLSearchParams({
          page: "1",
          pageSize: String(TRANSACTION_PAGE_SIZE),
        });
        if (!cancelled && resolvedCachedTransactions.length === 0) {
          setTransactionsLoading(true);
        }
        const transactionsController = new AbortController();
        const transactionsTimeout = window.setTimeout(() => {
          transactionsController.abort();
        }, 6500);
        const transactionsPromise = fetch(
          `/api/accounts/${encodeURIComponent(mergedAccount.id)}/transactions?${transactionsSearchParams.toString()}`,
          { signal: transactionsController.signal }
        );

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
                  ? mergeImportedWorkspaceTransactions([], nextTransactions)
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
          })
          .finally(() => {
            window.clearTimeout(transactionsTimeout);
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
  }, [accountId, cacheRefreshTick]);

  const accountCheckpointKey = useMemo(
    () => normalizeImportedAccountKey(account?.name, account?.institution, account?.accountNumber, account?.type, account?.currency),
    [account?.accountNumber, account?.currency, account?.institution, account?.name, account?.type]
  );

  const latestCheckpoint = useMemo(() => {
    if (checkpoints.length === 0) {
      return null;
    }

    const matchingCheckpoints = checkpoints.filter((checkpoint) => {
      if (checkpoint.accountId === accountId) {
        return true;
      }

      const sourceMetadata =
        checkpoint.sourceMetadata &&
        typeof checkpoint.sourceMetadata === "object" &&
        !Array.isArray(checkpoint.sourceMetadata)
          ? (checkpoint.sourceMetadata as Record<string, unknown>)
          : null;
      const checkpointKey = normalizeImportedAccountKey(
        typeof sourceMetadata?.accountName === "string" ? sourceMetadata.accountName : null,
        typeof sourceMetadata?.institution === "string" ? sourceMetadata.institution : null,
        typeof sourceMetadata?.accountNumber === "string" ? sourceMetadata.accountNumber : null,
        typeof sourceMetadata?.accountType === "string" ? sourceMetadata.accountType : null,
        typeof sourceMetadata?.currency === "string"
          ? sourceMetadata.currency
          : typeof sourceMetadata?.accountCurrency === "string"
            ? sourceMetadata.accountCurrency
            : null
      );
      const checkpointNumber =
        typeof sourceMetadata?.accountNumber === "string" ? sourceMetadata.accountNumber : null;
      const checkpointBankHint =
        typeof sourceMetadata?.uploadBankHint === "string" ? sourceMetadata.uploadBankHint : null;
      const checkpointInstitution =
        typeof sourceMetadata?.institution === "string" ? sourceMetadata.institution : null;
      return (
        checkpointKey === accountCheckpointKey ||
        accountNumbersMayMatch(account?.accountNumber ?? null, checkpointNumber) ||
        (Boolean(checkpointInstitution || checkpointBankHint) && accountNumbersMayMatch(account?.accountNumber ?? null, checkpointNumber))
      );
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
    () =>
      account
        ? (findCachedImportedAccount(account.id, account.workspaceId ?? readSelectedWorkspaceId())?.account as Account | null) ?? null
        : null,
    [account]
  );
  const cachedImportedBalance = typeof cachedImportedAccount?.balance === "string" ? cachedImportedAccount.balance.trim() : "";

  const accountBrand = useMemo(
    () => {
      const displayAccountName =
        account?.source === "upload"
          ? formatUploadAccountDisplayName(
              account?.name ?? "",
              account?.institution ?? null,
              account?.accountNumber ?? null,
              account?.type ?? null
            )
          : account?.name ?? null;

      if (account?.type === "investment") {
        return getInvestmentAssetBrand({
          symbol: account.investmentSymbol,
          name: displayAccountName ?? account.name,
          subtype: account.investmentSubtype,
          currency: account.currency,
          institution: account.institution,
        });
      }

      return getAccountBrand({
        institution: account?.institution ?? null,
        name: displayAccountName,
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
        checkpoint?.status !== "mismatch" &&
        checkpoint?.endingBalance !== null && checkpoint?.endingBalance !== undefined
          ? String(checkpoint.endingBalance)
          : null;
      const shouldPreserveImportedBalance =
        account?.source === "upload" && checkpointBalance === null;

      const reconciledValue =
        checkpointBalance ??
        (shouldPreserveImportedBalance
          ? account?.balance ?? cachedImportedBalance ?? null
          : deriveReconciledBalance({
              balance: account?.balance ?? cachedImportedBalance ?? null,
              transactions: transactions as BalanceLikeTransaction[],
              checkpoints: checkpoint ? [checkpoint] : [],
              treatStoredBalanceAsOpening: account?.source === "manual",
            }));

      return normalizeAccountBalanceSign(account?.type ?? "", parseAmount(reconciledValue));
    },
    [account?.balance, account?.source, account?.type, cachedImportedBalance, latestCheckpoint, transactions]
  );
  const checkpointBalance =
    latestCheckpoint?.status !== "mismatch" &&
    latestCheckpoint?.endingBalance !== null && latestCheckpoint?.endingBalance !== undefined
    ? String(latestCheckpoint.endingBalance)
    : null;
  const matchingImportSummary =
    getCompletedImportActivitySummary(importActivitySnapshot) ?? null;
  const matchingImportSummaryHasRows =
    account &&
    matchingImportSummary &&
    Number(matchingImportSummary.rowsImported ?? 0) > 0 &&
    uploadSummaryMatchesAccount(matchingImportSummary, account);
  const matchingImportSummaryPreviewTransactions = useMemo(
    () => matchingImportSummary?.previewTransactions ?? [],
    [matchingImportSummary]
  );
  const hasLoadedTransactions = account
    ? Number(account.transactionCount ?? 0) > 0 ||
      transactions.some((transaction) => {
        if (transaction.accountId === account.id) {
          return true;
        }

        return (
          normalizeImportedAccountKey(
            transaction.accountName,
            transaction.institution,
            transaction.accountNumber,
            account.type,
            transaction.currency
          ) ===
          normalizeImportedAccountKey(account.name, account.institution, account.accountNumber, account.type, account.currency)
        );
      }) ||
      transactionTotalCount > 0 ||
      (typeof latestCheckpoint?.rowCount === "number" && latestCheckpoint.rowCount > 0) ||
      Boolean(matchingImportSummaryHasRows)
    : false;
  const accountCardNumber = account
    ? formatCardAccountNumber(account.accountNumber ?? latestCheckpoint?.sourceMetadata?.accountNumber ?? null)
    : "";
  const latestCheckpointMetadata = latestCheckpoint?.sourceMetadata as Record<string, unknown> | null | undefined;
  const relatedTransactionInstitution =
    transactions.find((transaction) => {
      if (transaction.accountId === account?.id) {
        return typeof transaction.institution === "string" && transaction.institution.trim().length > 0;
      }

      return (
        account !== null &&
        normalizeImportedAccountKey(
          transaction.accountName,
          transaction.institution,
          transaction.accountNumber,
          account.type,
          transaction.currency
        ) ===
          normalizeImportedAccountKey(account.name, account.institution, account.accountNumber, account.type, account.currency) &&
        typeof transaction.institution === "string" &&
        transaction.institution.trim().length > 0
      );
    })?.institution?.trim() ?? null;
  const checkpointInstitution =
    typeof latestCheckpointMetadata?.institution === "string"
      ? latestCheckpointMetadata.institution
      : typeof latestCheckpointMetadata?.uploadBankHint === "string"
        ? latestCheckpointMetadata.uploadBankHint
        : null;
  const resolvedBankLabel = checkpointInstitution ?? relatedTransactionInstitution ?? account?.institution ?? null;
  const checkpointAccountName =
    typeof latestCheckpointMetadata?.accountName === "string" ? latestCheckpointMetadata.accountName : null;
  const accountCardName = account
    ? resolvedBankLabel
      ? formatUploadAccountDisplayName(
          checkpointAccountName ?? account.name,
          resolvedBankLabel,
          account.accountNumber ?? latestCheckpoint?.sourceMetadata?.accountNumber ?? null,
          account.type
        )
      : account.source === "upload" && !(account.accountNumber ?? latestCheckpoint?.sourceMetadata?.accountNumber)
      ? formatUploadAccountDisplayName(
          accountEditDraft.name || account.name,
          account.institution,
          null,
          account.type
        )
      : getAccountCardName({
          name: account.type === "investment" ? accountEditDraft.name || account.name : accountEditDraft.name || account.name,
          institution: account.institution ?? resolvedBankLabel,
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
    account?.type !== "investment" &&
    !hasVisibleBalance &&
    !hasMeaningfulBalance(checkpointBalance) &&
    !hasLoadedTransactions;
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
      : !(typeof account?.balance === "string" && account.balance.trim()) && stableDisplayBalance
        ? stableDisplayBalance
        : currentBalance.toString();
  const isCreditAccount = account?.type === "credit_card" || account?.type === "line_of_credit";
  const canAdjustBalanceSimply = account ? ["cash", "bank", "wallet"].includes(account.type) : false;
  const balanceAdjustmentIsCash = account?.type === "cash";
  const balanceAdjustmentLabel = balanceAdjustmentIsCash ? "Adjust cash" : "Adjust balance";
  const importedCreditLimit = parseNullableNumber(
    latestCheckpoint?.sourceMetadata?.creditLimit === null || latestCheckpoint?.sourceMetadata?.creditLimit === undefined
      ? null
      : String(latestCheckpoint.sourceMetadata.creditLimit)
  );
  const accountCreditLimit = parseNullableNumber(account?.creditLimit);
  const effectiveCreditLimit = accountCreditLimit ?? importedCreditLimit;
  const creditLimitSourceLabel =
    account?.creditLimitSource === "manual"
      ? "Set manually"
      : accountCreditLimit !== null
        ? "Saved on account"
        : importedCreditLimit !== null
          ? "Read from latest statement"
          : null;
  const statementPaymentDueDate = latestCheckpoint?.sourceMetadata?.paymentDueDate ?? null;
  const nextPaymentDueDate = getNextMonthlyDate(statementPaymentDueDate);
  const paymentDueDateWasProjected = Boolean(
    statementPaymentDueDate && nextPaymentDueDate && nextPaymentDueDate.getTime() !== new Date(statementPaymentDueDate).getTime()
  );
  const accountCardBalance = isLiabilityAccountType(account?.type)
    ? Math.abs(parseAmount(displayBalance))
    : parseAmount(displayBalance);

  useEffect(() => {
    if (!account || !matchingImportSummaryHasRows || matchingImportSummaryPreviewTransactions.length === 0) {
      return;
    }

    handledImportedSummaryKeysRef.current.add(buildImportedSummaryDedupKey(matchingImportSummary));
    setTransactions((current) =>
      mergeImportedWorkspaceTransactions(current, matchingImportSummaryPreviewTransactions as ImportedWorkspaceTransaction[])
    );
    setTransactionTotalCount((current) => Math.max(current, Number(matchingImportSummary?.rowsImported ?? 0) || matchingImportSummaryPreviewTransactions.length));
    setTransactionsLoading(false);
    setHasInitialDataLoaded(true);
  }, [account, matchingImportSummary, matchingImportSummaryHasRows, matchingImportSummaryPreviewTransactions]);

  useEffect(() => {
    if (!account || balanceEditorOpen) {
      return;
    }

    const nextDraft = Math.abs(parseAmount(displayBalance)).toFixed(2);
    setBalanceDraft(nextDraft);
    setBalanceSaveState("idle");
  }, [account, balanceEditorOpen, displayBalance]);

  useEffect(() => {
    if (!account || !isCreditAccount) {
      setCreditLimitDraft("");
      setCreditLimitSaveState("idle");
      creditSettingsBaselineRef.current = "";
      return;
    }

    const nextLimitDraft = effectiveCreditLimit === null ? "" : effectiveCreditLimit.toFixed(2);
    const nextSignature = nextLimitDraft;

    setCreditLimitDraft(nextLimitDraft);
    setCreditLimitSaveState("idle");
    creditSettingsBaselineRef.current = nextSignature;
  }, [
    account,
    effectiveCreditLimit,
    isCreditAccount,
  ]);

  useEffect(() => {
    if (!balanceEditorOpen) {
      return;
    }

    balanceInputRef.current?.focus();
    balanceInputRef.current?.select();
  }, [balanceEditorOpen]);

  const openBalanceEditor = () => {
    if (!account || isPendingBalance) {
      return;
    }

    setBalanceDraft(Math.abs(parseAmount(displayBalance)).toFixed(2));
    setBalanceSaveState("idle");
    setBalanceEditorOpen(true);
  };

  const openBalanceAdjustment = () => {
    if (!canAdjustBalanceSimply) {
      return;
    }

    setBalanceAdjustmentMode("add");
    setBalanceAdjustmentAmount("");
    setBalanceAdjustmentError(null);
    setBalanceAdjustmentOpen(true);
  };

  const closeBalanceAdjustment = () => {
    if (balanceAdjustmentSaving) {
      return;
    }

    setBalanceAdjustmentOpen(false);
    setBalanceAdjustmentError(null);
  };

  const saveBalanceAdjustment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!account?.workspaceId || !canAdjustBalanceSimply) {
      return;
    }

    const amount = Number(balanceAdjustmentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setBalanceAdjustmentError("Enter an amount greater than 0.");
      return;
    }

    const isAddingBalance = balanceAdjustmentMode === "add";
    const isCashAdjustment = account.type === "cash";
    if (isCashAdjustment && !isAddingBalance && amount > Math.max(0, currentBalance)) {
      setBalanceAdjustmentError("Cash cannot go below zero.");
      return;
    }
    const merchantLabel = isCashAdjustment
      ? isAddingBalance
        ? "Cash added"
        : "Cash removed"
      : isAddingBalance
        ? "Balance added"
        : "Balance removed";
    const adjustmentDescription = isCashAdjustment
      ? isAddingBalance
        ? "Cash count adjustment added."
        : "Cash count adjustment removed."
      : isAddingBalance
        ? "Balance adjustment added."
        : "Balance adjustment removed.";
    const transactionDate = new Date().toISOString().slice(0, 10);
    const categoryId =
      (isCashAdjustment ? getCategoryIdByName(categories, "Cash & ATM") : "") ||
      (isAddingBalance ? getCategoryIdByName(categories, "Income") : "") ||
      getCategoryIdByName(categories, "Financial") ||
      getCategoryIdByName(categories, "Other") ||
      undefined;

    setBalanceAdjustmentSaving(true);
    setBalanceAdjustmentError(null);

    const optimisticTransactionId = `optimistic-balance-adjustment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticTransaction: Transaction = {
      id: optimisticTransactionId,
      workspaceId: account.workspaceId,
      accountId: account.id,
      accountName: account.name,
      categoryId: categoryId ?? null,
      amount: amount.toFixed(2),
      currency: account.currency,
      type: isAddingBalance ? "income" : "expense",
      date: transactionDate,
      merchantRaw: merchantLabel,
      merchantClean: merchantLabel,
      categoryName: categoryId ? categories.find((category) => category.id === categoryId)?.name ?? null : null,
      reviewStatus: "confirmed",
      parserConfidence: 100,
      categoryConfidence: categoryId ? 100 : 0,
      accountMatchConfidence: 100,
      duplicateConfidence: 0,
      transferConfidence: 0,
      description: adjustmentDescription,
      isExcluded: false,
      isTransfer: false,
      institution: account.institution,
      accountNumber: account.accountNumber,
      source: "manual",
      importFileId: null,
      warningReason: null,
      splitBill: null,
      rawPayload: { source: "manual", optimistic: true },
    };

    setTransactions((current) => [optimisticTransaction, ...current.filter((transaction) => transaction.id !== optimisticTransactionId)]);
    setTransactionTotalCount((current) => current + 1);
    applyOptimisticWorkspaceTransactionUpsert(account.workspaceId, optimisticTransaction);
    setBalanceAdjustmentOpen(false);
    setBalanceAdjustmentAmount("");
    setMessage(isCashAdjustment ? (isAddingBalance ? "Cash added." : "Cash removed.") : isAddingBalance ? "Balance added." : "Balance removed.");

    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: account.workspaceId,
          accountId: account.id,
          categoryId,
          date: transactionDate,
          amount: amount.toFixed(2),
          currency: account.currency,
          type: isAddingBalance ? "income" : "expense",
          merchantRaw: merchantLabel,
          merchantClean: merchantLabel,
          description: adjustmentDescription,
          isTransfer: false,
          isExcluded: false,
          preserveType: true,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { transaction?: Partial<Transaction>; error?: string };

      if (!response.ok || !payload.transaction?.id) {
        throw new Error(payload.error ?? "Unable to save balance adjustment.");
      }

      const createdTransaction: Transaction = {
        id: payload.transaction.id,
        workspaceId: account.workspaceId,
        accountId: account.id,
        accountName: payload.transaction.accountName ?? account.name,
        categoryId: payload.transaction.categoryId ?? categoryId ?? null,
        amount: String(payload.transaction.amount ?? amount.toFixed(2)),
        currency: payload.transaction.currency ?? account.currency,
        type: payload.transaction.type ?? (isAddingBalance ? "income" : "expense"),
        date: payload.transaction.date ?? transactionDate,
        merchantRaw: payload.transaction.merchantRaw ?? merchantLabel,
        merchantClean: payload.transaction.merchantClean ?? merchantLabel,
        categoryName: payload.transaction.categoryName ?? (categoryId ? categories.find((category) => category.id === categoryId)?.name ?? null : null),
        reviewStatus: payload.transaction.reviewStatus ?? "confirmed",
        parserConfidence: payload.transaction.parserConfidence ?? 100,
        categoryConfidence: payload.transaction.categoryConfidence ?? (categoryId ? 100 : 0),
        accountMatchConfidence: payload.transaction.accountMatchConfidence ?? 100,
        duplicateConfidence: payload.transaction.duplicateConfidence ?? 0,
        transferConfidence: payload.transaction.transferConfidence ?? 0,
        description: payload.transaction.description ?? adjustmentDescription,
        isExcluded: payload.transaction.isExcluded ?? false,
        isTransfer: payload.transaction.isTransfer ?? false,
        institution: account.institution,
        accountNumber: account.accountNumber,
        source: "manual",
        importFileId: null,
        warningReason: null,
        splitBill: null,
        rawPayload: payload.transaction.rawPayload,
      };

      setTransactions((current) => [
        createdTransaction,
        ...current.filter(
          (transaction) => transaction.id !== optimisticTransactionId && transaction.id !== createdTransaction.id
        ),
      ]);
      applyOptimisticWorkspaceTransactionUpsert(account.workspaceId, createdTransaction, {
        replaceTransactionId: optimisticTransactionId,
      });
    } catch (error) {
      setTransactions((current) => current.filter((transaction) => transaction.id !== optimisticTransactionId));
      setTransactionTotalCount((current) => Math.max(0, current - 1));
      applyOptimisticWorkspaceTransactionDeletion(account.workspaceId, optimisticTransactionId);
      setBalanceAdjustmentOpen(true);
      setMessage("");
      setBalanceAdjustmentError(error instanceof Error ? error.message : "Unable to save balance adjustment.");
    } finally {
      setBalanceAdjustmentSaving(false);
    }
  };

  const saveBalanceFromCard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!account) {
      return;
    }

    const parsedBalance = parseBalanceInput(balanceDraft);
    if (parsedBalance === null) {
      setBalanceSaveState("error");
      setMessage("Enter a valid balance before saving.");
      return;
    }

    const nextBalance = normalizeAccountBalanceSign(account.type, parsedBalance).toFixed(2);
    setBalanceSaveState("saving");

    try {
      const response = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: account.workspaceId,
          balance: nextBalance,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to update account balance.");
      }

      const payload = await response.json();
      const nextAccount = (payload.account as Account | undefined) ?? { ...account, balance: nextBalance };
      setAccount(nextAccount);
      stableBalanceRef.current = nextAccount.balance ?? nextBalance;
      setInvestmentEditDraft((current) => (current ? { ...current, balance: nextAccount.balance ?? nextBalance } : current));
      setBalanceDraft(Math.abs(parseAmount(nextAccount.balance ?? nextBalance)).toFixed(2));
      setBalanceSaveState("saved");
      setBalanceEditorOpen(false);
      setMessage("Account balance updated.");
    } catch (error) {
      setBalanceSaveState("error");
      setMessage(error instanceof Error ? error.message : "Unable to update account balance.");
    }
  };

  const saveInlineCardBalance = async (value: string) => {
    if (!account) return;
    const parsedBalance = parseBalanceInput(value);
    if (parsedBalance === null) {
      setMessage("Enter a valid balance.");
      throw new Error("Enter a valid balance.");
    }
    const nextBalance = normalizeAccountBalanceSign(account.type, parsedBalance).toFixed(2);
    const response = await fetch(`/api/accounts/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: account.workspaceId, balance: nextBalance }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.account) {
      setMessage("Unable to update account balance.");
      throw new Error("Unable to update account balance.");
    }
    const nextAccount = payload.account as Account;
    setAccount(nextAccount);
    stableBalanceRef.current = nextAccount.balance ?? nextBalance;
    setBalanceDraft(Math.abs(parseAmount(nextAccount.balance ?? nextBalance)).toFixed(2));
    setMessage("Account balance updated.");
  };

  const saveInlineCardIdentity = async (field: "name" | "accountNumber", value: string) => {
    if (!account || account.type === "investment") return;
    const trimmed = value.trim();
    if (field === "name" && !trimmed) {
      setMessage("Account name cannot be empty.");
      throw new Error("Account name cannot be empty.");
    }
    const response = await fetch(`/api/accounts/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: account.workspaceId,
        [field]: field === "accountNumber" ? trimmed || null : trimmed,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.account) {
      setMessage("Unable to update account details.");
      throw new Error("Unable to update account details.");
    }
    const nextAccount = payload.account as Account;
    setAccount(nextAccount);
    setAccountEditDraft({ name: nextAccount.name, accountNumber: nextAccount.accountNumber ?? "" });
    setMessage("Account details updated.");
  };

  const saveCreditSettings = async () => {
    if (!account || !isCreditAccount) {
      return;
    }

    const parsedCreditLimit = creditLimitDraft.trim() ? parseBalanceInput(creditLimitDraft) : 0;
    if (parsedCreditLimit === null || parsedCreditLimit < 0) {
      setCreditLimitSaveState("error");
      setMessage("Enter a valid credit limit before saving.");
      return;
    }
    setCreditLimitSaveState("saving");
    try {
      const response = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: account.workspaceId,
          creditLimit: parsedCreditLimit > 0 ? parsedCreditLimit.toFixed(2) : null,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to update credit limit.");
      }

      const payload = await response.json();
      const nextAccount = (payload.account as Account | undefined) ?? {
        ...account,
        creditLimit: parsedCreditLimit > 0 ? parsedCreditLimit.toFixed(2) : null,
        creditLimitSource: parsedCreditLimit > 0 ? "manual" : null,
      };
      setAccount(nextAccount);
      setCreditLimitDraft(nextAccount.creditLimit ?? "");
      setCreditLimitSaveState("saved");
      creditSettingsBaselineRef.current = parsedCreditLimit > 0 ? parsedCreditLimit.toFixed(2) : "";
      setMessage("Credit card details updated.");
    } catch (error) {
      setCreditLimitSaveState("error");
      setMessage(error instanceof Error ? error.message : "Unable to update credit limit.");
    }
  };

  useEffect(() => {
    if (!account || !isCreditAccount) {
      return;
    }

    const currentSignature = creditLimitDraft;
    if (!creditSettingsBaselineRef.current || currentSignature === creditSettingsBaselineRef.current) {
      return;
    }

    if (creditSettingsAutosaveTimerRef.current) {
      clearTimeout(creditSettingsAutosaveTimerRef.current);
    }

    creditSettingsAutosaveTimerRef.current = setTimeout(() => {
      void saveCreditSettings();
    }, 650);

    return () => {
      if (creditSettingsAutosaveTimerRef.current) {
        clearTimeout(creditSettingsAutosaveTimerRef.current);
        creditSettingsAutosaveTimerRef.current = null;
      }
    };
  }, [account, creditLimitDraft, isCreditAccount]);
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
  const activeFinalizingImportIds = useMemo(
    () => new Set(importFiles.filter(isActiveEnrichmentJob).map((importFile) => importFile.id)),
    [importFiles]
  );
  const activeFinalizingImportKey = useMemo(
    () => Array.from(activeFinalizingImportIds).sort().join("|"),
    [activeFinalizingImportIds]
  );
  const failedFinalizingImportIds = useMemo(
    () => new Set(importFiles.filter(isFailedEnrichmentJob).map((importFile) => importFile.id)),
    [importFiles]
  );
  useEffect(() => {
    if (!account?.id || !account.workspaceId || !activeFinalizingImportKey) {
      return;
    }

    let cancelled = false;
    const refreshEnrichmentDeltas = async () => {
      const importFileIds = activeFinalizingImportKey.split("|").filter(Boolean);
      await Promise.allSettled(
        importFileIds.map((importFileId) =>
          fetch("/api/import-enrichment/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ importFileId, limit: 3, batchSize: 500 }),
            keepalive: true,
          })
        )
      );
      if (cancelled) {
        return;
      }

      const transactionsSearchParams = buildTransactionQuerySearchParams(
        account.workspaceId,
        { accountIds: [account.id] },
        { page: 1, pageSize: Math.max(transactionTotalCount, TRANSACTION_PAGE_SIZE) }
      );
      transactionsSearchParams.set("summaryMode", "light");
      const [transactionsResponse, importsResponse, categoriesResponse] = await Promise.all([
        fetch(`/api/transactions?${transactionsSearchParams.toString()}`),
        fetch(`/api/imports?workspaceId=${encodeURIComponent(account.workspaceId)}`),
        fetch(`/api/categories?workspaceId=${encodeURIComponent(account.workspaceId)}`),
      ]);

      if (cancelled) {
        return;
      }

      if (transactionsResponse.ok) {
        const transactionsPayload = (await transactionsResponse.json()) as {
          transactions?: Transaction[];
          totalCount?: number;
        } | null;
        const nextTransactions = Array.isArray(transactionsPayload?.transactions)
          ? mergeImportedWorkspaceTransactions([], transactionsPayload.transactions)
          : [];
        if (nextTransactions.length > 0) {
          setTransactions(nextTransactions);
          setTransactionTotalCount(
            typeof transactionsPayload?.totalCount === "number"
              ? Math.max(transactionsPayload.totalCount, nextTransactions.length)
              : nextTransactions.length
          );
        }
      }

      if (importsResponse.ok) {
        const importsPayload = (await importsResponse.json()) as { importFiles?: ImportFile[] } | null;
        setImportFiles(
          Array.isArray(importsPayload?.importFiles)
            ? importsPayload.importFiles.filter((importFile) => !importFile.accountId || importFile.accountId === account.id)
            : []
        );
      }

      if (categoriesResponse.ok) {
        const categoriesPayload = (await categoriesResponse.json()) as { categories?: Category[] } | null;
        if (Array.isArray(categoriesPayload?.categories) && categoriesPayload.categories.length > 0) {
          setCategories(categoriesPayload.categories);
        }
      }
    };

    void refreshEnrichmentDeltas();
    const intervalId = window.setInterval(() => {
      void refreshEnrichmentDeltas();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [account?.id, account?.workspaceId, activeFinalizingImportKey, transactionTotalCount]);
  const finalizingNoticeState = useMemo(() => getEnrichmentNoticeState(importFiles), [importFiles]);
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
            workspaceId: account?.workspaceId,
            accountId: account?.id,
            importFileIds: finalizingTransactions.map((transaction) => transaction.importFileId ?? ""),
            transactionIds: finalizingTransactions.map((transaction) => transaction.id),
          })
        : null,
    [account?.id, account?.workspaceId, finalizingNeedsReview, finalizingTransactionCount, finalizingTransactions]
  );
  useEffect(() => {
    setFinalizingNoticeDismissed(isFinalizingNoticeDismissed(finalizingNoticeDismissalKey));
  }, [finalizingNoticeDismissalKey]);
  useEffect(() => {
    if (visibleTransactions.length === 0) {
      return;
    }

    const currentActivity = readImportActivity();
    if (currentActivity?.status === "active") {
      const activeImportFileId =
        typeof currentActivity.importFileId === "string" && currentActivity.importFileId.trim()
          ? currentActivity.importFileId.trim()
          : null;
      const hasVisibleCurrentImportTransactions = activeImportFileId
        ? visibleTransactions.some((transaction) => {
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

      if (hasVisibleCurrentImportTransactions || (finalizingNeedsReview && finalizingTransactionCount > 0)) {
        clearImportActivity();
      }
    }
  }, [finalizingNeedsReview, finalizingTransactionCount, visibleTransactions.length]);
  const showFinalizingNotice = finalizingTransactionCount > 0 && !finalizingNoticeDismissed;
  const dismissFinalizingStatusNotice = () => {
    if (finalizingNeedsReview) {
      dismissFinalizingNotice(finalizingNoticeDismissalKey);
    }

    setFinalizingNoticeDismissed(true);
  };
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
  const getDisplayCategoryIdForTransaction = useCallback(
    (transaction: Transaction) => {
      const displayCategoryName = getDisplayTransactionCategoryName(transaction, categories, account?.institution ?? null);
      return getCategoryIdByName(categories, displayCategoryName) || transaction.categoryId || "";
    },
    [account?.institution, categories]
  );
  const detailSelectedCategory = useMemo(
    () => categories.find((category) => category.id === (detailDraft?.categoryId ?? "")) ?? null,
    [categories, detailDraft?.categoryId]
  );
  const detailAccountOptions = useMemo(() => {
    const accountsById = new Map<string, Account>();
    if (account) {
      accountsById.set(account.id, account);
    }

    for (const workspaceAccount of workspaceAccounts) {
      accountsById.set(workspaceAccount.id, workspaceAccount);
    }

    return Array.from(accountsById.values());
  }, [account, workspaceAccounts]);
  const detailAccountNumberById = useMemo(
    () => new Map(detailAccountOptions.map((entry) => [entry.id, entry.accountNumber ?? null] as const)),
    [detailAccountOptions]
  );
  const workspaceAccountNumbers = useMemo(
    () =>
      new Set(
        Array.from(detailAccountNumberById.values())
          .map((value) => String(value ?? "").replace(/\D/g, ""))
          .filter(Boolean)
      ),
    [detailAccountNumberById]
  );
  const getAccountTransactionDisplayType = useCallback(
    (transaction: Transaction) =>
      getTransactionDisplayType(
        transaction,
        detailAccountNumberById.get(transaction.accountId) ?? transaction.accountNumber ?? account?.accountNumber ?? null,
        workspaceAccountNumbers
      ),
    [account?.accountNumber, detailAccountNumberById, workspaceAccountNumbers]
  );
  const detailSelectedAccount = useMemo(
    () => (detailDraft ? detailAccountOptions.find((entry) => entry.id === detailDraft.accountId) ?? account : account),
    [account, detailAccountOptions, detailDraft]
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
  const selectedTransactionWarningReason = selectedTransaction?.warningReason ?? null;
  const selectedTransactionReviewReasons = selectedTransaction ? getTransactionReviewReasons(selectedTransaction) : [];
  const selectedTransactionWarningReasonSummary =
    selectedTransactionReviewReasons.length > 0 ? selectedTransactionReviewReasons.join(" · ") : selectedTransactionWarningReason;
  const selectedTransactionConfidenceScore = selectedTransaction
    ? getTransactionConfidenceScore(selectedTransaction, selectedTransactionWarningReason)
    : null;
  const selectedTransactionReviewChips = selectedTransaction
    ? getTransactionReviewChips(selectedTransaction, selectedTransactionWarningReason)
    : [];
  const detailTransactionSummary = useMemo(() => {
    if (!selectedTransaction) {
      return "";
    }

    return (
      getEffectiveTransactionMerchantName({
        merchantClean: detailDraft?.merchantClean ?? selectedTransaction.merchantClean,
        merchantRaw: selectedTransaction.merchantRaw,
        rawPayload: selectedTransaction.rawPayload as never,
      }) ?? selectedTransaction.merchantRaw
    );
  }, [detailDraft?.merchantClean, selectedTransaction]);
  const detailTransactionRawName = selectedTransaction?.merchantRaw.trim() ?? "";
  const hasDistinctDetailRawName = Boolean(
    detailTransactionRawName &&
      detailTransactionSummary &&
      detailTransactionRawName.toLowerCase() !== detailTransactionSummary.toLowerCase()
  );
  const selectedTransactionReceiptLineItems = useMemo(
    () => parseReceiptLineItemsFromPayload(selectedTransaction?.rawPayload),
    [selectedTransaction?.rawPayload]
  );
  const selectedTransactionRawSourceLine = useMemo(
    () => getRawPayloadTextCandidate(selectedTransaction?.rawPayload, ["line", "rawLine", "sourceLine", "rawText", "text"]),
    [selectedTransaction?.rawPayload]
  );
  const selectedTransactionRawNote = useMemo(() => getTransactionParsedNote(selectedTransaction), [selectedTransaction]);
  const detailReceiptLineItems = detailDraft?.receiptLineItems ?? selectedTransactionReceiptLineItems.map(receiptLineItemToDraft);
  const detailReceiptLineItemTotal = useMemo(
    () => getManualReceiptLineItemTotal(detailReceiptLineItems),
    [detailReceiptLineItems]
  );
  const hasDetailDraftChanges = useMemo(() => {
    const baselineCategoryId = selectedTransaction ? getDisplayCategoryIdForTransaction(selectedTransaction) || "" : "";
    return hasTransactionDetailDraftChanges(detailDraft, selectedTransaction, {
      baselineCategoryId,
      baselineCurrency: selectedTransaction?.currency ?? account?.currency ?? "PHP",
      baselineTransfer: Boolean(selectedTransaction?.isTransfer || selectedTransaction?.type === "transfer"),
    });
  }, [account?.currency, detailDraft, getDisplayCategoryIdForTransaction, selectedTransaction]);

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
      const response = await fetch(`/api/accounts/${encodeURIComponent(account.id)}/transactions?${searchParams.toString()}`);
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
    setDetailDraft((current) =>
      current && selectedTransaction?.id === updated.id
        ? createDetailDraft(
            { ...updated },
            {
              categoryId: getDisplayCategoryIdForTransaction(updated),
              type: getAccountTransactionDisplayType(updated),
            }
          )
        : current
    );
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
    setDetailDraft(
      createDetailDraft(transaction, {
        categoryId: getDisplayCategoryIdForTransaction(transaction),
        type: getAccountTransactionDisplayType(transaction),
      })
    );
    setTransactionDeleteConfirmOpen(false);
    setTransactionSplitBillOpen(false);
    setTransactionSplitBillDraft({
      groupId: "",
      participantNames: [],
    });
    setTransactionSplitBillError(null);
  };

  useEffect(() => {
    const active = Boolean(selectedTransaction);
    document.body.toggleAttribute("data-clover-page-modal", active);
    return () => {
      document.body.removeAttribute("data-clover-page-modal");
    };
  }, [selectedTransaction]);

  const resetTransactionDetail = () => {
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
  };

  const closeTransactionDetail = () => {
    if (selectedTransaction && detailDraft && hasDetailDraftChanges && !isSavingTransactionDetail) {
      void persistDetailDraft({ closeAfterSave: false });
      resetTransactionDetail();
      return;
    }

    resetTransactionDetail();
  };

  const persistDetailDraft = async ({ closeAfterSave = true }: { closeAfterSave?: boolean } = {}) => {
    if (!selectedTransaction || !detailDraft) {
      return;
    }

    setIsSavingTransactionDetail(true);
    try {
      const categoryChange = resolveTransactionCategoryChange({
        previousCategoryId: selectedTransaction.categoryId ?? "",
        previousCategoryName: selectedTransaction.categoryName ?? null,
        nextCategoryId: detailDraft.categoryId || "",
        lookupCategoryName: (categoryId) => categories.find((category) => category.id === categoryId)?.name ?? null,
      });
      await updateTransaction(
        selectedTransaction.id,
        buildTransactionUpdatePayload(detailDraft, selectedTransaction, {
          fallbackCurrency: account?.currency ?? "PHP",
        })
      );
      setMessage(
        categoryChange.categoryChanged
          ? buildTransactionCategoryUpdatedMessage({
              previousCategoryName: categoryChange.previousCategoryName,
              nextCategoryName: categoryChange.nextCategoryName,
            })
          : "Transaction details updated."
      );
      if (closeAfterSave) {
        setSelectedTransaction(null);
        setDetailDraft(null);
        setTransactionDeleteConfirmOpen(false);
        setTransactionSplitBillOpen(false);
        setTransactionSplitBillError(null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update transaction.");
    } finally {
      setIsSavingTransactionDetail(false);
    }
  };

  const updateDetailReceiptLineItem = (index: number, field: keyof ReceiptLineItemDraft, value: string) => {
    setDetailDraft((current) => {
      if (!current) {
        return current;
      }

      const nextLineItems = current.receiptLineItems.length > 0 ? [...current.receiptLineItems] : selectedTransactionReceiptLineItems.map(receiptLineItemToDraft);
      nextLineItems[index] = {
        ...(nextLineItems[index] ?? createEmptyReceiptLineItem()),
        [field]: value,
      };
      return {
        ...current,
        receiptLineItems: nextLineItems,
      };
    });
  };

  const addDetailReceiptLineItem = () => {
    setDetailDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        receiptLineItems: [...current.receiptLineItems, createEmptyReceiptLineItem()],
      };
    });
  };

  const deleteDetailReceiptLineItem = (index: number) => {
    setDetailDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        receiptLineItems: current.receiptLineItems.filter((_, itemIndex) => itemIndex !== index),
      };
    });
  };

  const createTransactionSplitBill = async () => {
    if (!selectedTransaction || !account) {
      return;
    }

    const transactionTitle = (detailDraft?.merchantClean ?? selectedTransaction.merchantClean ?? selectedTransaction.merchantRaw).trim();
    const transactionAmount = detailDraft?.amount ?? selectedTransaction.amount;
    const transactionCurrency = detailDraft?.currency ?? selectedTransaction.currency ?? account.currency;
    const transactionDate = detailDraft?.date ?? selectedTransaction.date.slice(0, 10);

    setTransactionSplitBillSaving(true);
    try {
      const createdBill = (await createSplitBillFromTransaction({
        workspaceId: selectedTransaction.workspaceId ?? account.workspaceId,
        transactionId: selectedTransaction.id,
        transactionTitle: transactionTitle || "Split Bill",
        billDate: transactionDate,
        currency: transactionCurrency,
        amount: transactionAmount,
        draft: transactionSplitBillDraft,
        receiptLineItems: selectedTransactionReceiptLineItems.map((lineItem) => ({
          description: lineItem.description,
          amount:
            lineItem.amount ??
            (getReceiptLineItemComputedAmount(lineItem) !== null ? String(getReceiptLineItemComputedAmount(lineItem)) : ""),
        })),
      })) as { id: string; title: string } | null;

      setTransactionSplitBillOpen(false);
      setTransactionSplitBillDraft({
        groupId: "",
        participantNames: [],
      });
      setTransactionSplitBillError(null);
      if (createdBill) {
        setSelectedTransaction((current) => (current ? { ...current, splitBill: createdBill } : current));
        setTransactions((current) => current.map((entry) => (entry.id === selectedTransaction.id ? { ...entry, splitBill: createdBill } : entry)));
      }
      router.refresh();
    } catch (error) {
      setTransactionSplitBillError(error instanceof Error ? error.message : "Unable to create split bill.");
    } finally {
      setTransactionSplitBillSaving(false);
    }
  };

  const confirmDeleteTransaction = async () => {
    if (!selectedTransaction || !account) {
      return;
    }

    const transactionId = selectedTransaction.id;
    setIsSavingTransactionDetail(true);
    try {
      await deleteTransactionRemote(transactionId);
      applyOptimisticWorkspaceTransactionDeletion(account.workspaceId, transactionId);
      setTransactions((current) => current.filter((entry) => entry.id !== transactionId));
      setTransactionTotalCount((current) => Math.max(0, current - 1));
      setSelectedTransaction(null);
      setDetailDraft(null);
      setTransactionDeleteConfirmOpen(false);
      setTransactionSplitBillOpen(false);
      setMessage("Transaction deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete transaction.");
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

  const deleteTransactionFromMobileRow = async (transaction: Transaction) => {
    if (!account || !window.confirm("Delete this transaction? This cannot be undone.")) {
      return;
    }

    try {
      await deleteTransactionRemote(transaction.id);
      applyOptimisticWorkspaceTransactionDeletion(account.workspaceId, transaction.id);
      setTransactions((current) => current.filter((entry) => entry.id !== transaction.id));
      setTransactionTotalCount((current) => Math.max(0, current - 1));
      setSelectedTransactionIds((current) => current.filter((id) => id !== transaction.id));
      setMessage("Transaction deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete transaction.");
      throw error;
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

  const focusInvestmentEditField = (field: keyof InvestmentEditDraft | "dividendAmount") => {
    const selector = `[data-investment-field="${field}"]`;
    const fieldElement = document.querySelector<HTMLInputElement | HTMLSelectElement>(selector);
    fieldElement?.focus();
    if (fieldElement instanceof HTMLInputElement) {
      fieldElement.select();
    }
  };

  const changeAccountType = async (nextType: SupportedAccountType) => {
    if (!account || nextType === account.type || accountTypeSaveState === "saving") {
      return;
    }

    const previousAccount = account;
    setAccountTypeSaveState("saving");
    setAccount((current) => (current ? { ...current, type: nextType } : current));

    try {
      const response = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: account.workspaceId,
          type: nextType,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to update the account type.");
      }

      const payload = await response.json();
      const nextAccount = payload.account as Account | undefined;
      if (nextAccount) {
        setAccount(nextAccount);
        const canonicalPath = getAccountPath(nextAccount);
        if (canonicalPath !== `/accounts/${accountPathSegment}`) {
          router.replace(canonicalPath);
        }
      }
      setAccountTypeSaveState("saved");
      setMessage(`Account moved to ${formatAccountTypeLabel(nextType)}.`);
    } catch (error) {
      setAccount(previousAccount);
      setAccountTypeSaveState("error");
      setMessage(error instanceof Error ? error.message : "Unable to update the account type.");
    }
  };

  const mergeableAccounts = useMemo(
    () =>
      workspaceAccounts
        .filter((candidate) => Boolean(account && candidate.id !== account.id))
        .sort((left, right) => {
          const leftLabel = `${left.institution ?? ""} ${left.name}`.trim().toLowerCase();
          const rightLabel = `${right.institution ?? ""} ${right.name}`.trim().toLowerCase();
          return leftLabel.localeCompare(rightLabel);
        }),
    [account, workspaceAccounts]
  );

  const openMergeAccountModal = () => {
    if (!account || mergeBusy || mergeableAccounts.length === 0) {
      return;
    }

    setMergeDirection((current) => current ?? "into_other");
    setMergeAccountId((current) => {
      if (current && mergeableAccounts.some((candidate) => candidate.id === current)) {
        return current;
      }

      return mergeableAccounts[0]?.id ?? "";
    });
  };

  const closeMergeAccountModal = () => {
    if (mergeBusy) {
      return;
    }

    setMergeDirection(null);
    setMergeAccountId("");
  };

  const mergeAccount = async () => {
    if (!account || !mergeDirection || mergeBusy || !mergeAccountId) {
      return;
    }

    const sourceAccountId = mergeDirection === "into_other" ? account.id : mergeAccountId;
    const targetAccountId = mergeDirection === "into_other" ? mergeAccountId : account.id;
    if (sourceAccountId === targetAccountId) {
      setMessage("Choose two different accounts to merge.");
      return;
    }

    setMergeBusy(true);
    try {
      const response = await fetch(`/api/accounts/${sourceAccountId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: account.workspaceId,
          targetAccountId,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Unable to merge accounts.");
      }

      const payload = await response.json();
      if (payload.account) {
        const mergedAccount = payload.account as Account;
        setAccount(mergedAccount);
        setMergeDirection(null);
        setMergeAccountId("");
        const nextPath = getAccountPath(mergedAccount);
        if (nextPath !== `/accounts/${accountPathSegment}`) {
          window.location.assign(nextPath);
        } else {
          window.location.reload();
        }
        return;
      }

      throw new Error("The merged account was not returned.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to merge accounts.");
    } finally {
      setMergeBusy(false);
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

      const response = await fetch(`/api/accounts/${accountId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Unable to delete account.");
      }

      router.replace("/accounts");
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

  if (!account) {
    return (
      <CloverShell
        active="accounts"
        title="Account"
        kicker="Account history"
        subtitle="This imported account is still being linked."
        showTopbar={false}
      >
        <section className="accounts-detail__panel">
          <div className="accounts-detail__header">
            <div className="actions accounts-detail__desktop-actions">
              <button className="button button-secondary" type="button" onClick={() => router.push("/accounts")}>
                Back to Accounts
              </button>
            </div>
          </div>
          <div className="empty-state">
            <p>{message || "Clover is still linking this imported account. Please try opening it again in a moment."}</p>
          </div>
        </section>
      </CloverShell>
    );
  }

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
      hideCompactBarKickerAndSubtitleOnMobile
      showTopbar={false}
    >
      <section className="accounts-detail__panel" style={accountBrandStyles}>
        {account ? (
          <div className="accounts-detail__hero">
            {isPendingBalance ? (
              <div className="accounts-detail__loading-chip-wrap">
                <span className="accounts-summary-chip is-neutral">Loading</span>
                <p className="panel-muted">Clover is still reading this {latestCheckpointFamily?.pendingLabel ?? "statement"} and filling in the rest.</p>
              </div>
            ) : null}

            <div className={`accounts-detail__hero-layout${isCreditAccount ? " is-credit-account" : ""}`}>
              <div className="accounts-detail__hero-card-row">
                <FinancialAccountCard
                  className="accounts-detail__hero-card"
                  accountBrand={accountBrand}
                  name={accountCardName}
                  accountNumber={liveCardNumber}
                  amount={isPendingBalance ? "Loading..." : formatAccountAmount(accountCardBalance, account.currency)}
                  amountLabel={`Change ${accountCardName} balance`}
                  editableName={account.type === "investment" ? undefined : account.name}
                  editableAccountNumber={account.type === "investment" ? undefined : account.accountNumber ?? ""}
                  editableAmount={Math.abs(parseAmount(displayBalance)).toFixed(2)}
                  onNameCommit={account.type === "investment" ? undefined : (value) => saveInlineCardIdentity("name", value)}
                  onAccountNumberCommit={account.type === "investment" ? undefined : (value) => saveInlineCardIdentity("accountNumber", value)}
                  onAmountCommit={saveInlineCardBalance}
                  showChevron={false}
                />

                <div className="accounts-detail__card-text-actions">
                  <button
                    className="accounts-detail__type-edit-button"
                    type="button"
                    onClick={() => {
                      setAccountTypeEditorOpen((open) => !open);
                      setAccountTypeSaveState("idle");
                    }}
                    aria-expanded={accountTypeEditorOpen}
                  >
                    Edit Type
                  </button>
                </div>

                {accountTypeEditorOpen ? (
                  <label className="accounts-detail__type-editor">
                    <span>Account type</span>
                    <select
                      value={account.type}
                      onChange={(event) => {
                        const nextType = event.target.value;
                        if (isSupportedAccountType(nextType)) {
                          void changeAccountType(nextType);
                        }
                      }}
                      disabled={accountTypeSaveState === "saving"}
                      aria-label="Account type"
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
                    <small aria-live="polite">
                      {accountTypeSaveState === "saving"
                        ? "Saving..."
                        : accountTypeSaveState === "saved"
                          ? "Saved"
                          : accountTypeSaveState === "error"
                            ? "Try again"
                            : ""}
                    </small>
                  </label>
                ) : null}

              </div>

              {isCreditAccount ? (
                <div className="accounts-detail__credit-inline" aria-label="Credit card details">
                  <label className="accounts-detail__credit-inline-field accounts-detail__credit-inline-field--editable">
                    <span>Credit limit</span>
                    <input
                      value={creditLimitDraft}
                      onChange={(event) => {
                        setCreditLimitDraft(event.target.value);
                        setCreditLimitSaveState("idle");
                      }}
                      inputMode="decimal"
                      placeholder="0.00"
                      aria-label="Credit limit"
                    />
                  </label>
                  <div className="accounts-detail__credit-inline-field accounts-detail__credit-inline-field--period">
                    <span>Next payment due</span>
                    <strong>{nextPaymentDueDate ? formatDate(nextPaymentDueDate.toISOString()) : "Not available"}</strong>
                    {paymentDueDateWasProjected ? <small>Projected from the statement due date</small> : null}
                  </div>
                  {creditLimitSaveState !== "idle" || creditLimitSourceLabel ? (
                    <span className="accounts-detail__credit-inline-meta">
                      {creditLimitSaveState === "saving"
                        ? "Saving..."
                        : creditLimitSaveState === "saved"
                          ? "Saved"
                          : creditLimitSaveState === "error"
                            ? "Needs attention"
                            : creditLimitSourceLabel}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

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
                        : ""}
                </span>
              </div>
            </div>
            <div className="accounts-detail__investment-summary">
              <button className="status-card accounts-detail__investment-field" type="button" onClick={() => focusInvestmentEditField("investmentSubtype")}>
                <div className="panel-muted">Subtype</div>
                <strong>{getInvestmentSubtypeLabel(investmentSubtype)}</strong>
              </button>
              <button className="status-card accounts-detail__investment-field" type="button" onClick={() => focusInvestmentEditField("balance")}>
                <div className="panel-muted">Current value</div>
                <strong>{formatAccountAmount(currentBalance, account.currency)}</strong>
              </button>
              <button
                className="status-card accounts-detail__investment-field"
                type="button"
                onClick={() => focusInvestmentEditField(isFixedIncomeInvestmentSubtype(investmentSubtype) ? "investmentPrincipal" : "investmentCostBasis")}
              >
                <div className="panel-muted">{getInvestmentPurchaseSummaryLabel(investmentSubtype)}</div>
                <strong>{investmentPurchaseValue === null ? "Not set" : formatAccountAmount(investmentPurchaseValue, account.currency)}</strong>
              </button>
              <button className="status-card accounts-detail__investment-field" type="button" onClick={() => focusInvestmentEditField("dividendAmount")}>
                <div className="panel-muted">Dividends</div>
                <strong>{formatAccountAmount(investmentDividendTotal, account.currency)}</strong>
              </button>
              <button
                className="status-card accounts-detail__investment-field"
                type="button"
                onClick={() => focusInvestmentEditField(isFixedIncomeInvestmentSubtype(investmentSubtype) ? "investmentPrincipal" : "investmentCostBasis")}
              >
                <div className="panel-muted">Gain / loss</div>
                <strong>{investmentGainLoss === null ? "Not set" : formatAccountAmount(investmentGainLoss, account.currency)}</strong>
              </button>
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
                    <input data-investment-field="institution" value={investmentEditDraft.institution} onChange={(event) => updateInvestmentEditDraft("institution", event.target.value)} />
                  </label>
                  <label>
                    Investment subtype
                    <select
                      data-investment-field="investmentSubtype"
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
                      {SORTED_INVESTMENT_SUBTYPES.map((subtype) => (
                        <option key={subtype} value={subtype}>
                          {getInvestmentSubtypeLabel(subtype)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Current value / balance
                    <input data-investment-field="balance" value={investmentEditDraft.balance} onChange={(event) => updateInvestmentEditDraft("balance", event.target.value)} inputMode="decimal" />
                  </label>
                  {investmentEditingFieldConfigs.map((field) => (
                    <label key={field.key}>
                      {field.label}
                      {field.type === "date" ? (
                        <input
                          type="date"
                          data-investment-field={field.key}
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
                          data-investment-field={field.key}
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
                        data-investment-field="dividendAmount"
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

        <div className="accounts-detail__transactions" style={{ marginTop: 24 }}>
          {showFinalizingNotice || selectedTransactionIds.length > 0 ? (
            <div className="accounts-detail__reconciliation-head accounts-detail__transactions-toolbar">
              <div className="accounts-detail__transactions-actions">
                {showFinalizingNotice ? (
                  <span className="accounts-summary-chip is-neutral">
                    <span>
                      {finalizingNoticeState.label} {finalizingTransactionCount} detail{finalizingTransactionCount === 1 ? "" : "s"} · {finalizingNoticeState.detail}
                    </span>
                    <button
                      className="icon-button transactions-status-line__dismiss"
                      type="button"
                      onClick={dismissFinalizingStatusNotice}
                      aria-label="Dismiss status notice"
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </span>
                ) : null}
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
          ) : null}
          {transactionsError ? (
            <p className="panel-muted">{transactionsError}</p>
          ) : transactionsLoading ? (
            <div className="transactions-loading-state" role="status" aria-live="polite" aria-label="Loading account transactions">
              <div className="transactions-loading-header">
                <span className="skeleton-block skeleton-block--checkbox" />
                <span className="skeleton-block skeleton-block--icon" />
                <span className="skeleton-block skeleton-block--name" />
                <span className="skeleton-block skeleton-block--date" />
                <span className="skeleton-block skeleton-block--category" />
                <span className="skeleton-block skeleton-block--amount" />
                <span className="skeleton-block skeleton-block--chevron" />
              </div>
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="transactions-loading-row">
                  <span className="skeleton-block skeleton-block--checkbox" />
                  <span className="skeleton-block skeleton-block--icon" />
                  <span className="transactions-loading-name">
                    <span className="skeleton-block skeleton-block--line skeleton-block--line-long" />
                    <span className="skeleton-block skeleton-block--line skeleton-block--line-short" />
                  </span>
                  <span className="skeleton-block skeleton-block--date" />
                  <span className="skeleton-block skeleton-block--category" />
                  <span className="skeleton-block skeleton-block--amount" />
                  <span className="skeleton-block skeleton-block--chevron" />
                </div>
              ))}
            </div>
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
                      className="line-item-header-cell line-item-header-cell--date"
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
                      className="line-item-header-cell line-item-header-cell--category"
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
                    const categoryValue = transaction.categoryId ?? "";
                    const categoryLabel = getDisplayTransactionCategoryName(transaction, categories, account?.institution);
                    const effectiveCategoryValue = getCategoryIdByName(categories, categoryLabel) || categoryValue;
                    const effectiveType = getAccountTransactionDisplayType(transaction);
                    const amountToneClass = effectiveType === "transfer" ? "neutral" : effectiveType === "income" ? "positive" : "negative";
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
                          <CategoryBrandMark
                            categoryName={categoryLabel}
                            size={24}
                            radius={8}
                            className="transaction-category-icon"
                          />
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
                            value={effectiveCategoryValue}
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
                          <span>{group.label}</span>
                        </div>
                        <div className="transactions-mobile-date-group__rows">
                          {group.transactions.map((transaction) => {
                            const amount = Number(transaction.amount);
                            const categoryLabel = getDisplayTransactionCategoryName(transaction, categories, account?.institution);
                            const effectiveType = getAccountTransactionDisplayType(transaction);
                            const amountToneClass =
                              effectiveType === "transfer" ? "neutral" : effectiveType === "income" ? "positive" : "negative";
                            const normalizedName =
                              getEffectiveTransactionMerchantName({
                                merchantClean: transaction.merchantClean,
                                merchantRaw: transaction.merchantRaw,
                                rawPayload: transaction.rawPayload as never,
                              }) ?? "Transaction";

                            return (
                              <MobileSwipeDelete
                                key={transaction.id}
                                deleteLabel={`Delete ${normalizedName}`}
                                onDelete={() => deleteTransactionFromMobileRow(transaction)}
                              >
                              <article
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
                                <div className="transactions-mobile-simple-row__name accounts-detail__mobile-transaction-name">
                                  <CategoryBrandMark
                                    categoryName={categoryLabel}
                                    size={20}
                                    radius={7}
                                    className="transactions-mobile-simple-row__category-icon"
                                  />
                                  <span className="transactions-mobile-simple-row__name-main">{normalizedName}</span>
                                </div>
                                <div className={`transactions-mobile-simple-row__amount-group ${amountToneClass}`}>
                                  <span className={`transactions-mobile-simple-row__amount ${amountToneClass}`}>
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
                              </MobileSwipeDelete>
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
                    <h4 id="account-transaction-detail-title">{detailTransactionSummary || selectedTransaction.merchantRaw}</h4>
                    {hasDistinctDetailRawName ? <p className="transaction-drawer__merchant-raw">{detailTransactionRawName}</p> : null}
                  </div>
                </div>
                <button className="icon-button transaction-drawer__close-button" type="button" onClick={closeTransactionDetail} aria-label="Close transaction details">
                  ×
                </button>
              </div>

              {selectedTransactionReviewChips.length > 0 ? (
                <div className="transaction-drawer-review-status" aria-label="Transaction review context">
                  {selectedTransactionReviewChips.map((chip) => (
                    <span
                      key={chip.label}
                      className={`transaction-drawer-review-status__chip transaction-drawer-review-status__chip--${chip.tone}`}
                    >
                      {chip.label}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="transaction-drawer-form transaction-drawer-form--single">
                <label>
                  Name
                  <input
                    value={detailDraft?.merchantClean ?? selectedTransaction.merchantClean ?? selectedTransaction.merchantRaw}
                    onChange={(event) => setDetailDraft((current) => (current ? { ...current, merchantClean: event.target.value } : current))}
                    placeholder="Merchant or payee"
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

                <div className="transaction-drawer-form__amount-field">
                  <span className="transaction-drawer-field-label">
                    <span>Amount</span>
                  </span>
                  <div className="transaction-drawer-form__money-row">
                    <CurrencySelector
                      value={detailDraft?.currency ?? selectedTransaction.currency ?? account?.currency ?? "PHP"}
                      onChange={(value) => setDetailDraft((current) => (current ? { ...current, currency: value } : current))}
                      options={currencyCatalogCodes}
                      ariaLabel="Select transaction currency"
                      className="transaction-drawer-form__currency-selector"
                      buttonClassName="transaction-drawer-form__currency-button"
                      menuClassName="transaction-drawer-form__currency-menu"
                      optionClassName="transaction-drawer-form__currency-option"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={detailDraft?.amount ?? selectedTransaction.amount}
                      onChange={(event) => setDetailDraft((current) => (current ? { ...current, amount: event.target.value } : current))}
                    />
                  </div>
                </div>

                <label>
                  <span className="transactions-manual-type-label">
                    <span>Type</span>
                  </span>
                  <div className="transactions-manual-type-control transaction-drawer-type-control">
                    <span className="transactions-manual-type-symbol" aria-hidden="true">
                      {(detailDraft?.type ??
                        (selectedTransaction.type === "income" ? "credit" : selectedTransaction.type === "transfer" ? "transfer" : "debit")) ===
                      "credit"
                        ? "+"
                        : (detailDraft?.type ?? selectedTransaction.type) === "transfer"
                          ? "↔"
                          : "-"}
                    </span>
                    <select
                      value={
                        detailDraft?.type ??
                        (selectedTransaction.type === "income" ? "credit" : selectedTransaction.type === "transfer" ? "transfer" : "debit")
                      }
                      onChange={(event) =>
                        setDetailDraft((current) =>
                          current
                            ? {
                                ...current,
                                type: event.target.value as TransactionDetailDraft["type"],
                                isTransfer: event.target.value === "transfer",
                              }
                            : current
                        )
                      }
                    >
                      <option value="debit">Expenses</option>
                      <option value="credit">Income</option>
                      <option value="transfer">Transfer</option>
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
                        <AccountBrandMark accountBrand={detailSelectedAccountBrand} label={detailSelectedAccount?.name ?? "Account"} />
                      ) : null}
                    </span>
                    <select
                      value={detailDraft?.accountId ?? selectedTransaction.accountId}
                      onChange={(event) => setDetailDraft((current) => (current ? { ...current, accountId: event.target.value } : current))}
                    >
                      {detailAccountOptions.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {getAccountDisplayName(entry)}
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
              </div>

              {selectedTransactionWarningReasonSummary ? (
                <div className="detail-warning-box detail-warning-box--compact transaction-drawer-warning">
                  <div className="detail-warning-box__header">
                    <span className="detail-warning-box__icon" aria-hidden="true">
                      <span className="warning-mark warning-mark--small" aria-hidden="true" />
                    </span>
                    <strong>Review warning</strong>
                    <span className="detail-warning-box__reason">{selectedTransactionWarningReasonSummary}</span>
                  </div>
                  <div className="detail-warning-actions detail-warning-actions--compact">
                    <button
                      className="button button-primary button-small"
                      type="button"
                      onClick={() => {
                        void updateTransaction(selectedTransaction.id, {
                          isExcluded: false,
                          isTransfer: false,
                          reviewStatus: "confirmed",
                        }).then(() => setMessage("Transaction kept."));
                      }}
                    >
                      Keep
                    </button>
                    <button
                      className="button button-danger button-small detail-warning-delete"
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

              <details className="transaction-drawer-more">
                <summary>More</summary>
                <div className="transaction-drawer-more__body">
                  <label className="transaction-drawer-form__notes">
                    Notes
                    <textarea
                      value={
                        selectedTransactionRawNote &&
                        (detailDraft?.description ?? "").trim() === selectedTransactionRawNote.trim()
                          ? ""
                          : detailDraft?.description ?? ""
                      }
                      onChange={(event) => setDetailDraft((current) => (current ? { ...current, description: event.target.value } : current))}
                      placeholder="Optional note or review context"
                    />
                  </label>
                  {selectedTransactionRawSourceLine ? (
                    <div className="transaction-drawer-more__row transaction-drawer-more__row--stacked">
                      <span>Raw source line</span>
                      <strong>{selectedTransactionRawSourceLine}</strong>
                    </div>
                  ) : null}
                  {selectedTransactionRawNote ? (
                    <div className="transaction-drawer-more__row transaction-drawer-more__row--stacked">
                      <span>Parsed note</span>
                      <p>{selectedTransactionRawNote}</p>
                    </div>
                  ) : null}

                  <div className="transaction-drawer-receipt-lines">
                    <div className="transaction-drawer-receipt-lines__head">
                      <span className="transaction-drawer-field-label">
                        <span>Receipt line items</span>
                      </span>
                      <span className="field-help">
                        {formatTransactionAmount(detailReceiptLineItemTotal, detailDraft?.currency ?? selectedTransaction.currency ?? account?.currency ?? "PHP")}
                      </span>
                    </div>
                    <div className="transaction-drawer-receipt-table" role="table" aria-label="Receipt line items">
                      <div className="transaction-drawer-receipt-table__row transaction-drawer-receipt-table__row--head" role="row">
                        <span role="columnheader">Name</span>
                        <span role="columnheader">Quantity</span>
                        <span role="columnheader">Currency</span>
                        <span role="columnheader">Amount</span>
                        <span role="columnheader" className="sr-only">Actions</span>
                      </div>
                      {detailReceiptLineItems.length > 0 ? (
                        detailReceiptLineItems.map((lineItem, index) => (
                          <div key={`${lineItem.description || "line"}-${index}`} className="transaction-drawer-receipt-table__row" role="row">
                            <input
                              aria-label={`Receipt line item ${index + 1} name`}
                              value={lineItem.description}
                              placeholder="Item name"
                              onChange={(event) => updateDetailReceiptLineItem(index, "description", event.target.value)}
                            />
                            <input
                              aria-label={`Receipt line item ${index + 1} quantity`}
                              value={lineItem.quantity}
                              placeholder="1"
                              inputMode="decimal"
                              onChange={(event) => updateDetailReceiptLineItem(index, "quantity", event.target.value)}
                            />
                            <input
                              aria-label={`Receipt line item ${index + 1} currency`}
                              value={lineItem.currency || detailDraft?.currency || selectedTransaction.currency || account?.currency || "PHP"}
                              placeholder={detailDraft?.currency || selectedTransaction.currency || account?.currency || "PHP"}
                              onChange={(event) => updateDetailReceiptLineItem(index, "currency", event.target.value.toUpperCase())}
                            />
                            <input
                              aria-label={`Receipt line item ${index + 1} amount`}
                              value={lineItem.amount}
                              placeholder="0.00"
                              inputMode="decimal"
                              onChange={(event) => updateDetailReceiptLineItem(index, "amount", event.target.value)}
                            />
                            <button
                              className="button button-ghost button-small transaction-drawer-receipt-table__delete"
                              type="button"
                              onClick={() => deleteDetailReceiptLineItem(index)}
                              aria-label={`Delete receipt line item ${index + 1}`}
                            >
                              ×
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="transaction-drawer-receipt-table__empty">No line items yet.</div>
                      )}
                    </div>
                    <button className="button button-secondary button-small transaction-drawer-receipt-lines__add" type="button" onClick={addDetailReceiptLineItem}>
                      Add line item
                    </button>
                  </div>

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

                  <div className="transaction-drawer-more__row">
                    <span>Confidence score</span>
                    <strong>{selectedTransactionConfidenceScore ?? 0}%</strong>
                  </div>
                  <p>Based on Clover's merchant, account, category, duplicate, and parser checks.</p>
                </div>
              </details>

              <div className="form-actions detail-actions">
                <div className="detail-actions__left">
                  {selectedTransaction.splitBill ? (
                    <Link className="button button-secondary" href={`/split-bill?bill=${selectedTransaction.splitBill.id}`} prefetch={false}>
                      Open In Split Bills
                    </Link>
                  ) : (
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => {
                        setTransactionSplitBillError(null);
                        setTransactionSplitBillOpen((current) => !current);
                      }}
                    >
                      {transactionSplitBillOpen ? "Hide Split Bills" : "Add To Split Bills"}
                    </button>
                  )}
                </div>
                {!selectedTransactionWarningReason && !transactionDeleteConfirmOpen ? (
                  <button
                    className="button button-danger"
                    type="button"
                    onClick={() => setTransactionDeleteConfirmOpen(true)}
                  >
                    Delete Transaction
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
                        disabled={isSavingTransactionDetail}
                      >
                        Cancel
                      </button>
                      <button className="button button-danger button-small" type="button" onClick={() => void confirmDeleteTransaction()} disabled={isSavingTransactionDetail}>
                        {isSavingTransactionDetail ? "Deleting..." : "Delete transaction"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {(transactionSplitBillError || (transactionSplitBillOpen && !selectedTransaction.splitBill && account)) ? (
                <div className="transaction-drawer-split-bill">
                  {transactionSplitBillError ? <p className="field-help field-help--compact transaction-drawer-split-bill__error">{transactionSplitBillError}</p> : null}
                  {transactionSplitBillOpen && !selectedTransaction.splitBill && account ? (
                    <SplitBillTransactionLinkFields
                      workspaceId={selectedTransaction.workspaceId ?? account.workspaceId}
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
              ) : null}
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
        ) : mergeDirection ? (
          <div className="detail-warning-box accounts-detail__merge-confirm" style={{ marginTop: 20 }}>
            <div className="detail-warning-box__header">
              <span className="detail-warning-box__icon" aria-hidden="true">
                <ActionIcon name="warning" />
              </span>
              <strong>
                {mergeDirection === "into_other"
                  ? account?.type === "investment"
                    ? "Merge this asset into another?"
                    : "Merge this account into another?"
                  : account?.type === "investment"
                    ? "Merge another asset into this one?"
                    : "Merge another account into this one?"}
              </strong>
            </div>
            <div className="accounts-detail__merge-direction">
              <button
                className={`button button-secondary button-small accounts-detail__merge-direction-button${mergeDirection === "into_other" ? " is-active" : ""}`}
                type="button"
                onClick={() => setMergeDirection("into_other")}
                disabled={mergeBusy}
              >
                {account?.type === "investment" ? "Keep this asset" : "Keep this account"}
              </button>
              <button
                className={`button button-secondary button-small accounts-detail__merge-direction-button${mergeDirection === "into_current" ? " is-active" : ""}`}
                type="button"
                onClick={() => setMergeDirection("into_current")}
                disabled={mergeBusy}
              >
                {account?.type === "investment" ? "Keep another asset" : "Keep another account"}
              </button>
            </div>
            <p>
              {mergeDirection === "into_other" ? (
                <>
                  This will move <strong>{account?.name ?? "this account"}</strong> and all of its linked history into the account
                  you choose.
                </>
              ) : (
                <>
                  This will move the selected account and all of its linked history into{" "}
                  <strong>{account?.name ?? "this account"}</strong>.
                </>
              )}
            </p>
            <label className="accounts-detail__merge-select">
              {mergeDirection === "into_other"
                ? "Choose the account to keep"
                : "Choose the account to merge into this one"}
              <select value={mergeAccountId} onChange={(event) => setMergeAccountId(event.target.value)} disabled={mergeBusy}>
                <option value="">Select an account</option>
                {mergeableAccounts.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.institution ? `${candidate.institution} · ` : ""}
                    {candidate.name}
                    {candidate.accountNumber ? ` · ${candidate.accountNumber}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <p>
              Clover will move linked transactions, imports, checkpoints, investment history, recurring patterns, and rules so the
              merged account keeps its history in one place.
            </p>
            <div className="detail-warning-actions">
              <button className="button button-secondary button-small" type="button" onClick={closeMergeAccountModal} disabled={mergeBusy}>
                Cancel
              </button>
              <button
                className="button button-primary button-small"
                type="button"
                onClick={() => void mergeAccount()}
                disabled={mergeBusy || !mergeAccountId}
              >
                {mergeBusy ? "Merging..." : "Merge account"}
              </button>
            </div>
          </div>
        ) : (
          <div className="accounts-detail__footer-actions" style={{ marginTop: 20 }}>
            {mergeableAccounts.length > 0 ? (
              <button className="button button-secondary button-small" type="button" onClick={() => openMergeAccountModal()} disabled={Boolean(deleteBusy)}>
                Merge
              </button>
            ) : null}
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

        {balanceAdjustmentOpen && account?.workspaceId ? (
          <div className="modal-backdrop modal-backdrop--centered-mobile" role="presentation" onClick={closeBalanceAdjustment}>
            <section
              className="modal-card modal-card--balance-adjustment glass"
              role="dialog"
              aria-modal="true"
              aria-labelledby="balance-adjustment-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-head">
                <div>
                  <p className="eyebrow">{balanceAdjustmentIsCash ? "Cash account" : "Account balance"}</p>
                  <h4 id="balance-adjustment-title">{balanceAdjustmentLabel}</h4>
                </div>
                <button className="icon-button" type="button" onClick={closeBalanceAdjustment} aria-label="Close balance adjustment">
                  ×
                </button>
              </div>

              <form className="accounts-detail__balance-adjustment-form" onSubmit={saveBalanceAdjustment}>
                <div className="accounts-detail__balance-adjustment-toggle" role="group" aria-label="Balance adjustment type">
                  <button
                    type="button"
                    className={`accounts-detail__balance-adjustment-toggle-button ${balanceAdjustmentMode === "add" ? "is-active" : ""}`}
                    onClick={() => setBalanceAdjustmentMode("add")}
                    aria-pressed={balanceAdjustmentMode === "add"}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    className={`accounts-detail__balance-adjustment-toggle-button ${balanceAdjustmentMode === "remove" ? "is-active" : ""}`}
                    onClick={() => setBalanceAdjustmentMode("remove")}
                    aria-pressed={balanceAdjustmentMode === "remove"}
                  >
                    Remove
                  </button>
                </div>

                <label className="accounts-detail__balance-adjustment-field">
                  <span>Amount</span>
                  <div className="accounts-detail__balance-adjustment-amount-row">
                    <span className="accounts-detail__balance-adjustment-currency">{account.currency}</span>
                    <input
                      value={balanceAdjustmentAmount}
                      onChange={(event) => setBalanceAdjustmentAmount(event.target.value)}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      autoFocus
                      required
                    />
                  </div>
                </label>

                {balanceAdjustmentError ? <p className="field-error">{balanceAdjustmentError}</p> : null}

                <div className="form-actions">
                  <button className="button button-secondary" type="button" onClick={closeBalanceAdjustment} disabled={balanceAdjustmentSaving}>
                    Cancel
                  </button>
                  <button className="button button-primary" type="submit" disabled={balanceAdjustmentSaving}>
                    {balanceAdjustmentSaving
                      ? "Saving..."
                      : balanceAdjustmentMode === "add"
                        ? balanceAdjustmentIsCash
                          ? "Add cash"
                          : "Add balance"
                        : balanceAdjustmentIsCash
                          ? "Remove cash"
                          : "Remove balance"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}
      </section>
    </CloverShell>
  );
}
