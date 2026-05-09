"use client";

import type { ChangeEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImportPasswordModal } from "@/components/import-password-modal";
import { PlanLimitNudge } from "@/components/plan-limit-nudge";
import { ImportUploadDock } from "@/components/import-upload-dock";
import { capturePostHogClientEvent, capturePostHogClientEventOnce, analyticsOnceKey } from "@/components/posthog-analytics";
import { formatDuplicateImportMessage } from "@/lib/import-duplicate-message";
import { isLikelyPasswordProtectedPdf } from "@/lib/import-file-password";
import { extractTextFromFile } from "@/lib/import-file-text";
import { postFileWithProgress } from "@/lib/import-file-post";
import { validateImportFile } from "@/lib/import-file-validation";
import { type ImportImageMode } from "@/lib/import-image-mode";
import { formatUploadAccountDisplayName } from "@/lib/account-display";
import {
  detectStatementMetadata,
  getTrailingBalanceFromParsedRows,
  inferAccountTypeFromStatement,
  normalizeInstitutionCurrency,
  parseImportText,
} from "@/lib/import-parser";
import { parsePlanLimitMessage, parsePlanLimitPayload, type PlanLimitPayload } from "@/lib/plan-limit-nudges";
import {
  getCachedAccountsWorkspace,
  findCachedTransactionsForAccount,
  syncImportedWorkspaceAccountCaches,
  syncImportedWorkspaceTransactionCaches,
} from "@/lib/workspace-cache";
import {
  clearImportActivity,
  setImportActivity,
  type ImportActivityLocation,
  type ImportActivitySnapshot,
  type ImportActivityStatus,
} from "@/lib/import-activity";
import type { UploadInsightsSummary } from "@/components/upload-insights-toast";

type AccountOption = {
  id: string;
  name: string;
  institution: string | null;
  accountNumber?: string | null;
  balance?: string | null;
  currency?: string | null;
  type: string;
};

type AccountRule = {
  accountId: string | null;
  accountName: string;
  institution: string | null;
  accountType: string;
};

type ImportFilesModalProps = {
  open: boolean;
  workspaceId: string;
  accounts: AccountOption[];
  accountRules?: AccountRule[];
  defaultAccountId?: string | null;
  showQaTools?: boolean;
  initialFiles?: File[] | null;
  onInitialFilesConsumed?: () => void;
  backgroundOnly?: boolean;
  onClose: () => void;
  onImported: (summary: UploadInsightsSummary) => Promise<void> | void;
};

type ImportStatus = "pending" | "needs_password" | "parsing" | "importing" | "done" | "error";

type ConfirmationState = "none" | "pending" | "staged" | "confirmed";

type UploadAccountType = "bank" | "wallet" | "credit_card" | "cash" | "investment" | "other" | null;

type StatementIdentity = {
  accountName: string | null;
  institution: string | null;
  accountNumber: string | null;
  accountType: UploadAccountType;
};

type QueuedFile = {
  id: string;
  file: File;
  importMode: ImportImageMode;
  status: ImportStatus;
  confirmationState: ConfirmationState;
  error: string | null;
  password: string;
  passwordVisible: boolean;
  importFileId: string | null;
  targetAccountId: string | null;
  optimisticAccountId: string | null;
  importedRows: number | null;
  progress: number;
  progressLabel: string;
  errorCode?: string | null;
  errorTitle?: string | null;
  errorNextSteps?: string[] | null;
};

type ImportProcessResult = {
  status: "done" | "needs_password" | "error" | "staged";
  importedRows: number | null;
  summary: UploadInsightsSummary | null;
};

type QaFinding = {
  code: string;
  severity: "info" | "warning" | "critical";
  field: string | null;
  message: string;
  suggestion: string | null;
  confidence: number;
};

type QaRunSummary = {
  id: string;
  score: number;
  source: string;
  status: string;
  findingCount: number;
  criticalCount: number;
  parserVersion: string | null;
  totalDurationMs: number | null;
  parserDurationMs: number | null;
  feedbackPayload: {
    metrics?: Record<string, unknown>;
  } | null;
  findings: QaFinding[];
};

type ImportStatusPayload = {
  importFile?: {
    status?: string;
    accountId?: string | null;
    processingPhase?: string | null;
    processingMessage?: string | null;
    processingAttempt?: number | null;
    processingTargetScore?: number | null;
    processingCurrentScore?: number | null;
  };
  parsedRowsCount?: number;
  confirmedTransactionsCount?: number;
  confirmationStatus?: string;
  telemetryPhase?: string | null;
  telemetryLabel?: string | null;
  telemetryMessage?: string | null;
  canResume?: boolean | null;
  resumeReason?: string | null;
  statementCheckpoint?: {
    sourceMetadata?: Record<string, unknown> | null;
    endingBalance?: string | null;
  } | null;
};

const isPasswordError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String((error as { name?: unknown }).name ?? "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return /password/i.test(name) || /password/i.test(message);
};

const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

const fileTypeLabel = (file: File) => {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".pdf") || file.type === "application/pdf") return "PDF";
  if (lowerName.endsWith(".csv")) return "CSV";
  if (
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg") ||
    lowerName.endsWith(".png") ||
    lowerName.endsWith(".webp") ||
    lowerName.endsWith(".heic") ||
    lowerName.endsWith(".heif")
  ) {
    return "Image";
  }
  return "File";
};

const fileAnalyticsBase = (file: File, workspaceId: string) => ({
  workspace_id: workspaceId || null,
  file_name: file.name,
  file_type: fileTypeLabel(file),
  file_size_bytes: file.size,
});

const getImportErrorCode = (error: unknown) => {
  if (error instanceof Error) {
    return error.name && error.name !== "Error" ? error.name : error.message || "unknown_error";
  }

  return "unknown_error";
};

const RESUMABLE_IMPORT_ERROR_CODES = new Set(["I-104", "I-105", "I-106", "I-107"]);

const isResumableImportErrorCode = (code?: string | null) => {
  const normalized = (code ?? "").trim().toUpperCase();
  return RESUMABLE_IMPORT_ERROR_CODES.has(normalized);
};

const formatImportFailureMessage = (_file: File | string, errorMessage: string) => errorMessage;

type ImportErrorStage = "validation" | "password" | "upload" | "process" | "confirm" | "background" | "monitor" | "unknown";

type ImportErrorNotice = {
  code: string;
  title: string;
  message: string;
  nextSteps: string[];
};

const buildImportErrorNotice = (stage: ImportErrorStage, fileName: string | null, reason?: string | null): ImportErrorNotice => {
  const codeMap: Record<ImportErrorStage, string> = {
    validation: "I-101",
    password: "I-102",
    upload: "I-103",
    process: "I-104",
    confirm: "I-105",
    background: "I-106",
    monitor: "I-107",
    unknown: "I-199",
  };

  const titleMap: Record<ImportErrorStage, string> = {
    validation: "That file needs a quick check",
    password: "A password is needed",
    upload: "Clover couldn't upload that file",
    process: "Clover couldn't finish reading that file",
    confirm: "Clover couldn't save that import",
    background: "Clover couldn't finish that file in the background",
    monitor: "Clover couldn't keep tracking that file",
    unknown: "Clover hit an import snag",
  };

  const fileLabel = fileName ? `${fileName}` : "This file";
  const reasonHint =
    stage === "password"
      ? "Unlock the file with its password and try again."
      : stage === "validation"
        ? "Upload a clearer PDF, CSV, or image file."
        : stage === "monitor"
          ? "The account details were read, but Clover needed more time to finish saving the import."
          : stage === "background"
            ? "Clover parsed the file, but the background reconciliation stalled."
            : stage === "confirm"
              ? "Clover could parse the file, but couldn't finish confirming it."
              : "Re-upload the original file and keep the tab open while Clover works.";

  const nextSteps =
    stage === "password"
      ? [
          "Unlock the file with its password, then try again.",
          "If the password keeps failing, re-download the original statement and re-upload it.",
          "You can always add missing transactions manually in Transactions.",
        ]
      : stage === "monitor" || stage === "background" || stage === "confirm"
        ? [
            "The parsed rows were kept, so you can safely go back to Accounts or Transactions.",
            "If Clover shows Resume import, use it to continue from the saved file.",
            "If the final import never completes, re-upload the file once and let Clover finish in the background.",
            "If anything is still missing, add the transactions manually in Transactions.",
          ]
        : [
            "Re-upload the original PDF or CSV.",
            "If Clover still stalls, add the missing transactions manually in Transactions.",
            "If the statement looks off after import, check Review before confirming anything.",
          ];

  return {
    code: codeMap[stage],
    title: titleMap[stage],
    message: `${fileLabel}: Clover wasn't able to finish this import.`,
    nextSteps: [reasonHint, ...nextSteps].filter((value, index, array) => value && array.indexOf(value) === index),
  };
};

const normalizeStatementAccountName = (name: string, institution?: string | null) => {
  const trimmed = name.trim();
  const normalizedInstitution = (institution ?? "").trim();
  if (!normalizedInstitution) {
    return trimmed;
  }

  const suffix = trimmed.replace(/\D/g, "").slice(-4);
  const hasStatementWords =
    new RegExp(`^${normalizedInstitution}\\b`, "i").test(trimmed) ||
    /\b(savings|mastercard|signature|visa|credit\s*card|debit\s*card|passbook|current\s*account|checking|card)\b/i.test(trimmed);

  if (!hasStatementWords) {
    return trimmed;
  }

  if (suffix) {
    return `${normalizedInstitution} ${suffix}`;
  }

  return normalizedInstitution;
};

const accountKey = (name: string, institution: string | null, accountNumber?: string | null) =>
  `${normalizeStatementAccountName(name, institution).toLowerCase()}::${(institution ?? "").trim().toLowerCase()}::${(
    accountNumber ?? ""
  )
    .replace(/\D/g, "")
    .slice(-4)}`;

const extractLastFourDigits = (value?: string | null) => {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
};

const accountRuleKey = (name: string, institution: string | null) =>
  `${(institution ?? "").trim().toLowerCase()}::${extractLastFourDigits(name) ?? name.trim().toLowerCase()}`;

const importedAccountIdentityKey = (name: string | null, institution: string | null, accountNumber?: string | null) =>
  `${normalizeStatementAccountName(name ?? "", institution).toLowerCase()}::${(institution ?? "").trim().toLowerCase()}::${(
    accountNumber ?? ""
  )
    .replace(/\D/g, "")
    .slice(-4)}`;

const findKnownImportedBalance = (
  accounts: AccountOption[],
  params: {
    workspaceId?: string | null;
    accountId?: string | null;
    accountName?: string | null;
    institution?: string | null;
    accountNumber?: string | null;
    accountType?: UploadAccountType;
  }
) => {
  const cachedAccounts: AccountOption[] = params.workspaceId
    ? ((getCachedAccountsWorkspace(params.workspaceId)?.accounts ?? []) as AccountOption[])
    : [];
  const candidateAccounts = [...cachedAccounts, ...accounts];
  const normalizedName = params.accountName
    ? formatUploadAccountDisplayName(
        params.accountName,
        params.institution ?? null,
        params.accountNumber ?? null,
        params.accountType ?? null
      )
    : null;
  const targetIdentityKey = normalizedName
    ? importedAccountIdentityKey(normalizedName, params.institution ?? null, params.accountNumber ?? null)
    : null;
  const targetInstitution = (params.institution ?? "").trim().toLowerCase();
  const targetLastFour = extractLastFourDigits(params.accountNumber ?? normalizedName ?? null);

  const matched = candidateAccounts.find((account) => {
    if (params.accountId && account.id === params.accountId) {
      return true;
    }

    const accountIdentityKey = importedAccountIdentityKey(
      typeof account.name === "string" ? account.name : null,
      typeof account.institution === "string" ? account.institution : null,
      typeof account.accountNumber === "string" ? account.accountNumber : null
    );
    if (targetIdentityKey && accountIdentityKey === targetIdentityKey) {
      return true;
    }

    const accountInstitution = String(account.institution ?? "").trim().toLowerCase();
    const accountLastFour = extractLastFourDigits(
      typeof account.accountNumber === "string" ? account.accountNumber : typeof account.name === "string" ? account.name : null
    );

    return Boolean(
      targetInstitution &&
        accountInstitution &&
        targetInstitution === accountInstitution &&
        targetLastFour &&
        accountLastFour &&
        targetLastFour === accountLastFour
    );
  });

  return pickStableBalance((matched as { balance?: unknown } | undefined)?.balance ?? null);
};

const getKnownPreviewTransactions = (params: {
  workspaceId: string;
  accountId: string | null;
  optimisticAccountId?: string | null;
  accountName?: string | null;
  institution?: string | null;
  accountNumber?: string | null;
  accountType?: UploadAccountType;
  previewTransactions?: NonNullable<UploadInsightsSummary["previewTransactions"]>;
}) => {
  if (Array.isArray(params.previewTransactions) && params.previewTransactions.length > 0) {
    return params.previewTransactions;
  }

  if (!params.workspaceId || !params.accountId) {
    return [];
  }

  const cached = findCachedTransactionsForAccount(params.accountId, {
    optimisticAccountId: params.optimisticAccountId ?? null,
    name: params.accountName ?? null,
    institution: params.institution ?? null,
    accountNumber: params.accountNumber ?? null,
    type: params.accountType ?? null,
  });

  if (!cached || !Array.isArray(cached.transactions) || cached.transactions.length === 0) {
    return [];
  }

  return cached.transactions as NonNullable<UploadInsightsSummary["previewTransactions"]>;
};

const PDF_ENCRYPTION_MARKERS = ["/Encrypt", "/Standard", "/V 2", "/V 4", "/V 5"];

const buildOptimisticUploadSummary = (
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
): UploadInsightsSummary => ({
  fileName,
  rowsImported: importedRows,
  accountId,
  accountName,
  institution,
  accountNumber,
  accountType,
  balance: showBalanceEvenIfEmpty || importedRows > 0 ? balance : null,
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
});

const toBalanceString = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toFixed(2) : null;
  }

  try {
    const stringified = String(value).trim();
    return stringified ? stringified : null;
  } catch {
    return null;
  }
};

const pickStableBalance = (...values: Array<unknown>) => {
  let firstMeaningful: string | null = null;

  for (const value of values) {
    const normalized = toBalanceString(value);
    if (!normalized) {
      continue;
    }

    if (firstMeaningful === null) {
      firstMeaningful = normalized;
    }

    const numeric = Number(normalized.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(numeric) && numeric !== 0) {
      return normalized;
    }
  }

  return firstMeaningful;
};

