"use client";

import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";
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
import {
  detectStatementMetadata,
  getTrailingBalanceFromParsedRows,
  inferAccountTypeFromStatement,
  parseImportText,
} from "@/lib/import-parser";
import { parsePlanLimitMessage, parsePlanLimitPayload, type PlanLimitPayload } from "@/lib/plan-limit-nudges";
import {
  getCachedAccountsWorkspace,
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
  onClose: () => void;
  onImported: (summary: UploadInsightsSummary) => Promise<void> | void;
};

type ImportStatus = "pending" | "needs_password" | "parsing" | "importing" | "done" | "error";

type ConfirmationState = "none" | "staged" | "confirmed";

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
  if (lowerName.endsWith(".tsv")) return "TSV";
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

const isPdfImportFile = (file: File | string) =>
  typeof file === "string" ? /\.pdf$/i.test(file) : file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

const lowQualityImportWarning = (fileName: string) =>
  `${fileName} looks too blurry for Clover to read. Please upload a clearer image or a higher-resolution PDF.`;

const isLowQualityImportFailure = (file: File | string, errorMessage: string) =>
  isPdfImportFile(file) &&
  /blurry|low[- ]?resolution|unreadable|cannot read|can't read|could not read|failed to extract text|text layer is missing|ocr/i.test(
    errorMessage
  );