const buildImportedWorkspaceAccount = (summary: UploadInsightsSummary) => {
  const accountId = summary.accountId ?? summary.optimisticAccountId ?? null;
  if (!accountId || !summary.accountName) {
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
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
};

const seedImportedWorkspaceCaches = (workspaceId: string, summary: UploadInsightsSummary) => {
  const importedAccount = buildImportedWorkspaceAccount(summary);
  if (!importedAccount) {
    return;
  }

  const currentAccount = getCachedAccountsWorkspace(workspaceId)?.accounts.find((entry) => {
    const entryId = typeof entry.id === "string" ? entry.id : "";
    const optimisticId = typeof (entry as { optimisticAccountId?: string | null }).optimisticAccountId === "string"
      ? (entry as { optimisticAccountId?: string | null }).optimisticAccountId
      : "";
    const entryName = typeof entry.name === "string" ? normalizeStatementAccountName(entry.name, typeof entry.institution === "string" ? entry.institution : null) : "";
    const importedName = formatUploadAccountDisplayName(
      summary.accountName ?? "",
      summary.institution ?? null,
      summary.accountNumber ?? null,
      summary.accountType ?? null
    );
    const entryInstitution = typeof entry.institution === "string" ? entry.institution : null;
    const entryAccountNumber = typeof (entry as { accountNumber?: unknown }).accountNumber === "string" ? (entry as { accountNumber?: string }).accountNumber : null;
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
  if (Array.isArray(summary.previewTransactions) && summary.previewTransactions.length > 0) {
    syncImportedWorkspaceTransactionCaches(workspaceId, summary.previewTransactions);
  }
};

const waitForImportSettledVisibility = async (params: {
  workspaceId: string;
  accountId: string | null;
  importedRows: number;
  expectedBalance: string | null;
  timeoutMs?: number;
}) => {
  const accountId = params.accountId && !params.accountId.startsWith("optimistic-") ? params.accountId : null;
  if (!accountId) {
    return true;
  }

  const expectedBalance = toBalanceString(params.expectedBalance);
  const timeoutMs = params.timeoutMs ?? 180_000;
  const startedAt = Date.now();
  const pollDelayMs = 2500;

  const normalizeBalance = (value: unknown) => {
    const text = toBalanceString(value);
    if (!text) {
      return null;
    }

    const numeric = Number(text.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(numeric) ? numeric : null;
  };

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const accountResponse = await fetch(`/api/accounts/${encodeURIComponent(accountId)}`, {
        cache: "no-store",
      });

      if (!accountResponse.ok) {
        await new Promise((resolve) => window.setTimeout(resolve, pollDelayMs));
        continue;
      }

      const accountPayload = await accountResponse.json().catch(() => null);
      const account = accountPayload?.account ?? null;
      const accountBalance = normalizeBalance(account?.balance);
      const accountLooksReady = Boolean(account && typeof account.id === "string" && account.id === accountId);
      const balanceLooksReady =
        expectedBalance === null
          ? accountBalance !== null
          : accountBalance !== null && normalizeBalance(expectedBalance) === accountBalance;

      if (!accountLooksReady || !balanceLooksReady) {
        await new Promise((resolve) => window.setTimeout(resolve, pollDelayMs));
        continue;
      }

      if (params.importedRows > 0) {
        const transactionsResponse = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/transactions?page=1&pageSize=1`, {
          cache: "no-store",
        });
        if (!transactionsResponse.ok) {
          await new Promise((resolve) => window.setTimeout(resolve, pollDelayMs));
          continue;
        }

        const categoriesResponse = await fetch(`/api/categories?workspaceId=${encodeURIComponent(params.workspaceId)}`, {
          cache: "no-store",
        });
        if (!categoriesResponse.ok) {
          await new Promise((resolve) => window.setTimeout(resolve, pollDelayMs));
          continue;
        }

        const transactionPayload = await transactionsResponse.json().catch(() => null);
        const totalCount = Number(transactionPayload?.totalCount ?? 0);
        const rows = Array.isArray(transactionPayload?.transactions) ? transactionPayload.transactions : [];
        if (totalCount <= 0 || rows.length <= 0) {
          await new Promise((resolve) => window.setTimeout(resolve, pollDelayMs));
          continue;
        }

        const categoryPayload = await categoriesResponse.json().catch(() => null);
        const categories = Array.isArray(categoryPayload?.categories) ? categoryPayload.categories : [];
        if (categories.length <= 0) {
          await new Promise((resolve) => window.setTimeout(resolve, pollDelayMs));
          continue;
        }
      }

      return true;
    } catch {
      await new Promise((resolve) => window.setTimeout(resolve, pollDelayMs));
    }
  }

  return false;
};

const buildOptimisticPreviewTransactions = (
  rows: Array<Record<string, unknown>>,
  params: {
    importFileId: string;
    accountId: string;
    accountName: string;
    institution: string | null;
  }
): NonNullable<UploadInsightsSummary["previewTransactions"]> => {
  const previewTransactions = rows
    .map((row, index) => {
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
      const type = row.type === "income" || row.type === "expense" || row.type === "transfer" ? row.type : "expense";
      const categoryName = typeof row.categoryName === "string" && row.categoryName.trim() ? row.categoryName.trim() : null;
      const description = typeof row.description === "string" && row.description.trim() ? row.description.trim() : null;
      const isTransfer = type === "transfer";

      if (!date || !amount) {
        return null;
      }

      return {
        id: `optimistic-${params.importFileId}-${index}`,
        importFileId: params.importFileId,
        accountId: params.accountId,
        accountName: params.accountName,
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

const loadOptimisticPreviewTransactions = async (
  importFileId: string,
  accountId: string,
  accountName: string,
  institution: string | null
) => {
  const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(`/api/imports/${importFileId}/preview`);
    if (response.ok) {
      const payload = await response.json().catch(() => ({}));
      const parsedRows = Array.isArray(payload.parsedRows) ? payload.parsedRows : [];
      if (parsedRows.length > 0) {
        return buildOptimisticPreviewTransactions(parsedRows, {
          importFileId,
          accountId,
          accountName,
          institution,
        });
      }
    }

    if (attempt < 5) {
      await sleep(250 + attempt * 100);
    }
  }

  return [];
};

const isQuickPasswordProtectedPdf = async (file: File) => {
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".pdf") && file.type !== "application/pdf") {
    return false;
  }

  const bytes = await file.slice(0, 65536).arrayBuffer();
  const header = new TextDecoder("latin1").decode(bytes);
  const normalized = header.replace(/\s+/g, " ");
  return PDF_ENCRYPTION_MARKERS.some((marker) => normalized.includes(marker));
};

const guessStatementIdentity = (fileName: string) => {
  const lowerName = fileName.toLowerCase();

  if (lowerName.includes("gcash")) {
    return { accountName: "GCash", institution: "GCash", accountNumber: null };
  }

  if (lowerName.includes("rcbc")) {
    const match = lowerName.match(/(\d{4})(?:_unlocked)?\.pdf$/i) ?? lowerName.match(/(\d{4})/);
    return {
      accountName: match ? `RCBC ${match[1]}` : "RCBC",
      institution: "RCBC",
      accountNumber: null,
    };
  }

  if (lowerName.includes("unionbank") || lowerName.includes("union bank")) {
    return { accountName: "UnionBank", institution: "UnionBank", accountNumber: null };
  }

  if (lowerName.includes("bpi")) {
    return { accountName: "BPI", institution: "BPI", accountNumber: null };
  }

  if (lowerName.includes("metrobank") || lowerName.includes("mb-online") || lowerName.includes("msoa")) {
    const match = lowerName.match(/(\d{4})(?=[^\d]*$)/) ?? lowerName.match(/(\d{4})/);
    return {
      accountName: match ? `Metrobank ${match[1]}` : "Metrobank",
      institution: "Metrobank",
      accountNumber: null,
    };
  }

  return null;
};

const resolveStatementIdentityFromMetadata = (metadata: unknown) => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const source = metadata as Record<string, unknown>;
  const accountName = typeof source.accountName === "string" && source.accountName.trim() ? source.accountName.trim() : null;
  const institution = typeof source.institution === "string" && source.institution.trim() ? source.institution.trim() : null;
  const accountNumber =
    typeof source.accountNumber === "string" && source.accountNumber.trim() ? source.accountNumber.trim() : null;

  if (!accountName && !institution && !accountNumber) {
    return null;
  }

  const rawAccountType = typeof source.accountType === "string" ? source.accountType.trim() : "";
  const accountType =
    rawAccountType === "bank" ||
    rawAccountType === "wallet" ||
    rawAccountType === "credit_card" ||
    rawAccountType === "cash" ||
    rawAccountType === "investment" ||
    rawAccountType === "other"
      ? rawAccountType
      : inferAccountTypeFromStatement(institution, accountName, "bank");

  return {
    accountName,
    institution,
    accountNumber,
    accountType,
  };
};

const deriveFallbackAccountNameFromFileName = (fileName: string) => {
  const stem = fileName.replace(/\.[^.]+$/, "").trim();
  return stem || "Imported statement";
};

const hasStatementSuffix = (name?: string | null) => /\b\d{4}\b/.test(name ?? "");

const isGenericSameInstitutionAccount = (account: AccountOption, institution: string | null) => {
  if (!institution) {
    return false;
  }

  return (
    account.institution?.trim().toLowerCase() === institution.trim().toLowerCase() &&
    !hasStatementSuffix(account.name)
  );
};

const combineUploadInsightsSummaries = (summaries: UploadInsightsSummary[]): UploadInsightsSummary => {
  const [firstSummary] = summaries;
  const rowsImported = summaries.reduce((total, summary) => total + summary.rowsImported, 0);
  const incomeTotal = summaries.reduce((total, summary) => total + summary.incomeTotal, 0);
  const expenseTotal = summaries.reduce((total, summary) => total + summary.expenseTotal, 0);
  const netTotal = summaries.reduce((total, summary) => total + summary.netTotal, 0);
  const sharedAccountName = summaries.every((summary) => summary.accountName === firstSummary.accountName)
    ? firstSummary.accountName
    : null;
  const sharedInstitution = summaries.every((summary) => summary.institution === firstSummary.institution)
    ? firstSummary.institution
    : null;
  const topCategory = [...summaries]
    .filter((summary) => summary.topCategoryName && summary.topCategoryAmount !== null)
    .sort((left, right) => (right.topCategoryAmount ?? 0) - (left.topCategoryAmount ?? 0))[0];
  const topMerchant = [...summaries]
    .filter((summary) => summary.topMerchantName && summary.topMerchantCount !== null)
    .sort((left, right) => (right.topMerchantCount ?? 0) - (left.topMerchantCount ?? 0))[0];
  const previewTransactions = summaries.flatMap((summary) => summary.previewTransactions ?? []);
  const sharedAccountType = summaries.every((summary) => summary.accountType === firstSummary.accountType)
    ? firstSummary.accountType ?? null
    : null;

  return {
    fileName: summaries.length === 1 ? firstSummary.fileName : `${summaries.length} files`,
    rowsImported,
    accountId: summaries.every((summary) => summary.accountId === firstSummary.accountId)
      ? firstSummary.accountId
      : null,
    accountName: sharedAccountName,
    institution: sharedInstitution,
    accountType: sharedAccountType,
    balance: summaries.every((summary) => summary.balance === firstSummary.balance)
      ? firstSummary.balance
      : null,
    incomeTotal,
    expenseTotal,
    netTotal,
    topCategoryName: topCategory?.topCategoryName ?? null,
    topCategoryAmount: topCategory?.topCategoryAmount ?? null,
    topCategoryShare: topCategory?.topCategoryShare ?? null,
    topMerchantName: topMerchant?.topMerchantName ?? null,
    topMerchantCount: topMerchant?.topMerchantCount ?? null,
    optimistic: false,
    optimisticAccountId: summaries.every((summary) => summary.optimisticAccountId === firstSummary.optimisticAccountId)
      ? firstSummary.optimisticAccountId ?? null
      : null,
    previewTransactions,
  };
};

const friendlyImportPhaseLabel = (label: string, fileName?: string | null) => {
  const fileSuffix = fileName ? ` ${fileName}` : "";

  switch (label) {
    case "Starting upload":
    case "Uploading the file":
      return "Uploading statement";
    case "Password needed":
      return "Password needed";
    case "Waiting for account details":
    case "Waiting for statement identity":
    case "Reading locally":
    case "Reading statement details":
    case "Clover is getting your file ready":
    case "Loading account":
    case "Reading account details":
      return "Reading account details";
    case "Preview ready":
      return "Account details ready";
    case "Queued for background processing":
      return "Queued for background processing";
    case "Finalizing in background":
    case "Finalizing import":
      return "Saving and reconciling";
    case "Loading transactions":
    case "Parsing in background":
      return "Identifying transactions";
    case "Clover is reading the document":
      return "Reading document";
    case "Import failed":
      return "Import failed";
    case "Done":
      return "Import complete";
    case "Queued":
      return "Queued";
    default:
      return `${label}${fileSuffix}`.trim();
  }
};

const friendlyImportProgressLabel = (label: string, fileName?: string | null) => {
  const fileSuffix = fileName ? ` ${fileName}` : "";

  switch (label) {
    case "Starting upload":
      return "Clover is preparing the statement for upload";
    case "Clover is getting your file ready":
      return "Clover is preparing the statement for upload";
    case "Uploading the file":
      return "Clover is sending the statement to the server";
    case "Password needed":
      return "This statement needs a password before Clover can continue";
    case "Waiting for account details":
      return "Clover is extracting the account name, number, and balance";
    case "Waiting for statement identity":
      return "Clover is reading the statement layout";
    case "Reading locally":
      return "Clover is scanning the file locally";
    case "Preview ready":
      return "Clover found the account details and is ready to show them";
    case "Queued for background processing":
      return "Clover will finish the remaining work in the background";
    case "Finalizing in background":
    case "Finalizing import":
      return "Clover is matching transactions, categories, and duplicates";
    case "Loading account":
      return "Clover already found the account and is matching it to your workspace";
    case "Loading transactions":
      return "Clover is identifying transactions and assigning categories";
    case "Parsing in background":
      return "Clover is identifying transactions and categories";
    case "Reading account details":
      return "Clover is pulling the account name, number, and balance into preview";
    case "Reading statement details":
      return "Clover is reading the account details, balance, and transactions";
    case "Import failed":
      return "Clover couldn't finish the import";
    case "Done":
      return "The file is imported and ready";
    case "Queued":
      return "Clover is waiting to start";
    default:
      return label;
  }
};

const IMPORT_PROGRESS = {
  preparing: 20,
  uploading: 40,
  parsing: 60,
  loadingAccount: 80,
  finalizing: 95,
  done: 100,
} as const;

const yieldToPaint = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));

export function ImportFilesModal({
  open,
  workspaceId,
  accounts,
  accountRules = [],
  defaultAccountId,
  showQaTools = false,
  initialFiles = null,
  onInitialFilesConsumed,
  backgroundOnly = false,
  onClose,
  onImported,
}: ImportFilesModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const accountIdByKeyRef = useRef(new Map<string, string>());
  const autoStartRef = useRef(false);
  const [items, setItems] = useState<QueuedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const selectedImportMode: ImportImageMode = "statement";
  const [launchInBackground, setLaunchInBackground] = useState(backgroundOnly);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Upload PDF, CSV, or image files to import documents and transactions.");
  const [validationNotice, setValidationNotice] = useState<string | null>(null);
  const [selectedPasswordItemId, setSelectedPasswordItemId] = useState<string | null>(null);
  const [planTier, setPlanTier] = useState<"free" | "pro" | "unknown">("unknown");
  const [monthlyUploadLimit, setMonthlyUploadLimit] = useState<number | null>(10);
  const [planLimitNudge, setPlanLimitNudge] = useState<PlanLimitPayload | null>(null);
  const [qaRunsByItemId, setQaRunsByItemId] = useState<Record<string, QaRunSummary | null>>({});
  const [qaLoadingByItemId, setQaLoadingByItemId] = useState<Record<string, boolean>>({});
  const [qaErrorByItemId, setQaErrorByItemId] = useState<Record<string, string | null>>({});
  const autoLoadedQaIdsRef = useRef(new Set<string>());
  const localPreparseStartedRef = useRef(new Set<string>());
  const handleStartImportRef = useRef<null | (() => Promise<void>)>(null);
  const initialFilesSignatureRef = useRef<string | null>(null);
  const importActivitySurfaceRef = useRef<ImportActivityLocation>("modal");
  const lastImportActivityRef = useRef<ImportActivitySnapshot | null>(null);
  const autoCloseAfterStartRef = useRef(false);
  const autoCloseCompletedBatchTimerRef = useRef<number | null>(null);
  const wasOpenRef = useRef(open);
  const itemsRef = useRef<QueuedFile[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const publishImportActivity = (
    snapshot:
      | (Partial<Omit<ImportActivitySnapshot, "updatedAt">> & {
          status: ImportActivityStatus;
          workspaceId?: string;
          surface?: ImportActivityLocation;
          errorTitle?: string | null;
          errorNextSteps?: string[] | null;
        })
      | null
  ) => {
    if (!workspaceId) {
      return;
    }

    if (!snapshot) {
      lastImportActivityRef.current = null;
      clearImportActivity();
      return;
    }

    const nextSnapshot: ImportActivitySnapshot = {
      workspaceId: snapshot.workspaceId ?? workspaceId,
      surface: snapshot.surface ?? importActivitySurfaceRef.current,
      status: snapshot.status,
      fileName: snapshot.fileName ?? null,
      fileIndex: Number(snapshot.fileIndex ?? 0),
      fileTotal: Number(snapshot.fileTotal ?? 0),
      completedFiles: Number(snapshot.completedFiles ?? 0),
      progress: Number(snapshot.progress ?? 0),
      detail: snapshot.detail ?? "",
      summary: snapshot.summary ?? null,
      errorCode: snapshot.errorCode ?? null,
      errorMessage: snapshot.errorMessage ?? null,
      errorTitle: snapshot.errorTitle ?? null,
      errorNextSteps: snapshot.errorNextSteps ?? null,
      updatedAt: Date.now(),
    };
    const previousSnapshot = lastImportActivityRef.current;
    if (
      previousSnapshot &&
      nextSnapshot.status === "active" &&
      previousSnapshot.workspaceId === nextSnapshot.workspaceId &&
      previousSnapshot.fileName === nextSnapshot.fileName
    ) {
      nextSnapshot.progress = Math.max(previousSnapshot.progress ?? 0, nextSnapshot.progress ?? 0);
    }
    lastImportActivityRef.current = nextSnapshot;
    setImportActivity(nextSnapshot);
  };

  const closeImportAfterError = (
    itemId: string,
    stage: ImportErrorStage,
    fileName: string,
    reason?: string | null
  ) => {
    const notice = buildImportErrorNotice(stage, fileName, reason);
    updateItem(itemId, {
      status: "error",
      confirmationState: "staged",
      error: notice.message,
      errorCode: notice.code,
      errorTitle: notice.title,
      errorNextSteps: notice.nextSteps,
      progress: 0,
      progressLabel: "Import issue",
    });
    publishImportActivity({
      workspaceId,
      surface: "background",
      status: "error",
      fileName,
      fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
      fileTotal: items.length,
      completedFiles: completedFileCount,
      progress: 0,
      detail: `${notice.code} ${notice.title}`,
      summary: null,
      errorCode: notice.code,
      errorMessage: notice.message,
      errorTitle: notice.title,
      errorNextSteps: notice.nextSteps,
    });
    setBusy(false);
    autoCloseAfterStartRef.current = false;
  };

  const closeImportAsRecoverable = (
    itemId: string,
    fileName: string,
    detail: string,
    progressLabel = "Finalizing import"
  ) => {
    updateItem(itemId, {
      status: "importing",
      confirmationState: "staged",
      error: null,
      errorCode: null,
      errorTitle: null,
      errorNextSteps: null,
      progress: Math.max(92, IMPORT_PROGRESS.loadingAccount),
      progressLabel,
    });
    publishImportActivity({
      workspaceId,
      surface: "background",
      status: "active",
      fileName,
      fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
      fileTotal: items.length,
      completedFiles: completedFileCount,
      progress: Math.max(92, IMPORT_PROGRESS.loadingAccount),
      detail,
      summary: null,
      errorMessage: null,
    });
    setBusy(false);
    autoCloseAfterStartRef.current = false;
  };

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;

    if (!open) {
      if (!wasOpen) {
        return;
      }

      setDragActive(false);
      setSelectedAccountId("");
      setSelectedPasswordItemId(null);
      setPlanTier("unknown");
      setMonthlyUploadLimit(10);
      setPlanLimitNudge(null);
      setQaRunsByItemId({});
      setQaLoadingByItemId({});
      setQaErrorByItemId({});
      autoLoadedQaIdsRef.current.clear();
      localPreparseStartedRef.current.clear();
      autoCloseAfterStartRef.current = false;
      accountIdByKeyRef.current.clear();
      setMessage("Upload PDF, CSV, or image files to import documents and transactions.");
      setValidationNotice(null);
      initialFilesSignatureRef.current = null;
      if (!items.some((item) => item.status === "pending" || item.status === "needs_password" || item.status === "parsing" || item.status === "importing")) {
        setItems([]);
        setBusy(false);
      }
      return;
    }

    importActivitySurfaceRef.current = backgroundOnly || launchInBackground ? "background" : "modal";

    router.prefetch("/accounts");
    router.prefetch("/transactions");
    if (workspaceId) {
      void Promise.all([
        fetch(`/api/accounts?workspaceId=${encodeURIComponent(workspaceId)}`),
        fetch(`/api/transactions?workspaceId=${encodeURIComponent(workspaceId)}`),
      ]);
    }

    const map = new Map<string, string>();
    for (const account of accounts) {
      map.set(accountKey(account.name, account.institution, account.accountNumber), account.id);
    }
    accountIdByKeyRef.current = map;

    setSelectedAccountId((current) => {
      if (current && accounts.some((account) => account.id === current)) {
        return current;
      }

      return defaultAccountId ?? "";
    });
    setMessage("Upload PDF, CSV, or image files to import documents and transactions.");
    setValidationNotice(null);
  }, [accounts, backgroundOnly, defaultAccountId, items, launchInBackground, open]);

  useEffect(() => {
    if (!open) {
      setLaunchInBackground(backgroundOnly);
      return;
    }

    return () => {
      importActivitySurfaceRef.current = "background";
      const snapshot = lastImportActivityRef.current;
      if (!snapshot) {
        clearImportActivity();
        return;
      }

      if (snapshot.status === "active" || snapshot.status === "done" || snapshot.status === "error") {
        setImportActivity({
          ...snapshot,
          surface: "background",
        });
        return;
      }

      clearImportActivity();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !initialFiles || initialFiles.length === 0) {
      return;
    }

    const signature = initialFiles.map(fileKey).join("|");
    if (initialFilesSignatureRef.current === signature) {
      return;
    }

    initialFilesSignatureRef.current = signature;
    addFiles(initialFiles);
    onInitialFilesConsumed?.();
  }, [initialFiles, open, onInitialFilesConsumed]);

  useEffect(() => {
    if (!open || items.length === 0 || !workspaceId) {
      return;
    }

    for (const item of items) {
      if (
        localPreparseStartedRef.current.has(item.id) ||
        item.confirmationState === "confirmed" ||
        item.status === "done" ||
        item.status === "error"
      ) {
        continue;
      }

      void preparsePendingItemLocally(item.id);
    }
  }, [items, open, preparsePendingItemLocally, workspaceId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    const loadPlanTier = async () => {
      try {
        const response = await fetch("/api/me");
        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        const nextPlanTier = payload?.user?.planTier === "pro" ? "pro" : "free";
        const nextMonthlyUploadLimit =
          payload?.user?.monthlyUploadLimit === null || payload?.user?.monthlyUploadLimit === undefined
            ? null
            : Number(payload.user.monthlyUploadLimit);
        if (!cancelled) {
          setPlanTier(nextPlanTier);
          setMonthlyUploadLimit(
            nextMonthlyUploadLimit === null
              ? null
              : Number.isFinite(nextMonthlyUploadLimit) && nextMonthlyUploadLimit >= 0
                ? nextMonthlyUploadLimit
                : 10
          );
        }
      } catch {
        if (!cancelled) {
          setPlanTier("unknown");
        }
      }
    };

    void loadPlanTier();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const showPlanLimitNudge = (payload: PlanLimitPayload) => {
    setPlanLimitNudge(payload);
    capturePostHogClientEvent("plan_limit_reached", {
      limit_type: payload.limitType,
      limit_value: payload.limitValue,
      plan_tier: payload.planTier,
      workspace_id: workspaceId || null,
    });
  };

  const createStatementAccount = async (
    name: string,
    institution: string | null,
    accountType?: UploadInsightsSummary["accountType"],
    accountNumber?: string | null,
    balance?: string | null,
    currency?: string | null
  ) => {
    const inferredType = accountType ?? inferAccountTypeFromStatement(institution, name, "bank");
    const normalizedCurrency = normalizeInstitutionCurrency(institution, currency ?? "PHP", name) ?? "PHP";
    const response = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        name,
        institution,
        accountNumber: accountNumber?.trim() || null,
        type: inferredType,
        currency: normalizedCurrency,
        balance: balance?.trim() || null,
        source: "upload",
      }),
    });

    if (!response.ok) {
      throw new Error("Unable to create an account for this document.");
    }

    const payload = await response.json();
    const accountId = String(payload.account?.id ?? "");
    if (!accountId) {
      throw new Error("The account could not be created.");
    }

    accountIdByKeyRef.current.set(accountKey(name, institution, accountNumber?.trim() || null), accountId);
    return accountId;
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const nextItem = items.find(
      (item) =>
        Boolean(item.importFileId) &&
        !autoLoadedQaIdsRef.current.has(item.id) &&
        !qaLoadingByItemId[item.id] &&
        (item.status === "importing" || item.status === "done" || item.confirmationState !== "none")
    );

    if (!nextItem) {
      return;
    }

    autoLoadedQaIdsRef.current.add(nextItem.id);
    void loadQaRun(nextItem.id).catch(() => null);
  }, [items, loadQaRun, open, qaLoadingByItemId, showQaTools]);

  const syncStatementAccountIdentity = async (
    accountId: string,
    name: string,
    institution: string | null,
    accountType?: UploadInsightsSummary["accountType"],
    accountNumber?: string | null,
    balance?: string | null,
    currency?: string | null
  ) => {
    const normalizedName = formatUploadAccountDisplayName(name, institution, accountNumber ?? null, accountType ?? null);
    const expectedType = accountType ?? inferAccountTypeFromStatement(institution, normalizedName, "bank");
    const current = accounts.find((account) => account.id === accountId);
    if (!current) {
      return;
    }

    const nextPayload: Record<string, string | null | undefined> = { workspaceId };
    if (current.type !== expectedType) {
      nextPayload.type = expectedType;
    }
    if (current.name !== normalizedName) {
      nextPayload.name = normalizedName;
    }
    const normalizedAccountNumber = accountNumber?.trim() || null;
    if ((current.accountNumber ?? null) !== normalizedAccountNumber) {
      nextPayload.accountNumber = normalizedAccountNumber;
    }
    const inferredCurrency = normalizeInstitutionCurrency(institution, currency ?? current.currency ?? null, normalizedName);
    if (inferredCurrency && (current.currency ?? "").toUpperCase() !== inferredCurrency) {
      nextPayload.currency = inferredCurrency;
    }
    const normalizedBalance = balance?.trim() || null;
    const currentBalance =
      typeof current.balance === "string" && current.balance.trim()
        ? Number(current.balance)
        : Number.NaN;
    const nextBalance = normalizedBalance === null ? Number.NaN : Number(normalizedBalance);
    if (
      normalizedBalance &&
      Number.isFinite(nextBalance) &&
      (!Number.isFinite(currentBalance) || currentBalance === 0 || Math.abs(currentBalance - nextBalance) > 0.000001)
    ) {
      nextPayload.balance = normalizedBalance;
    }

    if (Object.keys(nextPayload).length === 1) {
      return;
    }

    const response = await fetch(`/api/accounts/${accountId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextPayload),
    });

    if (!response.ok) {
      return;
    }
  };

  const addFiles = (incoming: FileList | File[], options?: { launchInBackground?: boolean }) => {
    const nextFiles = Array.from(incoming);
    if (nextFiles.length === 0) return;

    let feedbackMessage = "";
    let validationMessage = "";
    let shouldAutoClose = false;
    let additions: QueuedFile[] = [];
    const shouldLaunchInBackground = Boolean(options?.launchInBackground || backgroundOnly || launchInBackground);
      flushSync(() => {
        setItems((current) => {
        const existing = new Set(current.map((item) => fileKey(item.file)));
        const fileQueueLimit = monthlyUploadLimit === null ? Number.POSITIVE_INFINITY : Math.max(0, monthlyUploadLimit);
        const availableSlots = Math.max(0, fileQueueLimit - current.length);
      let skippedTooMany = 0;
      let additionsCount = 0;
      const validationIssues: string[] = [];

      additions = nextFiles.flatMap((file) => {
        const validationError = validateImportFile({
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type,
          importMode: selectedImportMode,
        });

        if (validationError) {
          if (validationError === "Import files must be 2 MB or smaller.") {
            validationIssues.push(`${file.name} is larger than 2 MB.`);
          } else if (validationError === "Only PDF, CSV, and common image files are supported.") {
            validationIssues.push(`${file.name} has an invalid file extension.`);
          } else {
            validationIssues.push(`${file.name} could not be added.`);
          }
          return [];
        }

        if (existing.has(fileKey(file))) {
          return [];
        }

        if (selectedImportMode !== "statement" && file.name.toLowerCase().endsWith(".csv")) {
          validationIssues.push(`${file.name} is a CSV file, so it should be uploaded as a statement instead.`);
          return [];
        }

        if (additionsCount >= availableSlots) {
          skippedTooMany += 1;
          return [];
        }

        additionsCount += 1;
        shouldAutoClose = !shouldLaunchInBackground;
        const guessedIdentity = guessStatementIdentity(file.name);
        const canUseOptimisticGuess = Boolean(guessedIdentity?.accountName && guessedIdentity.accountNumber);
        const optimisticAccountId = guessedIdentity && canUseOptimisticGuess ? `optimistic-${crypto.randomUUID()}` : null;
        capturePostHogClientEvent("file_upload_started", {
          ...fileAnalyticsBase(file, workspaceId),
          selected_account_id: selectedAccountId || null,
          selected_account_type: selectedAccountId ? accounts.find((account) => account.id === selectedAccountId)?.type ?? null : null,
        });
        return [
          {
            id: crypto.randomUUID(),
            file,
            status: "pending" as ImportStatus,
            confirmationState: "none" as ConfirmationState,
            error: null,
            password: "",
            passwordVisible: false,
            importMode: selectedImportMode,
            importFileId: null,
            targetAccountId: null,
            optimisticAccountId,
            importedRows: null,
            progress: IMPORT_PROGRESS.preparing,
            progressLabel: "Clover is getting your file ready",
          },
        ];
      });

      if (validationIssues.length > 0 && additions.length > 0) {
        feedbackMessage = `Added ${additions.length} file${additions.length === 1 ? "" : "s"} to the queue.`;
      } else if (validationIssues.length > 0 || skippedTooMany > 0) {
        feedbackMessage = "No files were added.";
      }

      if (validationIssues.length > 0 && skippedTooMany > 0) {
        validationMessage = `Warning: ${validationIssues.join(" ")} Clover also skipped ${skippedTooMany} file${skippedTooMany === 1 ? "" : "s"} over the ${monthlyUploadLimit}-file limit.`;
      } else if (validationIssues.length > 0) {
        validationMessage = `Warning: ${validationIssues.join(" ")}`;
      } else if (skippedTooMany > 0) {
        feedbackMessage = `Added ${additions.length} file${additions.length === 1 ? "" : "s"}; skipped ${skippedTooMany} file${skippedTooMany === 1 ? "" : "s"} over the ${monthlyUploadLimit}-file limit.`;
        if (monthlyUploadLimit !== null) {
          showPlanLimitNudge({
            planTier,
            limitType: "upload_limit",
            limitValue: monthlyUploadLimit,
          });
        }
      } else if (additions.length > 0) {
        feedbackMessage = `Added ${additions.length} file${additions.length === 1 ? "" : "s"} to the queue.`;
      } else {
        feedbackMessage = "No files were added.";
      }

      if (validationIssues.length > 0 || skippedTooMany > 0) {
        capturePostHogClientEvent("import_parsed_with_warnings", {
          workspace_id: workspaceId || null,
          warning_count: validationIssues.length + skippedTooMany,
          validation_issue_count: validationIssues.length,
          skipped_count: skippedTooMany,
          file_count: additions.length,
          limit_type: skippedTooMany > 0 ? "upload_limit" : null,
        });
      }

          return [...current, ...additions];
        });
      });

    if (nextFiles.length > 0) {
      autoStartRef.current = true;
      autoCloseAfterStartRef.current = shouldAutoClose;
      if (shouldLaunchInBackground) {
        setLaunchInBackground(true);
        importActivitySurfaceRef.current = "background";
      }
      const firstAddedFile = additions[0]?.file ?? nextFiles[0] ?? null;
      if (firstAddedFile) {
        publishImportActivity({
          workspaceId,
          surface: shouldLaunchInBackground ? "background" : importActivitySurfaceRef.current,
          status: "active",
          fileName: firstAddedFile.name,
          fileIndex: 1,
          fileTotal: additions.length || nextFiles.length,
          completedFiles: completedFileCount,
          progress: IMPORT_PROGRESS.preparing,
          detail: "Clover is getting your file ready",
          summary: null,
          errorMessage: null,
        });
      }
      window.setTimeout(() => {
        if (busy || !workspaceId || !autoStartRef.current || !handleStartImportRef.current) {
          return;
        }

        autoStartRef.current = false;
        void handleStartImportRef.current();
      }, 0);
    }

    if (feedbackMessage) {
      setMessage(feedbackMessage);
    }

    setValidationNotice(validationMessage || null);
  };

  const addDroppedFiles = (incoming: FileList | File[]) => {
    addFiles(incoming);
  };

  const updateItem = (id: string, patch: Partial<QueuedFile>) => {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) {
          return item;
        }

        if (item.status === "error" && patch.status && patch.status !== "error") {
          return item;
        }

        const nextProgress =
          typeof patch.progress === "number" &&
          patch.status !== "error" &&
          patch.status !== "done" &&
          item.status !== "error"
            ? Math.max(item.progress ?? 0, patch.progress)
            : patch.progress;

        return {
          ...item,
          ...patch,
          ...(patch.error === null || patch.status === "done" || patch.status === "pending" || patch.status === "importing" || patch.status === "needs_password"
            ? { errorCode: null, errorTitle: null, errorNextSteps: null }
            : {}),
          ...(nextProgress === undefined ? {} : { progress: nextProgress }),
        };
      })
    );
  };

  const confirmItemImport = async (
    itemId: string,
    importFileId: string,
    accountId: string | null,
    summaryContext: {
      fileName: string;
      accountName: string | null;
      institution: string | null;
      accountNumber: string | null;
      accountType: UploadInsightsSummary["accountType"];
      optimisticAccountId: string | null;
      previewTransactions?: NonNullable<UploadInsightsSummary["previewTransactions"]>;
    },
    options?: {
      backgroundOnly?: boolean;
    }
  ): Promise<ImportProcessResult> => {
    const backgroundOnly = Boolean(options?.backgroundOnly);
    const emitItemUpdate = (patch: Partial<QueuedFile>) => {
      if (!backgroundOnly) {
        updateItem(itemId, patch);
      }
    };
    const emitImportActivity = (payload: Parameters<typeof publishImportActivity>[0]) => {
      if (!backgroundOnly) {
        publishImportActivity(payload);
      }
    };
    const emitImportError = (stage: ImportErrorStage, fileName: string, message: string | null | undefined) => {
      if (!backgroundOnly) {
        closeImportAfterError(itemId, stage, fileName, message);
      }
    };
    const resolvedAccountId =
      accountId && !accountId.startsWith("optimistic-")
        ? accountId
        : await ensureTargetAccountId(
            summaryContext.accountName,
            summaryContext.institution,
            summaryContext.accountType,
            summaryContext.accountNumber
          );

    if (!resolvedAccountId) {
      throw new Error("Unable to determine the destination account for this document.");
    }

    let finalizingProgress = 92;
    let lastKnownConfirmedRows = 0;
    let lastKnownAccountBalance: string | null = null;
    const finalizingTimer = window.setInterval(() => {
      finalizingProgress = Math.min(98, finalizingProgress + 1);
      emitItemUpdate({
        status: "importing",
        progress: finalizingProgress,
        progressLabel: "Finalizing import",
        targetAccountId: resolvedAccountId,
      });
      emitImportActivity({
        workspaceId,
        surface: importActivitySurfaceRef.current,
        status: "active",
        fileName: summaryContext.fileName,
        fileIndex: items.findIndex((item) => item.id === itemId) + 1,
        fileTotal: items.length,
        completedFiles: completedFileCount,
        progress: finalizingProgress,
        detail: "Clover is wrapping things up",
        summary: null,
        errorMessage: null,
      });
    }, 700);

    emitItemUpdate({
      status: "importing",
      progress: finalizingProgress,
      progressLabel: "Finalizing import",
      targetAccountId: resolvedAccountId,
    });
    emitImportActivity({
      workspaceId,
      surface: importActivitySurfaceRef.current,
      status: "active",
      fileName: summaryContext.fileName,
      fileIndex: items.findIndex((item) => item.id === itemId) + 1,
      fileTotal: items.length,
      completedFiles: completedFileCount,
      progress: finalizingProgress,
      detail: "Clover is wrapping things up",
      summary: null,
      errorMessage: null,
    });

    try {
      for (let stagedAttempt = 0; stagedAttempt < 15; stagedAttempt += 1) {
        const confirmResponse = await fetch(`/api/imports/${importFileId}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId: resolvedAccountId }),
        });

        if (!confirmResponse.ok) {
          const payload = await confirmResponse.json().catch(() => ({}));
          const limitPayload = parsePlanLimitPayload(payload) ?? parsePlanLimitMessage(String(payload.error ?? ""), planTier);
          if (limitPayload) {
            showPlanLimitNudge(limitPayload);
          }
          const confirmErrorMessage = String(payload.error ?? "Unable to confirm this import.");
          const recoverableConfirmError =
            /account not found|import file not found|parsed rows|still processing|not ready|finalizing|loading account|loading transactions|checkpoint|pending|queued|unable to confirm|cannot confirm|timed out|error code i-104|error code i-105|couldn't save that import|couldn't keep tracking that file|wasn't able to finish this import/i.test(
              confirmErrorMessage.toLowerCase()
            );
          if (recoverableConfirmError && stagedAttempt < 29) {
            emitItemUpdate({
              status: "importing",
              confirmationState: "pending",
              progress: Math.max(92, finalizingProgress),
              progressLabel: "Finalizing import",
              targetAccountId: resolvedAccountId,
            });
            emitImportActivity({
              workspaceId,
              surface: importActivitySurfaceRef.current,
              status: "active",
              fileName: summaryContext.fileName,
              fileIndex: items.findIndex((item) => item.id === itemId) + 1,
              fileTotal: items.length,
              completedFiles: completedFileCount,
              progress: Math.max(92, finalizingProgress),
              detail: "Clover is still finalizing the import",
              summary: null,
              errorMessage: null,
            });
            await new Promise((resolve) => window.setTimeout(resolve, 750));
            continue;
          }

          const confirmError = formatImportFailureMessage(summaryContext.fileName, confirmErrorMessage);
          capturePostHogClientEvent("import_failed", {
            error_stage: "confirm",
            error_code: String(payload.error ?? "unable_to_confirm"),
            file_name: summaryContext.fileName,
            workspace_id: workspaceId || null,
          });
          emitImportError("confirm", summaryContext.fileName, confirmError);
          return { status: "error", importedRows: null, summary: null };
        }

        const confirmed = await confirmResponse.json();
        const importedRows = Number(confirmed.result?.imported ?? 0);
        lastKnownConfirmedRows = importedRows;
        if (confirmed.result?.status === "staged") {
          emitItemUpdate({
            status: "importing",
            confirmationState: "pending",
            progress: Math.max(92, finalizingProgress),
            progressLabel: "Finalizing import",
            targetAccountId: resolvedAccountId,
          });
          emitImportActivity({
            workspaceId,
            surface: importActivitySurfaceRef.current,
            status: "active",
            fileName: summaryContext.fileName,
            fileIndex: items.findIndex((item) => item.id === itemId) + 1,
            fileTotal: items.length,
            completedFiles: completedFileCount,
            progress: Math.max(92, finalizingProgress),
            detail: "Clover is still lining things up",
            summary: null,
            errorMessage: null,
          });
          return {
            status: "staged",
            importedRows,
            summary: null,
          };
        }

        const accountBalance = typeof confirmed.result?.accountBalance === "string" ? confirmed.result.accountBalance : null;
        lastKnownAccountBalance = accountBalance;
        const insightSummary = confirmed.result?.insightSummary ?? null;
        const resolvedAccountType = (
          summaryContext.accountType ??
          accounts.find((account) => account.id === resolvedAccountId)?.type ??
          inferAccountTypeFromStatement(summaryContext.institution, summaryContext.accountName, "bank")
        ) as UploadInsightsSummary["accountType"];
        const resolvedBalance = pickStableBalance(
          accountBalance,
          findKnownImportedBalance(accounts, {
            workspaceId,
            accountId: resolvedAccountId,
            accountName: summaryContext.accountName,
            institution: summaryContext.institution ?? null,
            accountNumber: summaryContext.accountNumber ?? null,
            accountType: resolvedAccountType,
          })
        );
          const summary = {
          fileName: summaryContext.fileName,
          rowsImported: importedRows,
          accountId: resolvedAccountId,
          accountName: summaryContext.accountName,
          institution: summaryContext.institution ?? null,
          accountNumber: summaryContext.accountNumber ?? null,
          accountType: resolvedAccountType,
          balance: resolvedBalance,
          optimisticAccountId: resolvedAccountId.startsWith("optimistic-") ? summaryContext.optimisticAccountId ?? resolvedAccountId : null,
          previewTransactions: getKnownPreviewTransactions({
            workspaceId,
            accountId: resolvedAccountId,
            optimisticAccountId: summaryContext.optimisticAccountId ?? null,
            accountName: summaryContext.accountName,
            institution: summaryContext.institution ?? null,
            accountNumber: summaryContext.accountNumber ?? null,
            accountType: resolvedAccountType,
            previewTransactions: summaryContext.previewTransactions,
          }),
          incomeTotal: Number(insightSummary?.incomeTotal ?? 0),
          expenseTotal: Number(insightSummary?.expenseTotal ?? 0),
          netTotal: Number(insightSummary?.netTotal ?? 0),
          topCategoryName: insightSummary?.topCategoryName ?? null,
          topCategoryAmount: insightSummary?.topCategoryAmount === null ? null : Number(insightSummary?.topCategoryAmount ?? 0),
          topCategoryShare: insightSummary?.topCategoryShare === null ? null : Number(insightSummary?.topCategoryShare ?? 0),
          topMerchantName: insightSummary?.topMerchantName ?? null,
          topMerchantCount: insightSummary?.topMerchantCount === null ? null : Number(insightSummary?.topMerchantCount ?? 0),
        } satisfies UploadInsightsSummary;
        const settledVisible = await waitForImportSettledVisibility({
          workspaceId,
          accountId: resolvedAccountId,
          importedRows,
          expectedBalance: summary.balance ?? null,
        });

        if (!settledVisible) {
          emitItemUpdate({
            status: "importing",
            confirmationState: "pending",
            error: null,
            importFileId,
            targetAccountId: resolvedAccountId,
            importedRows,
            progress: Math.max(IMPORT_PROGRESS.loadingAccount, 92),
            progressLabel: "Finalizing import",
          });
          emitImportActivity({
            workspaceId,
            surface: importActivitySurfaceRef.current,
            status: "active",
            fileName: summaryContext.fileName,
            fileIndex: items.findIndex((item) => item.id === itemId) + 1,
            fileTotal: items.length,
            completedFiles: completedFileCount,
            progress: Math.max(IMPORT_PROGRESS.loadingAccount, 92),
            detail: "Clover found the account details and is still saving the rest",
            summary,
            errorMessage: null,
          });
          return { status: "staged", importedRows, summary };
        }

        emitItemUpdate({
          status: "done",
          confirmationState: "confirmed",
          error: null,
          importFileId,
          targetAccountId: resolvedAccountId,
          importedRows,
          progress: 100,
          progressLabel: "Done",
        });
        emitImportActivity({
          workspaceId,
          surface: importActivitySurfaceRef.current,
          status: "done",
          fileName: summaryContext.fileName,
          fileIndex: items.findIndex((item) => item.id === itemId) + 1,
          fileTotal: items.length,
          completedFiles: completedFileCount + 1,
          progress: 100,
          detail: "All set",
          summary,
          errorMessage: null,
        });
        capturePostHogClientEvent("import_confirmed", {
          workspace_id: workspaceId || null,
          file_name: summaryContext.fileName,
          file_type: summaryContext.fileName.split(".").pop()?.toUpperCase() ?? "FILE",
          transaction_count: importedRows,
          institution: summaryContext.institution ?? null,
          amount_total: summary ? summary.incomeTotal + summary.expenseTotal : null,
          currency: "PHP",
        });
        return { status: "done", importedRows, summary };
      }

      if (
        lastKnownConfirmedRows > 0 ||
        Boolean(lastKnownAccountBalance) ||
        Boolean(summaryContext.accountName || summaryContext.accountNumber || summaryContext.institution) ||
        Boolean(resolvedAccountId)
      ) {
        emitItemUpdate({
          status: "importing",
          confirmationState: "pending",
          progress: Math.max(IMPORT_PROGRESS.loadingAccount, 92),
          progressLabel: "Finalizing import",
        });
        emitImportActivity({
          workspaceId,
          surface: importActivitySurfaceRef.current,
          status: "active",
          fileName: summaryContext.fileName,
          fileIndex: items.findIndex((item) => item.id === itemId) + 1,
          fileTotal: items.length,
          completedFiles: completedFileCount,
          progress: Math.max(IMPORT_PROGRESS.loadingAccount, 92),
          detail: "Clover found the account details and is still saving the rest",
          summary: null,
          errorMessage: null,
        });
        return {
          status: "staged",
          importedRows: lastKnownConfirmedRows || null,
          summary: null,
        };
      }

      emitImportError(
        "confirm",
        summaryContext.fileName,
        "Clover kept finalizing this import for too long. Try again, or add the account and transactions manually."
      );
      return { status: "error", importedRows: null, summary: null };
    } finally {
      window.clearInterval(finalizingTimer);
    }
  };

  const getProgressDetail = useCallback(
    (
      resolved: {
        accountName: string | null;
        institution: string | null;
        accountNumber: string | null;
      },
      rowsCount: number
    ) => {
      if (rowsCount > 0) {
        if (resolved.accountNumber) {
          return "Clover is reading the bank balance and transactions";
        }

        if (resolved.accountName || resolved.institution) {
          return "Clover is reading the transactions";
        }
      }

      if (resolved.accountName || resolved.institution || resolved.accountNumber) {
        return "Clover is reading the account details";
      }

      return "Clover is reading the document";
    },
    []
  );

  const getTelemetryDetail = (
    fallback: string,
    telemetryMessage?: string | null,
    telemetryLabel?: string | null,
    resumeReason?: string | null
  ) => {
    return telemetryMessage?.trim() || telemetryLabel?.trim() || resumeReason?.trim() || fallback;
  };

  const monitorQueuedImportAndConfirm = async (
    itemId: string,
    importFileId: string,
    accountId: string | null,
    summaryContext: {
      fileName: string;
      fallbackAccountName: string;
      guessedAccountName?: string | null;
      guessedInstitution?: string | null;
      guessedAccountNumber?: string | null;
      guessedAccountType?: UploadInsightsSummary["accountType"];
      accountName: string | null;
      institution: string | null;
      accountNumber: string | null;
      accountType: UploadInsightsSummary["accountType"];
      optimisticAccountId: string | null;
      initialBalance?: string | null;
      password?: string;
      previewTransactions?: NonNullable<UploadInsightsSummary["previewTransactions"]>;
    },
    options?: {
      backgroundOnly?: boolean;
    }
  ) => {
    const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const backgroundOnly = Boolean(options?.backgroundOnly);
    const emitItemUpdate = (patch: Partial<QueuedFile>) => {
      if (!backgroundOnly) {
        updateItem(itemId, patch);
      }
    };
    const emitImportActivity = (payload: Parameters<typeof publishImportActivity>[0]) => {
      if (!backgroundOnly) {
        publishImportActivity(payload);
      }
    };
    const emitImportError = (stage: ImportErrorStage, fileName: string, message: string | null | undefined) => {
      if (!backgroundOnly) {
        closeImportAfterError(itemId, stage, fileName, message);
      }
    };
    let seededFallbackSummary = false;
    const startedAt = Date.now();
    const MAX_WAIT_MS = 180_000;
    let latestResolvedAccountId: string | null = accountId && !accountId.startsWith("optimistic-") ? accountId : null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      try {
        const response = await fetch(`/api/imports/${importFileId}/status`, {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Unable to load import status.");
        }

        const payload = (await response.json()) as ImportStatusPayload;
        const importFile = payload.importFile;
        const parsedRowsCount = Number(payload.parsedRowsCount ?? 0);
        const confirmedTransactionsCount = Number(payload.confirmedTransactionsCount ?? 0);
        const processingPhase = typeof importFile?.processingPhase === "string" ? importFile.processingPhase : null;
        const processingMessage = typeof importFile?.processingMessage === "string" ? importFile.processingMessage : null;
        const telemetryPhase = typeof payload.telemetryPhase === "string" ? payload.telemetryPhase : null;
        const telemetryLabel = typeof payload.telemetryLabel === "string" ? payload.telemetryLabel : null;
        const telemetryMessage = typeof payload.telemetryMessage === "string" ? payload.telemetryMessage : null;
        const canResume = Boolean(payload.canResume);
        const resumeReason = typeof payload.resumeReason === "string" ? payload.resumeReason : null;
        const statementCheckpoint = payload.statementCheckpoint && typeof payload.statementCheckpoint === "object" ? payload.statementCheckpoint : null;
        const statementMetadata =
          statementCheckpoint?.sourceMetadata && typeof statementCheckpoint.sourceMetadata === "object"
            ? (statementCheckpoint.sourceMetadata as Record<string, unknown>)
            : null;
        const checkpointIdentity = resolveStatementIdentityFromMetadata(statementMetadata);
        const processingIdentity =
          checkpointIdentity ??
          (summaryContext.guessedAccountName
            ? {
                accountName: summaryContext.guessedAccountName,
                institution: summaryContext.guessedInstitution ?? null,
                accountNumber: summaryContext.guessedAccountNumber ?? null,
                accountType:
                  summaryContext.guessedAccountType ??
                  inferAccountTypeFromStatement(
                    summaryContext.guessedInstitution ?? null,
                    summaryContext.guessedAccountName,
                    "bank"
                  ),
              }
            : null) ??
          (summaryContext.accountName
            ? {
                accountName: summaryContext.accountName,
                institution: summaryContext.institution,
                accountNumber: summaryContext.accountNumber,
                accountType:
                  summaryContext.accountType ??
                  inferAccountTypeFromStatement(summaryContext.institution, summaryContext.accountName, "bank"),
              }
            : null);
        const resolvedAccountDisplayName = formatUploadAccountDisplayName(
          processingIdentity?.accountName ?? summaryContext.accountName ?? summaryContext.fallbackAccountName,
          processingIdentity?.institution ?? summaryContext.institution ?? null,
          processingIdentity?.accountNumber ?? summaryContext.accountNumber ?? null,
          processingIdentity?.accountType ?? summaryContext.accountType ?? null
        );
        const checkpointBalance = toBalanceString(statementCheckpoint?.endingBalance);
        const stableOptimisticBalance = pickStableBalance(checkpointBalance, summaryContext.initialBalance);
        const checkpointAccountId =
          statementCheckpoint && typeof statementCheckpoint === "object" && "accountId" in statementCheckpoint
            ? typeof (statementCheckpoint as { accountId?: unknown }).accountId === "string"
              ? (statementCheckpoint as { accountId?: string | null }).accountId ?? null
              : null
            : null;
        const hasRecoverableImportSignal = Boolean(
          parsedRowsCount > 0 ||
            confirmedTransactionsCount > 0 ||
            checkpointBalance ||
            checkpointAccountId ||
            processingIdentity?.accountName ||
            processingIdentity?.accountNumber ||
            canResume ||
            telemetryPhase === "repair_needed"
        );

        if (importFile?.status === "failed") {
          if (hasRecoverableImportSignal && attempt < 239) {
            emitItemUpdate({
              status: "importing",
              progress: Math.max(IMPORT_PROGRESS.loadingAccount, 92),
              progressLabel: telemetryLabel ?? "Finalizing import",
            });
            emitImportActivity({
              workspaceId,
              surface: importActivitySurfaceRef.current,
              status: "active",
              fileName: summaryContext.fileName,
              fileIndex: items.findIndex((item) => item.id === itemId) + 1,
              fileTotal: items.length,
              completedFiles: completedFileCount,
              progress: Math.max(IMPORT_PROGRESS.loadingAccount, 92),
              detail: getTelemetryDetail(
                "Clover is finalizing the imported account",
                telemetryMessage,
                telemetryLabel,
                resumeReason
              ),
              summary: null,
              errorMessage: null,
            });
            await sleep(800);
            continue;
          }
          const limitPayload = parsePlanLimitMessage(processingMessage, planTier);
          if (limitPayload) {
            showPlanLimitNudge(limitPayload);
          }
          capturePostHogClientEvent("import_failed", {
            workspace_id: workspaceId || null,
            file_name: summaryContext.fileName,
            error_stage: "background",
            error_code: processingMessage ?? "background_failure",
          });
          emitImportError("background", summaryContext.fileName, processingMessage);
          return;
        }

        if (importFile?.status === "processing" && processingPhase) {
          emitItemUpdate({
            status: "importing",
            progress: Math.max(IMPORT_PROGRESS.parsing, Math.min(79, IMPORT_PROGRESS.parsing + Number(importFile.processingAttempt ?? 0))),
            progressLabel:
              telemetryLabel ??
              processingMessage ??
              (processingPhase === "auto_rerunning"
                ? `Auto-rerun ${Number(importFile.processingAttempt ?? 0)}/${Number(importFile.processingTargetScore ?? 95)} in progress`
                : "Parsing in background"),
          });
          emitImportActivity({
            workspaceId,
            surface: importActivitySurfaceRef.current,
            status: "active",
            fileName: summaryContext.fileName,
            fileIndex: items.findIndex((item) => item.id === itemId) + 1,
            fileTotal: items.length,
            completedFiles: completedFileCount,
            progress: Math.max(IMPORT_PROGRESS.parsing, Math.min(79, IMPORT_PROGRESS.parsing + Number(importFile.processingAttempt ?? 0))),
            detail: getTelemetryDetail(
              processingPhase === "auto_rerunning"
                ? "Clover is rechecking the document"
                : getProgressDetail(
                    {
                      accountName: processingIdentity?.accountName ?? summaryContext.accountName,
                      institution: processingIdentity?.institution ?? summaryContext.institution,
                      accountNumber: processingIdentity?.accountNumber ?? summaryContext.accountNumber,
                    },
                    parsedRowsCount
                  ),
              telemetryMessage ?? processingMessage,
              telemetryLabel,
              resumeReason
            ),
            summary: null,
              errorMessage: null,
          });
          if (!seededFallbackSummary && (parsedRowsCount > 0 || Boolean(processingIdentity?.accountName || processingIdentity?.institution))) {
            const fallbackAccountId =
              summaryContext.optimisticAccountId && summaryContext.optimisticAccountId.trim()
                ? summaryContext.optimisticAccountId
                : accountId && !accountId.startsWith("optimistic-")
                  ? accountId
                  : await ensureTargetAccountId(
                      processingIdentity?.accountName ?? summaryContext.fallbackAccountName,
                      processingIdentity?.institution ?? null,
                      processingIdentity?.accountType ?? summaryContext.accountType ?? null,
                      processingIdentity?.accountNumber ?? null,
                      stableOptimisticBalance,
                      null
                    );
            latestResolvedAccountId = fallbackAccountId;
            const fallbackPreviewTransactions =
              summaryContext.previewTransactions && summaryContext.previewTransactions.length > 0
                ? summaryContext.previewTransactions
                : await loadOptimisticPreviewTransactions(
                    importFileId,
                    fallbackAccountId ?? "",
                    resolvedAccountDisplayName,
                    processingIdentity?.institution ?? null
                  )
                    .catch(() => [])
                    .then((rows) =>
                      rows.length > 0
                        ? rows
                        : getKnownPreviewTransactions({
                            workspaceId,
                            accountId: fallbackAccountId,
                            optimisticAccountId: summaryContext.optimisticAccountId,
                            accountName: resolvedAccountDisplayName,
                            institution: processingIdentity?.institution ?? null,
                            accountNumber: processingIdentity?.accountNumber ?? summaryContext.accountNumber ?? null,
                            accountType: processingIdentity?.accountType ?? summaryContext.accountType,
                            previewTransactions: summaryContext.previewTransactions,
                          })
                    );
            const fallbackSummary = buildOptimisticUploadSummary(
              summaryContext.fileName,
              parsedRowsCount || 0,
              fallbackAccountId,
              resolvedAccountDisplayName,
              processingIdentity?.institution ?? null,
              processingIdentity?.accountType ?? summaryContext.accountType ?? null,
              summaryContext.optimisticAccountId,
              stableOptimisticBalance,
              fallbackPreviewTransactions,
              processingIdentity?.accountNumber ?? summaryContext.accountNumber ?? null
            );

            seededFallbackSummary = true;
            seedImportedWorkspaceCaches(workspaceId, fallbackSummary);
            await Promise.resolve(onImported(fallbackSummary));
            emitItemUpdate({
              status: "importing",
              confirmationState: "pending",
              progress: Math.max(
                IMPORT_PROGRESS.loadingAccount,
                Math.min(92, IMPORT_PROGRESS.loadingAccount + Number(importFile.processingAttempt ?? 0))
              ),
              progressLabel: telemetryLabel ?? "Loading account",
              targetAccountId: fallbackAccountId,
            });
            emitImportActivity({
              workspaceId,
              surface: importActivitySurfaceRef.current,
              status: "active",
              fileName: summaryContext.fileName,
              fileIndex: items.findIndex((item) => item.id === itemId) + 1,
              fileTotal: items.length,
              completedFiles: completedFileCount,
              progress: Math.max(
                IMPORT_PROGRESS.loadingAccount,
                Math.min(92, IMPORT_PROGRESS.loadingAccount + Number(importFile.processingAttempt ?? 0))
              ),
              detail: getTelemetryDetail(
                getProgressDetail(
                  {
                    accountName: fallbackSummary.accountName,
                    institution: fallbackSummary.institution,
                    accountNumber: fallbackSummary.accountNumber ?? null,
                  },
                  parsedRowsCount
                ),
                telemetryMessage ?? processingMessage,
                telemetryLabel,
                resumeReason
              ),
              summary: null,
              errorMessage: null,
            });
          }

          const hasResolvedIdentity = Boolean(
            processingIdentity?.accountName ||
              processingIdentity?.institution ||
              summaryContext.accountName ||
              summaryContext.institution ||
              latestResolvedAccountId
          );
          const shouldAdvanceToConfirmation =
            parsedRowsCount > 0 &&
            hasResolvedIdentity &&
            Boolean(latestResolvedAccountId && !latestResolvedAccountId.startsWith("optimistic-"));
          if (shouldAdvanceToConfirmation) {
            void confirmItemImport(
              itemId,
              importFileId,
              latestResolvedAccountId,
              {
                fileName: summaryContext.fileName,
                accountName: resolvedAccountDisplayName,
                institution: processingIdentity?.institution ?? summaryContext.institution,
                accountNumber: processingIdentity?.accountNumber ?? summaryContext.accountNumber,
                accountType: processingIdentity?.accountType ?? summaryContext.accountType,
                optimisticAccountId: summaryContext.optimisticAccountId,
                previewTransactions: summaryContext.previewTransactions,
              },
              { backgroundOnly: true }
            );
            return;
          }
          const hasFinalizedAccountId =
            Boolean(latestResolvedAccountId && !latestResolvedAccountId.startsWith("optimistic-")) ||
            Boolean(
              accountId &&
                !accountId.startsWith("optimistic-") &&
                accounts.some((account) => account.id === accountId)
            );
          if (!hasFinalizedAccountId) {
            const fallbackAccountName =
              processingIdentity?.accountName ?? summaryContext.accountName ?? summaryContext.fallbackAccountName;
            const fallbackInstitution = processingIdentity?.institution ?? summaryContext.institution ?? null;
            const fallbackAccountNumber = processingIdentity?.accountNumber ?? summaryContext.accountNumber ?? null;
            if (fallbackAccountName || fallbackInstitution || fallbackAccountNumber) {
              latestResolvedAccountId = await ensureTargetAccountId(
                fallbackAccountName,
                fallbackInstitution,
                processingIdentity?.accountType ?? summaryContext.accountType ?? null,
                fallbackAccountNumber,
                stableOptimisticBalance,
                null
              );
            }
          }
          if (!latestResolvedAccountId || latestResolvedAccountId.startsWith("optimistic-")) {
            await sleep(600);
            continue;
          }
        }

        const hasSettledRows = confirmedTransactionsCount > 0;

        if (hasSettledRows) {
          const completedAccountId =
            latestResolvedAccountId && !latestResolvedAccountId.startsWith("optimistic-")
              ? latestResolvedAccountId
              : accountId && !accountId.startsWith("optimistic-")
                ? accountId
                : processingIdentity?.accountName ||
                    processingIdentity?.institution ||
                    summaryContext.accountName ||
                    summaryContext.institution
                  ? await ensureTargetAccountId(
                      processingIdentity?.accountName ?? summaryContext.accountName ?? summaryContext.fallbackAccountName,
                      processingIdentity?.institution ?? summaryContext.institution ?? null,
                      processingIdentity?.accountType ?? summaryContext.accountType ?? null,
                      processingIdentity?.accountNumber ?? summaryContext.accountNumber ?? null,
                      stableOptimisticBalance,
                      null
                    )
                  : null;
          const fallbackPreviewTransactions =
            summaryContext.previewTransactions && summaryContext.previewTransactions.length > 0
              ? summaryContext.previewTransactions
              : completedAccountId
                ? await loadOptimisticPreviewTransactions(
                    importFileId,
                    completedAccountId,
                    processingIdentity?.accountName ?? summaryContext.accountName ?? summaryContext.fallbackAccountName ?? "",
                    processingIdentity?.institution ?? summaryContext.institution ?? null
                  )
                    .catch(() => [])
                    .then((rows) =>
                      rows.length > 0
                        ? rows
                        : getKnownPreviewTransactions({
                            workspaceId,
                            accountId: completedAccountId,
                            optimisticAccountId: summaryContext.optimisticAccountId,
                            accountName:
                              processingIdentity?.accountName ??
                              summaryContext.accountName ??
                              summaryContext.fallbackAccountName ??
                              "",
                            institution: processingIdentity?.institution ?? summaryContext.institution ?? null,
                            accountNumber: processingIdentity?.accountNumber ?? summaryContext.accountNumber ?? null,
                            accountType: processingIdentity?.accountType ?? summaryContext.accountType,
                            previewTransactions: summaryContext.previewTransactions,
                          })
                    )
                : [];
          const completedSummary = buildOptimisticUploadSummary(
            summaryContext.fileName,
            confirmedTransactionsCount > 0 ? confirmedTransactionsCount : parsedRowsCount,
            completedAccountId,
            processingIdentity?.accountName ?? summaryContext.accountName ?? summaryContext.fallbackAccountName ?? "",
            processingIdentity?.institution ?? summaryContext.institution ?? null,
            processingIdentity?.accountType ?? summaryContext.accountType ?? null,
            summaryContext.optimisticAccountId,
            stableOptimisticBalance,
            fallbackPreviewTransactions,
            processingIdentity?.accountNumber ?? summaryContext.accountNumber ?? null
          );
          const finalizedSummary: UploadInsightsSummary = {
            ...completedSummary,
            optimistic: false,
            optimisticAccountId: null,
          };
          seedImportedWorkspaceCaches(workspaceId, finalizedSummary);
          await Promise.resolve(onImported(finalizedSummary));
          updateItem(itemId, {
            status: "done",
            confirmationState: "confirmed",
            progress: 100,
            progressLabel: "Done",
          });
          publishImportActivity({
            workspaceId,
            surface: importActivitySurfaceRef.current,
            status: "done",
            fileName: summaryContext.fileName,
            fileIndex: items.findIndex((item) => item.id === itemId) + 1,
            fileTotal: items.length,
            completedFiles: completedFileCount + 1,
            progress: 100,
            detail: "All set",
            summary: finalizedSummary,
            errorMessage: null,
          });
          return;
        }

        if (importFile?.status === "done" && !hasSettledRows) {
          updateItem(itemId, {
            status: "importing",
            confirmationState: "pending",
            progress: Math.max(
              IMPORT_PROGRESS.loadingAccount,
              Math.min(92, IMPORT_PROGRESS.loadingAccount + Number(importFile.processingAttempt ?? 0))
            ),
            progressLabel: "Loading transactions",
            targetAccountId: latestResolvedAccountId && !latestResolvedAccountId.startsWith("optimistic-") ? latestResolvedAccountId : null,
          });
          publishImportActivity({
            workspaceId,
            surface: importActivitySurfaceRef.current,
            status: "active",
            fileName: summaryContext.fileName,
            fileIndex: items.findIndex((item) => item.id === itemId) + 1,
            fileTotal: items.length,
            completedFiles: completedFileCount,
            progress: Math.max(
              IMPORT_PROGRESS.loadingAccount,
              Math.min(92, IMPORT_PROGRESS.loadingAccount + Number(importFile.processingAttempt ?? 0))
            ),
            detail: getProgressDetail(
              {
                accountName: processingIdentity?.accountName ?? summaryContext.accountName,
                institution: processingIdentity?.institution ?? summaryContext.institution,
                accountNumber: processingIdentity?.accountNumber ?? summaryContext.accountNumber,
              },
              parsedRowsCount
            ),
            summary: null,
            errorMessage: null,
          });
          await sleep(600);
          continue;
        }

        if (Date.now() - startedAt >= MAX_WAIT_MS) {
          const hasRecoverableProgress =
            Boolean(importFileId) || parsedRowsCount > 0 || confirmedTransactionsCount > 0;
          if (hasRecoverableProgress) {
            closeImportAsRecoverable(
              itemId,
              summaryContext.fileName,
              "Clover parsed the file and is still linking it to the account.",
              "Finalizing import"
            );
            return;
          }

          const timeoutMessage = "Timed out after 180 seconds while Clover was still reading the document.";
          closeImportAfterError(itemId, "monitor", summaryContext.fileName, timeoutMessage);
          return;
        }

        if (importFile?.status === "done" || parsedRowsCount > 0) {
          const statementConfidence = Number(statementMetadata?.confidence ?? 0);
          const trustStatementIdentity = statementConfidence >= 70;
          const resolvedIdentity = {
            accountName:
              trustStatementIdentity &&
              typeof statementMetadata?.accountName === "string" && statementMetadata.accountName.trim()
                ? statementMetadata.accountName.trim()
                : summaryContext.accountName,
            institution:
              trustStatementIdentity &&
              typeof statementMetadata?.institution === "string" && statementMetadata.institution.trim()
                ? statementMetadata.institution.trim()
                : summaryContext.institution,
            accountNumber:
              trustStatementIdentity &&
              typeof statementMetadata?.accountNumber === "string" && statementMetadata.accountNumber.trim()
                ? statementMetadata.accountNumber.trim()
                : summaryContext.accountNumber,
            accountType:
              trustStatementIdentity &&
              typeof statementMetadata?.accountType === "string" &&
              ["bank", "wallet", "credit_card", "cash", "investment", "other"].includes(statementMetadata.accountType)
                ? (statementMetadata.accountType as UploadInsightsSummary["accountType"])
                : summaryContext.accountType,
            balance: toBalanceString(statementCheckpoint?.endingBalance),
          };
          const resolvedAccountType = (resolvedIdentity.accountType ??
            accounts.find((account) => account.id === resolvedAccountId)?.type ??
            summaryContext.accountType ??
            null) as UploadInsightsSummary["accountType"];
          if (!trustStatementIdentity || statementConfidence < 80 || !resolvedIdentity.accountName || !resolvedIdentity.institution) {
            capturePostHogClientEventOnce(
              "import_parsed_with_warnings",
              {
                workspace_id: workspaceId || null,
                file_name: summaryContext.fileName,
                file_type: summaryContext.fileName.split(".").pop()?.toUpperCase() ?? "FILE",
                warning_count: 1,
                validation_issue_count: 0,
                skipped_count: 0,
                file_count: 1,
                limit_type: null,
                parse_confidence: statementConfidence || null,
                queued: Boolean(importFile?.status === "processing"),
              },
          analyticsOnceKey("import_parsed_with_warnings", `queued-import:${itemId}`)
            );
          }
          const hasParseableAccountIdentity = Boolean(
            resolvedIdentity.accountName ||
              resolvedIdentity.institution ||
              resolvedIdentity.accountNumber ||
              summaryContext.accountName ||
              summaryContext.institution ||
              summaryContext.accountNumber
          );
          const shouldDeferClientConfirmation =
            confirmedTransactionsCount === 0 &&
            (resolvedIdentity.institution === "GCash" || resolvedAccountType === "wallet") &&
            !hasParseableAccountIdentity &&
            parsedRowsCount === 0;

          const shouldUseFallbackIdentity = !resolvedIdentity.accountName && !resolvedIdentity.institution && attempt >= 4;
          if (!resolvedIdentity.accountName && !resolvedIdentity.institution && !shouldUseFallbackIdentity) {
            const previewResponse = await fetch(`/api/imports/${importFileId}/preview`);
            if (previewResponse.ok) {
              const payload = await previewResponse.json();
              const parsedRows = Array.isArray(payload.parsedRows) ? payload.parsedRows : [];
              const previewStatementCheckpoint =
                payload.statementCheckpoint && typeof payload.statementCheckpoint === "object" ? payload.statementCheckpoint : null;
              const previewRow =
                parsedRows.find(
                  (row: { accountName?: unknown; institution?: unknown }) =>
                    typeof row.accountName === "string" && row.accountName.trim()
                ) ?? parsedRows[0] ?? null;

              resolvedIdentity.accountName =
                trustStatementIdentity &&
                typeof previewRow?.accountName === "string" && previewRow.accountName.trim()
                  ? previewRow.accountName.trim()
                  : summaryContext.accountName;
              resolvedIdentity.institution =
                trustStatementIdentity &&
                typeof previewRow?.institution === "string" && previewRow.institution.trim()
                  ? previewRow.institution.trim()
                  : summaryContext.institution;
            }
          }

          if (!resolvedIdentity.accountName && !resolvedIdentity.institution && shouldUseFallbackIdentity) {
            resolvedIdentity.accountName = summaryContext.fallbackAccountName;
          }

          if (!resolvedIdentity.accountName && !resolvedIdentity.institution) {
            if (parsedRowsCount > 0 && !seededFallbackSummary) {
              const fallbackAccountId = accountId && !accountId.startsWith("optimistic-")
                ? accountId
                : processingIdentity?.accountNumber || summaryContext.accountNumber
                  ? await ensureTargetAccountId(
                      processingIdentity?.accountName ?? summaryContext.fallbackAccountName,
                      processingIdentity?.institution ?? null,
                      processingIdentity?.accountType ?? summaryContext.accountType ?? null,
                      processingIdentity?.accountNumber ?? summaryContext.accountNumber ?? null
                    )
                  : null;
              if (!fallbackAccountId) {
                await sleep(600);
                continue;
              }
              latestResolvedAccountId = fallbackAccountId;
              const fallbackPreviewTransactions =
                summaryContext.previewTransactions && summaryContext.previewTransactions.length > 0
                  ? summaryContext.previewTransactions
                : await loadOptimisticPreviewTransactions(
                    importFileId,
                    fallbackAccountId ?? "",
                    summaryContext.fallbackAccountName ?? "",
                    null
                  ).catch(() => []);
              const fallbackSummary = buildOptimisticUploadSummary(
                summaryContext.fileName,
                0,
                fallbackAccountId,
                summaryContext.fallbackAccountName,
                null,
                null,
                summaryContext.optimisticAccountId,
                stableOptimisticBalance,
                fallbackPreviewTransactions,
                summaryContext.accountNumber ?? null
              );

              seededFallbackSummary = true;
              updateItem(itemId, {
                status: "importing",
                progress: Math.max(IMPORT_PROGRESS.parsing, Math.min(IMPORT_PROGRESS.loadingAccount, IMPORT_PROGRESS.parsing + attempt * 0.5)),
                progressLabel: "Reading account details",
                targetAccountId: fallbackAccountId,
              });
              publishImportActivity({
                workspaceId,
                surface: importActivitySurfaceRef.current,
                status: "active",
                fileName: summaryContext.fileName,
                fileIndex: items.findIndex((item) => item.id === itemId) + 1,
                fileTotal: items.length,
                completedFiles: completedFileCount,
                progress: Math.max(IMPORT_PROGRESS.parsing, Math.min(IMPORT_PROGRESS.loadingAccount, IMPORT_PROGRESS.parsing + attempt * 0.5)),
                detail: getProgressDetail(
                  {
                    accountName: summaryContext.fallbackAccountName,
                    institution: null,
                    accountNumber: summaryContext.accountNumber,
                  },
                  parsedRowsCount
                ),
                summary: null,
                errorMessage: null,
              });
              seedImportedWorkspaceCaches(workspaceId, fallbackSummary);
              await Promise.resolve(onImported(fallbackSummary));
            } else {
              updateItem(itemId, {
                status: "importing",
                progress: Math.max(IMPORT_PROGRESS.parsing, Math.min(IMPORT_PROGRESS.loadingAccount, IMPORT_PROGRESS.parsing + attempt * 0.5)),
                progressLabel: telemetryLabel ?? "Reading account details",
                targetAccountId: accountId,
              });
              publishImportActivity({
                workspaceId,
                surface: importActivitySurfaceRef.current,
                status: "active",
                fileName: summaryContext.fileName,
                fileIndex: items.findIndex((item) => item.id === itemId) + 1,
                fileTotal: items.length,
                completedFiles: completedFileCount,
                progress: Math.max(IMPORT_PROGRESS.parsing, Math.min(IMPORT_PROGRESS.loadingAccount, IMPORT_PROGRESS.parsing + attempt * 0.5)),
              detail: getTelemetryDetail(
                getProgressDetail(
                  {
                    accountName: summaryContext.accountName,
                    institution: summaryContext.institution,
                    accountNumber: summaryContext.accountNumber,
                  },
                  parsedRowsCount
                ),
                telemetryMessage ?? processingMessage,
                telemetryLabel,
                resumeReason
              ),
              summary: null,
              errorMessage: null,
            });
            }
            await sleep(parsedRowsCount > 0 ? 300 : 600);
            continue;
          }

          const hasValidCurrentAccount = Boolean(
            accountId &&
              !accountId.startsWith("optimistic-") &&
              accounts.some((account) => account.id === accountId)
          );
          let resolvedAccountId = hasValidCurrentAccount ? accountId : null;
          if (hasValidCurrentAccount && trustStatementIdentity) {
            const currentAccountId = accountId as string;
            const syncAccountName = resolvedIdentity.accountName ?? summaryContext.fallbackAccountName;
            const syncInstitution = resolvedIdentity.institution ?? summaryContext.institution;
            void syncStatementAccountIdentity(
              currentAccountId,
              syncAccountName,
              syncInstitution,
              resolvedAccountType,
              resolvedIdentity.accountNumber ?? summaryContext.accountNumber ?? null,
              summaryContext.initialBalance ?? null,
              null
            ).catch(() => null);
          }

          if (!resolvedAccountId || resolvedAccountId.startsWith("optimistic-")) {
            const accountName = resolvedIdentity.accountName ?? summaryContext.accountName ?? null;
            const institution = resolvedIdentity.institution ?? summaryContext.institution ?? null;
            resolvedAccountId = await ensureTargetAccountId(
              accountName,
              institution,
              resolvedAccountType,
              resolvedIdentity.accountNumber ?? summaryContext.accountNumber ?? null,
              summaryContext.initialBalance ?? null,
              null
            );
          }
          if (!resolvedAccountId) {
            throw new Error("Unable to determine the destination account for this document.");
          }
          latestResolvedAccountId = resolvedAccountId;

          const shouldWaitForDeferredConfirmation =
            confirmedTransactionsCount === 0 &&
            shouldDeferClientConfirmation &&
            importFile?.status !== "done" &&
            attempt < 4;

          if (shouldWaitForDeferredConfirmation) {
            updateItem(itemId, {
              status: "importing",
              progress: Math.max(IMPORT_PROGRESS.loadingAccount, Math.min(98, IMPORT_PROGRESS.loadingAccount + attempt * 0.5)),
              progressLabel: telemetryLabel ?? "Finalizing import",
              targetAccountId: resolvedAccountId,
            });
            publishImportActivity({
              workspaceId,
              surface: importActivitySurfaceRef.current,
              status: "active",
              fileName: summaryContext.fileName,
              fileIndex: items.findIndex((item) => item.id === itemId) + 1,
              fileTotal: items.length,
              completedFiles: completedFileCount,
              progress: Math.max(IMPORT_PROGRESS.loadingAccount, Math.min(98, IMPORT_PROGRESS.loadingAccount + attempt * 0.5)),
              detail: getTelemetryDetail(
                getProgressDetail(
                  {
                    accountName: resolvedIdentity.accountName ?? summaryContext.accountName,
                    institution: resolvedIdentity.institution ?? summaryContext.institution,
                    accountNumber: resolvedIdentity.accountNumber ?? summaryContext.accountNumber,
                  },
                  parsedRowsCount
                ),
                telemetryMessage ?? processingMessage,
                telemetryLabel,
                resumeReason
              ),
              summary: null,
              errorMessage: null,
            });
            await sleep(600);
            continue;
          }

          const previewSummary = buildOptimisticUploadSummary(
            summaryContext.fileName,
            0,
            resolvedAccountId,
            resolvedIdentity.accountName ?? null,
            resolvedIdentity.institution ?? null,
            resolvedAccountType ??
              inferAccountTypeFromStatement(resolvedIdentity.institution, resolvedIdentity.accountName, "bank"),
            summaryContext.optimisticAccountId,
            pickStableBalance(
              findKnownImportedBalance(accounts, {
                workspaceId,
                accountId: resolvedAccountId,
                accountName: resolvedIdentity.accountName ?? null,
                institution: resolvedIdentity.institution ?? null,
                accountNumber: resolvedIdentity.accountNumber ?? summaryContext.accountNumber ?? null,
                accountType:
                  resolvedAccountType ??
                  inferAccountTypeFromStatement(resolvedIdentity.institution, resolvedIdentity.accountName, "bank"),
              }),
              summaryContext.initialBalance
            ),
            getKnownPreviewTransactions({
              workspaceId,
              accountId: resolvedAccountId,
              optimisticAccountId: summaryContext.optimisticAccountId,
              accountName: resolvedIdentity.accountName ?? null,
              institution: resolvedIdentity.institution ?? null,
              accountNumber: resolvedIdentity.accountNumber ?? summaryContext.accountNumber ?? null,
              accountType:
                resolvedAccountType ??
                inferAccountTypeFromStatement(resolvedIdentity.institution, resolvedIdentity.accountName, "bank"),
              previewTransactions: summaryContext.previewTransactions,
            }),
            resolvedIdentity.accountNumber ?? summaryContext.accountNumber ?? null,
            true
          );

          updateItem(itemId, {
            targetAccountId: resolvedAccountId,
          });

          seedImportedWorkspaceCaches(workspaceId, previewSummary);
          await Promise.resolve(onImported(previewSummary));
          publishImportActivity({
            workspaceId,
            surface: importActivitySurfaceRef.current,
            status: "active",
            fileName: summaryContext.fileName,
            fileIndex: items.findIndex((item) => item.id === itemId) + 1,
            fileTotal: items.length,
            completedFiles: completedFileCount,
            progress: IMPORT_PROGRESS.loadingAccount,
            detail: getProgressDetail(
              {
                accountName: resolvedIdentity.accountName ?? summaryContext.accountName,
                institution: resolvedIdentity.institution ?? summaryContext.institution,
                accountNumber: resolvedIdentity.accountNumber ?? summaryContext.accountNumber,
              },
              summaryContext.previewTransactions?.length ?? 0
            ),
            summary: null,
            errorMessage: null,
          });

          void confirmItemImport(
            itemId,
            importFileId,
            resolvedAccountId,
            {
              ...summaryContext,
              accountName: resolvedIdentity.accountName ?? summaryContext.accountName,
              institution: resolvedIdentity.institution ?? summaryContext.institution,
              accountNumber: resolvedIdentity.accountNumber ?? summaryContext.accountNumber ?? null,
              accountType: resolvedAccountType,
              previewTransactions: summaryContext.previewTransactions ?? [],
            },
            { backgroundOnly: true }
          )
          .then(async (result) => {
              if (result.summary) {
                seedImportedWorkspaceCaches(workspaceId, result.summary);
                await Promise.resolve(onImported(result.summary));
              }
            })
            .catch((error) => {
              console.warn("Background import confirmation failed", {
                importFileId,
                error: error instanceof Error ? error.message : String(error),
              });
            });
          capturePostHogClientEvent("statement_identity_confirmed", {
            workspace_id: workspaceId,
            import_file_id: importFileId,
            file_name: summaryContext.fileName,
            statement_account_name: resolvedIdentity.accountName ?? summaryContext.accountName ?? null,
            statement_institution: resolvedIdentity.institution ?? summaryContext.institution ?? null,
            account_id: resolvedAccountId,
          });
          capturePostHogClientEvent("import_retry_succeeded", {
            workspace_id: workspaceId,
            import_file_id: importFileId,
            file_name: summaryContext.fileName,
            retry_reason: "background_confirmation",
          });
          return;
        }

        updateItem(itemId, {
          status: "importing",
          progress: Math.max(IMPORT_PROGRESS.parsing, Math.min(IMPORT_PROGRESS.loadingAccount, IMPORT_PROGRESS.parsing + attempt * 0.5)),
          progressLabel: "Reading statement details",
          targetAccountId: accountId,
        });
        publishImportActivity({
          workspaceId,
          surface: importActivitySurfaceRef.current,
          status: "active",
          fileName: summaryContext.fileName,
          fileIndex: items.findIndex((item) => item.id === itemId) + 1,
          fileTotal: items.length,
          completedFiles: completedFileCount,
          progress: Math.max(IMPORT_PROGRESS.parsing, Math.min(IMPORT_PROGRESS.loadingAccount, IMPORT_PROGRESS.parsing + attempt * 0.5)),
          detail: getProgressDetail(
            {
              accountName: summaryContext.accountName,
              institution: summaryContext.institution,
              accountNumber: summaryContext.accountNumber,
            },
            parsedRowsCount
          ),
          summary: null,
          errorMessage: null,
        });
      } catch (error) {
        const limitPayload = parsePlanLimitMessage(error instanceof Error ? error.message : null, planTier);
        if (limitPayload) {
          showPlanLimitNudge(limitPayload);
        }
        capturePostHogClientEvent("import_retry_failed", {
          workspace_id: workspaceId,
          import_file_id: importFileId,
          file_name: summaryContext.fileName,
          retry_reason: "background_confirmation",
          error_code: getImportErrorCode(error),
        });
        closeImportAfterError(itemId, "monitor", summaryContext.fileName, error instanceof Error ? error.message : null);
        return;
      }

      await sleep(600);
    }

    closeImportAfterError(itemId, "monitor", summaryContext.fileName, "Timed out waiting for trusted statement identity.");
  };

  const preflightPasswordProtectedFiles = async () => {
    let foundPasswordProtected = false;

    const pendingItems = items.filter((item) => item.status === "pending" && !item.password.trim());
    for (const item of pendingItems) {
      if (await isQuickPasswordProtectedPdf(item.file)) {
        foundPasswordProtected = true;
        updateItem(item.id, {
          status: "needs_password",
          error: `${item.file.name} is password-protected. Enter the password to continue.`,
          password: "",
          passwordVisible: false,
          progress: 0,
          progressLabel: "Password needed",
        });
      }
    }

    return foundPasswordProtected;
  };

  const ensureTargetAccountId = async (
    statementAccountName?: string | null,
    institution?: string | null,
    accountType?: UploadInsightsSummary["accountType"],
    accountNumber?: string | null,
    balance?: string | null,
    currency?: string | null
  ) => {
    if (statementAccountName) {
      const normalizedStatementAccountName = formatUploadAccountDisplayName(
        statementAccountName,
        institution ?? null,
        accountNumber ?? null,
        accountType ?? null
      );
      const key = accountKey(normalizedStatementAccountName, institution ?? null, accountNumber ?? null);
      const persistedExisting =
        accounts.find(
          (account) =>
            !account.id.startsWith("optimistic-") &&
            accountKey(account.name, account.institution, account.accountNumber) === key
        )?.id ?? null;
      if (persistedExisting) {
        accountIdByKeyRef.current.set(key, persistedExisting);
        await syncStatementAccountIdentity(
          persistedExisting,
          normalizedStatementAccountName,
          institution ?? null,
          accountType,
          accountNumber,
          balance,
          currency
        );
        return persistedExisting;
      }

      const genericMatch = hasStatementSuffix(normalizedStatementAccountName)
        ? accounts.find((account) => !account.id.startsWith("optimistic-") && isGenericSameInstitutionAccount(account, institution ?? null))
        : null;
      if (genericMatch) {
        accountIdByKeyRef.current.set(
          accountKey(genericMatch.name, genericMatch.institution, genericMatch.accountNumber),
          genericMatch.id
        );
        await syncStatementAccountIdentity(
          genericMatch.id,
          normalizedStatementAccountName,
          institution ?? null,
          accountType,
          accountNumber,
          balance,
          currency
        );
        return genericMatch.id;
      }

      const rule = accountRules.find(
        (entry) => accountRuleKey(entry.accountName, entry.institution) === accountRuleKey(normalizedStatementAccountName, institution ?? null)
      );
      if (rule?.accountId) {
        const matchedAccount = accounts.find((account) => account.id === rule.accountId && !account.id.startsWith("optimistic-"));
        if (matchedAccount) {
          accountIdByKeyRef.current.set(
            accountKey(matchedAccount.name, matchedAccount.institution, matchedAccount.accountNumber),
            matchedAccount.id
          );
          await syncStatementAccountIdentity(
            matchedAccount.id,
            normalizedStatementAccountName,
            institution ?? null,
            accountType,
            accountNumber,
            balance,
            currency
          );
          return matchedAccount.id;
        }
      }

      return createStatementAccount(
        normalizedStatementAccountName,
        institution ?? null,
        accountType,
        accountNumber,
        balance,
        currency
      );
    }

    return null;
  };

  const resolveLocalAccountId = (
    statementAccountName: string | null,
    institution: string | null,
    accountNumber: string | null
  ) => {
    if (statementAccountName) {
      const normalizedStatementAccountName = normalizeStatementAccountName(statementAccountName, institution);
      const key = accountKey(normalizedStatementAccountName, institution ?? null, accountNumber ?? null);
      const persistedExisting =
        accounts.find(
          (account) =>
            !account.id.startsWith("optimistic-") &&
            accountKey(account.name, account.institution, account.accountNumber) === key
        )?.id ?? null;
      if (persistedExisting) {
        return persistedExisting;
      }

      const mappedExisting = accountIdByKeyRef.current.get(key);
      if (mappedExisting && !mappedExisting.startsWith("optimistic-")) {
        return mappedExisting;
      }

      const genericMatch = hasStatementSuffix(normalizedStatementAccountName)
        ? accounts.find((account) => !account.id.startsWith("optimistic-") && isGenericSameInstitutionAccount(account, institution ?? null))
        : null;
      if (genericMatch) {
        return genericMatch.id;
      }

      const rule = accountRules.find(
        (entry) => accountRuleKey(entry.accountName, entry.institution) === accountRuleKey(normalizedStatementAccountName, institution ?? null)
      );
      if (rule?.accountId) {
        const matchedAccount = accounts.find((account) => account.id === rule.accountId && !account.id.startsWith("optimistic-"));
        if (matchedAccount) {
          return matchedAccount.id;
        }
      }
    }

    if (accountNumber) {
      const matchedByNumber = accounts.find((account) => (account.accountNumber ?? null) === accountNumber);
      if (matchedByNumber) {
        return matchedByNumber.id;
      }
    }

    return `optimistic-${crypto.randomUUID()}`;
  };

  async function preparsePendingItemLocally(itemId: string) {
    if (localPreparseStartedRef.current.has(itemId)) {
      return;
    }

    const item = itemsRef.current.find((entry) => entry.id === itemId);
    if (!item || item.confirmationState === "confirmed" || item.status === "done" || item.status === "error") {
      return;
    }

    localPreparseStartedRef.current.add(itemId);
    updateItem(itemId, {
      progressLabel: "Reading locally",
    });

    try {
      const text = await extractTextFromFile(item.file, item.password.trim() || undefined);
      const localMetadata = detectStatementMetadata(text);
      const guessedIdentity = guessStatementIdentity(item.file.name);
      const itemImportMode = item.importMode ?? "statement";
      if (itemImportMode !== "statement") {
        return;
      }
      const parsedRows = parseImportText(text, item.file.name, fileTypeLabel(item.file), {
        institution: localMetadata?.institution ?? guessedIdentity?.institution ?? null,
        accountName: localMetadata?.accountName ?? guessedIdentity?.accountName ?? null,
        accountNumber: localMetadata?.accountNumber ?? null,
      });

      if (!localMetadata && parsedRows.length === 0) {
        return;
      }

      const accountName =
        localMetadata?.accountName ??
        guessedIdentity?.accountName ??
        deriveFallbackAccountNameFromFileName(item.file.name);
      const institution = localMetadata?.institution ?? guessedIdentity?.institution ?? null;
      const accountNumber = localMetadata?.accountNumber ?? null;
      if (!accountNumber) {
        return;
      }
      const accountType = (localMetadata?.accountType ??
        inferAccountTypeFromStatement(institution, accountName, "bank")) as UploadInsightsSummary["accountType"];
      const resolvedAccountId = resolveLocalAccountId(accountName, institution, accountNumber);
      const endingBalance = toBalanceString(localMetadata?.endingBalance ?? getTrailingBalanceFromParsedRows(parsedRows) ?? null);
      const optimisticAccountId = resolvedAccountId.startsWith("optimistic-") ? resolvedAccountId : null;

      const currentItem = itemsRef.current.find((entry) => entry.id === itemId);
      if (!currentItem || currentItem.status === "done" || currentItem.status === "error" || currentItem.confirmationState === "confirmed") {
        return;
      }

      const summary = buildOptimisticUploadSummary(
        item.file.name,
        parsedRows.length,
        resolvedAccountId,
        accountName,
        institution,
        accountType,
        optimisticAccountId,
        endingBalance,
        buildOptimisticPreviewTransactions(parsedRows, {
          importFileId: item.importFileId ?? item.id,
          accountId: resolvedAccountId,
        accountName,
        institution,
      }),
        accountNumber,
        true
      );

      seedImportedWorkspaceCaches(workspaceId, summary);
      await Promise.resolve(onImported(summary));
      updateItem(itemId, {
        progressLabel: parsedRows.length > 0 ? "Preview ready" : "Reading locally",
      });
    } catch (error) {
      if (isPasswordError(error)) {
        localPreparseStartedRef.current.delete(itemId);
      }
      // Browser-local preparse is best-effort only. The server path still finalizes the import.
    }
  }

  const removeItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  async function loadQaRun(itemId: string, forceRerun = false) {
    const item = items.find((entry) => entry.id === itemId);
    if (!item?.importFileId) {
      setQaErrorByItemId((current) => ({ ...current, [itemId]: "No import file is available for this row." }));
      return;
    }

    setQaLoadingByItemId((current) => ({ ...current, [itemId]: true }));
    setQaErrorByItemId((current) => ({ ...current, [itemId]: null }));

    try {
      const response = await fetch(`/api/imports/${item.importFileId}/qa`, {
        method: forceRerun ? "POST" : "GET",
        headers: forceRerun ? { "Content-Type": "application/json" } : undefined,
        body: forceRerun ? JSON.stringify({ source: "replay" }) : undefined,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Unable to load QA results.");
      }

      const payload = await response.json();
      const run = payload?.run ?? payload?.run?.run ?? null;
      const findings = Array.isArray(run?.findings) ? run.findings : [];

      setQaRunsByItemId((current) => ({
        ...current,
        [itemId]: run
          ? {
              id: String(run.id ?? crypto.randomUUID()),
              score: Number(run.score ?? 0),
              source: String(run.source ?? "unknown"),
              status: String(run.status ?? "completed"),
              findingCount: Number(run.findingCount ?? findings.length),
              criticalCount: Number(run.criticalCount ?? 0),
              parserVersion: run.parserVersion ? String(run.parserVersion) : null,
              totalDurationMs: run.totalDurationMs === null || run.totalDurationMs === undefined ? null : Number(run.totalDurationMs),
              parserDurationMs: run.parserDurationMs === null || run.parserDurationMs === undefined ? null : Number(run.parserDurationMs),
              feedbackPayload: run.feedbackPayload ?? null,
              findings: findings.map((finding: QaFinding) => ({
                code: String(finding.code ?? "unknown"),
                severity: finding.severity === "critical" || finding.severity === "warning" ? finding.severity : "info",
                field: finding.field ?? null,
                message: String(finding.message ?? ""),
                suggestion: finding.suggestion ?? null,
                confidence: Number(finding.confidence ?? 0),
              })),
            }
          : null,
      }));

      capturePostHogClientEvent("qa_run_completed", {
        workspace_id: workspaceId,
        import_file_id: item.importFileId,
        file_name: item.file.name,
        score: Number(run?.score ?? 0),
        finding_count: Number(run?.findingCount ?? findings.length),
        critical_count: Number(run?.criticalCount ?? 0),
        source: String(run?.source ?? "unknown"),
        force_rerun: forceRerun,
      });
    } catch (error) {
      setQaErrorByItemId((current) => ({
        ...current,
        [itemId]: error instanceof Error ? error.message : "Unable to load QA results.",
      }));
      capturePostHogClientEvent("qa_run_failed", {
        workspace_id: workspaceId,
        import_file_id: item.importFileId,
        file_name: item.file.name,
        force_rerun: forceRerun,
        error_code: getImportErrorCode(error),
      });
    } finally {
      setQaLoadingByItemId((current) => ({ ...current, [itemId]: false }));
    }
  }

  const monitorQueuedDocumentImport = async (
    itemId: string,
    importFileId: string,
    importMode: ImportImageMode,
    fileName: string
  ) => {
    const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const startedAt = Date.now();
    const MAX_WAIT_MS = 20_000;
    const progressLabel =
      importMode === "receipt"
        ? "Reading receipt in background"
        : importMode === "portfolio"
          ? "Reading portfolio in background"
          : importMode === "account_detail"
            ? "Reading account details in background"
            : importMode === "notes"
              ? "Reading notes in background"
              : "Reading document in background";
    const doneLabel =
      importMode === "receipt"
        ? "Receipt imported"
        : importMode === "portfolio"
          ? "Portfolio screenshot imported"
          : importMode === "account_detail"
            ? "Account details imported"
            : importMode === "notes"
              ? "Notes screenshot imported"
              : "Screenshot imported";

    for (let attempt = 0; attempt < 240; attempt += 1) {
      const response = await fetch(`/api/imports/${importFileId}/status`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Unable to load import status.");
      }

      const payload = (await response.json()) as ImportStatusPayload;
      const importFile = payload.importFile;
      const parsedRowsCount = Number(payload.parsedRowsCount ?? 0);
      const confirmedTransactionsCount = Number(payload.confirmedTransactionsCount ?? 0);
      const importStatus = typeof importFile?.status === "string" ? importFile.status : null;
      const processingPhase = typeof importFile?.processingPhase === "string" ? importFile.processingPhase : null;
      const processingMessage = typeof importFile?.processingMessage === "string" ? importFile.processingMessage : null;
      const telemetryPhase = typeof payload.telemetryPhase === "string" ? payload.telemetryPhase : null;
      const telemetryLabel = typeof payload.telemetryLabel === "string" ? payload.telemetryLabel : null;
      const telemetryMessage = typeof payload.telemetryMessage === "string" ? payload.telemetryMessage : null;
      const resumeReason = typeof payload.resumeReason === "string" ? payload.resumeReason : null;

      if (importStatus === "failed") {
        if ((parsedRowsCount > 0 || confirmedTransactionsCount > 0) && attempt < 239) {
          updateItem(itemId, {
            status: "importing",
            progress: 92,
            progressLabel: telemetryLabel ?? "Finalizing import",
          });
          publishImportActivity({
            workspaceId,
            surface: importActivitySurfaceRef.current,
            status: "active",
            fileName,
            fileIndex: items.findIndex((item) => item.id === itemId) + 1,
            fileTotal: items.length,
            completedFiles: completedFileCount,
            progress: 92,
            detail: getTelemetryDetail(
              "Clover is finalizing the imported file",
              telemetryMessage,
              telemetryLabel,
              resumeReason
            ),
            summary: null,
            errorMessage: null,
          });
          await sleep(800);
          continue;
        }
        closeImportAfterError(
          itemId,
          "background",
          fileName,
          processingMessage ?? "Clover couldn't finish reading this file."
        );
        return false;
      }

      if (importStatus === "done") {
        updateItem(itemId, {
          status: "done",
          confirmationState: "confirmed",
          progress: 100,
          progressLabel: doneLabel,
        });
        publishImportActivity({
          workspaceId,
          surface: importActivitySurfaceRef.current,
          status: "done",
          fileName,
          fileIndex: items.findIndex((item) => item.id === itemId) + 1,
          fileTotal: items.length,
          completedFiles: completedFileCount + 1,
          progress: 100,
          detail: doneLabel,
          summary: null,
          errorMessage: null,
        });
        router.refresh();
        return true;
      }

      updateItem(itemId, {
        status: "importing",
        progress: Math.max(IMPORT_PROGRESS.parsing, Math.min(92, IMPORT_PROGRESS.parsing + attempt * 0.25)),
        progressLabel: telemetryLabel ?? processingMessage ?? progressLabel,
      });
      publishImportActivity({
        workspaceId,
        surface: importActivitySurfaceRef.current,
        status: "active",
        fileName,
        fileIndex: items.findIndex((item) => item.id === itemId) + 1,
        fileTotal: items.length,
        completedFiles: completedFileCount,
        progress: Math.max(IMPORT_PROGRESS.parsing, Math.min(92, IMPORT_PROGRESS.parsing + attempt * 0.25)),
        detail: getTelemetryDetail(
          telemetryPhase === "repair_needed"
            ? "Clover needs another pass to finish this file"
            : processingPhase === "auto_rerunning"
            ? "Clover is rechecking the document"
            : parsedRowsCount > 0 || confirmedTransactionsCount > 0
              ? `Clover found ${Math.max(parsedRowsCount, confirmedTransactionsCount)} item(s)`
              : progressLabel,
          telemetryMessage ?? processingMessage,
          telemetryLabel,
          resumeReason
        ),
        summary: null,
        errorMessage: null,
      });

      if (Date.now() - startedAt >= MAX_WAIT_MS) {
        const hasRecoverableProgress =
          Boolean(importFileId) || parsedRowsCount > 0 || confirmedTransactionsCount > 0;
        if (hasRecoverableProgress) {
          closeImportAsRecoverable(
            itemId,
            fileName,
            "Clover parsed the file and is still finalizing the import.",
            "Finalizing import"
          );
          return false;
        }

        const timeoutMessage = "Timed out after 2 minutes while Clover was still reading the document.";
        closeImportAfterError(itemId, "monitor", fileName, timeoutMessage);
        return false;
      }

      await sleep(500);
    }

    closeImportAfterError(itemId, "monitor", fileName, "Timed out while Clover was still reading the document.");
    return false;
  };

  const processFile = async (itemId: string): Promise<ImportProcessResult> => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return { status: "error", importedRows: null, summary: null };
    const guessedIdentity = guessStatementIdentity(item.file.name);
    const canUseOptimisticGuess = Boolean(guessedIdentity?.accountName && guessedIdentity.accountNumber);
    const itemImportMode = item.importMode ?? "statement";
    const isDocumentImport = itemImportMode !== "statement";
    let importFileId: string | null = null;

    if (!workspaceId) {
      closeImportAfterError(itemId, "validation", item?.file.name ?? "This file", "Select a workspace before importing files.");
      return { status: "error", importedRows: null, summary: null };
    }

    if (await isLikelyPasswordProtectedPdf(item.file) && !item.password.trim()) {
      updateItem(itemId, {
        status: "needs_password",
        error: `${item.file.name} is password-protected. Enter the password to continue.`,
        progress: 0,
        progressLabel: "Password needed",
      });
      publishImportActivity({
        workspaceId,
        surface: importActivitySurfaceRef.current,
        status: "active",
        fileName: item.file.name,
        fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
        fileTotal: items.length,
        completedFiles: completedFileCount,
        progress: 0,
        detail: "This file needs a password",
        summary: null,
        errorMessage: `${item.file.name} is password-protected. Enter the password to continue.`,
      });
      return { status: "needs_password", importedRows: null, summary: null };
    }

    try {
      importFileId = crypto.randomUUID();

      capturePostHogClientEvent("import_started", {
        file_type: fileTypeLabel(item.file),
        file_size_bytes: item.file.size,
        import_mode: itemImportMode,
      });
      updateItem(itemId, { status: "importing", error: null, progress: IMPORT_PROGRESS.preparing, progressLabel: "Starting upload", importFileId });
      updateItem(itemId, { progress: IMPORT_PROGRESS.preparing, progressLabel: "Uploading the file" });
      publishImportActivity({
        workspaceId,
        surface: importActivitySurfaceRef.current,
        status: "active",
        fileName: item.file.name,
        fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
        fileTotal: items.length,
        completedFiles: completedFileCount,
        progress: 20,
        detail: "Clover is getting your file ready",
        summary: null,
        errorMessage: null,
      });
      await yieldToPaint();
      capturePostHogClientEvent("import_parsing_started", {
        file_type: fileTypeLabel(item.file),
        file_size_bytes: item.file.size,
        import_mode: itemImportMode,
      });
      const processResponse = await postFileWithProgress(
        `/api/imports/${importFileId}/process`,
        item.file,
        {
          workspaceId,
          fileName: item.file.name,
          fileType: item.file.type || item.file.name.split(".").pop() || "unknown",
          password: item.password.trim() || undefined,
          importMode: itemImportMode,
        },
        (progress) => {
          publishImportActivity({
            workspaceId,
            surface: importActivitySurfaceRef.current,
            status: "active",
            fileName: item.file.name,
            fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
            fileTotal: items.length,
            completedFiles: completedFileCount,
          progress: IMPORT_PROGRESS.preparing + progress * ((IMPORT_PROGRESS.uploading - IMPORT_PROGRESS.preparing) / 100),
          detail: "Clover is uploading the file",
          summary: null,
          errorMessage: null,
        });
          updateItem(itemId, {
            progress: IMPORT_PROGRESS.preparing + progress * ((IMPORT_PROGRESS.uploading - IMPORT_PROGRESS.preparing) / 100),
            progressLabel: "Uploading the file",
            status: "importing",
          });
        }
      );
      capturePostHogClientEvent("file_uploaded", {
        file_type: fileTypeLabel(item.file),
        file_size_bytes: item.file.size,
        import_mode: itemImportMode,
      });

      if (!processResponse.ok) {
        const payload = await processResponse.json().catch(() => ({}));
        const limitPayload = parsePlanLimitPayload(payload) ?? parsePlanLimitMessage(String(payload.error ?? ""), planTier);
        if (limitPayload) {
          showPlanLimitNudge(limitPayload);
        }
        capturePostHogClientEvent("file_upload_failed", {
          ...fileAnalyticsBase(item.file, workspaceId),
          error_stage: "upload",
          error_code: String(payload.error ?? "unknown"),
          limit_type: limitPayload?.limitType ?? null,
        });
        throw new Error(payload.error || "Unable to parse this file.");
      }

      const processPayload = await processResponse.json().catch(() => ({}));
      if (isDocumentImport) {
        const importedLabel =
          itemImportMode === "receipt"
            ? "Receipt imported"
            : itemImportMode === "portfolio"
              ? "Portfolio screenshot imported"
              : itemImportMode === "account_detail"
                ? "Account details imported"
            : itemImportMode === "notes"
              ? "Notes screenshot imported"
              : "Screenshot imported";
        if (processPayload?.queued) {
          updateItem(itemId, {
            status: "importing",
            confirmationState: "pending",
            error: null,
            importFileId,
            targetAccountId: null,
            importedRows: 0,
            progress: IMPORT_PROGRESS.loadingAccount,
            progressLabel:
              itemImportMode === "receipt"
                ? "Reading receipt in background"
                : itemImportMode === "portfolio"
                  ? "Reading portfolio in background"
                  : itemImportMode === "account_detail"
                    ? "Reading account details in background"
                    : itemImportMode === "notes"
                      ? "Reading notes in background"
                      : "Reading document in background",
          });
          publishImportActivity({
            workspaceId,
            surface: importActivitySurfaceRef.current,
            status: "active",
            fileName: item.file.name,
            fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
            fileTotal: items.length,
            completedFiles: completedFileCount,
            progress: IMPORT_PROGRESS.loadingAccount,
            detail:
              itemImportMode === "receipt"
                ? "Clover is reading the receipt"
                : itemImportMode === "portfolio"
                  ? "Clover is reading the portfolio"
                  : itemImportMode === "account_detail"
                    ? "Clover is reading the account details"
                    : itemImportMode === "notes"
                      ? "Clover is reading the notes"
                      : "Clover is reading the document",
            summary: null,
            errorMessage: null,
          });
          const completed = await monitorQueuedDocumentImport(itemId, importFileId, itemImportMode, item.file.name);
          if (!completed) {
            return { status: "error", importedRows: null, summary: null };
          }
          return {
            status: "done",
            importedRows: 0,
            summary: null,
          };
        }
        updateItem(itemId, {
          status: "done",
          confirmationState: "confirmed",
          error: null,
          importFileId,
          targetAccountId: null,
          importedRows: Number(processPayload?.imported ?? 0) || 0,
          progress: 100,
          progressLabel: importedLabel,
        });
        publishImportActivity({
          workspaceId,
          surface: importActivitySurfaceRef.current,
          status: "done",
          fileName: item.file.name,
          fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
          fileTotal: items.length,
          completedFiles: completedFileCount + 1,
          progress: 100,
          detail: importedLabel,
          summary: null,
          errorMessage: null,
        });
        setMessage(`Imported ${item.file.name}.`);
        router.refresh();
        return {
          status: "done",
          importedRows: Number(processPayload?.imported ?? 0) || 0,
          summary: null,
        };
      }

      const payloadIdentity = resolveStatementIdentityFromMetadata(processPayload?.metadata);
      const statementIdentity: StatementIdentity | null =
        payloadIdentity ??
        (guessedIdentity
          ? {
              ...guessedIdentity,
              accountNumber: null,
              accountType: inferAccountTypeFromStatement(guessedIdentity.institution, guessedIdentity.accountName, "bank"),
            }
          : null);
      const statementAccountType =
        statementIdentity?.accountType ??
        inferAccountTypeFromStatement(statementIdentity?.institution, statementIdentity?.accountName, "bank");
      if (statementIdentity?.accountName || statementIdentity?.institution) {
        capturePostHogClientEventOnce(
          "statement_identity_resolved",
          {
            ...fileAnalyticsBase(item.file, workspaceId),
            import_file_id: importFileId,
            statement_account_name: statementIdentity?.accountName ?? null,
            statement_institution: statementIdentity?.institution ?? null,
            statement_account_type: statementIdentity?.accountType ?? statementAccountType ?? null,
            confidence: Number(processPayload?.metadata?.confidence ?? 0) || null,
          },
          analyticsOnceKey("statement_identity_resolved", `file:${item.id}`)
        );
      }
      if (processPayload?.duplicate) {
        capturePostHogClientEvent("import_duplicate_detected", {
          ...fileAnalyticsBase(item.file, workspaceId),
          import_file_id: importFileId,
          statement_account_name: statementIdentity?.accountName ?? guessedIdentity?.accountName ?? null,
          statement_institution: statementIdentity?.institution ?? guessedIdentity?.institution ?? null,
          duplicate_status: true,
        });
        const duplicateMessage = formatDuplicateImportMessage(item.file.name, guessedIdentity?.accountName ?? null);
        updateItem(itemId, {
          status: "done",
          confirmationState: "confirmed",
          error: null,
          importFileId,
          targetAccountId: null,
          importedRows: 0,
          progress: 100,
          progressLabel: "Already imported in this workspace",
        });
        publishImportActivity({
          workspaceId,
          surface: importActivitySurfaceRef.current,
          status: "done",
          fileName: item.file.name,
          fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
          fileTotal: items.length,
          completedFiles: completedFileCount + 1,
          progress: 100,
          detail: duplicateMessage,
          summary: null,
          errorMessage: null,
        });
        setMessage(duplicateMessage);
        return { status: "done", importedRows: 0, summary: null };
      }

      capturePostHogClientEvent("import_parsed_successfully", {
        ...fileAnalyticsBase(item.file, workspaceId),
        transaction_count: Number(processPayload?.imported ?? 0) || undefined,
        institution: statementIdentity?.institution ?? null,
        import_mode: itemImportMode,
        parsing_mode: processPayload?.queued ? "queued" : "inline",
        confidence: Number(processPayload?.metadata?.confidence ?? 0) || null,
      });

      const parseConfidence = Number(processPayload?.metadata?.confidence ?? 0);
      if (processPayload?.queued || parseConfidence < 80 || !statementIdentity?.institution || !statementIdentity?.accountName) {
        capturePostHogClientEventOnce(
          "import_parsed_with_warnings",
          {
            ...fileAnalyticsBase(item.file, workspaceId),
            warning_count: processPayload?.queued ? 1 : 0,
            validation_issue_count: 0,
            skipped_count: 0,
            file_count: 1,
            limit_type: null,
            parse_confidence: parseConfidence || null,
            queued: Boolean(processPayload?.queued),
          },
          analyticsOnceKey("import_parsed_with_warnings", `file:${item.id}`)
          );
      }

      const serverConfirmedAccountId =
        typeof processPayload?.accountId === "string" && processPayload.accountId.trim()
          ? processPayload.accountId.trim()
          : null;
      if (serverConfirmedAccountId) {
        const confirmedRows = Number(processPayload?.confirmedTransactionsCount ?? processPayload?.imported ?? 0) || 0;
        const confirmedAccountName = statementIdentity?.accountName ?? guessedIdentity?.accountName ?? item.file.name;
        const confirmedInstitution = statementIdentity?.institution ?? guessedIdentity?.institution ?? null;
        const confirmedAccountNumber = statementIdentity?.accountNumber ?? guessedIdentity?.accountNumber ?? null;
        const confirmedAccountType =
          statementIdentity?.accountType ??
          statementAccountType ??
          inferAccountTypeFromStatement(confirmedInstitution, confirmedAccountName, "bank");
        const confirmedBalance = pickStableBalance(
          typeof processPayload.accountBalance === "string" ? processPayload.accountBalance : null,
          findKnownImportedBalance(accounts, {
            workspaceId,
            accountId: serverConfirmedAccountId,
            accountName: confirmedAccountName ?? null,
            institution: confirmedInstitution,
            accountNumber: confirmedAccountNumber,
            accountType: confirmedAccountType,
          })
        );
        const confirmedPreviewTransactions = await loadOptimisticPreviewTransactions(
          importFileId,
          serverConfirmedAccountId,
          confirmedAccountName ?? "",
          confirmedInstitution
        )
          .catch(() => [])
          .then((rows) =>
            rows.length > 0
              ? rows
              : getKnownPreviewTransactions({
                  workspaceId,
                  accountId: serverConfirmedAccountId,
                  optimisticAccountId: item.optimisticAccountId ?? null,
                  accountName: confirmedAccountName ?? null,
                  institution: confirmedInstitution,
                  accountNumber: confirmedAccountNumber,
                  accountType: confirmedAccountType,
                })
          );
        const confirmedInsightSummary =
          processPayload?.insightSummary ??
          {
            incomeTotal: 0,
            expenseTotal: 0,
            netTotal: 0,
            topCategoryName: null,
            topCategoryAmount: null,
            topCategoryShare: null,
            topMerchantName: null,
            topMerchantCount: null,
          };
        const confirmedSummary = ({
          fileName: item.file.name,
          rowsImported: confirmedRows,
          accountId: serverConfirmedAccountId,
          accountName: confirmedAccountName ?? null,
          institution: confirmedInstitution,
          accountNumber: confirmedAccountNumber,
          accountType: confirmedAccountType,
          balance: confirmedBalance,
          optimisticAccountId: item.optimisticAccountId ?? null,
          previewTransactions: confirmedPreviewTransactions,
          incomeTotal: Number(confirmedInsightSummary.incomeTotal ?? 0),
          expenseTotal: Number(confirmedInsightSummary.expenseTotal ?? 0),
          netTotal: Number(confirmedInsightSummary.netTotal ?? 0),
          topCategoryName: confirmedInsightSummary.topCategoryName ?? null,
          topCategoryAmount:
            confirmedInsightSummary.topCategoryAmount === null
              ? null
              : Number(confirmedInsightSummary.topCategoryAmount),
          topCategoryShare:
            confirmedInsightSummary.topCategoryShare === null
              ? null
              : Number(confirmedInsightSummary.topCategoryShare),
          topMerchantName: confirmedInsightSummary.topMerchantName ?? null,
          topMerchantCount:
            confirmedInsightSummary.topMerchantCount === null
              ? null
              : Number(confirmedInsightSummary.topMerchantCount),
        } satisfies UploadInsightsSummary);

        if (confirmedSummary) {
          seedImportedWorkspaceCaches(workspaceId, confirmedSummary);
          await Promise.resolve(onImported(confirmedSummary));
        }

          const settledVisible = await waitForImportSettledVisibility({
            workspaceId,
            accountId: serverConfirmedAccountId,
            importedRows: confirmedRows,
            expectedBalance: confirmedSummary.balance ?? null,
          });
        if (!settledVisible) {
          console.warn("Import finished before the settled data became visible", {
            importFileId,
            accountId: serverConfirmedAccountId,
          });
        }

        updateItem(itemId, {
          status: "done",
          confirmationState: "confirmed",
          error: null,
          importFileId,
          targetAccountId: serverConfirmedAccountId,
          importedRows: confirmedRows,
          progress: 100,
          progressLabel: "Done",
        });
        publishImportActivity({
          workspaceId,
          surface: importActivitySurfaceRef.current,
          status: "done",
          fileName: item.file.name,
          fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
          fileTotal: items.length,
          completedFiles: completedFileCount + 1,
          progress: 100,
          detail: "All set",
          summary: confirmedSummary,
          errorMessage: null,
        });

        setMessage(`Imported ${item.file.name}.`);
        router.refresh();
        return {
          status: "done",
          importedRows: confirmedRows,
          summary: confirmedSummary,
        };
      }

      if (processPayload?.queued) {
        const hasStatementIdentity = Boolean(
          statementIdentity?.accountName && statementIdentity?.institution && statementIdentity?.accountNumber
        );
        const knownOptimisticBalance = statementIdentity
          ? findKnownImportedBalance(accounts, {
              workspaceId,
              accountId: item.optimisticAccountId ?? null,
              accountName: statementIdentity.accountName ?? null,
              institution: statementIdentity?.institution ?? null,
              accountNumber: statementIdentity?.accountNumber ?? null,
              accountType: statementIdentity?.accountType ?? statementAccountType,
            })
          : null;
        const optimisticAccountId = hasStatementIdentity
          ? await ensureTargetAccountId(
              statementIdentity?.accountName ?? null,
              statementIdentity?.institution ?? null,
              statementAccountType,
              statementIdentity?.accountNumber ?? null,
              knownOptimisticBalance,
              null
            )
          : canUseOptimisticGuess
            ? item.optimisticAccountId ?? null
            : null;
        const previewTransactions =
          optimisticAccountId && statementIdentity?.accountName
            ? await loadOptimisticPreviewTransactions(
                importFileId,
                optimisticAccountId,
                statementIdentity.accountName ?? "",
                statementIdentity?.institution ?? null
              ).then((rows) =>
                rows.length > 0
                  ? rows
                  : getKnownPreviewTransactions({
                      workspaceId,
                      accountId: optimisticAccountId,
                      optimisticAccountId: item.optimisticAccountId ?? null,
                      accountName: statementIdentity.accountName ?? null,
                      institution: statementIdentity?.institution ?? null,
                      accountNumber: statementIdentity?.accountNumber ?? null,
                      accountType: statementIdentity?.accountType ?? statementAccountType,
                    })
              )
            : [];
        const optimisticIdentity =
          statementIdentity?.accountNumber
            ? statementIdentity
              : canUseOptimisticGuess && guessedIdentity
              ? {
                  ...guessedIdentity,
                  accountNumber: null,
                  accountType: inferAccountTypeFromStatement(guessedIdentity.institution, guessedIdentity.accountName, "bank"),
                }
              : null;
        const optimisticSummary = optimisticIdentity
          ? ({
              ...buildOptimisticUploadSummary(
                item.file.name,
                0,
                optimisticAccountId,
                optimisticIdentity.accountName ?? null,
                optimisticIdentity.institution ?? null,
                optimisticIdentity.accountType ?? statementAccountType,
                optimisticAccountId,
                knownOptimisticBalance,
                previewTransactions,
                statementIdentity?.accountNumber ?? null,
                true
              ),
            } satisfies UploadInsightsSummary)
          : null;
        updateItem(itemId, {
          importFileId,
          targetAccountId: optimisticAccountId,
          confirmationState: "staged",
          progress: IMPORT_PROGRESS.loadingAccount,
          progressLabel: hasStatementIdentity || canUseOptimisticGuess ? "Loading account" : "Waiting for account details",
          status: "importing",
        });
        publishImportActivity({
          workspaceId,
          surface: importActivitySurfaceRef.current,
          status: "active",
          fileName: item.file.name,
          fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
          fileTotal: items.length,
          completedFiles: completedFileCount,
          progress: IMPORT_PROGRESS.loadingAccount,
          detail:
            hasStatementIdentity || canUseOptimisticGuess
              ? getProgressDetail(
                  {
                    accountName: statementIdentity?.accountName ?? guessedIdentity?.accountName ?? null,
                    institution: statementIdentity?.institution ?? guessedIdentity?.institution ?? null,
                    accountNumber: statementIdentity?.accountNumber ?? null,
                  },
                  previewTransactions.length
                )
              : "Clover is reading the document",
          summary: null,
          errorMessage: null,
        });
        if (optimisticSummary) {
          seedImportedWorkspaceCaches(workspaceId, optimisticSummary);
          await Promise.resolve(onImported(optimisticSummary));

          const settledVisible = await waitForImportSettledVisibility({
            workspaceId,
            accountId: optimisticAccountId,
            importedRows: Number(processPayload?.imported ?? 0) || 0,
            expectedBalance: optimisticSummary.balance ?? null,
          });
          if (!settledVisible) {
            console.warn("Import finished before the settled data became visible", {
              importFileId,
              accountId: optimisticAccountId,
            });
          }

          updateItem(itemId, {
            status: "done",
            confirmationState: "confirmed",
            error: null,
            importFileId,
            targetAccountId: optimisticAccountId,
            importedRows: Number(processPayload?.imported ?? 0) || 0,
            progress: 100,
            progressLabel: "Done",
          });
          publishImportActivity({
            workspaceId,
            surface: importActivitySurfaceRef.current,
            status: "done",
            fileName: item.file.name,
            fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
            fileTotal: items.length,
            completedFiles: completedFileCount + 1,
            progress: 100,
            detail: "All set",
            summary: optimisticSummary,
            errorMessage: null,
          });

          void monitorQueuedImportAndConfirm(
            itemId,
            importFileId,
            optimisticAccountId,
            {
              fileName: item.file.name,
              fallbackAccountName: deriveFallbackAccountNameFromFileName(item.file.name),
              guessedAccountName: guessedIdentity?.accountName ?? null,
              guessedInstitution: guessedIdentity?.institution ?? null,
              guessedAccountNumber: null,
              guessedAccountType: guessedIdentity
                ? inferAccountTypeFromStatement(guessedIdentity.institution, guessedIdentity.accountName, "bank")
                : null,
              accountName: statementIdentity?.accountName ?? null,
              institution: statementIdentity?.institution ?? null,
              accountNumber: statementIdentity?.accountNumber ?? null,
              accountType: statementIdentity?.accountType ?? null,
              optimisticAccountId: hasStatementIdentity ? optimisticAccountId : canUseOptimisticGuess ? item.optimisticAccountId : null,
              initialBalance: optimisticSummary.balance ?? null,
              password: item.password.trim() || undefined,
              previewTransactions,
            },
            { backgroundOnly: true }
          );

          return {
            status: "done",
            importedRows: Number(processPayload?.imported ?? 0) || 0,
            summary: optimisticSummary,
          };
        }

        void monitorQueuedImportAndConfirm(itemId, importFileId, optimisticAccountId, {
          fileName: item.file.name,
          fallbackAccountName: deriveFallbackAccountNameFromFileName(item.file.name),
          guessedAccountName: guessedIdentity?.accountName ?? null,
          guessedInstitution: guessedIdentity?.institution ?? null,
          guessedAccountNumber: null,
          guessedAccountType: guessedIdentity
            ? inferAccountTypeFromStatement(guessedIdentity.institution, guessedIdentity.accountName, "bank")
            : null,
          accountName: statementIdentity?.accountName ?? null,
          institution: statementIdentity?.institution ?? null,
          accountNumber: statementIdentity?.accountNumber ?? null,
          accountType: statementIdentity?.accountType ?? null,
          optimisticAccountId: hasStatementIdentity ? optimisticAccountId : canUseOptimisticGuess ? item.optimisticAccountId : null,
              initialBalance: optimisticSummary ? (optimisticSummary as UploadInsightsSummary).balance : null,
          password: item.password.trim() || undefined,
          previewTransactions,
        });

        return {
          status: "staged",
          importedRows: 0,
          summary: optimisticSummary,
        };
      }

      const targetAccountId: string | null = statementIdentity
        ? await ensureTargetAccountId(
            statementIdentity.accountName ?? null,
            statementIdentity.institution ?? null,
            statementAccountType,
            statementIdentity.accountNumber ?? null,
            null,
            null
          )
        : null;

      const previewTransactions =
        targetAccountId && statementIdentity?.accountName
          ? await loadOptimisticPreviewTransactions(
              importFileId,
              targetAccountId,
              statementIdentity.accountName ?? "",
              statementIdentity?.institution ?? null
            ).then((rows) =>
              rows.length > 0
                ? rows
                : getKnownPreviewTransactions({
                    workspaceId,
                    accountId: targetAccountId,
                    optimisticAccountId: item.optimisticAccountId ?? null,
                    accountName: statementIdentity.accountName ?? null,
                    institution: statementIdentity?.institution ?? null,
                    accountNumber: statementIdentity?.accountNumber ?? null,
                    accountType: statementAccountType,
                  })
            )
          : [];
      const knownPreviewBalance = findKnownImportedBalance(accounts, {
        workspaceId,
        accountId: targetAccountId,
        accountName: statementIdentity?.accountName ?? null,
        institution: statementIdentity?.institution ?? null,
        accountNumber: statementIdentity?.accountNumber ?? null,
        accountType: statementAccountType,
      });
      const optimisticPreviewSummary =
        targetAccountId
          ? ({
              ...buildOptimisticUploadSummary(
                item.file.name,
                Number(processPayload?.imported ?? 0) || 0,
                targetAccountId,
                statementIdentity?.accountName ?? null,
                statementIdentity?.institution ?? null,
                statementAccountType,
                targetAccountId.startsWith("optimistic-") ? targetAccountId : null,
                knownPreviewBalance,
                previewTransactions,
                statementIdentity?.accountNumber ?? null,
                true
              ),
            } satisfies UploadInsightsSummary)
          : null;

      updateItem(itemId, {
        importFileId,
        targetAccountId,
        confirmationState: "staged",
        progress: IMPORT_PROGRESS.loadingAccount,
        progressLabel: targetAccountId ? "Loading account" : "Waiting for account details",
      });
      publishImportActivity({
        workspaceId,
        surface: importActivitySurfaceRef.current,
        status: "active",
        fileName: item.file.name,
        fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
        fileTotal: items.length,
        completedFiles: completedFileCount,
        progress: IMPORT_PROGRESS.loadingAccount,
        detail: targetAccountId
          ? getProgressDetail(
              {
                accountName: statementIdentity?.accountName ?? null,
                institution: statementIdentity?.institution ?? null,
                accountNumber: statementIdentity?.accountNumber ?? null,
              },
              previewTransactions.length
            )
          : "Clover is reading the document",
        summary: null,
        errorMessage: null,
      });

      if (optimisticPreviewSummary) {
        seedImportedWorkspaceCaches(workspaceId, optimisticPreviewSummary);
        await Promise.resolve(onImported(optimisticPreviewSummary));
      }

      if (targetAccountId) {
        try {
          const result = await confirmItemImport(
            itemId,
            importFileId,
            targetAccountId,
            {
              fileName: item.file.name,
              accountName: statementIdentity?.accountName ?? null,
              institution: statementIdentity?.institution ?? null,
              accountNumber: statementIdentity?.accountNumber ?? null,
              accountType: statementIdentity?.accountType ?? statementAccountType,
              optimisticAccountId: targetAccountId,
              previewTransactions,
            },
            {
              backgroundOnly: true,
            }
          );

          if (result.summary) {
            seedImportedWorkspaceCaches(workspaceId, result.summary);
            await Promise.resolve(onImported(result.summary));
          }
        } catch (error) {
          console.warn("Background import confirmation failed", {
            importFileId,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        const settledVisible = await waitForImportSettledVisibility({
          workspaceId,
          accountId: targetAccountId,
          importedRows: Number(processPayload?.imported ?? 0) || 0,
          expectedBalance: optimisticPreviewSummary?.balance ?? null,
        });
        if (!settledVisible) {
          console.warn("Import finished before the settled data became visible", {
            importFileId,
            accountId: targetAccountId,
          });
        }

        updateItem(itemId, {
          status: "done",
          confirmationState: "confirmed",
          error: null,
          importFileId,
          targetAccountId,
          importedRows: Number(processPayload?.imported ?? 0) || 0,
          progress: 100,
          progressLabel: "Done",
        });
        publishImportActivity({
          workspaceId,
          surface: importActivitySurfaceRef.current,
          status: "done",
          fileName: item.file.name,
          fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
          fileTotal: items.length,
          completedFiles: completedFileCount + 1,
          progress: 100,
          detail: "All set",
          summary: optimisticPreviewSummary,
          errorMessage: null,
        });
      } else {
          void monitorQueuedImportAndConfirm(itemId, importFileId, null, {
          fileName: item.file.name,
          fallbackAccountName: deriveFallbackAccountNameFromFileName(item.file.name),
          guessedAccountName: guessedIdentity?.accountName ?? null,
          guessedInstitution: guessedIdentity?.institution ?? null,
          guessedAccountNumber: null,
          guessedAccountType: guessedIdentity
            ? inferAccountTypeFromStatement(guessedIdentity.institution, guessedIdentity.accountName, "bank")
            : null,
          accountName: statementIdentity?.accountName ?? null,
          institution: statementIdentity?.institution ?? null,
          accountNumber: statementIdentity?.accountNumber ?? null,
          accountType: statementIdentity?.accountType ?? null,
          optimisticAccountId: null,
          initialBalance: optimisticPreviewSummary ? (optimisticPreviewSummary as UploadInsightsSummary).balance : null,
          password: item.password.trim() || undefined,
        }, {
          backgroundOnly: true,
        });
        updateItem(itemId, {
          status: "done",
          confirmationState: "confirmed",
          error: null,
          importFileId,
          targetAccountId: null,
          importedRows: Number(processPayload?.imported ?? 0) || 0,
          progress: 100,
          progressLabel: "Done",
        });
        publishImportActivity({
          workspaceId,
          surface: importActivitySurfaceRef.current,
          status: "done",
          fileName: item.file.name,
          fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
          fileTotal: items.length,
          completedFiles: completedFileCount + 1,
          progress: 100,
          detail: "All set",
          summary: optimisticPreviewSummary,
          errorMessage: null,
        });
      }

        return {
          status: "done",
          importedRows: Number(processPayload?.imported ?? 0) || null,
          summary: optimisticPreviewSummary,
        };
    } catch (error) {
      if (isPasswordError(error)) {
        const currentImportFileId = importFileId ?? item.importFileId ?? null;
        if (item.password.trim()) {
          capturePostHogClientEvent("password_failed", {
            ...fileAnalyticsBase(item.file, workspaceId),
            import_file_id: currentImportFileId,
            error_stage: "process",
            error_code: getImportErrorCode(error),
          });
        }
        const needsPasswordMessage = item.password.trim()
          ? `Wrong password for ${item.file.name}.`
          : `${item.file.name} is password-protected. Enter the password to continue.`;
      updateItem(itemId, {
        status: "needs_password",
        error: needsPasswordMessage,
        password: "",
        passwordVisible: false,
        progress: 0,
        progressLabel: "Password needed",
      });
      publishImportActivity({
        workspaceId,
        surface: importActivitySurfaceRef.current,
        status: "active",
        fileName: item.file.name,
        fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
        fileTotal: items.length,
        completedFiles: completedFileCount,
        progress: 0,
        detail: "This file needs a password",
        summary: null,
        errorMessage: needsPasswordMessage,
      });
      return { status: "needs_password", importedRows: null, summary: null };
      }

      const recoverableStatus = importFileId
        ? await fetch(`/api/imports/${importFileId}/status`)
            .then(async (response) => {
              if (!response.ok) {
                return null;
              }

              return (await response.json()) as ImportStatusPayload;
            })
            .catch(() => null)
        : null;
      const recoverableImportFileId =
        typeof importFileId === "string" && importFileId.trim() ? importFileId.trim() : null;
      const recoverableIdentity = resolveStatementIdentityFromMetadata(recoverableStatus?.statementCheckpoint?.sourceMetadata);
      const recoverableAccountId =
        typeof recoverableStatus?.importFile?.accountId === "string" && recoverableStatus.importFile.accountId.trim()
          ? recoverableStatus.importFile.accountId.trim()
          : null;
      const recoverableParsedRowsCount = Number(recoverableStatus?.parsedRowsCount ?? 0);
      const recoverableConfirmedRowsCount = Number(recoverableStatus?.confirmedTransactionsCount ?? 0);
      const hasRecoverableIdentity =
        Boolean(recoverableIdentity?.accountName || recoverableIdentity?.institution || recoverableIdentity?.accountNumber);
      const canRecoverFromProcessError =
        Boolean(recoverableAccountId && !recoverableAccountId.startsWith("optimistic-")) ||
        hasRecoverableIdentity;

      if (canRecoverFromProcessError) {
        const fallbackAccountId =
          recoverableAccountId && !recoverableAccountId.startsWith("optimistic-")
            ? recoverableAccountId
            : await ensureTargetAccountId(
                recoverableIdentity?.accountName ?? item.file.name,
                recoverableIdentity?.institution ?? null,
                recoverableIdentity?.accountType ??
                  inferAccountTypeFromStatement(recoverableIdentity?.institution, recoverableIdentity?.accountName, "bank"),
                recoverableIdentity?.accountNumber ?? null,
                null,
                null
              );

        const recoverablePreviewTransactions =
          recoverableImportFileId && fallbackAccountId
            ? await loadOptimisticPreviewTransactions(
                recoverableImportFileId,
                fallbackAccountId,
                recoverableIdentity?.accountName ?? item.file.name,
                recoverableIdentity?.institution ?? null
              ).catch(() => [])
            : [];
        const recoveredSummary = buildOptimisticUploadSummary(
          item.file.name,
          Math.max(recoverableConfirmedRowsCount, recoverableParsedRowsCount),
          fallbackAccountId,
          recoverableIdentity?.accountName ?? item.file.name,
          recoverableIdentity?.institution ?? null,
          recoverableIdentity?.accountType ??
            inferAccountTypeFromStatement(recoverableIdentity?.institution, recoverableIdentity?.accountName, "bank"),
          item.optimisticAccountId ?? null,
          pickStableBalance(
            toBalanceString(recoverableStatus?.statementCheckpoint?.endingBalance),
            findKnownImportedBalance(accounts, {
              workspaceId,
              accountId: fallbackAccountId,
              accountName: recoverableIdentity?.accountName ?? item.file.name,
              institution: recoverableIdentity?.institution ?? null,
              accountNumber: recoverableIdentity?.accountNumber ?? null,
              accountType:
                recoverableIdentity?.accountType ??
                inferAccountTypeFromStatement(recoverableIdentity?.institution, recoverableIdentity?.accountName, "bank"),
            })
          ),
          recoverablePreviewTransactions,
          recoverableIdentity?.accountNumber ?? null
        );
        const finalizedRecoveredSummary: UploadInsightsSummary = {
          ...recoveredSummary,
          optimistic: false,
        };

        seedImportedWorkspaceCaches(workspaceId, finalizedRecoveredSummary);
        await Promise.resolve(onImported(finalizedRecoveredSummary));
        updateItem(itemId, {
          status: "importing",
          confirmationState: "staged",
          error: null,
          importFileId,
          targetAccountId: fallbackAccountId,
          importedRows: Math.max(recoverableConfirmedRowsCount, recoverableParsedRowsCount) || 0,
          progress: IMPORT_PROGRESS.loadingAccount,
          progressLabel: "Loading account",
        });
        publishImportActivity({
          workspaceId,
          surface: importActivitySurfaceRef.current,
          status: "active",
          fileName: item.file.name,
          fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
          fileTotal: items.length,
          completedFiles: completedFileCount,
          progress: IMPORT_PROGRESS.loadingAccount,
          detail: getProgressDetail(
            {
              accountName: recoverableIdentity?.accountName ?? item.file.name,
              institution: recoverableIdentity?.institution ?? null,
              accountNumber: recoverableIdentity?.accountNumber ?? null,
            },
            Math.max(recoverableConfirmedRowsCount, recoverableParsedRowsCount)
          ),
          summary: null,
          errorMessage: null,
        });
        if (recoverableImportFileId && fallbackAccountId) {
          void monitorQueuedImportAndConfirm(itemId, recoverableImportFileId, fallbackAccountId, {
            fileName: item.file.name,
            fallbackAccountName: deriveFallbackAccountNameFromFileName(item.file.name),
            guessedAccountName: recoverableIdentity?.accountName ?? null,
            guessedInstitution: recoverableIdentity?.institution ?? null,
            guessedAccountNumber: recoverableIdentity?.accountNumber ?? null,
            guessedAccountType: recoverableIdentity?.accountType ?? null,
            accountName: recoverableIdentity?.accountName ?? null,
            institution: recoverableIdentity?.institution ?? null,
            accountNumber: recoverableIdentity?.accountNumber ?? null,
            accountType: recoverableIdentity?.accountType ?? null,
            optimisticAccountId: fallbackAccountId,
            initialBalance: finalizedRecoveredSummary.balance ?? null,
            password: item.password.trim() || undefined,
            previewTransactions: recoverablePreviewTransactions,
          }, {
            backgroundOnly: true,
          });
        }

        return {
          status: "staged",
          importedRows: Math.max(recoverableConfirmedRowsCount, recoverableParsedRowsCount) || null,
          summary: finalizedRecoveredSummary,
        };
      }

      capturePostHogClientEvent("import_failed", {
        error_stage: "process",
        error_code: getImportErrorCode(error),
        ...fileAnalyticsBase(item.file, workspaceId),
      });
      const processError = formatImportFailureMessage(
        item.file,
        error instanceof Error ? error.message : `Unable to import ${item.file.name}.`
      );
      closeImportAfterError(itemId, "process", item.file.name, processError);
      return { status: "error", importedRows: null, summary: null };
    }
  };

  const activeItem =
    items.find((item) => item.status === "parsing" || item.status === "importing") ??
    items.find((item) => item.status === "pending") ??
    null;
  const activeItemIndex = activeItem ? items.findIndex((item) => item.id === activeItem.id) + 1 : null;
  const passwordItems = items.filter((item) => item.status === "needs_password");
  const activePasswordItem =
    passwordItems.find((item) => item.id === selectedPasswordItemId) ?? passwordItems[0] ?? null;
  const completedFileCount = items.filter((item) => item.confirmationState === "confirmed").length;
  const activeProgressItem = activeItem ?? (busy ? items.find((item) => item.status === "pending") ?? null : null);
  const overallProgress = items.length > 0
    ? ((completedFileCount + (activeProgressItem ? activeProgressItem.progress / 100 : 0)) / items.length) * 100
    : 0;
  const hasImportIssue = items.some((item) => item.status === "error" || item.status === "needs_password") || Boolean(validationNotice);
  const currentErrorItem = items.find((item) => item.status === "error") ?? null;
  const showImportHelp = hasImportIssue || items.some((item) => item.confirmationState === "staged");
  const importHelpTitle = items.some((item) => item.status === "needs_password")
    ? "Password needed"
    : currentErrorItem?.errorTitle
      ? `${currentErrorItem.errorTitle}`
      : items.some((item) => item.status === "error")
        ? "What to do next"
      : "If Clover needs a hand";
  const importHelpItems = items.some((item) => item.status === "needs_password")
    ? [
        "Enter the password for the statement, then unlock the file.",
        "If the password still fails, re-upload the original PDF and try again.",
      ]
    : currentErrorItem?.errorNextSteps?.length
      ? currentErrorItem.errorNextSteps
      : items.some((item) => item.status === "error")
        ? [
            "Try uploading the original PDF or CSV again, one file at a time.",
            "If Clover says the file is not confident enough, add the transactions manually in Transactions.",
            "If the statement imported but still looks off, check the Review queue before confirming anything.",
          ]
      : [
          "If Clover stops on a file, upload the original statement again and keep the browser tab open.",
          "For low-confidence statements, use Transactions to add anything Clover missed manually.",
          "If the import looks wrong but still completes, check Review before confirming changes.",
        ];
  const canResumeImport = (item: QueuedFile) =>
    Boolean(item.importFileId && (item.confirmationState === "staged" || isResumableImportErrorCode(item.errorCode)));

  useEffect(() => {
    if (!open || !workspaceId) {
      return;
    }

    if (items.length === 0) {
      if (!busy) {
        clearImportActivity();
        lastImportActivityRef.current = null;
      }
      return;
    }

    const hasCompletedBatchNow = items.length > 0 && items.every((item) => item.status === "done" || item.confirmationState === "confirmed");
    const nextStatus = hasCompletedBatchNow && !busy ? "done" : items.some((item) => item.status === "error") ? "error" : "active";
    const nextDetail = activeProgressItem
      ? friendlyImportProgressLabel(activeProgressItem.progressLabel, activeProgressItem.file.name)
      : validationNotice ?? message;
    const activeErrorItem = items.find((item) => item.status === "error") ?? null;
    const previousSummary = lastImportActivityRef.current?.summary ?? null;
    const nextSnapshot: ImportActivitySnapshot = {
      workspaceId,
      surface: importActivitySurfaceRef.current,
      status: nextStatus,
      fileName: activeProgressItem?.file.name ?? items[items.length - 1]?.file.name ?? null,
      fileIndex: activeProgressItem ? items.findIndex((item) => item.id === activeProgressItem.id) + 1 : completedFileCount,
      fileTotal: items.length,
      completedFiles: completedFileCount,
      progress: overallProgress,
      detail: nextDetail,
      summary: nextStatus === "done" ? previousSummary : null,
      errorCode: activeErrorItem?.errorCode ?? (validationNotice ? lastImportActivityRef.current?.errorCode ?? null : null),
      errorMessage: activeErrorItem?.error ?? validationNotice ?? null,
      errorTitle: activeErrorItem?.errorTitle ?? null,
      errorNextSteps: activeErrorItem?.errorNextSteps ?? null,
      updatedAt: Date.now(),
    };

    lastImportActivityRef.current = nextSnapshot;
    setImportActivity(nextSnapshot);
  }, [activeProgressItem, busy, completedFileCount, items, message, open, overallProgress, validationNotice, workspaceId]);
  useEffect(() => {
    if (autoCloseCompletedBatchTimerRef.current) {
      window.clearTimeout(autoCloseCompletedBatchTimerRef.current);
      autoCloseCompletedBatchTimerRef.current = null;
    }

    if (!open || busy) {
      return;
    }

    const hasCompletedBatchNow = items.length > 0 && items.every((item) => item.status === "done" || item.confirmationState === "confirmed");
    if (!hasCompletedBatchNow) {
      return;
    }

    autoCloseCompletedBatchTimerRef.current = window.setTimeout(() => {
      autoCloseCompletedBatchTimerRef.current = null;
      onClose();
    }, 10_000);

    return () => {
      if (autoCloseCompletedBatchTimerRef.current) {
        window.clearTimeout(autoCloseCompletedBatchTimerRef.current);
        autoCloseCompletedBatchTimerRef.current = null;
      }
    };
  }, [busy, items, onClose, open]);
  useEffect(() => {
    if (!open || passwordItems.length === 0) {
      setSelectedPasswordItemId(null);
      return;
    }

    if (!selectedPasswordItemId || !passwordItems.some((item) => item.id === selectedPasswordItemId)) {
      setSelectedPasswordItemId(passwordItems[0].id);
    }
  }, [open, passwordItems, selectedPasswordItemId]);

  const handleStartImport = async () => {
    if (busy) return;

    setBusy(true);
    setValidationNotice(null);
    setMessage("Clover is lining up your files...");
    capturePostHogClientEventOnce(
      "first_import_started",
      {
        file_count: items.length,
        workspace_id: workspaceId || null,
      },
      analyticsOnceKey("first_import_started", "session")
    );

    let importedCount = 0;
    let blockedCount = 0;
    let stagedCount = 0;
    let errorCount = 0;
    const alreadyConfirmedCount = items.filter((item) => item.confirmationState === "confirmed").length;
    const uploadInsightsSummaries: UploadInsightsSummary[] = [];

    const pendingPasswordFiles = items.some((item) => item.status === "needs_password" && !item.password.trim());
    if (!pendingPasswordFiles) {
      const foundPasswordProtected = await preflightPasswordProtectedFiles();
      if (foundPasswordProtected) {
        setMessage("A few files need passwords before Clover can continue.");
        setBusy(false);
        return;
      }
    }

    for (const item of items) {
      if (item.confirmationState === "confirmed") {
        continue;
      }

      if (items.some((queued) => queued.status === "needs_password")) {
        break;
      }

      const result = await processFile(item.id);
      if (result.status === "done") {
        importedCount += 1;
        if (result.summary) {
          uploadInsightsSummaries.push(result.summary);
        }
      }

      if (result.status === "staged") {
        stagedCount += 1;
      }

      if (result.status === "needs_password") {
        blockedCount += 1;
        break;
      }

      if (result.status === "error") {
        errorCount += 1;
      }
    }

    if (blockedCount > 0) {
      setMessage("Passwords saved. Clover will continue with the remaining files.");
    } else if (stagedCount > 0) {
      setMessage(
        importedCount > 0
          ? `Imported ${importedCount} file${importedCount === 1 ? "" : "s"}; Clover is wrapping things up.`
          : `Parsed ${stagedCount} file${stagedCount === 1 ? "" : "s"}; Clover is wrapping things up.`
      );
    } else if (importedCount > 0) {
      setMessage(`Imported ${importedCount} file${importedCount === 1 ? "" : "s"}.`);
    } else {
      setMessage("Add files to begin.");
    }

    setBusy(false);

    const finishedEnough = blockedCount === 0 && errorCount === 0 && (importedCount > 0 || stagedCount > 0 || alreadyConfirmedCount === items.length);

    if (finishedEnough) {
      capturePostHogClientEventOnce(
        "first_import_completed",
        {
          file_count: uploadInsightsSummaries.length || importedCount,
          transaction_count: uploadInsightsSummaries.reduce((total, summary) => total + summary.rowsImported, 0),
          income_total: uploadInsightsSummaries.reduce((total, summary) => total + summary.incomeTotal, 0),
          expense_total: uploadInsightsSummaries.reduce((total, summary) => total + summary.expenseTotal, 0),
          amount_total: uploadInsightsSummaries.reduce((total, summary) => total + summary.incomeTotal + summary.expenseTotal, 0),
          workspace_id: workspaceId || null,
        },
        analyticsOnceKey("first_import_completed", "session")
      );
      if (uploadInsightsSummaries.length > 0) {
        for (const summary of uploadInsightsSummaries) {
          seedImportedWorkspaceCaches(workspaceId, summary);
        }
        await Promise.resolve(
          onImported(
          uploadInsightsSummaries.length === 1
            ? uploadInsightsSummaries[0]
            : combineUploadInsightsSummaries(uploadInsightsSummaries)
          )
        );
      }
    }
  };

  handleStartImportRef.current = handleStartImport;

  const handleRetry = async (itemId: string) => {
    const item = items.find((entry) => entry.id === itemId);
    if (item) {
      capturePostHogClientEvent("password_provided", {
        ...fileAnalyticsBase(item.file, workspaceId),
        import_file_id: item.importFileId,
        retry_reason: "password_unlock",
      });
      capturePostHogClientEvent("import_retry_started", {
        ...fileAnalyticsBase(item.file, workspaceId),
        import_file_id: item.importFileId,
        retry_reason: "password_unlock",
      });
    }

    updateItem(itemId, {
      status: "pending",
      error: null,
      errorCode: null,
      errorTitle: null,
      errorNextSteps: null,
      progress: 0,
      progressLabel: "Clover is getting your file ready",
    });

    const remainingLockedFiles = items.filter((item) => item.id !== itemId && item.status === "needs_password");
    if (remainingLockedFiles.length > 0) {
      setMessage("Password saved. Enter the next password to continue.");
      return;
    }

    setMessage("All passwords saved. Clover is starting the rest.");
    autoStartRef.current = true;
  };

  const handleResumeImport = async (itemId: string) => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item?.importFileId) {
      setMessage("No stalled import was found to resume.");
      return;
    }

    setBusy(true);
    setMessage("Resuming import...");

    try {
      capturePostHogClientEvent("import_retry_started", {
        ...fileAnalyticsBase(item.file, workspaceId),
        import_file_id: item.importFileId,
        retry_reason: "resume_import",
      });

      const response = await fetch(`/api/imports/${item.importFileId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const limitPayload = parsePlanLimitPayload(payload) ?? parsePlanLimitMessage(String(payload.error ?? ""), planTier);
        if (limitPayload) {
          showPlanLimitNudge(limitPayload);
        }
        const errorMessage = String(payload.error ?? "Unable to resume this import.");
        capturePostHogClientEvent("import_retry_failed", {
          ...fileAnalyticsBase(item.file, workspaceId),
          import_file_id: item.importFileId,
          retry_reason: "resume_import",
          error_code: String(payload.error ?? getImportErrorCode(new Error(errorMessage))),
        });
        closeImportAfterError(itemId, "monitor", item.file.name, errorMessage);
        return;
      }

      const telemetryPhase = typeof payload.telemetryPhase === "string" ? payload.telemetryPhase : null;
      const telemetryLabel = typeof payload.telemetryLabel === "string" ? payload.telemetryLabel : null;
      const telemetryMessage = typeof payload.telemetryMessage === "string" ? payload.telemetryMessage : null;
      const resumedAccountId =
        typeof payload.accountId === "string" && payload.accountId.trim() ? payload.accountId.trim() : item.targetAccountId;

      if (payload.skipped && telemetryPhase === "complete") {
        updateItem(itemId, {
          status: "done",
          confirmationState: "confirmed",
          error: null,
          importFileId: item.importFileId,
          targetAccountId: resumedAccountId ?? item.targetAccountId,
          importedRows: item.importedRows ?? 0,
          progress: 100,
          progressLabel: "Done",
        });
        setMessage("The import was already complete.");
        router.refresh();
        capturePostHogClientEvent("import_retry_succeeded", {
          ...fileAnalyticsBase(item.file, workspaceId),
          import_file_id: item.importFileId,
          retry_reason: "resume_import",
          skipped: true,
        });
        return;
      }

      updateItem(itemId, {
        status: "importing",
        confirmationState: "pending",
        error: null,
        importFileId: item.importFileId,
        targetAccountId: resumedAccountId ?? item.targetAccountId,
        progress: Math.max(item.progress, IMPORT_PROGRESS.loadingAccount),
        progressLabel: telemetryLabel ?? "Resuming import",
      });
      publishImportActivity({
        workspaceId,
        surface: importActivitySurfaceRef.current,
        status: "active",
        fileName: item.file.name,
        fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
        fileTotal: items.length,
        completedFiles: completedFileCount,
        progress: Math.max(item.progress, IMPORT_PROGRESS.loadingAccount),
        detail: getTelemetryDetail("Clover is resuming the import", telemetryMessage, telemetryLabel, null),
        summary: null,
        errorMessage: null,
      });

      await monitorQueuedImportAndConfirm(
        itemId,
        item.importFileId,
        resumedAccountId ?? item.targetAccountId ?? null,
        {
          fileName: item.file.name,
          fallbackAccountName: deriveFallbackAccountNameFromFileName(item.file.name),
          guessedAccountName: null,
          guessedInstitution: null,
          guessedAccountNumber: null,
          guessedAccountType: null,
          accountName: null,
          institution: null,
          accountNumber: null,
          accountType: null,
          optimisticAccountId: resumedAccountId && !resumedAccountId.startsWith("optimistic-") ? resumedAccountId : item.targetAccountId,
          initialBalance: null,
          password: item.password.trim() || undefined,
          previewTransactions: [],
        }
      );

      setMessage(`Resumed ${item.file.name}.`);

      capturePostHogClientEvent("import_retry_succeeded", {
        ...fileAnalyticsBase(item.file, workspaceId),
        import_file_id: item.importFileId,
        retry_reason: "resume_import",
      });
    } catch (error) {
      closeImportAfterError(itemId, "monitor", item.file.name, error instanceof Error ? error.message : null);
      setMessage("Clover couldn't resume the import.");
      capturePostHogClientEvent("import_retry_failed", {
        ...(item ? fileAnalyticsBase(item.file, workspaceId) : {}),
        import_file_id: item?.importFileId ?? null,
        retry_reason: "resume_import",
        error_code: getImportErrorCode(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleReplayConfirm = async (itemId: string) => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item?.importFileId) {
      setMessage("No staged import found to confirm.");
      return;
    }

    setBusy(true);
    setMessage("Retrying confirmation...");
    try {
      capturePostHogClientEvent("import_retry_started", {
        ...fileAnalyticsBase(item.file, workspaceId),
        import_file_id: item.importFileId,
        retry_reason: "confirmation_retry",
      });
      const accountId = item.targetAccountId;
      if (!accountId) {
        setMessage("Clover still needs a matching account before this import can be confirmed.");
        return;
      }
      const result = await confirmItemImport(itemId, item.importFileId, accountId, {
        fileName: item.file.name,
        accountName: null,
        institution: null,
        accountNumber: null,
        accountType: null,
        optimisticAccountId: item.targetAccountId,
      });
      if (typeof result.importedRows === "number") {
        setMessage(`Confirmed ${result.importedRows} imported row${result.importedRows === 1 ? "" : "s"}.`);
      }
      if (result.summary) {
        await Promise.resolve(onImported(result.summary));
      }
      capturePostHogClientEvent("statement_identity_confirmed", {
        ...fileAnalyticsBase(item.file, workspaceId),
        import_file_id: item.importFileId,
        account_id: accountId,
      });
      capturePostHogClientEvent("import_retry_succeeded", {
        ...fileAnalyticsBase(item.file, workspaceId),
        import_file_id: item.importFileId,
        retry_reason: "confirmation_retry",
      });
    } catch (error) {
      if (item) {
        closeImportAfterError(itemId, "confirm", item.file.name, error instanceof Error ? error.message : null);
      }
      setMessage("Clover couldn't finish the confirmation step.");
      capturePostHogClientEvent("import_retry_failed", {
        ...(item ? fileAnalyticsBase(item.file, workspaceId) : {}),
        import_file_id: item?.importFileId ?? null,
        retry_reason: "confirmation_retry",
        error_code: getImportErrorCode(error),
      });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (busy || !workspaceId || !autoStartRef.current) {
      return;
    }

    if (items.some((item) => item.status === "needs_password")) {
      return;
    }

    const nextItem = items.find(
      (item) => item.status === "pending" || (item.status === "needs_password" && item.password.trim())
    );

    if (!nextItem) {
      autoStartRef.current = false;
      return;
    }

    autoStartRef.current = false;
    void handleStartImport();
  }, [busy, handleStartImport, items, workspaceId]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      addFiles(event.target.files);
    }
    event.target.value = "";
  };

  const openFilePicker = () => {
    if (!fileInputRef.current) {
      return;
    }

    fileInputRef.current.value = "";
    fileInputRef.current.click();
  };

  const readyToImport = items.some((item) => item.status === "pending" || (item.status === "needs_password" && item.password.trim()) || item.confirmationState === "staged");

  if (!open) {
    return null;
  }

  if (backgroundOnly) {
    return null;
  }

  const portalTarget = typeof document === "undefined" ? null : document.body;
  if (!portalTarget) {
    return null;
  }

  if (backgroundOnly || launchInBackground) {
    return null;
  }

  const hasCompletedBatch = items.length > 0 && items.every((item) => item.status === "done" || item.confirmationState === "confirmed");
  const showCompactProgress = busy || Boolean(activeItem) || hasCompletedBatch;

  const modalContent = activePasswordItem ? (
      <ImportPasswordModal
        open
        files={passwordItems.map((item) => ({
          id: item.id,
          name: item.file.name,
          sizeLabel: `${fileTypeLabel(item.file)} · ${Math.max(1, Math.round(item.file.size / 1024))} KB`,
          error: item.error,
          password: item.password,
          passwordVisible: item.passwordVisible,
        }))}
        activeFileId={activePasswordItem.id}
        onClose={onClose}
        onPasswordChange={(id, password) => updateItem(id, { password, error: null })}
        onToggleVisibility={(id) =>
          updateItem(id, { passwordVisible: !items.find((item) => item.id === id)?.passwordVisible })
        }
        onUnlock={(id) => void handleRetry(id)}
      />
    ) : showCompactProgress ? (
      <ImportUploadDock
        open
        fileName={activeProgressItem?.file.name ?? null}
        fileIndex={activeProgressItem ? items.findIndex((item) => item.id === activeProgressItem.id) + 1 : completedFileCount}
        fileTotal={items.length}
        completedFiles={completedFileCount}
        progress={overallProgress}
        detail={friendlyImportProgressLabel(activeProgressItem ? activeProgressItem.progressLabel : completedFileCount > 0 ? "Done" : "Queued", activeProgressItem?.file.name ?? null)}
        phaseLabel={activeProgressItem ? friendlyImportPhaseLabel(activeProgressItem.progressLabel, activeProgressItem.file.name) : null}
        onClose={onClose}
        />
    ) : (
    <div className="modal-backdrop modal-backdrop--import-fullscreen" role="presentation" onClick={onClose}>
      <section
        className="modal-card modal-card--wide accounts-import-modal glass"
        role="dialog"
        aria-modal="true"
        aria-label="Import files"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="accounts-import-modal__toolbar">
          <button className="accounts-import-close" type="button" onClick={onClose} aria-label="Close import files">
            ×
          </button>
        </div>

        <div
          className={`accounts-import-dropzone accounts-import-dropzone--hero ${dragActive ? "is-active" : ""}`}
          role="presentation"
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            if (event.dataTransfer.files.length > 0) {
              addDroppedFiles(event.dataTransfer.files);
            }
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              openFilePicker();
            }
          }}
        >
          <input
            ref={fileInputRef}
            className="hidden-file-input"
            type="file"
            accept=".csv,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif"
            multiple
            onChange={handleInputChange}
          />
          <strong>Drop files here</strong>
          <span>or browse for files from your computer.</span>
          <button className="button button-secondary button-small" type="button" onClick={openFilePicker}>
            Choose files
          </button>
        </div>

        <div className="accounts-import-footer-copy">
          {validationNotice ? <p className="accounts-import-footer-copy__warning">{validationNotice}</p> : null}
          <p className="accounts-import-footer-copy__status">{message}</p>
          <p>
            Accepted files: PDF, CSV, JPG, JPEG, PNG, WEBP, HEIC, and HEIF. Password-protected PDFs are supported.
            CSVs work best with statement imports.
          </p>
          <p>We upload the file first, then parse it on the server so the workflow stays responsive.</p>
        </div>

        {showImportHelp ? (
          <aside className="accounts-import-help glass">
            <p className="eyebrow">{importHelpTitle}</p>
            <strong>Clover will try again, but you can keep moving.</strong>
            <ul className="accounts-import-help__list">
              {importHelpItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="accounts-import-help__actions">
              <Link className="button button-secondary button-small" href="/transactions?manual=1">
                Add transactions manually
              </Link>
              <Link className="button button-secondary button-small" href="/review">
                Open review
              </Link>
            </div>
          </aside>
        ) : null}

        <div className="accounts-import-files">
          {items.length > 0 ? (
            items.map((item) => {
              const isPasswordLocked = item.status === "needs_password";
              const qaRun = qaRunsByItemId[item.id];
              const qaLoading = Boolean(qaLoadingByItemId[item.id]);
              const qaError = qaErrorByItemId[item.id];

              return (
                <article key={item.id} className={`accounts-import-file accounts-import-file--${item.status}`}>
                  <div className="accounts-import-file__head">
                    <div className="accounts-import-file__meta">
                      <strong>{item.file.name}</strong>
                      <span>
                        {fileTypeLabel(item.file)} · {Math.max(1, Math.round(item.file.size / 1024))} KB
                      </span>
                    </div>
                    <div className="accounts-import-file__badges">
                      <span className={`accounts-import-badge is-${item.status}`}>{item.status.replaceAll("_", " ")}</span>
                      <button className="icon-button accounts-import-remove" type="button" onClick={() => removeItem(item.id)} aria-label={`Remove ${item.file.name}`}>
                        ×
                      </button>
                    </div>
                  </div>

                  {item.error ? (
                    <div className="accounts-import-file__error">
                      <strong>{item.errorTitle ?? "Import issue"}</strong>
                      <p>{item.error}</p>
                      {item.errorCode ? <p className="accounts-import-file__error-code">Error code {item.errorCode}</p> : null}
                      {item.errorNextSteps?.length ? (
                        <ul className="accounts-import-file__error-list">
                          {item.errorNextSteps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}

                  {isPasswordLocked ? (
                    <div className="accounts-import-password-row">
                      <label>
                        Password for {item.file.name}
                        <div className="accounts-import-password-input">
                          <input
                            type={item.passwordVisible ? "text" : "password"}
                            value={item.password}
                            onChange={(event) => updateItem(item.id, { password: event.target.value, error: null })}
                            placeholder="Enter password"
                          />
                          <button
                            className="button button-secondary button-small"
                            type="button"
                            onClick={() => updateItem(item.id, { passwordVisible: !item.passwordVisible })}
                          >
                            {item.passwordVisible ? "Hide" : "Show"}
                          </button>
                        </div>
                      </label>
                      <button
                        className="button button-primary button-small"
                        type="button"
                        onClick={() => void handleRetry(item.id)}
                        disabled={busy || !item.password.trim()}
                      >
                        Unlock file
                      </button>
                    </div>
                  ) : null}

                  <div className="accounts-import-file__foot">
                    <span>
                      {item.confirmationState === "confirmed"
                        ? item.importedRows === 0
                          ? item.progressLabel || "Already imported in this workspace"
                          : `Imported ${item.importedRows ?? 0} row${item.importedRows === 1 ? "" : "s"}`
                        : item.confirmationState === "staged"
                          ? "Parsed and ready for confirmation"
                          : item.status === "importing"
                            ? "Importing into the selected account..."
                            : item.status === "parsing"
                              ? "Parsing locally..."
                              : item.status === "needs_password"
                                ? "Waiting for password"
                                : "Clover is getting your file ready"}
                    </span>
                    <div className="accounts-import-file__actions">
                      {showQaTools && item.importFileId ? (
                        <>
                          <button
                            className="button button-secondary button-small"
                            type="button"
                            onClick={() => void loadQaRun(item.id)}
                            disabled={busy || qaLoading}
                          >
                            {qaLoading ? "Loading QA..." : "Load QA"}
                          </button>
                          <button
                            className="button button-secondary button-small"
                            type="button"
                            onClick={() => void loadQaRun(item.id, true)}
                            disabled={busy || qaLoading}
                          >
                            Re-run QA
                          </button>
                        </>
                      ) : null}
                      {item.status === "error" && item.importFileId && canResumeImport(item) ? (
                        <button
                          className="button button-primary button-small"
                          type="button"
                          onClick={() => void handleResumeImport(item.id)}
                          disabled={busy}
                        >
                          Resume import
                        </button>
                      ) : item.status === "error" && item.importFileId ? (
                        <button
                          className="button button-primary button-small"
                          type="button"
                          onClick={() => void handleReplayConfirm(item.id)}
                          disabled={busy}
                        >
                          Retry confirmation
                        </button>
                      ) : item.status === "error" ? (
                        <button
                          className="button button-secondary button-small"
                          type="button"
                          onClick={() => {
                            capturePostHogClientEvent("import_retry_started", {
                              ...fileAnalyticsBase(item.file, workspaceId),
                              import_file_id: item.importFileId,
                              retry_reason: "reprocess_error",
                            });
                            void processFile(item.id)
                              .then((result) => {
                                if (result.status === "error") {
                                  capturePostHogClientEvent("import_retry_failed", {
                                    ...fileAnalyticsBase(item.file, workspaceId),
                                    import_file_id: item.importFileId,
                                    retry_reason: "reprocess_error",
                                    error_code: item.error ? getImportErrorCode(new Error(item.error)) : "unknown_error",
                                  });
                                  return;
                                }

                                capturePostHogClientEvent("import_retry_succeeded", {
                                  ...fileAnalyticsBase(item.file, workspaceId),
                                  import_file_id: item.importFileId,
                                  retry_reason: "reprocess_error",
                                });
                              })
                              .catch((error) => {
                                capturePostHogClientEvent("import_retry_failed", {
                                  ...fileAnalyticsBase(item.file, workspaceId),
                                  import_file_id: item.importFileId,
                                  retry_reason: "reprocess_error",
                                  error_code: getImportErrorCode(error),
                                });
                              });
                          }}
                          disabled={busy || !selectedAccountId}
                        >
                          Retry import
                        </button>
                      ) : item.confirmationState === "staged" && item.importFileId ? (
                        <button
                          className="button button-primary button-small"
                          type="button"
                          onClick={() => (canResumeImport(item) ? void handleResumeImport(item.id) : void handleReplayConfirm(item.id))}
                          disabled={busy}
                        >
                          {canResumeImport(item) ? "Resume import" : "Confirm now"}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {showQaTools && qaError ? <p className="accounts-import-file__error">{qaError}</p> : null}
                  {showQaTools && qaRun ? (
                    <div className="accounts-import-qa">
                      <div className="accounts-import-qa__summary">
                        <strong>Data QA</strong>
                        <span>Score {qaRun.score}/100</span>
                        <span>{qaRun.findingCount} finding{qaRun.findingCount === 1 ? "" : "s"}</span>
                        <span>{qaRun.criticalCount} critical</span>
                      </div>
                      <div className="accounts-import-qa__meta">
                        <span>Source: {qaRun.source}</span>
                        <span>Parser: {qaRun.parserVersion ?? "unknown"}</span>
                        <span>Time: {qaRun.totalDurationMs ?? 0} ms</span>
                      </div>
                      <div className="accounts-import-qa__actions">
                        <Link className="button button-secondary button-small" href={`/admin/data-qa/${qaRun.id}`} prefetch={false}>
                          Open full page
                        </Link>
                      </div>
                      {qaRun.findings.length > 0 ? (
                        <ul className="accounts-import-qa__findings">
                          {qaRun.findings.slice(0, 4).map((finding) => (
                            <li key={`${finding.code}-${finding.field ?? "field"}`} className={`accounts-import-qa__finding is-${finding.severity}`}>
                              <strong>{finding.code}</strong>
                              <span>{finding.message}</span>
                              {finding.suggestion ? <small>{finding.suggestion}</small> : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="accounts-import-qa__empty">No findings were reported for this run.</p>
                      )}
                    </div>
                  ) : showQaTools && qaLoading ? (
                    <div className="accounts-import-qa">
                      <p className="accounts-import-qa__empty">Loading QA results...</p>
                    </div>
                  ) : null}
                </article>
              );
            })
          ) : null}
        </div>

        <div className="form-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>
            Close
          </button>
          <button className="button button-primary" type="button" onClick={() => void handleStartImport()} disabled={busy || !readyToImport || !workspaceId}>
            {busy ? "Importing..." : "Import files"}
          </button>
        </div>
      </section>
    </div>
  );

  return createPortal(
    <>
      {modalContent}
      <PlanLimitNudge payload={planLimitNudge} onDismiss={() => setPlanLimitNudge(null)} />
    </>,
    portalTarget
  );
}