const formatImportFailureMessage = (file: File | string, errorMessage: string) => {
  if (isLowQualityImportFailure(file, errorMessage)) {
    const fileName = typeof file === "string" ? file : file.name;
    return lowQualityImportWarning(fileName || "This file");
  }

  return errorMessage;
};

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
        ? "Upload a clearer PDF or a supported CSV/TSV file."
        : "Re-upload the original statement and keep the tab open while Clover works.";

  const nextSteps =
    stage === "password"
      ? [
          "Unlock the file with its password, then try again.",
          "If the password keeps failing, re-download the original statement and re-upload it.",
          "You can always add missing transactions manually in Transactions.",
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

const accountKey = (name: string, institution: string | null) =>
  `${normalizeStatementAccountName(name, institution).toLowerCase()}::${(institution ?? "").trim().toLowerCase()}`;

const extractLastFourDigits = (value?: string | null) => {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
};

const accountRuleKey = (name: string, institution: string | null) =>
  `${(institution ?? "").trim().toLowerCase()}::${extractLastFourDigits(name) ?? name.trim().toLowerCase()}`;

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

const buildOptimisticUploadSummaryFromAccount = (
  fileName: string,
  account: AccountOption & { balance?: string | null }
): UploadInsightsSummary =>
  buildOptimisticUploadSummary(
    fileName,
    0,
    account.id,
    account.name,
    account.institution,
    account.type as UploadAccountType,
    account.id,
    null,
    [],
    account.accountNumber ?? null
  );

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

const buildImportedWorkspaceAccount = (summary: UploadInsightsSummary) => {
  const accountId = summary.accountId ?? summary.optimisticAccountId ?? null;
  if (!accountId || !summary.accountName) {
    return null;
  }

  const normalizedAccountName = normalizeStatementAccountName(summary.accountName, summary.institution);
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
    currency: "PHP",
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
    const importedName = normalizeStatementAccountName(summary.accountName ?? "", summary.institution ?? null);
    const entryInstitution = typeof entry.institution === "string" ? entry.institution : null;
    return (
      entryId === importedAccount.id ||
      optimisticId === importedAccount.id ||
      accountKey(entryName, entryInstitution) === accountKey(importedName, summary.institution ?? null)
    );
  });

  if (!importedAccount.accountNumber && typeof currentAccount?.accountNumber === "string" && currentAccount.accountNumber.trim()) {
    importedAccount.accountNumber = currentAccount.accountNumber.trim();
  }

  syncImportedWorkspaceAccountCaches(workspaceId, importedAccount);
  if (Array.isArray(summary.previewTransactions) && summary.previewTransactions.length > 0) {
    syncImportedWorkspaceTransactionCaches(workspaceId, summary.previewTransactions);
  }
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
        currency: "PHP",
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
    return { accountName: "GCash", institution: "GCash" };
  }

  if (lowerName.includes("rcbc")) {
    const match = lowerName.match(/(\d{4})(?:_unlocked)?\.pdf$/i) ?? lowerName.match(/(\d{4})/);
    return {
      accountName: match ? `RCBC ${match[1]}` : "RCBC",
      institution: "RCBC",
    };
  }

  if (lowerName.includes("unionbank") || lowerName.includes("union bank")) {
    return { accountName: "UnionBank", institution: "UnionBank" };
  }

  if (lowerName.includes("bpi")) {
    return { accountName: "BPI", institution: "BPI" };
  }

  if (lowerName.includes("metrobank") || lowerName.includes("mb-online") || lowerName.includes("msoa")) {
    const match = lowerName.match(/(\d{4})(?=[^\d]*$)/) ?? lowerName.match(/(\d{4})/);
    return {
      accountName: match ? `Metrobank ${match[1]}` : "Metrobank",
      institution: "Metrobank",
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

const friendlyImportProgressLabel = (label: string, fileName?: string | null) => {
  const fileSuffix = fileName ? ` ${fileName}` : "";

  switch (label) {
    case "Starting upload":
      return "Clover is getting your file ready";
    case "Uploading the file":
      return `Clover is bringing in${fileSuffix}`;
    case "Password needed":
      return "This file needs a password";
    case "Waiting for account details":
      return "Clover is matching the account";
    case "Waiting for statement identity":
      return "Clover is reading the statement";
    case "Reading locally":
      return "Clover is reading the statement locally";
    case "Preview ready":
      return "Clover found the statement";
    case "Queued for background processing":
      return "Clover is lining up the rest";
    case "Finalizing in background":
    case "Finalizing import":
      return "Clover is wrapping things up";
    case "Parsing in background":
      return "Clover is reading the statement";
    case "Import failed":
      return "That file needs another try";
    case "Done":
      return "All set";
    case "Queued":
      return "Waiting in line";
    default:
      return label;
  }
};

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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Upload CSV or PDF files to import transactions and balances.");
  const [validationNotice, setValidationNotice] = useState<string | null>(null);
  const [selectedPasswordItemId, setSelectedPasswordItemId] = useState<string | null>(null);
  const [planTier, setPlanTier] = useState<"free" | "pro" | "unknown">("unknown");
  const [monthlyUploadLimit, setMonthlyUploadLimit] = useState(10);
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
      updatedAt: Date.now(),
    };
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
      error: `${notice.code}: ${notice.message}`,
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
      detail: notice.title,
      summary: null,
      errorCode: notice.code,
      errorMessage: notice.message,
    });
    setBusy(false);
    autoCloseAfterStartRef.current = false;
  };

  useEffect(() => {
    if (!open) {
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
      setMessage("Upload CSV or PDF files to import transactions and balances.");
      setValidationNotice(null);
      initialFilesSignatureRef.current = null;
      if (!items.some((item) => item.status === "pending" || item.status === "needs_password" || item.status === "parsing" || item.status === "importing")) {
        setItems([]);
        setBusy(false);
      }
      return;
    }

    importActivitySurfaceRef.current = "modal";

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
      map.set(accountKey(account.name, account.institution), account.id);
    }
    accountIdByKeyRef.current = map;

    setSelectedAccountId((current) => {
      if (current && accounts.some((account) => account.id === current)) {
        return current;
      }

      return defaultAccountId ?? accounts[0]?.id ?? "";
    });
    setMessage("Upload CSV or PDF files to import transactions and balances.");
    setValidationNotice(null);
  }, [accounts, defaultAccountId, items, open]);

  useEffect(() => {
    if (!open) {
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
        const nextMonthlyUploadLimit = Number(payload?.user?.monthlyUploadLimit ?? 10);
        if (!cancelled) {
          setPlanTier(nextPlanTier);
          setMonthlyUploadLimit(Number.isFinite(nextMonthlyUploadLimit) && nextMonthlyUploadLimit >= 0 ? nextMonthlyUploadLimit : 10);
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
    accountNumber?: string | null
  ) => {
    const inferredType = accountType ?? inferAccountTypeFromStatement(institution, name, "bank");
    const response = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        name,
        institution,
        accountNumber: accountNumber?.trim() || null,
        type: inferredType,
        currency: "PHP",
        source: "upload",
      }),
    });

    if (!response.ok) {
      throw new Error("Unable to create an account for this statement.");
    }

    const payload = await response.json();
    const accountId = String(payload.account?.id ?? "");
    if (!accountId) {
      throw new Error("The account could not be created.");
    }

    accountIdByKeyRef.current.set(accountKey(name, institution), accountId);
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
    accountNumber?: string | null
  ) => {
    const normalizedName = normalizeStatementAccountName(name, institution);
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

  const addFiles = (incoming: FileList | File[]) => {
    const nextFiles = Array.from(incoming);
    if (nextFiles.length === 0) return;

    let feedbackMessage = "";
    let validationMessage = "";
    let shouldAutoClose = false;
      flushSync(() => {
        setItems((current) => {
        const existing = new Set(current.map((item) => fileKey(item.file)));
        const fileQueueLimit = Math.max(0, monthlyUploadLimit);
        const availableSlots = Math.max(0, fileQueueLimit - current.length);
      let skippedTooMany = 0;
      let additionsCount = 0;
      const validationIssues: string[] = [];

      const additions = nextFiles.flatMap((file) => {
        const validationError = validateImportFile({
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type,
        });

        if (validationError) {
          if (validationError === "Import files must be 2 MB or smaller.") {
            validationIssues.push(`${file.name} is larger than 2 MB.`);
          } else if (validationError === "Only PDF, CSV, TSV, and JSON files are supported.") {
            validationIssues.push(`${file.name} has an invalid file extension.`);
          } else {
            validationIssues.push(`${file.name} could not be added.`);
          }
          return [];
        }

        if (existing.has(fileKey(file))) {
          return [];
        }

        if (additionsCount >= availableSlots) {
          skippedTooMany += 1;
          return [];
        }

        additionsCount += 1;
        shouldAutoClose = true;
        const guessedIdentity = guessStatementIdentity(file.name);
        const canUseOptimisticGuess = Boolean(guessedIdentity?.accountName);
        const optimisticAccountId = guessedIdentity && canUseOptimisticGuess ? `optimistic-${crypto.randomUUID()}` : null;
        const selectedAccount = selectedAccountId ? accounts.find((account) => account.id === selectedAccountId) : null;
        capturePostHogClientEvent("file_upload_started", {
          ...fileAnalyticsBase(file, workspaceId),
          selected_account_id: selectedAccount?.id ?? null,
          selected_account_type: selectedAccount?.type ?? null,
        });
        if (selectedAccount) {
          const optimisticSummary = buildOptimisticUploadSummaryFromAccount(file.name, selectedAccount);
          seedImportedWorkspaceCaches(workspaceId, optimisticSummary);
          void onImported(optimisticSummary);
        } else if (guessedIdentity && optimisticAccountId) {
          const optimisticSummary = {
            fileName: file.name,
            rowsImported: 0,
            accountId: optimisticAccountId,
            accountName: guessedIdentity.accountName,
            institution: guessedIdentity.institution,
            accountType: inferAccountTypeFromStatement(guessedIdentity.institution, guessedIdentity.accountName, "bank"),
            balance: null,
            incomeTotal: 0,
            expenseTotal: 0,
            netTotal: 0,
            topCategoryName: null,
            topCategoryAmount: null,
            topCategoryShare: null,
            topMerchantName: null,
            topMerchantCount: null,
            optimistic: true,
            optimisticAccountId,
          } satisfies UploadInsightsSummary;
          seedImportedWorkspaceCaches(workspaceId, optimisticSummary);
          void onImported(optimisticSummary);
        }
        return [
          {
            id: crypto.randomUUID(),
            file,
            status: "pending" as ImportStatus,
            confirmationState: "none" as ConfirmationState,
            error: null,
            password: "",
            passwordVisible: false,
            importFileId: null,
            targetAccountId: null,
            optimisticAccountId,
            importedRows: null,
            progress: 1,
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
        showPlanLimitNudge({
          planTier,
          limitType: "upload_limit",
          limitValue: monthlyUploadLimit,
        });
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
      queueMicrotask(() => {
        if (busy || !workspaceId || !autoStartRef.current || !handleStartImportRef.current) {
          return;
        }

        autoStartRef.current = false;
        void handleStartImportRef.current();
      });
    }

    if (feedbackMessage) {
      setMessage(feedbackMessage);
    }

    setValidationNotice(validationMessage || null);
  };

  const updateItem = (id: string, patch: Partial<QueuedFile>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
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
    }
  ): Promise<ImportProcessResult> => {
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
      throw new Error("Unable to determine the destination account for this statement.");
    }

    let finalizingProgress = 92;
    const finalizingTimer = window.setInterval(() => {
      finalizingProgress = Math.min(98, finalizingProgress + 1);
      updateItem(itemId, {
        status: "importing",
        progress: finalizingProgress,
        progressLabel: "Finalizing import",
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
        progress: finalizingProgress,
        detail: "Clover is wrapping things up",
        summary: null,
        errorMessage: null,
      });
    }, 700);

    updateItem(itemId, {
      status: "importing",
      progress: finalizingProgress,
      progressLabel: "Finalizing import",
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
      progress: finalizingProgress,
      detail: "Clover is wrapping things up",
      summary: null,
      errorMessage: null,
    });

    try {
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
        const confirmError = formatImportFailureMessage(summaryContext.fileName, payload.error || "Unable to confirm this import.");
        capturePostHogClientEvent("import_failed", {
          error_stage: "confirm",
          error_code: String(payload.error ?? "unable_to_confirm"),
          file_name: summaryContext.fileName,
          workspace_id: workspaceId || null,
        });
        closeImportAfterError(itemId, "confirm", summaryContext.fileName, confirmError);
        return { status: "error", importedRows: null, summary: null };
      }

      const confirmed = await confirmResponse.json();
      const importedRows = Number(confirmed.result?.imported ?? 0);
      const accountBalance = typeof confirmed.result?.accountBalance === "string" ? confirmed.result.accountBalance : null;
      const insightSummary = confirmed.result?.insightSummary ?? null;
      const resolvedAccountType = (
        summaryContext.accountType ??
        accounts.find((account) => account.id === resolvedAccountId)?.type ??
        inferAccountTypeFromStatement(summaryContext.institution, summaryContext.accountName, "bank")
      ) as UploadInsightsSummary["accountType"];
      const summary = insightSummary
        ? {
            fileName: summaryContext.fileName,
            rowsImported: importedRows,
            accountId: resolvedAccountId,
            accountName: summaryContext.accountName,
            institution: summaryContext.institution ?? null,
            accountNumber: summaryContext.accountNumber ?? null,
            accountType: resolvedAccountType,
            balance: accountBalance,
            optimisticAccountId: summaryContext.optimisticAccountId ?? null,
            previewTransactions: summaryContext.previewTransactions ?? [],
            incomeTotal: Number(insightSummary.incomeTotal ?? 0),
            expenseTotal: Number(insightSummary.expenseTotal ?? 0),
            netTotal: Number(insightSummary.netTotal ?? 0),
            topCategoryName: insightSummary.topCategoryName ?? null,
            topCategoryAmount: insightSummary.topCategoryAmount === null ? null : Number(insightSummary.topCategoryAmount),
            topCategoryShare: insightSummary.topCategoryShare === null ? null : Number(insightSummary.topCategoryShare),
            topMerchantName: insightSummary.topMerchantName ?? null,
            topMerchantCount: insightSummary.topMerchantCount === null ? null : Number(insightSummary.topMerchantCount),
          }
        : null;
      updateItem(itemId, {
        status: "done",
        confirmationState: "confirmed",
        error: null,
        importFileId,
        targetAccountId: resolvedAccountId,
        importedRows,
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
    } finally {
      window.clearInterval(finalizingTimer);
    }
  };

  const monitorQueuedImportAndConfirm = async (
    itemId: string,
    importFileId: string,
    accountId: string | null,
    summaryContext: {
      fileName: string;
      fallbackAccountName: string;
      accountName: string | null;
      institution: string | null;
      accountNumber: string | null;
      accountType: UploadInsightsSummary["accountType"];
      optimisticAccountId: string | null;
      password?: string;
      previewTransactions?: NonNullable<UploadInsightsSummary["previewTransactions"]>;
    }
  ) => {
    const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    let seededFallbackSummary = false;
    const startedAt = Date.now();
    const MAX_WAIT_MS = 60_000;
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
        const statementCheckpoint = payload.statementCheckpoint && typeof payload.statementCheckpoint === "object" ? payload.statementCheckpoint : null;
        const statementMetadata =
          statementCheckpoint?.sourceMetadata && typeof statementCheckpoint.sourceMetadata === "object"
            ? (statementCheckpoint.sourceMetadata as Record<string, unknown>)
            : null;
        const checkpointIdentity = resolveStatementIdentityFromMetadata(statementMetadata);
        const processingIdentity =
          checkpointIdentity ??
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

        if (importFile?.status === "failed") {
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
          closeImportAfterError(itemId, "background", summaryContext.fileName, processingMessage);
          return;
        }

        if (importFile?.status === "processing" && processingPhase) {
          updateItem(itemId, {
            status: "importing",
            progress: Math.max(90, Math.min(98, 90 + Number(importFile.processingAttempt ?? 0))),
            progressLabel:
              processingMessage ??
              (processingPhase === "auto_rerunning"
                ? `Auto-rerun ${Number(importFile.processingAttempt ?? 0)}/${Number(importFile.processingTargetScore ?? 95)} in progress`
                : "Parsing in background"),
          });
          publishImportActivity({
            workspaceId,
            surface: importActivitySurfaceRef.current,
            status: "active",
            fileName: summaryContext.fileName,
            fileIndex: items.findIndex((item) => item.id === itemId) + 1,
            fileTotal: items.length,
            completedFiles: completedFileCount,
            progress: Math.max(90, Math.min(98, 90 + Number(importFile.processingAttempt ?? 0))),
            detail:
              processingMessage ??
              (processingPhase === "auto_rerunning"
                ? `Clover is rechecking the statement`
                : "Clover is reading the statement"),
            summary: null,
              errorMessage: null,
            });
          if (!seededFallbackSummary && (parsedRowsCount > 0 || Boolean(processingIdentity?.accountName || processingIdentity?.institution))) {
            const fallbackAccountId =
              accountId && !accountId.startsWith("optimistic-")
                ? accountId
                : await ensureTargetAccountId(
                    processingIdentity?.accountName ?? summaryContext.fallbackAccountName,
                    processingIdentity?.institution ?? null,
                    processingIdentity?.accountType ?? summaryContext.accountType ?? null,
                    processingIdentity?.accountNumber ?? null
                  );
            const fallbackPreviewTransactions =
              summaryContext.previewTransactions && summaryContext.previewTransactions.length > 0
                ? summaryContext.previewTransactions
                : await loadOptimisticPreviewTransactions(
                    importFileId,
                    fallbackAccountId,
                    processingIdentity?.accountName ?? summaryContext.fallbackAccountName,
                    processingIdentity?.institution ?? null
                  ).catch(() => []);
            const fallbackSummary = buildOptimisticUploadSummary(
              summaryContext.fileName,
              parsedRowsCount || 0,
              fallbackAccountId,
              processingIdentity?.accountName ?? summaryContext.fallbackAccountName,
              processingIdentity?.institution ?? null,
              processingIdentity?.accountType ?? summaryContext.accountType ?? null,
              summaryContext.optimisticAccountId,
              toBalanceString(statementCheckpoint?.endingBalance),
              fallbackPreviewTransactions,
              processingIdentity?.accountNumber ?? summaryContext.accountNumber ?? null
            );

            seededFallbackSummary = true;
            seedImportedWorkspaceCaches(workspaceId, fallbackSummary);
            void onImported(fallbackSummary);
          }
          await sleep(600);
          continue;
        }

        if (confirmedTransactionsCount > 0) {
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
            summary: null,
            errorMessage: null,
          });
          return;
        }

        if (Date.now() - startedAt >= MAX_WAIT_MS) {
          const canFinalizePartial =
            parsedRowsCount > 0 && Boolean(latestResolvedAccountId && !latestResolvedAccountId.startsWith("optimistic-")) &&
            Boolean(processingIdentity?.accountName || processingIdentity?.institution || summaryContext.accountName || summaryContext.institution);

          if (canFinalizePartial) {
            const fallbackAccountId =
              latestResolvedAccountId && !latestResolvedAccountId.startsWith("optimistic-")
                ? latestResolvedAccountId
                : await ensureTargetAccountId(
                    processingIdentity?.accountName ?? summaryContext.accountName ?? summaryContext.fallbackAccountName,
                    processingIdentity?.institution ?? summaryContext.institution ?? null,
                    processingIdentity?.accountType ?? summaryContext.accountType ?? null,
                    processingIdentity?.accountNumber ?? null
                  );

            const fallbackPreviewTransactions =
              summaryContext.previewTransactions && summaryContext.previewTransactions.length > 0
                ? summaryContext.previewTransactions
                : await loadOptimisticPreviewTransactions(
                    importFileId,
                    fallbackAccountId,
                    processingIdentity?.accountName ?? summaryContext.accountName ?? summaryContext.fallbackAccountName,
                    processingIdentity?.institution ?? summaryContext.institution ?? null
                  ).catch(() => []);

            const fallbackSummary = buildOptimisticUploadSummary(
              summaryContext.fileName,
              parsedRowsCount || 0,
              fallbackAccountId,
              processingIdentity?.accountName ?? summaryContext.accountName ?? summaryContext.fallbackAccountName,
              processingIdentity?.institution ?? summaryContext.institution ?? null,
              processingIdentity?.accountType ?? summaryContext.accountType ?? null,
              summaryContext.optimisticAccountId,
              toBalanceString(statementCheckpoint?.endingBalance),
              fallbackPreviewTransactions
            );

            seedImportedWorkspaceCaches(workspaceId, fallbackSummary);
            void onImported(fallbackSummary);
            updateItem(itemId, {
              status: "done",
              confirmationState: "confirmed",
              progress: 100,
              progressLabel: "Done",
              targetAccountId: fallbackAccountId,
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
              summary: fallbackSummary,
              errorMessage: null,
            });
            return;
          }

          const timeoutMessage =
            parsedRowsCount > 0
              ? "Clover could read some rows, but couldn't finish assigning the statement. Add the account manually, then try again or add the missing rows in Transactions."
              : "Timed out after 60 seconds while Clover was still reading the statement.";
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
          const shouldDeferClientConfirmation =
            resolvedIdentity.institution === "GCash" || resolvedAccountType === "wallet";

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
                : await ensureTargetAccountId(summaryContext.fallbackAccountName, null, null, null);
              const fallbackPreviewTransactions =
                summaryContext.previewTransactions && summaryContext.previewTransactions.length > 0
                  ? summaryContext.previewTransactions
                  : await loadOptimisticPreviewTransactions(
                      importFileId,
                      fallbackAccountId,
                      summaryContext.fallbackAccountName,
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
                null,
                fallbackPreviewTransactions,
                summaryContext.accountNumber ?? null
              );

              seededFallbackSummary = true;
              updateItem(itemId, {
                status: "importing",
                progress: Math.max(92, Math.min(95, 84 + attempt * 0.1)),
                progressLabel: "Waiting for statement identity",
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
                progress: Math.max(92, Math.min(95, 84 + attempt * 0.1)),
                detail: "Clover is reading the statement",
                summary: null,
                errorMessage: null,
              });
              seedImportedWorkspaceCaches(workspaceId, fallbackSummary);
              void onImported(fallbackSummary);
            } else {
              updateItem(itemId, {
                status: "importing",
                progress: Math.max(92, Math.min(95, 84 + attempt * 0.1)),
                progressLabel: "Waiting for statement identity",
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
                progress: Math.max(92, Math.min(95, 84 + attempt * 0.1)),
                detail: "Clover is reading the statement",
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
              null
            );
          }
          if (!resolvedAccountId) {
            throw new Error("Unable to determine the destination account for this statement.");
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
              progress: Math.max(95, Math.min(98, 94 + attempt * 0.1)),
              progressLabel: "Finalizing import",
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
              progress: Math.max(95, Math.min(98, 94 + attempt * 0.1)),
              detail: "Clover is wrapping things up",
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
            null,
            summaryContext.previewTransactions ?? [],
            resolvedIdentity.accountNumber ?? summaryContext.accountNumber ?? null
          );

          updateItem(itemId, {
            targetAccountId: resolvedAccountId,
          });

          seedImportedWorkspaceCaches(workspaceId, previewSummary);
          void onImported(previewSummary);
          publishImportActivity({
            workspaceId,
            surface: importActivitySurfaceRef.current,
            status: "active",
            fileName: summaryContext.fileName,
            fileIndex: items.findIndex((item) => item.id === itemId) + 1,
            fileTotal: items.length,
            completedFiles: completedFileCount,
            progress: 92,
            detail: "Clover is lining up the rest",
            summary: null,
            errorMessage: null,
          });

          const result = await confirmItemImport(itemId, importFileId, resolvedAccountId, {
            ...summaryContext,
            accountName: resolvedIdentity.accountName ?? summaryContext.accountName,
            institution: resolvedIdentity.institution ?? summaryContext.institution,
            accountNumber: resolvedIdentity.accountNumber ?? summaryContext.accountNumber ?? null,
            accountType: resolvedAccountType,
            previewTransactions: summaryContext.previewTransactions ?? [],
          });
          if (result.summary) {
            seedImportedWorkspaceCaches(workspaceId, result.summary);
            void onImported(result.summary);
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
              summary: result.summary,
              errorMessage: null,
            });
          }
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
          progress: Math.max(92, Math.min(95, 92 + attempt * 0.1)),
          progressLabel: "Parsing in background",
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
          progress: Math.max(92, Math.min(95, 92 + attempt * 0.1)),
          detail: "Clover is reading the statement",
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
    accountNumber?: string | null
  ) => {
    if (statementAccountName) {
      const normalizedStatementAccountName = normalizeStatementAccountName(statementAccountName, institution ?? null);
      const key = accountKey(normalizedStatementAccountName, institution ?? null);
      const existing = accountIdByKeyRef.current.get(key) ?? accounts.find((account) => accountKey(account.name, account.institution) === key)?.id;
      if (existing) {
        accountIdByKeyRef.current.set(key, existing);
        await syncStatementAccountIdentity(existing, normalizedStatementAccountName, institution ?? null, accountType, accountNumber);
        return existing;
      }

      const genericMatch =
        hasStatementSuffix(normalizedStatementAccountName)
          ? accounts.find((account) => isGenericSameInstitutionAccount(account, institution ?? null))
          : null;
      if (genericMatch) {
        accountIdByKeyRef.current.set(accountKey(genericMatch.name, genericMatch.institution), genericMatch.id);
        await syncStatementAccountIdentity(genericMatch.id, normalizedStatementAccountName, institution ?? null, accountType, accountNumber);
        return genericMatch.id;
      }

      const rule = accountRules.find(
        (entry) => accountRuleKey(entry.accountName, entry.institution) === accountRuleKey(normalizedStatementAccountName, institution ?? null)
      );
      if (rule?.accountId) {
        const matchedAccount = accounts.find((account) => account.id === rule.accountId);
        if (matchedAccount) {
          accountIdByKeyRef.current.set(accountKey(matchedAccount.name, matchedAccount.institution), matchedAccount.id);
          await syncStatementAccountIdentity(matchedAccount.id, normalizedStatementAccountName, institution ?? null, accountType, accountNumber);
          return matchedAccount.id;
        }
      }

      return createStatementAccount(normalizedStatementAccountName, institution ?? null, accountType, accountNumber);
    }

    if (selectedAccountId) {
      return selectedAccountId;
    }

    const fallback = accounts[0]?.id;
    if (fallback) {
      setSelectedAccountId(fallback);
      return fallback;
    }

    return createStatementAccount("Cash", "Cash", "cash", null);
  };

  const resolveLocalAccountId = (
    statementAccountName: string | null,
    institution: string | null,
    accountNumber: string | null
  ) => {
    if (statementAccountName) {
      const normalizedStatementAccountName = normalizeStatementAccountName(statementAccountName, institution);
      const key = accountKey(normalizedStatementAccountName, institution ?? null);
      const existing =
        accountIdByKeyRef.current.get(key) ?? accounts.find((account) => accountKey(account.name, account.institution) === key)?.id;
      if (existing) {
        return existing;
      }

      const genericMatch = hasStatementSuffix(normalizedStatementAccountName)
        ? accounts.find((account) => isGenericSameInstitutionAccount(account, institution ?? null))
        : null;
      if (genericMatch) {
        return genericMatch.id;
      }

      const rule = accountRules.find(
        (entry) => accountRuleKey(entry.accountName, entry.institution) === accountRuleKey(normalizedStatementAccountName, institution ?? null)
      );
      if (rule?.accountId) {
        const matchedAccount = accounts.find((account) => account.id === rule.accountId);
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

    if (selectedAccountId && accounts.some((account) => account.id === selectedAccountId)) {
      return selectedAccountId;
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
        [],
        accountNumber,
        true
      );

      seedImportedWorkspaceCaches(workspaceId, summary);
      void onImported(summary);
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

  const processFile = async (itemId: string): Promise<ImportProcessResult> => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return { status: "error", importedRows: null, summary: null };
    const guessedIdentity = guessStatementIdentity(item.file.name);
    const canUseOptimisticGuess = Boolean(guessedIdentity?.accountName);
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
      });
      updateItem(itemId, { status: "importing", error: null, progress: 8, progressLabel: "Starting upload", importFileId });
      updateItem(itemId, { progress: 20, progressLabel: "Uploading the file" });
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
      });
      const processResponse = await postFileWithProgress(
        `/api/imports/${importFileId}/process`,
        item.file,
        {
          workspaceId,
          fileName: item.file.name,
          fileType: item.file.type || item.file.name.split(".").pop() || "unknown",
          password: item.password.trim() || undefined,
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
            progress: 20 + progress * 0.45,
            detail: `Clover is bringing in ${item.file.name}`,
            summary: null,
            errorMessage: null,
          });
          updateItem(itemId, {
            progress: 20 + progress * 0.45,
            progressLabel: `Uploading ${item.file.name}`,
            status: "importing",
          });
        }
      );
      capturePostHogClientEvent("file_uploaded", {
        file_type: fileTypeLabel(item.file),
        file_size_bytes: item.file.size,
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

      if (processPayload?.queued) {
        const hasStatementIdentity = Boolean(statementIdentity?.accountName && statementIdentity?.institution);
        const optimisticAccountId = hasStatementIdentity
          ? await ensureTargetAccountId(
              statementIdentity?.accountName ?? null,
              statementIdentity?.institution ?? null,
              statementAccountType,
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
                statementIdentity.accountName,
                statementIdentity?.institution ?? null
              )
            : [];
        const optimisticIdentity =
          statementIdentity ??
          (guessedIdentity
            ? {
                ...guessedIdentity,
                accountNumber: null,
                accountType: inferAccountTypeFromStatement(guessedIdentity.institution, guessedIdentity.accountName, "bank"),
              }
            : null);
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
                null,
                previewTransactions,
                statementIdentity?.accountNumber ?? null
              ),
            } satisfies UploadInsightsSummary)
          : null;
        updateItem(itemId, {
          importFileId,
          targetAccountId: optimisticAccountId,
          confirmationState: "staged",
          progress: 92,
          progressLabel: hasStatementIdentity || canUseOptimisticGuess ? "Queued for background processing" : "Waiting for account details",
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
          progress: 92,
          detail: hasStatementIdentity || canUseOptimisticGuess ? "Clover is lining up the rest" : "Clover is reading the statement",
          summary: null,
          errorMessage: null,
        });
        if (optimisticSummary) {
          seedImportedWorkspaceCaches(workspaceId, optimisticSummary);
          void onImported(optimisticSummary);
        }

        void monitorQueuedImportAndConfirm(itemId, importFileId, optimisticAccountId, {
          fileName: item.file.name,
          fallbackAccountName: deriveFallbackAccountNameFromFileName(item.file.name),
          accountName: statementIdentity?.accountName ?? null,
          institution: statementIdentity?.institution ?? null,
          accountNumber: statementIdentity?.accountNumber ?? null,
          accountType: statementIdentity?.accountType ?? null,
          optimisticAccountId: hasStatementIdentity ? optimisticAccountId : canUseOptimisticGuess ? item.optimisticAccountId : null,
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
            null
          )
        : null;

      const previewTransactions =
        targetAccountId && statementIdentity?.accountName
          ? await loadOptimisticPreviewTransactions(
              importFileId,
              targetAccountId,
              statementIdentity.accountName,
              statementIdentity?.institution ?? null
            )
          : [];
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
                targetAccountId,
                null,
                previewTransactions,
                statementIdentity?.accountNumber ?? null
              ),
            } satisfies UploadInsightsSummary)
          : null;

      updateItem(itemId, {
        importFileId,
        targetAccountId,
        confirmationState: "staged",
        progress: 92,
        progressLabel: targetAccountId ? "Finalizing in background" : "Waiting for account details",
      });
      publishImportActivity({
        workspaceId,
        surface: importActivitySurfaceRef.current,
        status: "active",
        fileName: item.file.name,
        fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
        fileTotal: items.length,
        completedFiles: completedFileCount,
        progress: 92,
        detail: targetAccountId ? "Clover is wrapping things up" : "Clover is reading the statement",
        summary: null,
        errorMessage: null,
      });

      if (optimisticPreviewSummary) {
        seedImportedWorkspaceCaches(workspaceId, optimisticPreviewSummary);
        void onImported(optimisticPreviewSummary);
      }

      if (targetAccountId) {
        void confirmItemImport(itemId, importFileId, targetAccountId, {
          fileName: item.file.name,
          accountName: statementIdentity?.accountName ?? null,
          institution: statementIdentity?.institution ?? null,
          accountNumber: statementIdentity?.accountNumber ?? null,
          accountType: statementIdentity?.accountType ?? statementAccountType,
          optimisticAccountId: targetAccountId,
          previewTransactions,
        }).then((result) => {
          if (result.summary) {
            seedImportedWorkspaceCaches(workspaceId, result.summary);
            void onImported(result.summary);
          }
        });
      } else {
        void monitorQueuedImportAndConfirm(itemId, importFileId, null, {
          fileName: item.file.name,
          fallbackAccountName: deriveFallbackAccountNameFromFileName(item.file.name),
          accountName: statementIdentity?.accountName ?? null,
          institution: statementIdentity?.institution ?? null,
          accountNumber: statementIdentity?.accountNumber ?? null,
          accountType: statementIdentity?.accountType ?? null,
          optimisticAccountId: null,
          password: item.password.trim() || undefined,
        });
      }

        return {
          status: "staged",
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

  const activeItem = items.find((item) => item.status === "parsing" || item.status === "importing") ?? null;
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
  const showImportHelp = hasImportIssue || items.some((item) => item.confirmationState === "staged");
  const importHelpTitle = items.some((item) => item.status === "needs_password")
    ? "Password needed"
    : items.some((item) => item.status === "error")
      ? "What to do next"
      : "If Clover needs a hand";
  const importHelpItems = items.some((item) => item.status === "needs_password")
    ? [
        "Enter the password for the statement, then unlock the file.",
        "If the password still fails, re-upload the original PDF and try again.",
      ]
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
      errorCode: items.some((item) => item.status === "error") ? lastImportActivityRef.current?.errorCode ?? null : null,
      errorMessage: items.find((item) => item.status === "error")?.error ?? validationNotice ?? null,
      updatedAt: Date.now(),
    };

    lastImportActivityRef.current = nextSnapshot;
    setImportActivity(nextSnapshot);
  }, [activeProgressItem, busy, completedFileCount, items, message, open, overallProgress, validationNotice, workspaceId]);
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
    setMessage("Clover is lining up your statements...");
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
        void onImported(
          uploadInsightsSummaries.length === 1
            ? uploadInsightsSummaries[0]
            : combineUploadInsightsSummaries(uploadInsightsSummaries)
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
      const accountId = item.targetAccountId || selectedAccountId || (await ensureTargetAccountId());
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
        void onImported(result.summary);
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

  useEffect(() => {
    if (!open || !autoCloseAfterStartRef.current) {
      return;
    }

    if (passwordItems.some((item) => item.status === "needs_password")) {
      return;
    }

    const hasStartedUpload = items.some(
      (item) => item.status === "parsing" || item.status === "importing" || item.confirmationState === "staged"
    );

    if (!hasStartedUpload) {
      return;
    }

    autoCloseAfterStartRef.current = false;
    onClose();
  }, [items, onClose, open, passwordItems]);

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

  const portalTarget = typeof document === "undefined" ? null : document.body;
  if (!portalTarget) {
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
        detail={
          friendlyImportProgressLabel(
            activeProgressItem
              ? activeProgressItem.progressLabel
              : completedFileCount > 0
                ? "Done"
                : "Queued",
            activeProgressItem?.file.name ?? null
          )
        }
        onClose={onClose}
        />
    ) : (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
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
              addFiles(event.dataTransfer.files);
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
            accept=".csv,.tsv,.pdf"
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
          <p>Accepted files: CSV and PDF. Password-protected files are supported.</p>
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

                  {item.error ? <p className="accounts-import-file__error">{item.error}</p> : null}

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
                      {item.status === "error" && item.importFileId ? (
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
                          onClick={() => void handleReplayConfirm(item.id)}
                          disabled={busy}
                        >
                          Confirm now
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
