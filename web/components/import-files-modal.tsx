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
import {
  fileAnalyticsBase,
  fileKey,
  findAccountOptionById,
  fileTypeLabel,
  isImageImportFile,
  resolveCashAccountOption,
} from "@/lib/import-file-helpers";
import { extractTextFromFile, probeFilePasswordProtection } from "@/lib/import-file-text";
import { postFileWithProgress } from "@/lib/import-file-post";
import { validateImportFile } from "@/lib/import-file-validation";
import { type ImportImageMode } from "@/lib/import-image-mode";
import { formatUploadAccountDisplayName } from "@/lib/account-display";
import { normalizeBankName } from "@/lib/data-qa-banks";
import {
  buildBpiMobileScreenshotFallbackText,
  isKnownBpiMobileScreenshotFile,
} from "@/lib/bpi-mobile-screenshot-fallback";
import {
  detectStatementMetadata,
  getTrailingBalanceFromParsedRows,
  inferAccountTypeFromStatement,
  normalizeInstitutionCurrency,
  parseImportText,
} from "@/lib/import-parser";
import { assessReceiptPreviewQuality, parseReceiptText, type ReceiptPreviewResult } from "@/lib/split-bill";
import { resolveReceiptAccountHintToAccount } from "@/lib/receipt-account-resolution";
import { shouldAutoResumeQueuedImport } from "@/lib/import-resume-policy";
import {
  buildReceiptOptimisticSummary,
  buildReceiptPreviewTransactions,
  buildReceiptSummaryFromReceiptDocument,
  buildReceiptSummaryFromReceiptTransaction,
} from "@/lib/import-receipt-summary";
import {
  buildOptimisticPreviewTransactions,
  loadOrGetKnownPreviewTransactions,
  loadOptimisticPreviewTransactions,
} from "@/lib/import-preview-transactions";
import { friendlyImportPhaseLabel, friendlyImportProgressLabel, IMPORT_PROGRESS } from "@/lib/import-progress";
import { getLocalPreparseProgressPatch, resolveImportModalStatusDecision } from "@/lib/import-modal-status";
import { waitForImportSettledVisibility } from "@/lib/import-settled-visibility";
import { parsePlanLimitMessage, parsePlanLimitPayload, type PlanLimitPayload } from "@/lib/plan-limit-nudges";
import { getImportErrorSpec, getImportErrorSpecForCode, isResumableImportErrorCode, type ImportErrorStage, type ImportErrorSpec } from "@/lib/import-error-spec";
import {
  clearImportActivity,
  readImportActivity,
  setImportActivity,
  subscribeImportActivity,
  type ImportActivityLocation,
  type ImportActivitySnapshot,
  type ImportActivityStatus,
} from "@/lib/import-activity";
import type { UploadInsightsSummary } from "@/components/upload-insights-toast";
import type { AccountType } from "@/lib/domain-types";
import {
  combineUploadInsightsSummaries,
  dedupeAccountSummaries,
  normalizeServerAccountSummaries,
  pickStableBalance,
  toBalanceString,
  type UploadAccountSummary,
} from "@/lib/import-upload-summary";
import { findKnownImportedBalance, getKnownPreviewTransactions } from "@/lib/import-preview-cache";
import {
  buildOptimisticUploadSummary,
  buildResolvedOptimisticUploadSummary,
  seedImportedWorkspaceCaches,
} from "@/lib/import-optimistic-summary";
import {
  accountKey,
  accountRuleKey,
  countDistinctStatementAccountsFromParsedRows,
  deriveFallbackAccountNameFromFileName,
  deriveStatementFallbackAccountName,
  extractLastFourDigits,
  guessStatementIdentity,
  hasStatementSuffix,
  importedAccountIdentityKey,
  inferImportModeForFile,
  isGenericMobileScreenshotFileName,
  isGenericSameInstitutionAccount,
  normalizeStatementAccountName,
  resolveMobileWalletIdentityFromParsedRows,
  resolveStatementIdentityFromMetadata,
  resolveStatementIdentityFromParsedRows,
  type StatementIdentity,
} from "@/lib/import-statement-identity";
import {
  getImportVisibilityTimeoutMsForItems,
  hasActiveServerImport,
  hasVisibleImportData,
  importContextLooksWise,
  isExplicitLowQualityUnionBankStatementFilename,
  isKnownUnionBankSampleStatementFilename,
  isLikelyLowQualityUnionBankStatementFile,
  isLikelyLowQualityUnionBankStatementFilename,
  isLikelyLowQualityPnbStatementFile,
  isServerHeavyStatementBatchItem,
  shouldPublishImportSummary,
  shouldRequireVisibleRowsForImport,
  shouldSkipClientStatementPreparse,
  summarizeVisibilityOutcome,
} from "@/lib/import-visibility-rules";

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
  showManualTransactionLink?: boolean;
  initialFiles?: File[] | null;
  onInitialFilesConsumed?: () => void;
  backgroundOnly?: boolean;
  onClose: () => void;
  onImported: (summary: UploadInsightsSummary) => Promise<void> | void;
};

type ImportStatus = "pending" | "needs_password" | "parsing" | "importing" | "done" | "error";

type ConfirmationState = "none" | "pending" | "staged" | "confirmed";

type UploadAccountType = AccountType | null;

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

const MIN_FULLSCREEN_IMPORT_MODAL_MS = 1200;
const IN_FLIGHT_IMPORT_PROGRESS_INITIAL_DELAY_MS = 400;
const IN_FLIGHT_IMPORT_PROGRESS_POLL_INTERVAL_MS = 500;

type ImportStatusPayload = {
  importFile?: {
    status?: string;
    accountId?: string | null;
    processingPhase?: string | null;
    processingMessage?: string | null;
    processingAttempt?: number | null;
    processingTargetScore?: number | null;
    processingCurrentScore?: number | null;
    updatedAt?: string | null;
  };
  receiptDocument?: {
    id?: string;
    accountId?: string | null;
    transactionId?: string | null;
    merchantRaw?: string | null;
    merchantClean?: string | null;
    transactionDate?: string | null;
    transactionTime?: string | null;
    currency?: string | null;
    subtotal?: string | null;
    tax?: string | null;
    total?: string | null;
    paymentMethod?: string | null;
    accountMatch?: Record<string, unknown> | null;
    rawPayload?: Record<string, unknown> | null;
  } | null;
  receiptTransaction?: {
    id?: string;
    accountId?: string;
    accountName?: string;
    institution?: string | null;
    accountNumber?: string | null;
    categoryId?: string | null;
    reviewStatus?: string | null;
    date?: string;
    amount?: string;
    currency?: string;
    type?: "income" | "expense" | "transfer";
    merchantRaw?: string;
    merchantClean?: string | null;
    description?: string | null;
    rawPayload?: Record<string, unknown> | null;
    normalizedPayload?: Record<string, unknown> | null;
    isTransfer?: boolean;
    isExcluded?: boolean;
    createdAt?: string;
  } | null;
  parsedRowsCount?: number;
  confirmedTransactionsCount?: number;
  visibleImportComplete?: boolean;
  accountSummaries?: UploadInsightsSummary["accountSummaries"];
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
  finalizationEstimatedSecondsRemaining?: number | null;
  finalizationNeedsReview?: boolean | null;
};

const isPasswordError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String((error as { name?: unknown }).name ?? "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return /password/i.test(name) || /password/i.test(message);
};

const requestedImportEnrichmentIds = new Set<string>();

const triggerImportEnrichment = (importFileId: string) => {
  if (!importFileId || requestedImportEnrichmentIds.has(importFileId)) {
    return;
  }

  requestedImportEnrichmentIds.add(importFileId);
  void fetch("/api/import-enrichment/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ importFileId, limit: 10, batchSize: 100 }),
    keepalive: true,
  })
    .then((response) => {
      if (!response.ok) {
        requestedImportEnrichmentIds.delete(importFileId);
      }
    })
    .catch(() => {
      requestedImportEnrichmentIds.delete(importFileId);
    });
};

const reportImportClientStage = (stage: string, details: Record<string, string | number | boolean | null> = {}) => {
  void fetch("/api/imports/client-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage, details }),
    keepalive: true,
  }).catch(() => undefined);
};

const clearImportInteractionLocks = () => {
  if (typeof document === "undefined") {
    return;
  }

  delete document.body.dataset.cloverImportModalLocks;
  delete document.body.dataset.cloverImportModalOpen;
  delete document.body.dataset.cloverImportModalVisible;
  delete document.body.dataset.cloverImportModalVisibleCount;
};

const getImportErrorCode = (error: unknown) => {
  if (error instanceof Error) {
    return error.name && error.name !== "Error" ? error.name : error.message || "unknown_error";
  }

  return "unknown_error";
};

const formatImportFailureMessage = (file: File | string, errorMessage: string) =>
  getImportErrorSpec("process", typeof file === "string" ? file : file.name, errorMessage).message;

const VISUAL_IMPORT_REPAIR_GRACE_MS = 30_000;

const isRecoverableVisualUploadFileName = (fileName: string) =>
  /\.(?:pdf|jpe?g|png|webp|heic|heif|gif|bmp|avif)$/i.test(fileName.trim().toLowerCase());

const buildImportErrorNotice = (stage: ImportErrorStage, fileName: string | null, reason?: string | null): ImportErrorSpec => {
  const spec = getImportErrorSpec(stage, fileName, reason);

  return {
    ...spec,
  };
};

const MAX_IMPORT_FILES_PER_BATCH = 5;
const IMPORT_BACKGROUND_HARD_STOP_MS = 60_000;
const startedImportMonitorKeys = new Set<string>();

const yieldToPaint = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));

export function ImportFilesModal({
  open,
  workspaceId,
  accounts,
  accountRules = [],
  defaultAccountId,
  showQaTools = false,
  showManualTransactionLink = true,
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
  const [message, setMessage] = useState("");
  const [validationNotice, setValidationNotice] = useState<string | null>(null);
  const [selectedPasswordItemId, setSelectedPasswordItemId] = useState<string | null>(null);
  const [planTier, setPlanTier] = useState<"free" | "pro" | "unknown">("unknown");
  const [monthlyUploadLimit, setMonthlyUploadLimit] = useState<number | null>(10);
  const [planLimitNudge, setPlanLimitNudge] = useState<PlanLimitPayload | null>(null);
  const [qaRunsByItemId, setQaRunsByItemId] = useState<Record<string, QaRunSummary | null>>({});
  const [qaLoadingByItemId, setQaLoadingByItemId] = useState<Record<string, boolean>>({});
  const [qaErrorByItemId, setQaErrorByItemId] = useState<Record<string, string | null>>({});
  const [displayedOverallProgress, setDisplayedOverallProgress] = useState(0);
  const [compactProgressUnlocked, setCompactProgressUnlocked] = useState(false);
  const [uploadPaused, setUploadPaused] = useState(false);
  const autoLoadedQaIdsRef = useRef(new Set<string>());
  const localPreparseStartedRef = useRef(new Set<string>());
  const localPreparseSummaryByItemIdRef = useRef(new Map<string, UploadInsightsSummary>());
  const localPreparseTextByItemIdRef = useRef(new Map<string, string>());
  const handleStartImportRef = useRef<null | (() => Promise<void>)>(null);
  const initialFilesSignatureRef = useRef<string | null>(null);
  const importActivitySurfaceRef = useRef<ImportActivityLocation>("modal");
  const lastImportActivityRef = useRef<ImportActivitySnapshot | null>(null);
  const retiredImportActivityFileNamesRef = useRef(new Set<string>());
  const autoCloseAfterStartRef = useRef(false);
  const successfulImportAutoCloseTimerRef = useRef<number | null>(null);
  const compactProgressUnlockTimerRef = useRef<number | null>(null);
  const compactProgressStartedAtRef = useRef<number | null>(null);
  const visibilityDeadlineRef = useRef<number | null>(null);
  const visibilityHardStopTimerRef = useRef<number | null>(null);
  const uploadPausedRef = useRef(false);
  const uploadCancelRequestedRef = useRef(false);
  const primaryVisibilityCompletedRef = useRef(false);
  const activeUploadAbortControllersRef = useRef<Set<AbortController>>(new Set());
  const busyRef = useRef(false);
  const uploadRunnerActiveRef = useRef(false);
  const uploadRunnerTimerRef = useRef<number | null>(null);
  const importModalInstanceIdRef = useRef(crypto.randomUUID());
  const wasOpenRef = useRef(open);
  const itemsRef = useRef<QueuedFile[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    uploadPausedRef.current = uploadPaused;
  }, [uploadPaused]);

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

    if (primaryVisibilityCompletedRef.current) {
      return;
    }

    const previousSnapshot = lastImportActivityRef.current;
    const liveItems = itemsRef.current;
    const liveFileTotal = liveItems.length;
    const snapshotFileTotal = Number(snapshot.fileTotal ?? 0);
    const normalizedFileTotal = Math.max(snapshotFileTotal, liveFileTotal);
    const liveSettledFileCount = liveItems.filter((item) =>
      item.confirmationState === "confirmed" ||
      item.status === "done" ||
      item.status === "error" ||
      hasVisibleImportData(item, localPreparseSummaryByItemIdRef.current.get(item.id))
    ).length;
    const snapshotSettlesCurrentFile =
      snapshot.status === "done" || snapshot.status === "error";
    const snapshotFileName = snapshot.fileName?.trim() || null;
    const snapshotItem =
      snapshotFileName !== null
        ? liveItems.find((item) => item.file.name === snapshotFileName) ?? null
        : null;
    const snapshotImportFileId =
      typeof snapshot.importFileId === "string" && snapshot.importFileId.trim()
        ? snapshot.importFileId.trim()
        : null;
    if (
      snapshot.status === "active" &&
      snapshotImportFileId &&
      snapshotItem?.importFileId &&
      snapshotItem.importFileId !== snapshotImportFileId
    ) {
      return;
    }
    const shouldCountSnapshotFile =
      snapshotSettlesCurrentFile &&
      snapshotItem !== null &&
      !(
        snapshotItem.confirmationState === "confirmed" ||
        snapshotItem.status === "done" ||
        snapshotItem.status === "error" ||
        hasVisibleImportData(snapshotItem, localPreparseSummaryByItemIdRef.current.get(snapshotItem.id))
      );
    const normalizedCompletedFiles = Math.min(
      normalizedFileTotal || Number.POSITIVE_INFINITY,
      Math.max(Number(snapshot.completedFiles ?? 0), liveSettledFileCount + (shouldCountSnapshotFile ? 1 : 0))
    );
    const liveActiveItem =
      liveItems.find((item) => item.status === "parsing" || item.status === "importing") ??
      liveItems.find((item) => item.status === "pending") ??
      null;
    const liveActiveContribution =
      liveActiveItem &&
      !(
        liveActiveItem.confirmationState === "confirmed" ||
        liveActiveItem.status === "done" ||
        liveActiveItem.status === "error" ||
        hasVisibleImportData(liveActiveItem, localPreparseSummaryByItemIdRef.current.get(liveActiveItem.id))
      )
        ? liveActiveItem.progress / 100
        : 0;
    const liveBatchProgress =
      normalizedFileTotal > 0
        ? Math.min(100, ((normalizedCompletedFiles + liveActiveContribution) / normalizedFileTotal) * 100)
        : 0;
    const nextSnapshot: ImportActivitySnapshot = {
      workspaceId: snapshot.workspaceId ?? workspaceId,
      surface: snapshot.surface ?? importActivitySurfaceRef.current,
      status: snapshot.status,
      importFileId:
        snapshotImportFileId
          ? snapshotImportFileId
          : previousSnapshot?.workspaceId === (snapshot.workspaceId ?? workspaceId) &&
              previousSnapshot?.fileName === (snapshot.fileName ?? null)
            ? previousSnapshot.importFileId ?? null
            : null,
      fileName: snapshot.fileName ?? null,
      fileIndex: Number(snapshot.fileIndex ?? 0),
      fileTotal: normalizedFileTotal,
      completedFiles: normalizedCompletedFiles,
      progress: Math.max(Number(snapshot.progress ?? 0), liveBatchProgress),
      detail: snapshot.detail ?? "",
      summary: snapshot.summary ?? null,
      errorCode: snapshot.errorCode ?? null,
      errorMessage: snapshot.errorMessage ?? null,
      errorTitle: snapshot.errorTitle ?? null,
      errorNextSteps: snapshot.errorNextSteps ?? null,
      timing: snapshot.timing ?? previousSnapshot?.timing ?? null,
      updatedAt: Date.now(),
    };
    const isVisiblePrimaryCompletion =
      nextSnapshot.status === "done" &&
      nextSnapshot.progress >= 100 &&
      /accounts and transactions are visible|visible in clover|keep cleaning up names and categories/i.test(
        nextSnapshot.detail
      );
    const isPartialBatchCompletion =
      !isVisiblePrimaryCompletion &&
      nextSnapshot.status === "done" &&
      nextSnapshot.fileTotal > 1 &&
      nextSnapshot.completedFiles < nextSnapshot.fileTotal;
    if (isPartialBatchCompletion) {
      if (nextSnapshot.fileName) {
        retiredImportActivityFileNamesRef.current.add(nextSnapshot.fileName);
      }
      nextSnapshot.status = "active";
      nextSnapshot.summary = null;
      nextSnapshot.errorMessage = null;
      nextSnapshot.errorCode = null;
      nextSnapshot.errorTitle = null;
      nextSnapshot.errorNextSteps = null;
      const partialBatchProgress = (nextSnapshot.completedFiles / nextSnapshot.fileTotal) * 100;
      nextSnapshot.progress = Math.min(
        99,
        nextSnapshot.progress >= 100
          ? partialBatchProgress
          : Math.max(nextSnapshot.progress, partialBatchProgress)
      );
      nextSnapshot.detail =
        nextSnapshot.detail && !/^all set$/i.test(nextSnapshot.detail)
          ? nextSnapshot.detail
          : "That file is visible in Clover. Continuing with the remaining files.";
    }
    if (
      nextSnapshot.fileName &&
      !isPartialBatchCompletion &&
      retiredImportActivityFileNamesRef.current.has(nextSnapshot.fileName) &&
      nextSnapshot.status !== "error"
    ) {
      return;
    }
    if (nextSnapshot.status === "done" && nextSnapshot.fileName) {
      retiredImportActivityFileNamesRef.current.add(nextSnapshot.fileName);
    }
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
    const currentItem = itemsRef.current.find((entry) => entry.id === itemId);
    if (
      currentItem?.status === "done" ||
      currentItem?.confirmationState === "confirmed" ||
      retiredImportActivityFileNamesRef.current.has(fileName)
    ) {
      retiredImportActivityFileNamesRef.current.add(fileName);
      setBusy(false);
      autoCloseAfterStartRef.current = false;
      return;
    }

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

  const markQueuedUploadsCanceled = (activeItemId?: string | null) => {
    setItems((current) =>
      current.map((item) => {
        if (
          item.confirmationState === "confirmed" ||
          item.status === "done" ||
          item.status === "error" ||
          item.status === "needs_password"
        ) {
          return item;
        }

        return {
          ...item,
          status: "error",
          error: activeItemId && item.id === activeItemId ? "Upload canceled." : "Upload canceled before it started.",
          errorCode: null,
          errorTitle: "Upload canceled",
          errorNextSteps: null,
          progress: item.progress,
          progressLabel: "Canceled",
        };
      })
    );
  };

  const waitForUploadResume = async () => {
    while (uploadPausedRef.current && !uploadCancelRequestedRef.current) {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
  };

  const closeImportAsRecoverable = (
    itemId: string,
    fileName: string,
    detail: string,
    progressLabel = "Review needed"
  ) => {
    updateItem(itemId, {
      status: "done",
      confirmationState: "confirmed",
      error: null,
      errorCode: null,
      errorTitle: null,
      errorNextSteps: null,
      progress: 100,
      progressLabel,
    });
    publishImportActivity({
      workspaceId,
      surface: "background",
      status: "done",
      fileName,
      fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
      fileTotal: items.length,
      completedFiles: Math.min(items.length, completedFileCount + 1),
      progress: 100,
      detail,
      summary: null,
      errorMessage: null,
    });
    setBusy(false);
    autoCloseAfterStartRef.current = false;
  };

  const scheduleSuccessfulImportAutoClose = () => {
    if (backgroundOnly || importActivitySurfaceRef.current === "background") {
      return;
    }

    if (successfulImportAutoCloseTimerRef.current !== null) {
      window.clearTimeout(successfulImportAutoCloseTimerRef.current);
    }

    successfulImportAutoCloseTimerRef.current = window.setTimeout(() => {
      successfulImportAutoCloseTimerRef.current = null;
      if (!primaryVisibilityCompletedRef.current) {
        return;
      }
      clearImportActivity();
      lastImportActivityRef.current = null;
      onClose();
    }, 10_000);
  };

  const hardStopVisibleImportModal = (reason: "deadline" | "background" | "visible") => {
    const currentItems = itemsRef.current;
    if (currentItems.length === 0) {
      setBusy(false);
      onClose();
      return;
    }

    const getItemSummary = (item: QueuedFile) => localPreparseSummaryByItemIdRef.current.get(item.id) ?? null;
    const outcome = summarizeVisibilityOutcome(currentItems, getItemSummary);
    const completedSummary = buildVisibleImportSummary(currentItems);
    const outcomeMessage =
      reason === "visible"
        ? `Accounts and transactions are visible. ${outcome.message}`
        : reason === "deadline"
          ? `Initial visibility window ended. ${outcome.message}`
          : outcome.message;

    for (const item of outcome.successful) {
      retiredImportActivityFileNamesRef.current.add(item.file.name);
    }

    setItems((current) =>
      current.map((item) => {
        const itemSummary = getItemSummary(item);
        const isRecoverableInFlight =
          item.status !== "done" &&
          item.status !== "error" &&
          item.status !== "needs_password" &&
          (Boolean(item.importFileId) ||
            Boolean(item.targetAccountId) ||
            item.importedRows !== null ||
            item.confirmationState === "staged" ||
            item.progress >= IMPORT_PROGRESS.uploading);
        if (hasVisibleImportData(item, itemSummary)) {
          return {
            ...item,
            status: "done",
            confirmationState: "confirmed",
            error: null,
            errorCode: null,
            errorTitle: null,
            errorNextSteps: null,
            progress: 100,
            progressLabel: "Visible in Clover",
          };
        }

        if (item.status === "error" || item.status === "needs_password") {
          return item;
        }

        if (isRecoverableInFlight) {
          return {
            ...item,
            status: "done",
            confirmationState: "confirmed",
            error: null,
            errorCode: null,
            errorTitle: null,
            errorNextSteps: null,
            progress: 100,
            progressLabel: "Still processing",
          };
        }

        if (reason !== "visible") {
          return {
            ...item,
            status: "pending",
            error: null,
            errorCode: null,
            errorTitle: null,
            errorNextSteps: null,
            progress: item.progress,
            progressLabel: "Queued in background",
          };
        }

        return {
          ...item,
          status: "error",
          confirmationState: item.confirmationState === "confirmed" ? "confirmed" : "staged",
          error:
            "Clover could not read enough details to show this file in your workspace. Try uploading a clearer original PDF or image.",
          errorCode: "I-104",
          errorTitle: "File not readable",
          errorNextSteps: [
            "Upload the original PDF when available, or use a clearer screenshot with the account details and transactions visible.",
            "Try importing the file by itself so Clover can focus on that statement.",
            "If Clover still cannot read it, add the account or transactions manually.",
          ],
          progress: Math.min(item.progress, IMPORT_PROGRESS.finalizing),
          progressLabel: "Review needed",
        };
      })
    );
    setMessage(outcomeMessage);
    setBusy(false);
    autoStartRef.current = false;
    autoCloseAfterStartRef.current = false;
    visibilityDeadlineRef.current = null;
    if (visibilityHardStopTimerRef.current) {
      window.clearTimeout(visibilityHardStopTimerRef.current);
      visibilityHardStopTimerRef.current = null;
    }

    if (reason === "deadline" && outcome.retryNeeded.length > 0) {
      const retryFileNames = outcome.retryNeeded.map((entry) => entry.file.name).join(", ");
      publishImportActivity({
        workspaceId,
        surface: "background",
        status: "error",
        fileName: outcome.retryNeeded[0]?.file.name ?? currentItems[currentItems.length - 1]?.file.name ?? null,
        fileIndex: Math.max(1, outcome.successful.length),
        fileTotal: currentItems.length,
        completedFiles: outcome.successful.length,
        progress: Math.min(99, Math.max(IMPORT_PROGRESS.uploading, Math.round((outcome.successful.length / currentItems.length) * 100))),
        detail: "Import timed out",
        summary: completedSummary,
        errorCode: "I-107",
        errorTitle: "Some files were not uploaded",
        errorMessage: `${outcomeMessage} Try uploading these files again: ${retryFileNames}.`,
        errorNextSteps: [
          `Upload these files again: ${retryFileNames}.`,
          "Try uploading fewer files at a time if the batch is large.",
          "Use the original PDF or a clearer screenshot when available.",
        ],
      });
      lastImportActivityRef.current = null;
      primaryVisibilityCompletedRef.current = true;
      return;
    }

    if (outcome.failureCount > 0) {
      clearImportActivity();
      lastImportActivityRef.current = null;
      return;
    }

    if (outcome.partial.length > 0 || outcome.queued.length > 0) {
      publishImportActivity({
        workspaceId,
        surface: "background",
        status: "active",
        fileName: currentItems[currentItems.length - 1]?.file.name ?? null,
        fileIndex: Math.max(1, outcome.successful.length),
        fileTotal: currentItems.length,
        completedFiles: outcome.successful.length,
        progress: Math.min(99, Math.max(IMPORT_PROGRESS.uploading, Math.round((outcome.successful.length / currentItems.length) * 100))),
        detail: outcomeMessage,
        summary: completedSummary,
        errorMessage: null,
      });
      return;
    }

    if (outcome.failureCount === 0) {
      publishImportActivity({
        workspaceId,
        surface: "background",
        status: "done",
        fileName: currentItems[currentItems.length - 1]?.file.name ?? null,
        fileIndex: currentItems.length,
        fileTotal: currentItems.length,
        completedFiles: outcome.successful.length,
        progress: 100,
        detail: outcomeMessage,
        summary: completedSummary,
        errorMessage: null,
        errorTitle: null,
        errorNextSteps: null,
      });

      primaryVisibilityCompletedRef.current = true;
      // The success state is only allowed to close after durable rows are
      // visible. This gives the user feedback without leaving a completed
      // modal on screen indefinitely.
      scheduleSuccessfulImportAutoClose();
    }
  };

  const closeVisibleImportModalIfPrimaryDataReady = () => {
    const currentItems = itemsRef.current;
    if (currentItems.length === 0 || !open || visibilityDeadlineRef.current === null) {
      return;
    }

    const allPrimaryDataVisible = currentItems.every((item) => {
      return hasVisibleImportData(item, localPreparseSummaryByItemIdRef.current.get(item.id));
    });

    if (allPrimaryDataVisible) {
      hardStopVisibleImportModal("visible");
    }
  };

  const hasPrimaryDataForItem = (item: QueuedFile) => {
    return hasVisibleImportData(item, localPreparseSummaryByItemIdRef.current.get(item.id));
  };

  const waitForLocalPrimaryVisibility = async (timeoutMs: number) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const currentItems = itemsRef.current.filter((item) => item.confirmationState !== "confirmed");
      if (currentItems.length === 0 || currentItems.every(hasPrimaryDataForItem)) {
        closeVisibleImportModalIfPrimaryDataReady();
        return true;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }

    closeVisibleImportModalIfPrimaryDataReady();
    return itemsRef.current
      .filter((item) => item.confirmationState !== "confirmed")
      .every(hasPrimaryDataForItem);
  };

  useEffect(() => {
    if (!open || primaryVisibilityCompletedRef.current) {
      return;
    }

    const interval = window.setInterval(() => {
      const deadline = visibilityDeadlineRef.current;
      if (!deadline || Date.now() < deadline || primaryVisibilityCompletedRef.current) {
        return;
      }

      const hasUnsettledItem = itemsRef.current.some(
        (item) => item.status === "pending" || item.status === "parsing" || item.status === "importing"
      );
      if (hasUnsettledItem || busy) {
        if (hasActiveServerImport(itemsRef.current)) {
          visibilityDeadlineRef.current = null;
          if (visibilityHardStopTimerRef.current) {
            window.clearTimeout(visibilityHardStopTimerRef.current);
            visibilityHardStopTimerRef.current = null;
          }
          return;
        }
        hardStopVisibleImportModal("deadline");
      }
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [busy, open]);

  const buildVisibleImportSummary = (currentItems: QueuedFile[] = itemsRef.current) => {
    const summaries = currentItems
      .map((item): UploadInsightsSummary | null => {
        const localSummary = localPreparseSummaryByItemIdRef.current.get(item.id) ?? null;
        const localPreviewCount = Array.isArray(localSummary?.previewTransactions)
          ? localSummary.previewTransactions.length
          : 0;
        const localRowCount = Number(localSummary?.rowsImported ?? 0);
        const itemRowCount = Number(item.importedRows ?? 0);
        const rowsImported = Math.max(
          Number.isFinite(localRowCount) ? localRowCount : 0,
          Number.isFinite(itemRowCount) ? itemRowCount : 0,
          localPreviewCount
        );

        if (localSummary) {
          return {
            ...localSummary,
            rowsImported,
          };
        }

        if (rowsImported <= 0) {
          return null;
        }

        return buildOptimisticUploadSummary(
          item.file.name,
          rowsImported,
          item.targetAccountId,
          null,
          null,
          null,
          item.optimisticAccountId,
          null,
          [],
          null,
          false
        );
      })
      .filter((summary): summary is UploadInsightsSummary => Boolean(summary));

    return combineUploadInsightsSummaries(summaries);
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
      localPreparseSummaryByItemIdRef.current.clear();
      autoCloseAfterStartRef.current = false;
      if (successfulImportAutoCloseTimerRef.current !== null) {
        window.clearTimeout(successfulImportAutoCloseTimerRef.current);
        successfulImportAutoCloseTimerRef.current = null;
      }
      visibilityDeadlineRef.current = null;
      if (visibilityHardStopTimerRef.current) {
        window.clearTimeout(visibilityHardStopTimerRef.current);
        visibilityHardStopTimerRef.current = null;
      }
      accountIdByKeyRef.current.clear();
      setMessage("");
      setValidationNotice(null);
      initialFilesSignatureRef.current = null;
      const serverImportStillActive = hasActiveServerImport(itemsRef.current);
      if (!serverImportStillActive) {
        // Pending client-only rows are not durable work. Keeping them after close
        // poisons retries because the next selection is rejected as a duplicate.
        itemsRef.current = [];
        setItems([]);
        setBusy(false);
        autoStartRef.current = false;
        uploadRunnerActiveRef.current = false;
        if (uploadRunnerTimerRef.current !== null) {
          window.clearTimeout(uploadRunnerTimerRef.current);
          uploadRunnerTimerRef.current = null;
        }
      }
      return;
    }

    // Modal initialization must run once per open session. Queue progress and
    // account updates happen frequently during an import; replaying this block
    // for each update caused hundreds of duplicate Accounts/Transactions reads
    // and left the page feeling locked after the modal docked.
    if (wasOpen) {
      return;
    }

    importActivitySurfaceRef.current = backgroundOnly || launchInBackground ? "background" : "modal";

    router.prefetch("/accounts");
    router.prefetch("/transactions");

    setSelectedAccountId((current) => {
      if (current && accounts.some((account) => account.id === current)) {
        return current;
      }

      return defaultAccountId ?? "";
    });
    setMessage("");
    setValidationNotice(null);
  }, [accounts, backgroundOnly, defaultAccountId, items, launchInBackground, open]);

  useEffect(() => {
    const map = new Map<string, string>();
    for (const account of accounts) {
      map.set(accountKey(account.name, account.institution, account.accountNumber, account.currency ?? null, account.type), account.id);
    }
    accountIdByKeyRef.current = map;
  }, [accounts]);

  useEffect(() => {
    if (!open) {
      setLaunchInBackground(backgroundOnly);
      return;
    }

    return () => {
      importActivitySurfaceRef.current = "background";
      const snapshot = lastImportActivityRef.current;
      if (primaryVisibilityCompletedRef.current) {
        clearImportActivity();
        lastImportActivityRef.current = null;
        return;
      }
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
      localPreparseTextByItemIdRef.current.clear();
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
        item.status === "error" ||
        item.status === "needs_password"
      ) {
        continue;
      }

      if (shouldSkipClientStatementPreparse(item.file.name)) {
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

    accountIdByKeyRef.current.set(
      accountKey(name, institution, accountNumber?.trim() || null, normalizedCurrency, inferredType),
      accountId
    );
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

  const scheduleQueuedImport = (delayMs = 0) => {
    if (uploadRunnerTimerRef.current !== null) {
      window.clearTimeout(uploadRunnerTimerRef.current);
    }

    uploadRunnerTimerRef.current = window.setTimeout(() => {
      uploadRunnerTimerRef.current = null;
      const pendingFiles = itemsRef.current.filter(
        (item) => item.status === "pending" || (item.status === "needs_password" && item.password.trim())
      );
      const hasLockedPasswordFile = itemsRef.current.some(
        (item) => item.status === "needs_password" && !item.password.trim()
      );

      if (!workspaceId || pendingFiles.length === 0 || hasLockedPasswordFile) {
        reportImportClientStage("auto_start_blocked", {
          workspaceReady: Boolean(workspaceId),
          pendingFiles: pendingFiles.length,
          passwordBlocked: hasLockedPasswordFile,
        });
        return;
      }

      if (busyRef.current || uploadRunnerActiveRef.current || !handleStartImportRef.current) {
        reportImportClientStage("auto_start_waiting", {
          busy: busyRef.current,
          runnerActive: uploadRunnerActiveRef.current,
          handlerReady: Boolean(handleStartImportRef.current),
        });
        scheduleQueuedImport(150);
        return;
      }

      autoStartRef.current = false;
      uploadRunnerActiveRef.current = true;
      reportImportClientStage("auto_start_dispatched", {
        pendingFiles: pendingFiles.length,
        instanceId: importModalInstanceIdRef.current,
      });
      void handleStartImportRef.current()
        .catch((error) => {
          reportImportClientStage("auto_start_failed", {
            reason: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
          });
        })
        .finally(() => {
          uploadRunnerActiveRef.current = false;
          if (itemsRef.current.some((item) => item.status === "pending")) {
            scheduleQueuedImport(150);
          }
        });
    }, delayMs);
  };

  const addFiles = (incoming: FileList | File[], options?: { launchInBackground?: boolean }) => {
    const nextFiles = Array.from(incoming);
    if (nextFiles.length === 0) return;

    if (!workspaceId) {
      setValidationNotice("Clover is still loading your workspace. Please wait a moment, then upload again.");
      setMessage("Upload unavailable while Clover finishes loading your workspace.");
      autoStartRef.current = false;
      return;
    }

    let feedbackMessage = "";
    let validationMessage = "";
    let shouldAutoClose = false;
    let additions: QueuedFile[] = [];
    let queuedItemsSnapshot: QueuedFile[] | null = null;
    const shouldLaunchInBackground = Boolean(options?.launchInBackground || backgroundOnly || launchInBackground);
      flushSync(() => {
        setItems((current) => {
        // A file that never reached the server must remain retryable. Replace a
        // stale copy of the same selection instead of silently treating it as a
        // duplicate forever.
        const incomingKeys = new Set(nextFiles.map(fileKey));
        const retainedCurrent = current.filter(
          (item) =>
            !incomingKeys.has(fileKey(item.file)) &&
            item.status !== "error" &&
            item.status !== "done" &&
            item.confirmationState !== "confirmed"
        );
        const existing = new Set(retainedCurrent.map((item) => fileKey(item.file)));
        // The server enforces the monthly upload quota per file. The modal should
        // only cap extreme UI batches, otherwise a stale user-limit payload can
        // accidentally turn a multi-file selection into a one-file import.
        const availableSlots = Math.max(0, MAX_IMPORT_FILES_PER_BATCH - retainedCurrent.length);
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
          if (validationError === "Uploaded files must be 2 MB or smaller.") {
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
        const queuedFileId = crypto.randomUUID();
        const stableImportFileId = crypto.randomUUID();
        const guessedIdentity = guessStatementIdentity(file.name);
        const canUseOptimisticGuess = Boolean(guessedIdentity?.accountName && guessedIdentity.accountNumber);
        const optimisticAccountId = guessedIdentity && canUseOptimisticGuess ? `optimistic-${crypto.randomUUID()}` : null;
        const importMode = inferImportModeForFile(file, selectedImportMode);
        capturePostHogClientEvent("file_upload_started", {
          ...fileAnalyticsBase(file, workspaceId),
          selected_account_id: selectedAccountId || null,
          selected_account_type: selectedAccountId ? accounts.find((account) => account.id === selectedAccountId)?.type ?? null : null,
        });
        return [
          {
            id: queuedFileId,
            file,
            status: "pending" as ImportStatus,
            confirmationState: "none" as ConfirmationState,
            error: null,
            password: "",
            passwordVisible: false,
            importMode,
            importFileId: stableImportFileId,
            targetAccountId: null,
            optimisticAccountId,
            importedRows: null,
            progress: IMPORT_PROGRESS.preparing,
            progressLabel: "Preparing file",
          },
        ];
      });

      if (validationIssues.length > 0 && additions.length > 0) {
        feedbackMessage = `Added ${additions.length} file${additions.length === 1 ? "" : "s"} to the queue.`;
      } else if (validationIssues.length > 0 || skippedTooMany > 0) {
        feedbackMessage = "No files were added.";
      }

      if (validationIssues.length > 0 && skippedTooMany > 0) {
        validationMessage = `Warning: ${validationIssues.join(" ")} Clover also skipped ${skippedTooMany} file${skippedTooMany === 1 ? "" : "s"} over the ${MAX_IMPORT_FILES_PER_BATCH}-file queue limit.`;
      } else if (validationIssues.length > 0) {
        validationMessage = `Warning: ${validationIssues.join(" ")}`;
      } else if (skippedTooMany > 0) {
        feedbackMessage = `Added ${additions.length} file${additions.length === 1 ? "" : "s"}; skipped ${skippedTooMany} file${skippedTooMany === 1 ? "" : "s"} over the ${MAX_IMPORT_FILES_PER_BATCH}-file queue limit.`;
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

          queuedItemsSnapshot = [...retainedCurrent, ...additions];
          return queuedItemsSnapshot;
        });
      });

    // Keep the imperative upload handoff synchronized with the queue immediately;
    // the passive items effect may not have run before the zero-delay starter.
    if (queuedItemsSnapshot) {
      itemsRef.current = queuedItemsSnapshot;
    }

    if (additions.length > 0) {
      primaryVisibilityCompletedRef.current = false;
    }

    if (additions.length > 0) {
      autoStartRef.current = true;
      autoCloseAfterStartRef.current = shouldAutoClose;
      reportImportClientStage("files_queued", {
        fileCount: additions.length,
        workspaceReady: Boolean(workspaceId),
        instanceId: importModalInstanceIdRef.current,
      });
      const pdfAdditions = additions.filter((item) => item.file.name.toLowerCase().endsWith(".pdf"));
      if (pdfAdditions.length === 0) {
        scheduleQueuedImport();
      } else {
        // Probe encrypted PDFs before dispatching their upload request. This is
        // metadata-only, so protected files can prompt immediately without
        // waiting for the server to upload and preflight the full document.
        void Promise.all(
          pdfAdditions.map(async (item) => {
            const isPasswordProtected = await probeFilePasswordProtection(item.file);
            if (!isPasswordProtected) {
              return;
            }

            const currentItem = itemsRef.current.find((entry) => entry.id === item.id);
            if (!currentItem || currentItem.status !== "pending" || currentItem.password.trim()) {
              return;
            }

            requestPasswordForItem(item.id);
          })
        ).finally(() => {
          scheduleQueuedImport();
        });
      }
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
          detail: "Clover is checking the file.",
          summary: null,
          errorMessage: null,
        });
      }
    }

    if (feedbackMessage) {
      setMessage(feedbackMessage);
    }

    if (additions.length === 0) {
      reportImportClientStage("files_rejected_before_queue", {
        fileCount: nextFiles.length,
        workspaceReady: Boolean(workspaceId),
      });
    }

    setValidationNotice(validationMessage || null);
  };

  const addDroppedFiles = (incoming: FileList | File[]) => {
    addFiles(incoming);
  };

  const updateItem = (id: string, patch: Partial<QueuedFile>) => {
    const nextItems = itemsRef.current.map((item) => {
        if (item.id !== id) {
          return item;
        }

        if (
          (item.status === "done" || item.confirmationState === "confirmed") &&
          patch.status &&
          patch.status !== "done"
        ) {
          return {
            ...item,
            importFileId: patch.importFileId ?? item.importFileId,
            targetAccountId: patch.targetAccountId ?? item.targetAccountId,
            importedRows: patch.importedRows ?? item.importedRows,
          };
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
      });

    // Queue decisions run from refs between React commits. Keep the ref in sync
    // immediately so a just-completed file cannot be dispatched again while its
    // state update is still batched.
    itemsRef.current = nextItems;
    setItems(nextItems);
  };

  const requestPasswordForItem = (itemId: string, wrongPassword = false) => {
    const currentItem = itemsRef.current.find((entry) => entry.id === itemId);
    if (!currentItem) {
      return;
    }

    // A password prompt ends this monitor attempt. The unlocked retry must be
    // allowed to begin a fresh observer for the same import file.
    startedImportMonitorKeys.delete(`${importModalInstanceIdRef.current}:${workspaceId}:${currentItem.importFileId ?? ""}`);

    const passwordMessage = wrongPassword
      ? `Wrong password for ${currentItem.file.name}.`
      : `${currentItem.file.name} is password-protected. Enter the password to continue.`;
    setLaunchInBackground(false);
    updateItem(itemId, {
      status: "needs_password",
      confirmationState: "staged",
      error: passwordMessage,
      password: "",
      passwordVisible: false,
      progress: 0,
      progressLabel: "Password needed",
    });
    publishImportActivity({
      workspaceId,
      surface: importActivitySurfaceRef.current,
      status: "active",
      fileName: currentItem.file.name,
      fileIndex: itemsRef.current.findIndex((entry) => entry.id === itemId) + 1,
      fileTotal: itemsRef.current.length,
      completedFiles: completedFileCount,
      progress: 0,
      detail: "This file needs a password",
      summary: null,
      errorMessage: passwordMessage,
    });
  };

  useEffect(() => {
    return subscribeImportActivity(() => {
      const currentActivity = readImportActivity();
      const previousActivity = lastImportActivityRef.current;
      if (currentActivity || previousActivity?.status !== "active") {
        return;
      }

      const batchStillRunning =
        Number(previousActivity.fileTotal ?? 0) > 0 &&
        Number(previousActivity.completedFiles ?? 0) < Number(previousActivity.fileTotal ?? 0);
      if (batchStillRunning) {
        lastImportActivityRef.current = null;
        return;
      }

      const canRetireVisibleImport = itemsRef.current.some(
        (item) =>
          ((item.status === "importing" || item.status === "parsing") && item.progress >= IMPORT_PROGRESS.uploading) ||
          item.confirmationState === "confirmed" ||
          Number(item.importedRows ?? 0) > 0
      );
      if (!canRetireVisibleImport) {
        return;
      }

      // An activity-store update can race the modal's final server response.
      // Settle the visible modal instead of closing it: closing here makes a
      // successful import indistinguishable from a failed/disconnected upload.
      hardStopVisibleImportModal("visible");
    });
  }, [onClose]);

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
      closeImportAfterError(itemId, stage, fileName, message);
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

    const resolvedSummaryAccountName = formatUploadAccountDisplayName(
      summaryContext.accountName ?? summaryContext.fileName,
      summaryContext.institution ?? null,
      summaryContext.accountNumber ?? null,
      summaryContext.accountType ?? null
    );

    let finalizingProgress = 90;
    let lastKnownConfirmedRows = 0;
    let lastKnownAccountBalance: string | null = null;
    const finalizingTimer = window.setInterval(() => {
      finalizingProgress = Math.min(IMPORT_PROGRESS.finalizing, finalizingProgress + 1);
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
      // Background confirmation is a lightweight wait while the worker owns
      // the save. Give it enough time to observe a durable result rather than
      // publishing an optimistic success before the UI can read the rows.
      const maxStagedAttempts = backgroundOnly ? 90 : 15;
      for (let stagedAttempt = 0; stagedAttempt < maxStagedAttempts; stagedAttempt += 1) {
        const visibilityDeadline = visibilityDeadlineRef.current;
        if (!backgroundOnly && visibilityDeadline && Date.now() >= visibilityDeadline) {
          hardStopVisibleImportModal("deadline");
          return { status: "staged", importedRows: lastKnownConfirmedRows || null, summary: null };
        }

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
          if (recoverableConfirmError && stagedAttempt < maxStagedAttempts - 1) {
            emitItemUpdate({
              status: "importing",
              confirmationState: "pending",
              progress: Math.max(90, finalizingProgress),
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
              progress: Math.max(90, finalizingProgress),
              detail: "Clover is still finalizing the import",
              summary: null,
              errorMessage: null,
            });
            await new Promise((resolve) => window.setTimeout(resolve, 500));
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
            progress: Math.max(90, finalizingProgress),
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
            progress: Math.max(90, finalizingProgress),
            detail: "Clover is still lining things up",
            summary: null,
            errorMessage: null,
          });
          if (stagedAttempt < maxStagedAttempts - 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 500));
            continue;
          }
          return {
            status: "staged",
            importedRows,
            summary: null,
          };
        }

        const accountBalance = typeof confirmed.result?.accountBalance === "string" ? confirmed.result.accountBalance : null;
        lastKnownAccountBalance = accountBalance;
        const insightSummary = confirmed.result?.insightSummary ?? null;
        const confirmedAccountSummaries = normalizeServerAccountSummaries(confirmed.result?.accountSummaries);
        const resolvedAccountType = (
          summaryContext.accountType ??
          accounts.find((account) => account.id === resolvedAccountId)?.type ??
          inferAccountTypeFromStatement(summaryContext.institution, summaryContext.accountName, "bank")
        ) as UploadInsightsSummary["accountType"];
        const summary = buildResolvedOptimisticUploadSummary({
          accounts,
          workspaceId,
          fileName: summaryContext.fileName,
          importedRows,
          accountId: resolvedAccountId,
          accountName: resolvedSummaryAccountName,
          institution: summaryContext.institution ?? null,
          accountNumber: summaryContext.accountNumber ?? null,
          accountType: resolvedAccountType ?? null,
          optimisticAccountId: resolvedAccountId.startsWith("optimistic-") ? summaryContext.optimisticAccountId ?? resolvedAccountId : null,
          balanceSources: [accountBalance],
          // The local preview is useful while parsing, but its transfer type
          // can be provisional. Once confirmation succeeds, let the workspace
          // refresh render the committed rows rather than briefly replacing
          // them with the parser's preliminary classification.
          previewTransactions: [],
          insightMetrics: insightSummary,
          accountSummaries: confirmedAccountSummaries.length > 0 ? confirmedAccountSummaries : undefined,
          optimistic: false,
        });
        seedImportedWorkspaceCaches(workspaceId, summary);
        await Promise.resolve(onImported(summary));

        triggerImportEnrichment(importFileId);
        const settledVisible = await waitForSettledVisibility(
          itemId,
          importFileId,
          resolvedAccountId,
          importedRows,
          summary.balance ?? null,
          "Import confirmation succeeded before settled data became visible"
        );
        if (!settledVisible) {
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
          progressLabel: "Visible in Clover",
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
          detail: "Accounts and transactions are visible. Clover will keep cleaning up names and categories in the background.",
          summary,
          errorMessage: null,
        });
        window.setTimeout(closeVisibleImportModalIfPrimaryDataReady, 0);
        capturePostHogClientEvent("import_confirmed", {
          workspace_id: workspaceId || null,
          file_name: summaryContext.fileName,
          file_type: summaryContext.fileName.split(".").pop()?.toUpperCase() ?? "FILE",
          transaction_count: importedRows,
          institution: summaryContext.institution ?? null,
          amount_total: summary ? summary.incomeTotal + summary.expenseTotal : null,
          currency: "PHP",
        });
        capturePostHogClientEvent("transaction_confirmation_completed", {
          workspace_id: workspaceId || null,
          transaction_count: importedRows,
          institution: summaryContext.institution ?? null,
          source_surface: importActivitySurfaceRef.current,
        });
        return { status: "done", importedRows, summary };
      }

      if (
        lastKnownConfirmedRows > 0 ||
        Boolean(lastKnownAccountBalance) ||
        Boolean(summaryContext.accountName || summaryContext.accountNumber || summaryContext.institution) ||
        Boolean(resolvedAccountId)
      ) {
        const resolvedAccountType = (
          summaryContext.accountType ??
          accounts.find((account) => account.id === resolvedAccountId)?.type ??
          inferAccountTypeFromStatement(summaryContext.institution, summaryContext.accountName, "bank")
        ) as UploadInsightsSummary["accountType"];
        const rowsImported = Math.max(lastKnownConfirmedRows, summaryContext.previewTransactions?.length ?? 0);
        const summary = buildResolvedOptimisticUploadSummary({
          accounts,
          workspaceId,
          fileName: summaryContext.fileName,
          importedRows: rowsImported,
          accountId: resolvedAccountId,
          accountName: resolvedSummaryAccountName,
          institution: summaryContext.institution ?? null,
          accountNumber: summaryContext.accountNumber ?? null,
          accountType: resolvedAccountType ?? null,
          optimisticAccountId: resolvedAccountId.startsWith("optimistic-") ? summaryContext.optimisticAccountId ?? resolvedAccountId : null,
          balanceSources: [lastKnownAccountBalance],
          previewTransactions: summaryContext.previewTransactions,
          optimistic: false,
        });
        seedImportedWorkspaceCaches(workspaceId, summary);
        await Promise.resolve(onImported(summary));
        emitItemUpdate({
          status: "done",
          confirmationState: "confirmed",
          progress: 100,
          progressLabel: "Done",
          targetAccountId: resolvedAccountId,
          importedRows: rowsImported,
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
          detail: "Accounts and transactions are visible. Clover will keep cleaning up names and categories in the background.",
          summary,
          errorMessage: null,
        });
        return {
          status: "done",
          importedRows: rowsImported,
          summary,
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
          return "Accounts and transactions are visible. Clover is cleaning up names and categories in the background.";
        }

        if (resolved.accountName || resolved.institution) {
          return "Accounts and transactions are visible. Clover is cleaning up categories in the background.";
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

  const waitForSettledVisibility = async (
    itemId: string,
    importFileId: string,
    accountId: string | null,
    importedRows: number,
    expectedBalance: string | null,
    warningMessage: string
  ) => {
    updateItem(itemId, {
      status: "importing",
      confirmationState: "staged",
      importFileId,
      targetAccountId: accountId,
      importedRows,
      progress: 99,
      progressLabel: "Making transactions visible",
    });
    setMessage("Clover saved the import and is making the transactions visible in your workspace.");
    publishImportActivity({
      workspaceId,
      surface: importActivitySurfaceRef.current,
      status: "active",
      importFileId,
      fileName: itemsRef.current.find((item) => item.id === itemId)?.file.name ?? null,
      fileIndex: Math.max(1, itemsRef.current.findIndex((item) => item.id === itemId) + 1),
      fileTotal: itemsRef.current.length,
      completedFiles: completedFileCount,
      progress: 99,
      detail: "Clover saved the import and is making the transactions visible.",
      summary: null,
      errorMessage: null,
    });

    const settledVisible = await waitForImportSettledVisibility({
      importFileId,
      accountId,
      importedRows,
      expectedBalance,
      timeoutMs: 30_000,
    });

    if (settledVisible) {
      return true;
    }

    console.warn(warningMessage, { importFileId, accountId, importedRows });
    closeImportAfterError(
      itemId,
      "confirm",
      itemsRef.current.find((item) => item.id === itemId)?.file.name ?? "this file",
      "Clover saved the file, but the transactions are taking longer than expected to appear. Nothing was discarded. Keep this window open and retry this import status in a moment."
    );
    return false;
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
    const monitorKey = `${importModalInstanceIdRef.current}:${workspaceId}:${importFileId}`;
    if (startedImportMonitorKeys.has(monitorKey)) {
      reportImportClientStage("monitor_reused", {
        importFileId,
        instanceId: importModalInstanceIdRef.current,
      });
      return;
    }
    startedImportMonitorKeys.add(monitorKey);
    window.setTimeout(() => startedImportMonitorKeys.delete(monitorKey), 10 * 60 * 1000);

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
      closeImportAfterError(itemId, stage, fileName, message);
    };
    const emitImportRecoverable = (fileName: string, detail: string, progressLabel = "Review needed") => {
      if (!backgroundOnly) {
        closeImportAsRecoverable(itemId, fileName, detail, progressLabel);
      }
    };
    let seededFallbackSummary = false;
    let queuedResumeAttempted = false;
    const startedAt = Date.now();
    const queuedImportPollDelayMs = () => Math.min(1_000, 500 + Math.floor((Date.now() - startedAt) / 15_000) * 250);
    const requiresVisibleRows =
      shouldRequireVisibleRowsForImport(summaryContext.fileName) || importContextLooksWise(summaryContext);
    const allowFilenameFallbackIdentity = !isGenericMobileScreenshotFileName(summaryContext.fileName);
    const MAX_WAIT_MS = backgroundOnly ? IMPORT_BACKGROUND_HARD_STOP_MS : requiresVisibleRows ? 75_000 : 180_000;
    let latestResolvedAccountId: string | null = accountId && !accountId.startsWith("optimistic-") ? accountId : null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      try {
        const visibilityDeadline = visibilityDeadlineRef.current;
        if (!backgroundOnly && visibilityDeadline && Date.now() >= visibilityDeadline) {
          if (hasActiveServerImport(itemsRef.current)) {
            visibilityDeadlineRef.current = null;
            if (visibilityHardStopTimerRef.current) {
              window.clearTimeout(visibilityHardStopTimerRef.current);
              visibilityHardStopTimerRef.current = null;
            }
          } else {
            hardStopVisibleImportModal("deadline");
            return;
          }
        }

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
        const visibleImportComplete = Boolean(payload.visibleImportComplete || confirmedTransactionsCount > 0);
        const suppressUnionBankPreview = isLikelyLowQualityUnionBankStatementFile(summaryContext.fileName);
        const statusAccountSummaries = normalizeServerAccountSummaries(payload.accountSummaries);
        const primaryStatusAccountSummary =
          statusAccountSummaries.find((summary) => summary.accountId === latestResolvedAccountId) ??
          statusAccountSummaries[0] ??
          null;
        const finalizationNeedsReview = Boolean(payload.finalizationNeedsReview);
        const processingPhase = typeof importFile?.processingPhase === "string" ? importFile.processingPhase : null;
        const processingMessage = typeof importFile?.processingMessage === "string" ? importFile.processingMessage : null;
        const passwordRequired =
          processingPhase === "password_required" || /password-protected|password required/i.test(processingMessage ?? "");
        const statusAccountId =
          typeof importFile?.accountId === "string" && importFile.accountId.trim() && !importFile.accountId.startsWith("optimistic-")
            ? importFile.accountId.trim()
            : null;
        if (statusAccountId) {
          latestResolvedAccountId = statusAccountId;
        }
        if (!latestResolvedAccountId && primaryStatusAccountSummary?.accountId) {
          latestResolvedAccountId = primaryStatusAccountSummary.accountId;
        }
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
          (primaryStatusAccountSummary
            ? {
                accountName: primaryStatusAccountSummary.accountName,
                institution: primaryStatusAccountSummary.institution,
                accountNumber: primaryStatusAccountSummary.accountNumber,
                accountType:
                  primaryStatusAccountSummary.accountType ??
                  inferAccountTypeFromStatement(
                    primaryStatusAccountSummary.institution,
                    primaryStatusAccountSummary.accountName,
                    "bank"
                  ),
              }
            : null) ??
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
        const resolvedSummaryAccountName = resolvedAccountDisplayName;
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
        const hasVisibleImportDataSignal = Boolean(
          visibleImportComplete ||
          parsedRowsCount > 0 ||
            confirmedTransactionsCount > 0 ||
            checkpointBalance ||
            checkpointAccountId ||
            processingIdentity?.accountName ||
            processingIdentity?.accountNumber
        );
        const hasRowBackedVisibility = confirmedTransactionsCount > 0 || visibleImportComplete;
        const visibleProgressSignal = requiresVisibleRows ? hasRowBackedVisibility : hasVisibleImportDataSignal;
        const visualRepairGraceActive =
          isRecoverableVisualUploadFileName(summaryContext.fileName) &&
          parsedRowsCount === 0 &&
          confirmedTransactionsCount === 0 &&
          Date.now() - startedAt < VISUAL_IMPORT_REPAIR_GRACE_MS;

        // Password-required is terminal for this attempt. Check it before any
        // optimistic visibility or recovery path so preliminary metadata cannot
        // hide the password prompt.
        if (passwordRequired) {
          requestPasswordForItem(itemId, Boolean(itemsRef.current.find((item) => item.id === itemId)?.password.trim()));
          return;
        }

        if (processingPhase === "account_match_needs_confirmation") {
          closeImportAfterError(
            itemId,
            "confirm",
            summaryContext.fileName,
            processingMessage ?? "Clover needs confirmation before recreating an account that was previously deleted."
          );
          return;
        }

        if (finalizationNeedsReview && visibleImportComplete) {
          triggerImportEnrichment(importFileId);
          emitItemUpdate({
            status: "done",
            confirmationState: "confirmed",
            progress: 100,
            progressLabel: "Review needed",
            targetAccountId: latestResolvedAccountId ?? accountId,
            importedRows: confirmedTransactionsCount || parsedRowsCount || null,
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
            detail: "Accounts and transactions are visible. Some details could not be finalized automatically; please review them.",
            summary: null,
            errorMessage: null,
          });
          return;
        }

        if (importFile?.status === "failed" && parsedRowsCount === 0 && confirmedTransactionsCount === 0) {
          if (visualRepairGraceActive) {
            emitItemUpdate({
              status: "importing",
              confirmationState: "pending",
              error: null,
              errorCode: null,
              errorTitle: null,
              errorNextSteps: null,
              progress: IMPORT_PROGRESS.uploading,
              progressLabel: "Running backup reader",
              targetAccountId: latestResolvedAccountId ?? accountId,
            });
            emitImportActivity({
              workspaceId,
              surface: importActivitySurfaceRef.current,
              status: "active",
              fileName: summaryContext.fileName,
              fileIndex: items.findIndex((item) => item.id === itemId) + 1,
              fileTotal: items.length,
              completedFiles: completedFileCount,
              progress: IMPORT_PROGRESS.uploading,
              detail: "Clover is retrying this visual statement with the backup reader.",
              summary: null,
              errorMessage: null,
            });
            await sleep(500);
            continue;
          }

          if (visibleProgressSignal) {
            emitImportRecoverable(
              summaryContext.fileName,
              "Account details are visible. Clover will keep cleaning up names and categories in the background.",
              "Visible in Clover"
            );
            return;
          }

          if (hasRecoverableImportSignal && attempt < 6) {
            await sleep(queuedImportPollDelayMs());
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

        if (Date.now() - startedAt >= MAX_WAIT_MS) {
          if (backgroundOnly) {
            closeImportAfterError(
              itemId,
              "monitor",
              summaryContext.fileName,
              processingMessage ?? "Timed out while Clover was still reading the document."
            );
            return;
          }

          const hasRecoverableProgress =
            parsedRowsCount > 0 ||
            confirmedTransactionsCount > 0 ||
            (!requiresVisibleRows && Boolean(latestResolvedAccountId || checkpointAccountId));
          if (hasRecoverableProgress) {
            emitImportRecoverable(
              summaryContext.fileName,
              "Clover is still working on this import in the background. Rows are not visible yet, so this upload has been moved out of the active modal.",
              "Still processing"
            );
          } else {
            emitImportError(
              "background",
              summaryContext.fileName,
              processingMessage ?? "Clover could not show reliable rows from this statement in time."
            );
          }
          return;
        }

        if (!visibleImportComplete) {
          const shouldAutoResumeQueuedImportNow = shouldAutoResumeQueuedImport({
            backgroundOnly,
            resumeAttempted: queuedResumeAttempted,
            canResume,
            processingPhase,
            parsedRowsCount,
            confirmedTransactionsCount,
            updatedAt: importFile?.updatedAt,
          });

          if (shouldAutoResumeQueuedImportNow) {
            queuedResumeAttempted = true;
            emitItemUpdate({
              status: "importing",
              confirmationState: "pending",
              progress: Math.max(IMPORT_PROGRESS.parsing, IMPORT_PROGRESS.uploading),
              progressLabel: "Starting import",
              targetAccountId: latestResolvedAccountId ?? accountId,
            });
            emitImportActivity({
              workspaceId,
              surface: importActivitySurfaceRef.current,
              status: "active",
              fileName: summaryContext.fileName,
              fileIndex: items.findIndex((item) => item.id === itemId) + 1,
              fileTotal: items.length,
              completedFiles: completedFileCount,
              progress: Math.max(IMPORT_PROGRESS.parsing, IMPORT_PROGRESS.uploading),
              detail: "Clover is starting this import directly because the background queue has not picked it up yet.",
              summary: null,
              errorMessage: null,
            });
            await fetch(`/api/imports/${importFileId}/resume`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
            }).catch(() => null);
            await sleep(queuedImportPollDelayMs());
            continue;
          }

          const waitingProgress = Math.max(
            IMPORT_PROGRESS.uploading,
            Math.min(
              90,
              parsedRowsCount > 0 || visibleProgressSignal
                ? IMPORT_PROGRESS.loadingAccount
                : processingPhase === "identifying_transactions"
                  ? IMPORT_PROGRESS.parsing
                  : IMPORT_PROGRESS.uploading
            )
          );
          const waitingLabel =
            telemetryLabel ??
            processingMessage ??
            (parsedRowsCount > 0 || visibleProgressSignal
              ? "Saving visible rows"
              : processingPhase === "identifying_transactions"
                ? "Reading transactions"
                : "Uploading statement");
          emitItemUpdate({
            status: "importing",
            confirmationState: "pending",
            progress: waitingProgress,
            progressLabel: waitingLabel,
            targetAccountId: latestResolvedAccountId ?? accountId,
          });
          emitImportActivity({
            workspaceId,
            surface: importActivitySurfaceRef.current,
            status: "active",
            fileName: summaryContext.fileName,
            fileIndex: items.findIndex((item) => item.id === itemId) + 1,
            fileTotal: items.length,
            completedFiles: completedFileCount,
            progress: waitingProgress,
            detail: getTelemetryDetail(
              parsedRowsCount > 0 || visibleProgressSignal
                ? "Clover is saving the account and transactions so they stay visible."
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
          await sleep(queuedImportPollDelayMs());
          continue;
        }

        if (importFile?.status === "processing" && processingPhase && confirmedTransactionsCount === 0) {
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
          if (
            !suppressUnionBankPreview &&
            !seededFallbackSummary &&
            parsedRowsCount > 0 &&
            !allowFilenameFallbackIdentity &&
            !processingIdentity?.accountName &&
            !processingIdentity?.institution &&
            !summaryContext.accountName &&
            !summaryContext.institution
          ) {
            const previewResponse = await fetch(`/api/imports/${importFileId}/preview`);
            const previewPayload = previewResponse.ok ? await previewResponse.json().catch(() => null) : null;
            const parsedRows = Array.isArray(previewPayload?.parsedRows)
              ? previewPayload.parsedRows.filter((row: unknown): row is Record<string, unknown> =>
                  Boolean(row && typeof row === "object" && !Array.isArray(row))
                )
              : [];
            const identityRow =
              parsedRows.find(
                (row: Record<string, unknown>) =>
                  typeof row.accountName === "string" &&
                  row.accountName.trim() &&
                  typeof row.institution === "string" &&
                  row.institution.trim()
              ) ?? parsedRows[0] ?? null;
            const previewAccountName =
              typeof identityRow?.accountName === "string" && identityRow.accountName.trim()
                ? identityRow.accountName.trim()
                : null;
            const previewInstitution =
              typeof identityRow?.institution === "string" && identityRow.institution.trim()
                ? identityRow.institution.trim()
                : null;
            const previewAccountNumber =
              typeof identityRow?.accountNumber === "string" && identityRow.accountNumber.trim()
                ? identityRow.accountNumber.trim()
                : null;
            const previewAccountType =
              typeof identityRow?.accountType === "string" &&
              ["bank", "wallet", "credit_card", "cash", "investment", "other"].includes(identityRow.accountType)
                ? (identityRow.accountType as UploadInsightsSummary["accountType"])
                : /^(?:GCash|Maya)$/i.test(previewInstitution ?? "")
                  ? "wallet"
                  : summaryContext.accountType ?? null;

            if (previewAccountName || previewInstitution || previewAccountNumber) {
              const previewAccountId = await ensureTargetAccountId(
                previewAccountName,
                previewInstitution,
                previewAccountType,
                previewAccountNumber,
                stableOptimisticBalance,
                null
              );
              const previewTransactions = previewAccountId
                ? buildOptimisticPreviewTransactions(parsedRows, {
                    importFileId,
                    accountId: previewAccountId,
                    accountName: previewAccountName ?? previewInstitution ?? "Wallet",
                    institution: previewInstitution,
                    accountNumber: previewAccountNumber,
                  })
                : [];
              if (previewAccountId && previewTransactions.length > 0) {
                const previewSummary = buildResolvedOptimisticUploadSummary({
                  accounts,
                  workspaceId,
                  fileName: summaryContext.fileName,
                  importedRows: Math.max(parsedRowsCount, previewTransactions.length),
                  accountId: previewAccountId,
                  accountName: previewAccountName,
                  institution: previewInstitution,
                  accountNumber: previewAccountNumber,
                  accountType: previewAccountType ?? null,
                  optimisticAccountId: summaryContext.optimisticAccountId,
                  balanceSources: [stableOptimisticBalance],
                  previewTransactions,
                });

                seededFallbackSummary = true;
                latestResolvedAccountId = previewAccountId;
                seedImportedWorkspaceCaches(workspaceId, previewSummary);
                await Promise.resolve(onImported(previewSummary));
                emitItemUpdate({
                  status: "done",
                  confirmationState: "confirmed",
                  progress: 100,
                  progressLabel: "Done",
                  targetAccountId: previewAccountId,
                  importedRows: Math.max(parsedRowsCount, previewTransactions.length),
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
                  detail: "Accounts and transactions are visible. Clover will keep cleaning up names and categories in the background.",
                  summary: previewSummary,
                  errorMessage: null,
                });
                void confirmItemImport(
                  itemId,
                  importFileId,
                  previewAccountId,
                  {
                    fileName: summaryContext.fileName,
                    accountName: previewSummary.accountName,
                    institution: previewSummary.institution,
                    accountNumber: previewSummary.accountNumber ?? null,
                    accountType: previewSummary.accountType,
                    optimisticAccountId: summaryContext.optimisticAccountId,
                    previewTransactions,
                  },
                  { backgroundOnly: true }
                ).catch((error) => {
                  console.warn("Background mobile wallet screenshot confirmation failed after visible import", {
                    importFileId,
                    error: error instanceof Error ? error.message : String(error),
                  });
                });
                return;
              }
            }
          }
          if (
            !suppressUnionBankPreview &&
            !seededFallbackSummary &&
            (parsedRowsCount > 0 || Boolean(processingIdentity?.accountName || processingIdentity?.institution)) &&
            (allowFilenameFallbackIdentity || Boolean(processingIdentity?.accountName || processingIdentity?.institution))
          ) {
            const persistedFallbackAccountId =
              accountId && !accountId.startsWith("optimistic-")
                ? accountId
                : await ensureTargetAccountId(
                    processingIdentity?.accountName ?? summaryContext.fallbackAccountName,
                    processingIdentity?.institution ?? null,
                    processingIdentity?.accountType ?? summaryContext.accountType ?? null,
                    processingIdentity?.accountNumber ?? null,
                    stableOptimisticBalance,
                    null
                  );
            const fallbackAccountId =
              persistedFallbackAccountId ??
              (summaryContext.optimisticAccountId && summaryContext.optimisticAccountId.trim()
                ? summaryContext.optimisticAccountId
                : null);
            latestResolvedAccountId = fallbackAccountId;
            const fallbackPreviewTransactions =
              summaryContext.previewTransactions && summaryContext.previewTransactions.length > 0
                ? summaryContext.previewTransactions
                : await loadOptimisticPreviewTransactions(
                    importFileId,
                    fallbackAccountId ?? "",
                    resolvedAccountDisplayName,
                    processingIdentity?.institution ?? null,
                    processingIdentity?.accountNumber ?? summaryContext.accountNumber ?? null
                  )
                    .catch(() => [])
                    .then((rows) =>
                      rows.length > 0
                        ? rows
                        : loadOrGetKnownPreviewTransactions({
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
            const fallbackSummary = buildResolvedOptimisticUploadSummary({
              accounts,
              workspaceId,
              fileName: summaryContext.fileName,
              importedRows: parsedRowsCount || 0,
              accountId: fallbackAccountId,
              accountName: resolvedAccountDisplayName,
              institution: processingIdentity?.institution ?? null,
              accountNumber: processingIdentity?.accountNumber ?? summaryContext.accountNumber ?? null,
              accountType: processingIdentity?.accountType ?? summaryContext.accountType ?? null,
              optimisticAccountId: summaryContext.optimisticAccountId,
              balanceSources: [stableOptimisticBalance],
              previewTransactions: fallbackPreviewTransactions,
            });

            seededFallbackSummary = true;
            seedImportedWorkspaceCaches(workspaceId, fallbackSummary);
            await Promise.resolve(onImported(fallbackSummary));
            if (parsedRowsCount > 0 && fallbackPreviewTransactions.length > 0) {
              emitItemUpdate({
                status: "done",
                confirmationState: "confirmed",
                progress: 100,
                progressLabel: "Done",
                targetAccountId: fallbackAccountId,
                importedRows: Math.max(parsedRowsCount, fallbackPreviewTransactions.length),
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
                detail: "Accounts and transactions are visible. Clover will keep cleaning up names and categories in the background.",
                summary: fallbackSummary,
                errorMessage: null,
              });
              if (fallbackAccountId && !fallbackAccountId.startsWith("optimistic-")) {
                void confirmItemImport(
                  itemId,
                  importFileId,
                  fallbackAccountId,
                  {
                    fileName: summaryContext.fileName,
                    accountName: fallbackSummary.accountName,
                    institution: fallbackSummary.institution,
                    accountNumber: fallbackSummary.accountNumber ?? null,
                    accountType: fallbackSummary.accountType,
                    optimisticAccountId: summaryContext.optimisticAccountId,
                    previewTransactions: fallbackPreviewTransactions,
                  },
                  { backgroundOnly: true }
                ).catch((error) => {
                  console.warn("Background raw-row confirmation failed after visible import", {
                    importFileId,
                    error: error instanceof Error ? error.message : String(error),
                  });
                });
              }
              return;
            }
            emitItemUpdate({
              status: "importing",
              confirmationState: "pending",
              progress: Math.max(
                IMPORT_PROGRESS.loadingAccount,
                Math.min(90, IMPORT_PROGRESS.loadingAccount + Number(importFile.processingAttempt ?? 0))
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
                Math.min(90, IMPORT_PROGRESS.loadingAccount + Number(importFile.processingAttempt ?? 0))
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
              processingIdentity?.accountName ??
              summaryContext.accountName ??
              (allowFilenameFallbackIdentity ? summaryContext.fallbackAccountName : null);
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
            await sleep(queuedImportPollDelayMs());
            continue;
          }
        }

        const hasMobileWalletPreviewRows = Boolean(
          summaryContext.previewTransactions?.some((transaction) => {
            const identityText = `${transaction.accountName ?? ""} ${summaryContext.accountName ?? ""} ${summaryContext.institution ?? ""}`;
            return /gcash|maya/i.test(identityText);
          })
        );
        const hasSettledRows =
          visibleImportComplete ||
          (importFile?.status === "done" &&
            hasMobileWalletPreviewRows &&
            Boolean(latestResolvedAccountId || primaryStatusAccountSummary?.accountId));

        if (hasSettledRows) {
          triggerImportEnrichment(importFileId);
          if (statusAccountSummaries.length > 1) {
            const finalizedSummaries: UploadInsightsSummary[] = [];
            for (const accountSummary of statusAccountSummaries) {
              const summaryAccountName = accountSummary.accountName ?? resolvedAccountDisplayName;
              const summaryInstitution =
                accountSummary.institution ?? processingIdentity?.institution ?? summaryContext.institution ?? null;
              const summaryAccountType =
                accountSummary.accountType ?? processingIdentity?.accountType ?? summaryContext.accountType ?? null;
              const summaryPreviewTransactions = await loadOrGetKnownPreviewTransactions({
                workspaceId,
                importFileId,
                accountId: accountSummary.accountId,
                optimisticAccountId: summaryContext.optimisticAccountId,
                accountName: summaryAccountName,
                institution: summaryInstitution,
                accountNumber: accountSummary.accountNumber,
                accountType: summaryAccountType,
                previewTransactions: summaryContext.previewTransactions,
              });
              const accountFinalizedSummary = buildResolvedOptimisticUploadSummary({
                accounts,
                workspaceId,
                fileName: summaryContext.fileName,
                importedRows: accountSummary.rowsImported || summaryPreviewTransactions.length,
                accountId: accountSummary.accountId,
                accountName: summaryAccountName,
                institution: summaryInstitution,
                accountNumber: accountSummary.accountNumber,
                accountType: summaryAccountType,
                optimisticAccountId: summaryContext.optimisticAccountId,
                balanceSources: [accountSummary.balance, stableOptimisticBalance],
                previewTransactions: summaryPreviewTransactions,
                accountSummaries: [accountSummary],
                optimistic: false,
              });

              finalizedSummaries.push(accountFinalizedSummary);
              seedImportedWorkspaceCaches(workspaceId, accountFinalizedSummary);
              await Promise.resolve(onImported(accountFinalizedSummary));
            }

            const combinedFinalizedSummary = combineUploadInsightsSummaries(finalizedSummaries);
            if (backgroundOnly) {
              return;
            }

            emitItemUpdate({
              status: "done",
              confirmationState: "confirmed",
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
              summary: combinedFinalizedSummary,
              errorMessage: null,
            });
            return;
          }

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
                ? await loadOrGetKnownPreviewTransactions({
                    workspaceId,
                    importFileId,
                    accountId: completedAccountId,
                    optimisticAccountId: summaryContext.optimisticAccountId,
                    accountName: resolvedAccountDisplayName,
                    institution: processingIdentity?.institution ?? summaryContext.institution ?? null,
                    accountNumber: processingIdentity?.accountNumber ?? summaryContext.accountNumber ?? null,
                    accountType: processingIdentity?.accountType ?? summaryContext.accountType,
                    previewTransactions: summaryContext.previewTransactions,
                  })
                : [];
          const finalizedSummary: UploadInsightsSummary = {
            ...buildResolvedOptimisticUploadSummary({
              accounts,
              workspaceId,
              fileName: summaryContext.fileName,
              importedRows:
                primaryStatusAccountSummary?.rowsImported ||
                (confirmedTransactionsCount > 0 ? confirmedTransactionsCount : parsedRowsCount),
              accountId: primaryStatusAccountSummary?.accountId ?? completedAccountId,
              accountName: primaryStatusAccountSummary?.accountName ?? resolvedAccountDisplayName,
              institution: primaryStatusAccountSummary?.institution ?? processingIdentity?.institution ?? summaryContext.institution ?? null,
              accountNumber:
                primaryStatusAccountSummary?.accountNumber ?? processingIdentity?.accountNumber ?? summaryContext.accountNumber ?? null,
              accountType: primaryStatusAccountSummary?.accountType ?? processingIdentity?.accountType ?? summaryContext.accountType ?? null,
              optimisticAccountId: summaryContext.optimisticAccountId,
              balanceSources: [primaryStatusAccountSummary?.balance, stableOptimisticBalance],
              previewTransactions: fallbackPreviewTransactions,
              accountSummaries: statusAccountSummaries.length > 0 ? statusAccountSummaries : undefined,
              optimistic: false,
            }),
            optimisticAccountId: null,
          };
          seedImportedWorkspaceCaches(workspaceId, finalizedSummary);
          await Promise.resolve(onImported(finalizedSummary));
          if (backgroundOnly) {
            return;
          }

          emitItemUpdate({
            status: "done",
            confirmationState: "confirmed",
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
            summary: finalizedSummary,
            errorMessage: null,
          });
          return;
        }

        if (importFile?.status === "done" && !hasSettledRows) {
          emitItemUpdate({
            status: "importing",
            confirmationState: "pending",
            progress: IMPORT_PROGRESS.loadingAccount,
            progressLabel: "Loading transactions",
            targetAccountId: latestResolvedAccountId && !latestResolvedAccountId.startsWith("optimistic-") ? latestResolvedAccountId : null,
          });
          emitImportActivity({
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
                accountName: processingIdentity?.accountName ?? summaryContext.accountName,
                institution: processingIdentity?.institution ?? summaryContext.institution,
                accountNumber: processingIdentity?.accountNumber ?? summaryContext.accountNumber,
              },
              parsedRowsCount
            ),
            summary: null,
            errorMessage: null,
          });
          await sleep(queuedImportPollDelayMs());
          continue;
        }

        if (Date.now() - startedAt >= MAX_WAIT_MS) {
          const hasRecoverableProgress =
            Boolean(importFileId) || parsedRowsCount > 0 || confirmedTransactionsCount > 0;
          if (hasRecoverableProgress) {
            emitImportRecoverable(
              summaryContext.fileName,
              "Clover parsed the file and is still linking it to the account.",
              "Finalizing import"
            );
            return;
          }

          const timeoutMessage = `Timed out after ${Math.round(MAX_WAIT_MS / 1000)} seconds while Clover was still reading the document.`;
          emitImportError("monitor", summaryContext.fileName, timeoutMessage);
          return;
        }

        if (importFile?.status === "done" || parsedRowsCount > 0) {
          const statementConfidence = Number(statementMetadata?.confidence ?? 0);
          const trustStatementIdentity = statementConfidence >= 70;
          const metadataAccountName =
            typeof statementMetadata?.accountName === "string" && statementMetadata.accountName.trim()
              ? statementMetadata.accountName.trim()
              : null;
          const metadataInstitution =
            typeof statementMetadata?.institution === "string" && statementMetadata.institution.trim()
              ? statementMetadata.institution.trim()
              : null;
          const metadataAccountNumber =
            typeof statementMetadata?.accountNumber === "string" && statementMetadata.accountNumber.trim()
              ? statementMetadata.accountNumber.trim()
              : null;
          const metadataAccountType =
            typeof statementMetadata?.accountType === "string" &&
            ["bank", "wallet", "credit_card", "cash", "investment", "other"].includes(statementMetadata.accountType)
              ? (statementMetadata.accountType as UploadInsightsSummary["accountType"])
              : null;
          const resolvedIdentity = {
            accountName: metadataAccountName ?? processingIdentity?.accountName ?? summaryContext.accountName,
            institution: metadataInstitution ?? processingIdentity?.institution ?? summaryContext.institution,
            accountNumber: metadataAccountNumber ?? processingIdentity?.accountNumber ?? summaryContext.accountNumber,
            accountType: metadataAccountType ?? processingIdentity?.accountType ?? summaryContext.accountType,
            balance: toBalanceString(statementCheckpoint?.endingBalance),
          };
          const resolvedAccountType = (resolvedIdentity.accountType ??
            accounts.find((account) => account.id === (latestResolvedAccountId ?? accountId ?? ""))?.type ??
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

          const shouldUseFallbackIdentity =
            allowFilenameFallbackIdentity && !resolvedIdentity.accountName && !resolvedIdentity.institution && attempt >= 4;
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
                typeof previewRow?.accountName === "string" && previewRow.accountName.trim()
                  ? previewRow.accountName.trim()
                  : summaryContext.accountName;
              resolvedIdentity.institution =
                typeof previewRow?.institution === "string" && previewRow.institution.trim()
                  ? previewRow.institution.trim()
                  : summaryContext.institution;
            }
          }

          if (!resolvedIdentity.accountName && !resolvedIdentity.institution && shouldUseFallbackIdentity) {
            resolvedIdentity.accountName = summaryContext.fallbackAccountName;
            resolvedIdentity.institution = processingIdentity?.institution ?? summaryContext.institution ?? null;
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
                await sleep(queuedImportPollDelayMs());
                continue;
              }
              latestResolvedAccountId = fallbackAccountId;
              const fallbackPreviewTransactions =
                summaryContext.previewTransactions && summaryContext.previewTransactions.length > 0
                  ? summaryContext.previewTransactions
                : await loadOptimisticPreviewTransactions(
                    importFileId,
                    fallbackAccountId ?? "",
                    resolvedAccountDisplayName,
                    null,
                    summaryContext.accountNumber ?? null
                  ).catch(() => []);
              const fallbackSummary = buildOptimisticUploadSummary(
                summaryContext.fileName,
                0,
                fallbackAccountId,
                resolvedAccountDisplayName,
                null,
                null,
                summaryContext.optimisticAccountId,
                stableOptimisticBalance,
                fallbackPreviewTransactions,
                summaryContext.accountNumber ?? null
              );

              seededFallbackSummary = true;
              emitItemUpdate({
                status: "importing",
                progress: Math.max(IMPORT_PROGRESS.parsing, Math.min(IMPORT_PROGRESS.loadingAccount, IMPORT_PROGRESS.parsing + attempt * 0.5)),
                progressLabel: "Reading file details",
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
              emitItemUpdate({
                status: "importing",
                progress: Math.max(IMPORT_PROGRESS.parsing, Math.min(IMPORT_PROGRESS.loadingAccount, IMPORT_PROGRESS.parsing + attempt * 0.5)),
                progressLabel: telemetryLabel ?? "Reading file details",
                targetAccountId: accountId,
              });
              emitImportActivity({
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
            await sleep(queuedImportPollDelayMs());
            continue;
          }

          const hasValidCurrentAccount = Boolean(
            accountId &&
              !accountId.startsWith("optimistic-") &&
              accounts.some((account) => account.id === accountId)
          );
          let resolvedAccountId = hasValidCurrentAccount ? accountId : null;
          if (hasValidCurrentAccount && (trustStatementIdentity || Boolean(resolvedIdentity.accountName || resolvedIdentity.institution))) {
            const currentAccountId = accountId as string;
            const syncAccountName = resolvedIdentity.accountName ?? summaryContext.fallbackAccountName;
            const syncInstitution = resolvedIdentity.institution ?? summaryContext.institution;
            void syncStatementAccountIdentity(
              currentAccountId,
              resolvedAccountDisplayName || syncAccountName,
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
            emitItemUpdate({
              status: "importing",
              progress: IMPORT_PROGRESS.loadingAccount,
              progressLabel: telemetryLabel ?? "Finalizing import",
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
              progress: IMPORT_PROGRESS.loadingAccount,
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
            await sleep(queuedImportPollDelayMs());
            continue;
          }

          if (!suppressUnionBankPreview) {
            emitItemUpdate({
              status: "importing",
              confirmationState: "pending",
              progress: IMPORT_PROGRESS.finalizing,
              progressLabel: "Saving transactions",
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
              progress: IMPORT_PROGRESS.finalizing,
              detail: "Clover is saving transactions to your workspace.",
              summary: null,
              errorMessage: null,
            });
          } else {
            emitItemUpdate({
              status: "importing",
              confirmationState: "pending",
              progress: Math.max(IMPORT_PROGRESS.loadingAccount, 90),
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
              progress: Math.max(IMPORT_PROGRESS.loadingAccount, 90),
              detail: "Clover is finalizing this UnionBank import.",
              summary: null,
              errorMessage: null,
            });
          }

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
                emitItemUpdate({
                  status: "done",
                  confirmationState: "confirmed",
                  progress: 100,
                  progressLabel: "Visible in Clover",
                  targetAccountId: resolvedAccountId,
                  importedRows: result.importedRows ?? null,
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
                  detail: "Accounts and transactions are visible. Clover will keep cleaning up names and categories in the background.",
                  summary: result.summary,
                  errorMessage: null,
                });
                window.setTimeout(closeVisibleImportModalIfPrimaryDataReady, 0);
                return;
              }

              if (result.status === "staged" && Number(result.importedRows ?? 0) > 0) {
                const completedSummary = buildResolvedOptimisticUploadSummary({
                  accounts,
                  workspaceId,
                  fileName: summaryContext.fileName,
                  importedRows: Number(result.importedRows ?? 0),
                  accountId: resolvedAccountId,
                  accountName: resolvedAccountDisplayName,
                  institution: resolvedIdentity.institution ?? summaryContext.institution ?? null,
                  accountNumber: resolvedIdentity.accountNumber ?? summaryContext.accountNumber ?? null,
                  accountType: resolvedAccountType ?? null,
                  optimisticAccountId: null,
                  balanceSources: [summaryContext.initialBalance],
                  previewTransactions: summaryContext.previewTransactions,
                });
                seedImportedWorkspaceCaches(workspaceId, completedSummary);
                await Promise.resolve(onImported(completedSummary));
                emitItemUpdate({
                  status: "done",
                  confirmationState: "confirmed",
                  progress: 100,
                  progressLabel: "Done",
                  targetAccountId: resolvedAccountId,
                  importedRows: Number(result.importedRows ?? 0),
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
                  detail: "Transactions are in Clover. Names and categories may need review.",
                  summary: completedSummary,
                  errorMessage: null,
                });
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

        emitItemUpdate({
          status: "importing",
          progress: Math.max(IMPORT_PROGRESS.parsing, Math.min(IMPORT_PROGRESS.loadingAccount, IMPORT_PROGRESS.parsing + attempt * 0.5)),
          progressLabel: "Reading file details",
          targetAccountId: accountId,
        });
        emitImportActivity({
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
        const errorMessage = error instanceof Error ? error.message : String(error ?? "");
        const transientFetchFailure = /failed to fetch|networkerror|load failed|abort/i.test(errorMessage);
        const latestItem = itemsRef.current.find((entry) => entry.id === itemId);
        const latestImportedRows = Number(latestItem?.importedRows ?? 0);
        if (latestItem?.status === "done" || latestItem?.confirmationState === "confirmed" || latestImportedRows > 0) {
          return;
        }

        const recoveredStatus = await fetch(`/api/imports/${importFileId}/status`, { cache: "no-store" })
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null) as ImportStatusPayload | null;
        const recoveredConfirmedRows = Number(recoveredStatus?.confirmedTransactionsCount ?? 0);
        const recoveredParsedRows = Number(recoveredStatus?.parsedRowsCount ?? 0);
        const recoveredVisible =
          Boolean(recoveredStatus?.visibleImportComplete) ||
          recoveredConfirmedRows > 0 ||
          recoveredStatus?.importFile?.status === "done";
        if (recoveredVisible) {
          triggerImportEnrichment(importFileId);
          emitItemUpdate({
            status: "done",
            confirmationState: "confirmed",
            progress: 100,
            progressLabel: "Done",
            targetAccountId:
              latestResolvedAccountId ??
              (typeof recoveredStatus?.importFile?.accountId === "string" ? recoveredStatus.importFile.accountId : null) ??
              accountId,
            importedRows: recoveredConfirmedRows || recoveredParsedRows || latestImportedRows || null,
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
            detail: "Accounts and transactions are visible. Clover will keep cleaning up names and categories in the background.",
            summary: null,
            errorMessage: null,
          });
          return;
        }

        if (transientFetchFailure && latestItem?.importFileId && Date.now() - startedAt < MAX_WAIT_MS) {
          emitItemUpdate({
            status: "importing",
            confirmationState: "pending",
            progress: Math.max(IMPORT_PROGRESS.loadingAccount, 90),
            progressLabel: "Finalizing import",
            targetAccountId: latestResolvedAccountId ?? accountId,
          });
          emitImportActivity({
            workspaceId,
            surface: importActivitySurfaceRef.current,
            status: "active",
            fileName: summaryContext.fileName,
            fileIndex: items.findIndex((item) => item.id === itemId) + 1,
            fileTotal: items.length,
            completedFiles: completedFileCount,
            progress: Math.max(IMPORT_PROGRESS.loadingAccount, 90),
            detail: "Clover is still finalizing this import",
            summary: null,
            errorMessage: null,
          });
          await sleep(queuedImportPollDelayMs());
          continue;
        }
        capturePostHogClientEvent("import_retry_failed", {
          workspace_id: workspaceId,
          import_file_id: importFileId,
          file_name: summaryContext.fileName,
          retry_reason: "background_confirmation",
          error_code: getImportErrorCode(error),
        });
        emitImportError("monitor", summaryContext.fileName, errorMessage || null);
        return;
      }

      await sleep(queuedImportPollDelayMs());
    }

    const latestItem = itemsRef.current.find((entry) => entry.id === itemId);
    if (latestItem?.importFileId) {
      emitImportRecoverable(
        summaryContext.fileName,
        "Clover parsed the file and is still linking it to the account.",
        "Finalizing import"
      );
      return;
    }

    emitImportError(
      "monitor",
      summaryContext.fileName,
      `Timed out after ${Math.round(MAX_WAIT_MS / 60_000)} minutes while Clover was still finalizing this import.`
    );
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
      const key = accountKey(
        normalizedStatementAccountName,
        institution ?? null,
        accountNumber ?? null,
        currency ?? null,
        accountType ?? null
      );
      const persistedExisting =
        accounts.find(
          (account) =>
            !account.id.startsWith("optimistic-") &&
            accountKey(account.name, account.institution, account.accountNumber, account.currency ?? null, account.type) === key
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
          accountKey(
            genericMatch.name,
            genericMatch.institution,
            genericMatch.accountNumber,
            genericMatch.currency ?? null,
            genericMatch.type
          ),
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
            accountKey(
              matchedAccount.name,
              matchedAccount.institution,
              matchedAccount.accountNumber,
              matchedAccount.currency ?? null,
              matchedAccount.type
            ),
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
      const key = accountKey(
        normalizedStatementAccountName,
        institution ?? null,
        accountNumber ?? null,
        null,
        null
      );
      const persistedExisting =
        accounts.find(
          (account) =>
            !account.id.startsWith("optimistic-") &&
            accountKey(account.name, account.institution, account.accountNumber, account.currency ?? null, account.type) === key
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
    if (
      !item ||
      item.confirmationState === "confirmed" ||
      item.status === "done" ||
      item.status === "error" ||
      item.status === "needs_password"
    ) {
      return;
    }

    if (shouldSkipClientStatementPreparse(item.file.name)) {
      return;
    }

    localPreparseStartedRef.current.add(itemId);
    // Local scanning is advisory; keep the item pending so auto-start can hand it to the server.
    updateItem(itemId, getLocalPreparseProgressPatch(item.progress));
    publishImportActivity({
      workspaceId,
      surface: importActivitySurfaceRef.current,
      status: "active",
      importFileId: item.importFileId ?? item.id,
      fileName: item.file.name,
      fileIndex: itemsRef.current.findIndex((entry) => entry.id === itemId) + 1,
      fileTotal: itemsRef.current.length,
      completedFiles: completedFileCount,
      progress: Math.max(IMPORT_PROGRESS.preparing, Number(item.progress ?? 0)),
      detail: "Clover is scanning the file locally",
      summary: null,
      errorMessage: null,
    });

    try {
      const itemImportMode = inferImportModeForFile(item.file, item.importMode ?? "statement");
      const knownBpiScreenshot = itemImportMode === "statement" && isKnownBpiMobileScreenshotFile(item.file.name);
      const text = knownBpiScreenshot
        ? buildBpiMobileScreenshotFallbackText(item.file.name) ?? ""
        : await extractTextFromFile(item.file, item.password.trim() || undefined);
      if (text.trim()) {
        localPreparseTextByItemIdRef.current.set(itemId, text);
      }
      if (itemImportMode === "receipt") {
        const receiptPreview = parseReceiptText(text);
        const receiptPreviewQuality = assessReceiptPreviewQuality(receiptPreview);
        if (!receiptPreview.billDate || !receiptPreview.total || !receiptPreviewQuality.reliableForFastPath) {
          return;
        }

        const receiptAccountCandidates = accounts.map((account) => ({
          id: account.id,
          name: account.name,
          institution: account.institution ?? null,
          accountNumber: account.accountNumber ?? null,
          type: account.type,
          currency: account.currency ?? null,
        }));
        const receiptHint = receiptPreview.receiptAccountMatch
          ? resolveReceiptAccountHintToAccount(receiptPreview.receiptAccountMatch, receiptAccountCandidates)
          : null;
        const matchedReceiptAccount = receiptHint
          ? accounts.find((account) => account.id === receiptHint.accountId) ?? null
          : null;
        const cashAccount = resolveCashAccountOption(accounts);
        const targetAccount = matchedReceiptAccount ?? cashAccount;
        if (!targetAccount) {
          return;
        }

        const summary = buildReceiptOptimisticSummary(
          item.file.name,
          item.importFileId ?? item.id,
          receiptPreview,
          targetAccount,
          (params) =>
            buildOptimisticUploadSummary(
              params.fileName,
              params.importedRows,
              params.accountId,
              params.accountName,
              params.institution,
              params.accountType,
              params.optimisticAccountId ?? null,
              params.balance ?? null,
              params.previewTransactions,
              params.accountNumber ?? null,
              params.showBalanceEvenIfEmpty ?? false
            )
        );
        localPreparseSummaryByItemIdRef.current.set(itemId, summary);
        return;
      }

      const localMetadata = detectStatementMetadata(text, item.file.name);
      const guessedIdentity = guessStatementIdentity(item.file.name);
      if (itemImportMode !== "statement") {
        return;
      }
      const parsedRows = parseImportText(text, item.file.name, fileTypeLabel(item.file), {
        institution: localMetadata?.institution ?? guessedIdentity?.institution ?? null,
        accountName: localMetadata?.accountName ?? guessedIdentity?.accountName ?? null,
        accountNumber: localMetadata?.accountNumber ?? guessedIdentity?.accountNumber ?? null,
      });
      const mobileWalletIdentity = resolveMobileWalletIdentityFromParsedRows(parsedRows as Array<Record<string, unknown>>);
      const parsedRowIdentity = resolveStatementIdentityFromParsedRows(parsedRows as Array<Record<string, unknown>>);
      const parsedAccountGroupCount = countDistinctStatementAccountsFromParsedRows(parsedRows as Array<Record<string, unknown>>);

      if (!localMetadata && parsedRows.length === 0) {
        return;
      }

      const shouldPreferParsedRowIdentity =
        isImageImportFile(item.file) && Boolean(parsedRowIdentity?.accountName || parsedRowIdentity?.institution || parsedRowIdentity?.accountNumber);
      const preferredStatementIdentity = shouldPreferParsedRowIdentity ? parsedRowIdentity : localMetadata;
      const fallbackStatementIdentity = shouldPreferParsedRowIdentity ? localMetadata : parsedRowIdentity;

      const accountName =
        mobileWalletIdentity?.accountName ??
        preferredStatementIdentity?.accountName ??
        fallbackStatementIdentity?.accountName ??
        guessedIdentity?.accountName ??
        deriveStatementFallbackAccountName(
          item.file.name,
          mobileWalletIdentity?.institution ??
            preferredStatementIdentity?.institution ??
            fallbackStatementIdentity?.institution ??
            guessedIdentity?.institution ??
            null,
          mobileWalletIdentity?.accountNumber ??
            preferredStatementIdentity?.accountNumber ??
            fallbackStatementIdentity?.accountNumber ??
            guessedIdentity?.accountNumber ??
            null,
          (mobileWalletIdentity?.accountType ?? localMetadata?.accountType ?? null) as UploadInsightsSummary["accountType"] | null
        );
      const institution =
        mobileWalletIdentity?.institution ??
        preferredStatementIdentity?.institution ??
        fallbackStatementIdentity?.institution ??
        guessedIdentity?.institution ??
        null;
      const accountNumber =
        mobileWalletIdentity?.accountNumber ??
        preferredStatementIdentity?.accountNumber ??
        fallbackStatementIdentity?.accountNumber ??
        guessedIdentity?.accountNumber ??
        null;
      if (/^UCPB$/i.test(institution ?? "") && !accountNumber) {
        return;
      }
      if (!accountName && !institution && parsedRows.length === 0) {
        return;
      }
      if (!mobileWalletIdentity && parsedAccountGroupCount > 1) {
        const readRowString = (row: Record<string, unknown>, key: string) => {
          const direct = row[key];
          if (typeof direct === "string" && direct.trim()) {
            return direct.trim();
          }

          const rawPayload =
            row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
              ? (row.rawPayload as Record<string, unknown>)
              : null;
          const payloadValue = rawPayload?.[key];
          return typeof payloadValue === "string" && payloadValue.trim() ? payloadValue.trim() : null;
        };
        const readRowBalance = (row: Record<string, unknown>) => {
          const rawPayload =
            row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
              ? (row.rawPayload as Record<string, unknown>)
              : null;
          return toBalanceString(
            rawPayload?.statementEndingBalance ?? rawPayload?.balance ?? rawPayload?.endingBalance ?? null
          );
        };
        const isAccountSnapshotMarker = (row: Record<string, unknown>) => {
          const rawPayload =
            row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
              ? (row.rawPayload as Record<string, unknown>)
              : null;
          return rawPayload?.kind === "account_snapshot_marker";
        };
        const groupedRows = new Map<
          string,
          {
            accountName: string | null;
            institution: string | null;
            accountNumber: string | null;
            rows: typeof parsedRows;
          }
        >();

        for (const row of parsedRows as Array<Record<string, unknown>>) {
          const rowAccountName = readRowString(row, "accountName");
          const rowInstitution = readRowString(row, "institution");
          const rowAccountNumber = readRowString(row, "accountNumber");
          if (!rowAccountName && !rowInstitution && !rowAccountNumber) {
            continue;
          }

          const groupKey = [
            (rowInstitution ?? "").toLowerCase(),
            (rowAccountNumber ?? "").replace(/\D/g, ""),
            (rowAccountName ?? "").toLowerCase(),
          ].join("::");
          const existingGroup = groupedRows.get(groupKey);
          if (existingGroup) {
            existingGroup.rows.push(row as (typeof parsedRows)[number]);
            continue;
          }

          groupedRows.set(groupKey, {
            accountName: rowAccountName,
            institution: rowInstitution,
            accountNumber: rowAccountNumber,
            rows: [row as (typeof parsedRows)[number]],
          });
        }

        if (groupedRows.size > 0) {
          const localImportFileId = item.importFileId ?? item.id;
          const groupedSummaries: UploadInsightsSummary[] = [];

          for (const group of groupedRows.values()) {
            const previewRows = group.rows.filter((row) => !isAccountSnapshotMarker(row as Record<string, unknown>));
            const accountType = inferAccountTypeFromStatement(
              group.institution,
              group.accountName,
              "bank"
            ) as UploadInsightsSummary["accountType"];
            const resolvedAccountId = resolveLocalAccountId(
              group.accountName,
              group.institution,
              group.accountNumber
            );
            const optimisticAccountId = resolvedAccountId.startsWith("optimistic-") ? resolvedAccountId : null;
            const balance =
              readRowBalance(group.rows.at(-1) as Record<string, unknown>) ??
              toBalanceString(getTrailingBalanceFromParsedRows(group.rows)) ??
              null;
            const previewAccountName = group.accountName ?? group.institution ?? "Imported account";
            const summary = buildOptimisticUploadSummary(
              item.file.name,
              previewRows.length,
              resolvedAccountId,
              group.accountName,
              group.institution,
              accountType,
              optimisticAccountId,
              balance,
              buildOptimisticPreviewTransactions(previewRows, {
                importFileId: localImportFileId,
                accountId: resolvedAccountId,
                accountName: previewAccountName,
                institution: group.institution,
                accountNumber: group.accountNumber,
              }),
              group.accountNumber,
              true
            );

            groupedSummaries.push(summary);
            seedImportedWorkspaceCaches(workspaceId, summary);
            await Promise.resolve(onImported(summary));
          }

          const combinedSummary = combineUploadInsightsSummaries(groupedSummaries);
          if (combinedSummary) {
            localPreparseSummaryByItemIdRef.current.set(itemId, combinedSummary);
          }
          updateItem(itemId, {
            importFileId: localImportFileId,
            targetAccountId: groupedSummaries[0]?.accountId ?? null,
            importedRows: parsedRows.length,
            progressLabel: "Preview ready",
          });
          window.setTimeout(closeVisibleImportModalIfPrimaryDataReady, 0);
        }
        return;
      }
      const accountType = (mobileWalletIdentity?.accountType ?? localMetadata?.accountType ??
        inferAccountTypeFromStatement(institution, accountName, "bank")) as UploadInsightsSummary["accountType"];
      const endingBalance = mobileWalletIdentity
        ? null
        : toBalanceString(localMetadata?.endingBalance ?? getTrailingBalanceFromParsedRows(parsedRows) ?? null);

      const currentItem = itemsRef.current.find((entry) => entry.id === itemId);
      if (!currentItem || currentItem.status === "done" || currentItem.status === "error" || currentItem.confirmationState === "confirmed") {
        return;
      }

      const resolvedAccountId = resolveLocalAccountId(accountName, institution, accountNumber);
      const optimisticAccountId = resolvedAccountId.startsWith("optimistic-") ? resolvedAccountId : null;
      const localImportFileId = item.importFileId ?? item.id;
      const previewAccountName = accountName ?? institution ?? "Imported account";

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
          importFileId: localImportFileId,
          accountId: resolvedAccountId,
          accountName: previewAccountName,
          institution,
          accountNumber,
        }),
        accountNumber,
        true
      );

      seedImportedWorkspaceCaches(workspaceId, summary);
      localPreparseSummaryByItemIdRef.current.set(itemId, summary);
      await Promise.resolve(onImported(summary));
      updateItem(itemId, {
        importFileId: localImportFileId,
        targetAccountId: resolvedAccountId,
        importedRows: parsedRows.length,
        progressLabel: parsedRows.length > 0 ? "Preview ready" : "Reading locally",
      });
      window.setTimeout(closeVisibleImportModalIfPrimaryDataReady, 0);

      if (accountName || institution || accountNumber) {
        void ensureTargetAccountId(
          accountName,
          institution,
          accountType,
          accountNumber,
          endingBalance,
          parsedRows[0]?.currency ?? null
        )
          .then(async (persistedAccountId) => {
            if (!persistedAccountId || persistedAccountId === resolvedAccountId) {
              return;
            }

            const persistedSummary = {
              ...summary,
              accountId: persistedAccountId,
              optimisticAccountId: optimisticAccountId ?? summary.optimisticAccountId ?? null,
              previewTransactions: summary.previewTransactions?.map((transaction) => ({
                ...transaction,
                accountId: persistedAccountId,
              })),
            } satisfies UploadInsightsSummary;

            seedImportedWorkspaceCaches(workspaceId, persistedSummary);
            localPreparseSummaryByItemIdRef.current.set(itemId, persistedSummary);
            await Promise.resolve(onImported(persistedSummary));
            updateItem(itemId, {
              targetAccountId: persistedAccountId,
            });
          })
          .catch(() => null);
      }
    } catch (error) {
      if (uploadCancelRequestedRef.current) {
        updateItem(itemId, {
          status: "error",
          confirmationState: "staged",
          error: "Upload canceled.",
          errorCode: null,
          errorTitle: "Upload canceled",
          errorNextSteps: null,
          progress: item.progress,
          progressLabel: "Canceled",
        });
        return { status: "error", importedRows: null, summary: null };
      }

      if (isPasswordError(error)) {
        // Password detection during the advisory browser scan must not stop the
        // upload. The server owns password handling and backup-parser routing.
        return;
      }
      // Browser-local preparse is best-effort only. The server path still finalizes the import.
    }
  }

  const removeItem = (id: string) => {
    localPreparseSummaryByItemIdRef.current.delete(id);
    localPreparseTextByItemIdRef.current.delete(id);
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
    fileName: string,
    options?: {
      deliverSummary?: boolean;
      keepWatchingAfterVisible?: boolean;
    }
  ): Promise<{ completed: boolean; summary: UploadInsightsSummary | null }> => {
    const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const startedAt = Date.now();
    const MAX_WAIT_MS = importMode === "receipt" ? 240_000 : importMode === "statement" ? 120_000 : 20_000;
    const timeoutDurationLabel =
      MAX_WAIT_MS >= 60_000
        ? `${Math.round(MAX_WAIT_MS / 60_000)} minute${Math.round(MAX_WAIT_MS / 60_000) === 1 ? "" : "s"}`
        : `${Math.round(MAX_WAIT_MS / 1000)} seconds`;
    const deliverSummary = options?.deliverSummary ?? true;
    const keepWatchingAfterVisible = options?.keepWatchingAfterVisible ?? false;
    const progressLabel =
      importMode === "receipt"
        ? "Reading receipt in background"
        : importMode === "portfolio"
          ? "Reading portfolio in background"
          : importMode === "account_detail"
            ? "Reading file details in background"
            : importMode === "notes"
              ? "Reading notes in background"
              : "Reading document in background";
    const doneLabel =
      importMode === "receipt"
        ? "Receipt imported"
        : importMode === "portfolio"
          ? "Portfolio screenshot imported"
          : importMode === "account_detail"
            ? "File details imported"
            : importMode === "notes"
              ? "Notes screenshot imported"
              : "Screenshot imported";

    const statusPollDelayMs = 1_500;
    for (let attempt = 0; attempt < Math.ceil(MAX_WAIT_MS / statusPollDelayMs); attempt += 1) {
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
      const visualRepairGraceActive =
        isRecoverableVisualUploadFileName(fileName) &&
        parsedRowsCount === 0 &&
        confirmedTransactionsCount === 0 &&
        Date.now() - startedAt < VISUAL_IMPORT_REPAIR_GRACE_MS;
      const statusDecision = resolveImportModalStatusDecision({
        importMode,
        status: importStatus,
        processingPhase,
        processingMessage,
        telemetryPhase,
        telemetryLabel,
        telemetryMessage,
        parsedRowsCount,
        confirmedTransactionsCount,
        visibleImportComplete: Boolean(payload.visibleImportComplete),
        hasStructuredReceiptVisibility: Boolean(payload.receiptTransaction),
        processingAttempt: importFile?.processingAttempt ?? null,
        progressFloor:
          processingPhase === "reading_account_details" || processingPhase === "finalizing"
            ? IMPORT_PROGRESS.finalizing
            : IMPORT_PROGRESS.parsing,
      });

      if (statusDecision.kind === "repair_needed") {
        if (visualRepairGraceActive) {
          updateItem(itemId, {
            status: "importing",
            confirmationState: "pending",
            error: null,
            errorCode: null,
            errorTitle: null,
            errorNextSteps: null,
            progress: Math.max(IMPORT_PROGRESS.uploading, statusDecision.progress),
            progressLabel: "Running backup reader",
          });
          publishImportActivity({
            workspaceId,
            surface: importActivitySurfaceRef.current,
            status: "active",
            fileName,
            fileIndex: items.findIndex((item) => item.id === itemId) + 1,
            fileTotal: items.length,
            completedFiles: completedFileCount,
            progress: Math.max(IMPORT_PROGRESS.uploading, statusDecision.progress),
            detail: "Clover is switching this file to the backup reader.",
            summary: null,
            errorMessage: null,
          });
          await sleep(statusPollDelayMs);
          continue;
        }
        closeImportAfterError(itemId, "background", fileName, statusDecision.message);
        return { completed: false, summary: null };
      }

      if (importStatus === "failed") {
        if (statusDecision.kind === "visible") {
          closeImportAsRecoverable(
            itemId,
            fileName,
            "The file is visible in Clover. Clover will keep cleaning up names and categories in the background.",
            statusDecision.progressLabel
          );
          return { completed: true, summary: null };
        }
        if (visualRepairGraceActive) {
          updateItem(itemId, {
            status: "importing",
            confirmationState: "pending",
            error: null,
            errorCode: null,
            errorTitle: null,
            errorNextSteps: null,
            progress: IMPORT_PROGRESS.uploading,
            progressLabel: "Running backup reader",
          });
          publishImportActivity({
            workspaceId,
            surface: importActivitySurfaceRef.current,
            status: "active",
            fileName,
            fileIndex: items.findIndex((item) => item.id === itemId) + 1,
            fileTotal: items.length,
            completedFiles: completedFileCount,
            progress: IMPORT_PROGRESS.uploading,
            detail: "Clover is retrying this visual file with the backup reader.",
            summary: null,
            errorMessage: null,
          });
          await sleep(statusPollDelayMs);
          continue;
        }
        closeImportAfterError(
          itemId,
          "background",
          fileName,
          processingMessage ?? "Clover couldn't finish reading this file."
        );
        return { completed: false, summary: null };
      }

      if (importMode === "receipt") {
        const receiptAccountId =
          typeof importFile?.accountId === "string" && importFile.accountId.trim()
            ? importFile.accountId.trim()
            : typeof payload.receiptDocument?.accountId === "string" && payload.receiptDocument.accountId.trim()
              ? payload.receiptDocument.accountId.trim()
              : null;
        const accountOption = findAccountOptionById(accounts, receiptAccountId);
        const localReceiptSummary = localPreparseSummaryByItemIdRef.current.get(itemId) ?? null;
        const receiptTransactionSummary =
          payload.receiptTransaction
            ? buildReceiptSummaryFromReceiptTransaction(
                {
                  fileName,
                  importFileId,
                  receiptTransaction: payload.receiptTransaction,
                  accountType: (accountOption?.type as UploadAccountType) ?? null,
                },
                (params) =>
                  buildOptimisticUploadSummary(
                    params.fileName,
                    params.importedRows,
                    params.accountId,
                    params.accountName,
                    params.institution,
                    params.accountType,
                    params.optimisticAccountId ?? null,
                    params.balance ?? null,
                    params.previewTransactions,
                    params.accountNumber ?? null,
                    params.showBalanceEvenIfEmpty ?? false
                  )
              )
            : null;
        const receiptSummary =
          receiptTransactionSummary ??
          (payload.receiptDocument
            ? buildReceiptSummaryFromReceiptDocument(
                {
                  fileName,
                  importFileId,
                  receiptDocument: payload.receiptDocument,
                  accountId: receiptAccountId,
                  accountType: (accountOption?.type as UploadAccountType) ?? null,
                  previewAccountName: accountOption?.name ?? null,
                },
                (params) =>
                  buildOptimisticUploadSummary(
                    params.fileName,
                    params.importedRows,
                    params.accountId,
                    params.accountName,
                    params.institution,
                    params.accountType,
                    params.optimisticAccountId ?? null,
                    params.balance ?? null,
                    params.previewTransactions,
                    params.accountNumber ?? null,
                    params.showBalanceEvenIfEmpty ?? false
                  )
              )
            : null) ??
          localReceiptSummary;

        const receiptHasStructuredVisibility =
          Boolean(payload.receiptTransaction) ||
          confirmedTransactionsCount > 0;

        if (receiptSummary && receiptHasStructuredVisibility) {
          const receiptImportedRows = Math.max(
            1,
            Number(receiptSummary.rowsImported ?? 0),
            Number(confirmedTransactionsCount ?? 0)
          );
          const settledVisible = await waitForSettledVisibility(
            itemId,
            importFileId,
            receiptSummary.accountId ?? receiptAccountId ?? null,
            receiptImportedRows,
            receiptSummary.balance ?? null,
            "Receipt confirmation succeeded before its transaction became visible"
          );
          if (!settledVisible) {
            return { completed: false, summary: receiptSummary };
          }
          updateItem(itemId, {
            status: "done",
            confirmationState: "confirmed",
            progress: 100,
            progressLabel: doneLabel,
            targetAccountId: receiptSummary.accountId ?? receiptAccountId ?? null,
          });
          if (deliverSummary) {
            seedImportedWorkspaceCaches(workspaceId, receiptSummary);
            await Promise.resolve(onImported(receiptSummary));
          }
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
            summary: deliverSummary ? receiptSummary : null,
            errorMessage: null,
          });
          window.setTimeout(closeVisibleImportModalIfPrimaryDataReady, 0);
          if (
            itemsRef.current.length > 0 &&
            itemsRef.current.every((entry) => entry.status === "done" || entry.confirmationState === "confirmed")
          ) {
            primaryVisibilityCompletedRef.current = true;
            scheduleSuccessfulImportAutoClose();
          }
          if (keepWatchingAfterVisible && !payload.receiptTransaction && importStatus !== "done") {
            void monitorQueuedDocumentImport(itemId, importFileId, importMode, fileName, {
              deliverSummary: false,
              keepWatchingAfterVisible: false,
            }).finally(() => router.refresh());
          } else {
            router.refresh();
          }
          return { completed: true, summary: receiptSummary };
        }

        if (importStatus === "failed") {
          if (statusDecision.kind === "visible") {
            closeImportAsRecoverable(
              itemId,
              fileName,
              "The file is visible in Clover. Clover will keep cleaning up names and categories in the background.",
              statusDecision.progressLabel
            );
            return { completed: true, summary: null };
          }
          if (visualRepairGraceActive) {
            updateItem(itemId, {
              status: "importing",
              confirmationState: "pending",
              error: null,
              errorCode: null,
              errorTitle: null,
              errorNextSteps: null,
              progress: IMPORT_PROGRESS.uploading,
              progressLabel: "Running backup reader",
            });
            publishImportActivity({
              workspaceId,
              surface: importActivitySurfaceRef.current,
              status: "active",
              fileName,
              fileIndex: items.findIndex((item) => item.id === itemId) + 1,
              fileTotal: items.length,
              completedFiles: completedFileCount,
              progress: IMPORT_PROGRESS.uploading,
              detail: "Clover is retrying this visual file with the backup reader.",
              summary: null,
              errorMessage: null,
            });
            await sleep(statusPollDelayMs);
            continue;
          }
          closeImportAfterError(
            itemId,
            "background",
            fileName,
            processingMessage ?? "Clover couldn't finish reading this file."
          );
          return { completed: false, summary: null };
        }

        if (importStatus === "done") {
          updateItem(itemId, {
            status: "importing",
            confirmationState: "pending",
            progress: IMPORT_PROGRESS.finalizing,
            progressLabel: "Making transaction visible",
            targetAccountId: receiptAccountId ?? null,
          });
          publishImportActivity({
            workspaceId,
            surface: importActivitySurfaceRef.current,
            status: "active",
            fileName,
            fileIndex: items.findIndex((item) => item.id === itemId) + 1,
            fileTotal: items.length,
            completedFiles: completedFileCount,
            progress: IMPORT_PROGRESS.finalizing,
            detail: "Receipt imported; waiting for the transaction to appear",
            summary: null,
            errorMessage: null,
          });
          await sleep(statusPollDelayMs);
          continue;
        }

        updateItem(itemId, {
          status: "importing",
          progress: Math.max(statusDecision.progress, Number(itemsRef.current.find((item) => item.id === itemId)?.progress ?? 0)),
          progressLabel: statusDecision.progressLabel,
        });
        publishImportActivity({
          workspaceId,
          surface: importActivitySurfaceRef.current,
          status: "active",
          fileName,
          fileIndex: items.findIndex((item) => item.id === itemId) + 1,
          fileTotal: items.length,
          completedFiles: completedFileCount,
          progress: Math.max(statusDecision.progress, Number(itemsRef.current.find((item) => item.id === itemId)?.progress ?? 0)),
          detail: getTelemetryDetail(
            telemetryPhase === "repair_needed"
              ? "Clover needs another pass to finish this file"
              : processingPhase === "auto_rerunning"
              ? "Clover is rechecking the document"
              : parsedRowsCount > 0 || confirmedTransactionsCount > 0
                ? `Clover found ${Math.max(parsedRowsCount, confirmedTransactionsCount)} item(s)`
                : statusDecision.detail,
            telemetryMessage ?? processingMessage,
            telemetryLabel,
            resumeReason
          ),
          summary: null,
          errorMessage: null,
        });

        if (Date.now() - startedAt >= MAX_WAIT_MS) {
          const hasRecoverableProgress =
            Boolean(payload.visibleImportComplete || payload.receiptDocument || payload.receiptTransaction) ||
            parsedRowsCount > 0 ||
            confirmedTransactionsCount > 0;
          if (hasRecoverableProgress) {
            closeImportAsRecoverable(
              itemId,
              fileName,
              "Clover parsed the file and is still finalizing the import.",
              "Finalizing import"
            );
            return { completed: true, summary: null };
          }

          const timeoutMessage = `Timed out after ${timeoutDurationLabel} while Clover was still reading the document.`;
          closeImportAfterError(itemId, "monitor", fileName, timeoutMessage);
          return { completed: false, summary: null };
        }

        await sleep(statusPollDelayMs);
        continue;
      }

      if (importStatus === "done" && statusDecision.kind === "visible") {
        updateItem(itemId, {
          status: "done",
          confirmationState: "confirmed",
          progress: 100,
          progressLabel: doneLabel,
          targetAccountId: importFile?.accountId ?? null,
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
        return { completed: true, summary: null };
      }

      if (importStatus === "done") {
        updateItem(itemId, {
          status: "importing",
          confirmationState: "pending",
          progress: IMPORT_PROGRESS.finalizing,
          progressLabel: "Making data visible",
          targetAccountId: importFile?.accountId ?? null,
        });
        await sleep(statusPollDelayMs);
        continue;
      }

      updateItem(itemId, {
        status: "importing",
        progress: Math.max(statusDecision.progress, Number(itemsRef.current.find((item) => item.id === itemId)?.progress ?? 0)),
        progressLabel: statusDecision.progressLabel,
      });
      publishImportActivity({
        workspaceId,
        surface: importActivitySurfaceRef.current,
        status: "active",
        fileName,
        fileIndex: items.findIndex((item) => item.id === itemId) + 1,
        fileTotal: items.length,
        completedFiles: completedFileCount,
        progress: Math.max(statusDecision.progress, Number(itemsRef.current.find((item) => item.id === itemId)?.progress ?? 0)),
        detail: getTelemetryDetail(
          telemetryPhase === "repair_needed"
            ? "Clover needs another pass to finish this file"
            : processingPhase === "auto_rerunning"
            ? "Clover is rechecking the document"
            : parsedRowsCount > 0 || confirmedTransactionsCount > 0
              ? `Clover found ${Math.max(parsedRowsCount, confirmedTransactionsCount)} item(s)`
              : statusDecision.detail,
          telemetryMessage ?? processingMessage,
          telemetryLabel,
          resumeReason
        ),
        summary: null,
        errorMessage: null,
      });

      if (Date.now() - startedAt >= MAX_WAIT_MS) {
        const hasRecoverableProgress =
          Boolean(payload.visibleImportComplete || payload.receiptDocument || payload.receiptTransaction) ||
          parsedRowsCount > 0 ||
          confirmedTransactionsCount > 0;
        if (hasRecoverableProgress) {
          closeImportAsRecoverable(
            itemId,
            fileName,
            "Clover parsed the file and is still finalizing the import.",
            "Finalizing import"
          );
          return { completed: true, summary: null };
        }

        const timeoutMessage = `Timed out after ${timeoutDurationLabel} while Clover was still reading the document.`;
        closeImportAfterError(itemId, "monitor", fileName, timeoutMessage);
        return { completed: false, summary: null };
      }

      await sleep(statusPollDelayMs);
    }

    const hasRecoverableFinalProgress = Boolean(importFileId);

    if (hasRecoverableFinalProgress) {
      closeImportAsRecoverable(
        itemId,
        fileName,
        "Clover parsed the file and is still finalizing the import.",
        "Finalizing import"
      );
      return { completed: true, summary: null };
    }

    closeImportAfterError(itemId, "monitor", fileName, "Timed out while Clover was still reading the document.");
    return { completed: false, summary: null };
  };

  const processFile = async (itemId: string, options?: { signal?: AbortSignal | null }): Promise<ImportProcessResult> => {
    const item = itemsRef.current.find((entry) => entry.id === itemId);
    if (!item) return { status: "error", importedRows: null, summary: null };
    const guessedIdentity = guessStatementIdentity(item.file.name);
    const canUseOptimisticGuess = Boolean(guessedIdentity?.accountName && guessedIdentity.accountNumber);
    const itemImportMode = inferImportModeForFile(item.file, item.importMode ?? "statement");
    const isDocumentImport = itemImportMode !== "statement";
    let importFileId: string | null = null;

    if (!workspaceId) {
      closeImportAfterError(itemId, "validation", item?.file.name ?? "This file", "Select a workspace before importing files.");
      return { status: "error", importedRows: null, summary: null };
    }

    try {
      importFileId = item.importFileId ?? crypto.randomUUID();
      reportImportClientStage("process_file_started", {
        importMode: itemImportMode,
        fileSize: item.file.size,
        hasWorkspace: Boolean(workspaceId),
        importFileId,
        instanceId: importModalInstanceIdRef.current,
      });
      capturePostHogClientEvent("import_started", {
        file_type: fileTypeLabel(item.file),
        file_size_bytes: item.file.size,
        import_mode: itemImportMode,
      });
      updateItem(itemId, { status: "importing", error: null, progress: IMPORT_PROGRESS.preparing, progressLabel: "Preparing file", importFileId });
      updateItem(itemId, { progress: IMPORT_PROGRESS.preparing, progressLabel: "Uploading file" });
      publishImportActivity({
        workspaceId,
        surface: importActivitySurfaceRef.current,
        status: "active",
        importFileId,
        fileName: item.file.name,
        fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
        fileTotal: items.length,
        completedFiles: completedFileCount,
        progress: IMPORT_PROGRESS.preparing,
        detail: "Clover is uploading the file.",
        summary: null,
        errorMessage: null,
      });
      await yieldToPaint();
      capturePostHogClientEvent("import_parsing_started", {
        file_type: fileTypeLabel(item.file),
        file_size_bytes: item.file.size,
        import_mode: itemImportMode,
      });
      const lowerFileName = item.file.name.toLowerCase();
      const knownBpiScreenshot = itemImportMode === "statement" && isKnownBpiMobileScreenshotFile(item.file.name);
      const inferredBankName = normalizeBankName(item.file.name);
      const shouldSendFileNameBankHint =
        !/\.(?:png|jpe?g|webp|heic|heif|gif|bmp|avif)$/i.test(lowerFileName);
      const shouldSkipLocalStatementPreparse =
        itemImportMode === "statement" &&
        (lowerFileName.endsWith(".pdf") || lowerFileName.endsWith(".csv")) &&
        shouldSkipClientStatementPreparse(item.file.name);
      let extractedTextForUpload = localPreparseTextByItemIdRef.current.get(itemId);
      if (!extractedTextForUpload && knownBpiScreenshot) {
        extractedTextForUpload = buildBpiMobileScreenshotFallbackText(item.file.name) ?? "";
        if (extractedTextForUpload.trim()) {
          localPreparseTextByItemIdRef.current.set(itemId, extractedTextForUpload);
        }
      }
      // Never wait for browser-side parsing before upload. If the advisory scan
      // has already produced text, include it; otherwise the server receives the
      // original file immediately and can run its deterministic and backup readers.
      let processResponseSettled = false;
      let inFlightStatusMonitorStopped = false;
      const processResponsePromise = postFileWithProgress(
        `/api/imports/${importFileId}/process`,
        item.file,
        {
          workspaceId,
          fileName: item.file.name,
          fileType: item.file.type || item.file.name.split(".").pop() || "unknown",
          password: item.password.trim() || undefined,
          importMode: itemImportMode,
          bankName:
            inferredBankName !== "Unknown" && shouldSendFileNameBankHint
              ? inferredBankName
              : knownBpiScreenshot
                ? "BPI"
                : undefined,
          extractedText: extractedTextForUpload,
        },
        (progress) => {
          publishImportActivity({
            workspaceId,
            surface: importActivitySurfaceRef.current,
            status: "active",
            importFileId,
            fileName: item.file.name,
            fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
            fileTotal: items.length,
            completedFiles: completedFileCount,
            progress: IMPORT_PROGRESS.preparing + progress * ((IMPORT_PROGRESS.uploading - IMPORT_PROGRESS.preparing) / 100),
            detail: "Clover is uploading the file.",
            summary: null,
            errorMessage: null,
          });
          updateItem(itemId, {
            progress: IMPORT_PROGRESS.preparing + progress * ((IMPORT_PROGRESS.uploading - IMPORT_PROGRESS.preparing) / 100),
            progressLabel: "Uploading file",
            status: "importing",
          });
        },
        { signal: options?.signal ?? null }
      ).finally(() => {
        processResponseSettled = true;
        inFlightStatusMonitorStopped = true;
      });
      // Tiny files can finish uploading without a computable progress event.
      // Once the request is in flight, leave preparation but keep the label at
      // the truthful upload stage until the server reports file reading.
      updateItem(itemId, {
        status: "importing",
        progress: IMPORT_PROGRESS.uploading,
        progressLabel: "Sending file",
      });
      publishImportActivity({
        workspaceId,
        surface: importActivitySurfaceRef.current,
        status: "active",
        importFileId,
        fileName: item.file.name,
        fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
        fileTotal: items.length,
        completedFiles: completedFileCount,
        progress: IMPORT_PROGRESS.uploading,
        detail: "Clover is uploading the file.",
        summary: null,
        errorMessage: null,
      });
      // The multipart request stays open while the deterministic parser saves
      // rows. Poll the read-only lightweight progress endpoint so progress is
      // driven by real server phases instead of freezing at the upload boundary.
      // This also refreshes the page as soon as committed rows are visible,
      // without waiting for post-visible QA or response serialization.
      void (async () => {
        await new Promise((resolve) => window.setTimeout(resolve, IN_FLIGHT_IMPORT_PROGRESS_INITIAL_DELAY_MS));
        while (!inFlightStatusMonitorStopped && !processResponseSettled) {
          try {
            const response = await fetch(`/api/imports/${importFileId}/progress`, { cache: "no-store" });
            if (response.ok) {
              const payload = (await response.json()) as ImportStatusPayload;
              const importFile = payload.importFile;
              const processingPhase = typeof importFile?.processingPhase === "string" ? importFile.processingPhase : null;
              const processingMessage = typeof importFile?.processingMessage === "string" ? importFile.processingMessage : null;
              const parsedRowsCount = Number(payload.parsedRowsCount ?? 0);
              const confirmedTransactionsCount = Number(payload.confirmedTransactionsCount ?? 0);
              const passwordRequired =
                processingPhase === "password_required" || /password-protected|password required/i.test(processingMessage ?? "");
              if (passwordRequired) {
                inFlightStatusMonitorStopped = true;
                requestPasswordForItem(
                  itemId,
                  Boolean(itemsRef.current.find((item) => item.id === itemId)?.password.trim())
                );
                break;
              }
              const statusDecision = resolveImportModalStatusDecision({
                importMode: itemImportMode,
                status: typeof importFile?.status === "string" ? importFile.status : null,
                processingPhase,
                processingMessage,
                telemetryPhase: typeof payload.telemetryPhase === "string" ? payload.telemetryPhase : null,
                telemetryLabel: typeof payload.telemetryLabel === "string" ? payload.telemetryLabel : null,
                telemetryMessage: typeof payload.telemetryMessage === "string" ? payload.telemetryMessage : null,
                parsedRowsCount,
                confirmedTransactionsCount,
                visibleImportComplete: Boolean(payload.visibleImportComplete),
                hasStructuredReceiptVisibility: Boolean(payload.receiptTransaction),
                processingAttempt: importFile?.processingAttempt ?? null,
                // Preserve only progress the user has actually seen. The
                // durable server phase below supplies the next meaningful
                // band (read, identify, save) instead of collapsing every
                // in-flight update into one parsing percentage.
                progressFloor: Number(itemsRef.current.find((entry) => entry.id === itemId)?.progress ?? IMPORT_PROGRESS.uploading),
              });

              if (statusDecision.kind === "visible") {
                const visibleRows = Math.max(confirmedTransactionsCount, parsedRowsCount);
                const visibleAccountId =
                  typeof importFile?.accountId === "string" && importFile.accountId.trim()
                    ? importFile.accountId.trim()
                    : null;
                updateItem(itemId, {
                  status: "done",
                  confirmationState: "confirmed",
                  error: null,
                  targetAccountId: visibleAccountId,
                  importedRows: visibleRows,
                  progress: 100,
                  progressLabel: "Imported successfully",
                });
                publishImportActivity({
                  workspaceId,
                  surface: importActivitySurfaceRef.current,
                  status: "done",
                  importFileId,
                  fileName: item.file.name,
                  fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
                  fileTotal: items.length,
                  completedFiles: completedFileCount + 1,
                  progress: 100,
                  detail: `${visibleRows} transaction${visibleRows === 1 ? "" : "s"} imported successfully.`,
                  summary: null,
                  errorMessage: null,
                });
                setMessage(`Imported ${item.file.name}.`);
                router.refresh();
                inFlightStatusMonitorStopped = true;
                break;
              }

              if (statusDecision.kind === "waiting") {
                const currentItem = itemsRef.current.find((entry) => entry.id === itemId);
                const nextProgress = Math.max(Number(currentItem?.progress ?? 0), statusDecision.progress);
                updateItem(itemId, {
                  status: "importing",
                  progress: nextProgress,
                  progressLabel: statusDecision.progressLabel,
                });
                publishImportActivity({
                  workspaceId,
                  surface: importActivitySurfaceRef.current,
                  status: "active",
                  importFileId,
                  fileName: item.file.name,
                  fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
                  fileTotal: items.length,
                  completedFiles: completedFileCount,
                  progress: nextProgress,
                  detail: statusDecision.detail,
                  summary: null,
                  errorMessage: null,
                });
              }
            }
          } catch {
            // The process response remains authoritative. A missed status poll
            // must never turn a healthy upload into an error.
          }

          await new Promise((resolve) => window.setTimeout(resolve, IN_FLIGHT_IMPORT_PROGRESS_POLL_INTERVAL_MS));
        }
      })();
      if (shouldSkipLocalStatementPreparse) {
        void (async () => {
          await new Promise((resolve) => window.setTimeout(resolve, 8_000));
          if (processResponseSettled) {
            return;
          }

          await monitorQueuedImportAndConfirm(itemId, importFileId!, null, {
            fileName: item.file.name,
            fallbackAccountName:
              deriveStatementFallbackAccountName(
                item.file.name,
                guessedIdentity?.institution ?? null,
                guessedIdentity?.accountNumber ?? null,
                guessedIdentity
                  ? inferAccountTypeFromStatement(guessedIdentity.institution, guessedIdentity.accountName, "bank")
                  : null,
              ) ?? "Imported statement",
            guessedAccountName: guessedIdentity?.accountName ?? null,
            guessedInstitution: guessedIdentity?.institution ?? null,
            guessedAccountNumber: null,
            guessedAccountType: guessedIdentity
              ? inferAccountTypeFromStatement(guessedIdentity.institution, guessedIdentity.accountName, "bank")
              : null,
            accountName: guessedIdentity?.accountName ?? null,
            institution: guessedIdentity?.institution ?? null,
            accountNumber: null,
            accountType: guessedIdentity
              ? inferAccountTypeFromStatement(guessedIdentity.institution, guessedIdentity.accountName, "bank")
              : null,
            optimisticAccountId: item.optimisticAccountId ?? null,
            initialBalance: null,
            password: item.password.trim() || undefined,
          }).finally(() => {
            if (!processResponseSettled) {
              router.refresh();
            }
          });
        })().catch((error) => {
          console.warn("In-flight import visibility monitor failed", {
            importFileId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
      const processResponse = await processResponsePromise;
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
      const canonicalImportFileId =
        typeof processPayload?.canonicalImportFileId === "string"
          ? processPayload.canonicalImportFileId
          : typeof processPayload?.duplicateOfImportFileId === "string"
            ? processPayload.duplicateOfImportFileId
            : null;
      if (canonicalImportFileId && canonicalImportFileId !== importFileId) {
        reportImportClientStage("canonical_import_adopted", {
          importFileId,
          canonicalImportFileId,
          instanceId: importModalInstanceIdRef.current,
        });
        importFileId = canonicalImportFileId;
        updateItem(itemId, { importFileId: canonicalImportFileId });
      }
      if (!importFileId) {
        throw new Error("Clover lost the import identifier while reconciling this upload.");
      }
      if (isDocumentImport) {
        const importedLabel =
          itemImportMode === "receipt"
            ? "Receipt imported"
            : itemImportMode === "portfolio"
              ? "Portfolio screenshot imported"
              : itemImportMode === "account_detail"
                ? "File details imported"
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
                    ? "Reading file details in background"
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
          if (itemImportMode === "receipt") {
            const precomputedReceiptSummary = localPreparseSummaryByItemIdRef.current.get(itemId) ?? null;
            if (precomputedReceiptSummary) {
              seedImportedWorkspaceCaches(workspaceId, precomputedReceiptSummary);
              await Promise.resolve(onImported(precomputedReceiptSummary));

              updateItem(itemId, {
                status: "done",
                confirmationState: "confirmed",
                error: null,
                importFileId,
                targetAccountId: precomputedReceiptSummary.accountId,
                importedRows: precomputedReceiptSummary.rowsImported,
                progress: 100,
                progressLabel: "Receipt imported",
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
                detail: "Receipt imported",
                summary: precomputedReceiptSummary,
                errorMessage: null,
              });

              void monitorQueuedDocumentImport(itemId, importFileId, itemImportMode, item.file.name, {
                deliverSummary: false,
              }).finally(() => router.refresh());
              return {
                status: "done",
                importedRows: precomputedReceiptSummary.rowsImported,
                summary: precomputedReceiptSummary,
              };
            }

            const inlineReceiptSummary =
              processPayload?.receiptTransaction
                ? buildReceiptSummaryFromReceiptTransaction(
                    {
                      fileName: item.file.name,
                      importFileId,
                      receiptTransaction: processPayload.receiptTransaction,
                      accountType: null,
                    },
                    (params) =>
                      buildOptimisticUploadSummary(
                        params.fileName,
                        params.importedRows,
                        params.accountId,
                        params.accountName,
                        params.institution,
                        params.accountType,
                        params.optimisticAccountId ?? null,
                        params.balance ?? null,
                        params.previewTransactions,
                        params.accountNumber ?? null,
                        params.showBalanceEvenIfEmpty ?? false
                      )
                  )
                : processPayload?.receiptDocument
                  ? buildReceiptSummaryFromReceiptDocument(
                      {
                        fileName: item.file.name,
                        importFileId,
                        receiptDocument: processPayload.receiptDocument,
                        accountId: typeof processPayload.accountId === "string" ? processPayload.accountId : null,
                        accountType: null,
                        previewAccountName: null,
                      },
                      (params) =>
                        buildOptimisticUploadSummary(
                          params.fileName,
                          params.importedRows,
                          params.accountId,
                          params.accountName,
                          params.institution,
                          params.accountType,
                          params.optimisticAccountId ?? null,
                          params.balance ?? null,
                          params.previewTransactions,
                          params.accountNumber ?? null,
                          params.showBalanceEvenIfEmpty ?? false
                        )
                    )
                  : null;

            if (inlineReceiptSummary) {
              seedImportedWorkspaceCaches(workspaceId, inlineReceiptSummary);
              await Promise.resolve(onImported(inlineReceiptSummary));

              updateItem(itemId, {
                status: "done",
                confirmationState: "confirmed",
                error: null,
                importFileId,
                targetAccountId: inlineReceiptSummary.accountId,
                importedRows: inlineReceiptSummary.rowsImported,
                progress: 100,
                progressLabel: "Receipt imported",
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
                detail: "Receipt imported",
                summary: inlineReceiptSummary,
                errorMessage: null,
              });
              setMessage(`Imported ${item.file.name}.`);
              router.refresh();
              return {
                status: "done",
                importedRows: inlineReceiptSummary.rowsImported,
                summary: inlineReceiptSummary,
              };
            }
          }
          const monitorResult = await monitorQueuedDocumentImport(itemId, importFileId, itemImportMode, item.file.name);
          if (!monitorResult.completed) {
            return { status: "error", importedRows: null, summary: null };
          }
          return {
            status: "done",
            importedRows: monitorResult.summary?.rowsImported ?? 0,
            summary: monitorResult.summary,
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
        const duplicateAccountSummaries = normalizeServerAccountSummaries(processPayload?.accountSummaries);
        const duplicateAccountId =
          typeof processPayload?.accountId === "string" && processPayload.accountId.trim()
            ? processPayload.accountId.trim()
            : duplicateAccountSummaries.length === 1
              ? duplicateAccountSummaries[0]?.accountId ?? null
              : null;
        const duplicateAccountSummary =
          duplicateAccountSummaries.find((summary) => summary.accountId === duplicateAccountId) ??
          duplicateAccountSummaries[0] ??
          null;
        const duplicateRowsImported = Number(processPayload?.confirmedTransactionsCount ?? processPayload?.imported ?? 0) || 0;
        const duplicateMessage = formatDuplicateImportMessage(item.file.name, guessedIdentity?.accountName ?? null);
        updateItem(itemId, {
          status: "done",
          confirmationState: "confirmed",
          error: null,
          importFileId,
          targetAccountId: duplicateAccountId,
          importedRows: Math.max(duplicateRowsImported, duplicateAccountSummary?.rowsImported ?? 0),
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
      const serverAccountSummaries = normalizeServerAccountSummaries(processPayload?.accountSummaries);
      if (serverAccountSummaries.length > 1) {
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
        const emittedSummaries: UploadInsightsSummary[] = [];
        for (const accountSummary of serverAccountSummaries) {
          const confirmedAccountName = accountSummary.accountName ?? statementIdentity?.accountName ?? guessedIdentity?.accountName ?? item.file.name;
          const confirmedInstitution = accountSummary.institution ?? statementIdentity?.institution ?? guessedIdentity?.institution ?? null;
          const confirmedAccountType =
            accountSummary.accountType ??
            statementIdentity?.accountType ??
            statementAccountType ??
            inferAccountTypeFromStatement(confirmedInstitution, confirmedAccountName, "bank");
          const confirmedPreviewTransactions = await loadOrGetKnownPreviewTransactions({
            workspaceId,
            importFileId,
            accountId: accountSummary.accountId,
            optimisticAccountId: item.optimisticAccountId ?? null,
            accountName: confirmedAccountName ?? null,
            institution: confirmedInstitution,
            accountNumber: accountSummary.accountNumber,
            accountType: confirmedAccountType,
          });
          const settledRows = Math.max(Number(accountSummary.rowsImported ?? 0), confirmedPreviewTransactions.length);
          const accountUploadSummary = buildResolvedOptimisticUploadSummary({
            accounts,
            workspaceId,
            fileName: item.file.name,
            importedRows: settledRows,
            accountId: accountSummary.accountId,
            accountName: confirmedAccountName ?? null,
            institution: confirmedInstitution,
            accountNumber: accountSummary.accountNumber,
            accountType: confirmedAccountType,
            optimisticAccountId: null,
            balanceSources: [accountSummary.balance],
            previewTransactions: confirmedPreviewTransactions,
            insightMetrics: confirmedInsightSummary,
            accountSummaries: [accountSummary],
            optimistic: false,
          });

          seedImportedWorkspaceCaches(workspaceId, accountUploadSummary);
          emittedSummaries.push(accountUploadSummary);
          await Promise.resolve(onImported(accountUploadSummary));
        }

        const combinedSummary = combineUploadInsightsSummaries(emittedSummaries);
        const settledRows = emittedSummaries.reduce((total, summary) => total + Number(summary.rowsImported ?? 0), 0);
        updateItem(itemId, {
          status: "done",
          confirmationState: "confirmed",
          error: null,
          importFileId,
          targetAccountId: serverConfirmedAccountId,
          importedRows: settledRows,
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
          summary: combinedSummary,
          errorMessage: null,
        });
        setMessage(`Imported ${item.file.name}.`);
        router.refresh();
        return {
          status: "done",
          importedRows: settledRows,
          summary: combinedSummary,
        };
      }
      if (serverConfirmedAccountId) {
        const serverAccountSummary = serverAccountSummaries.find((summary) => summary.accountId === serverConfirmedAccountId) ?? serverAccountSummaries[0] ?? null;
        const confirmedRows = Number(processPayload?.confirmedTransactionsCount ?? processPayload?.imported ?? 0) || 0;
        const confirmedAccountName = serverAccountSummary?.accountName ?? statementIdentity?.accountName ?? guessedIdentity?.accountName ?? item.file.name;
        const confirmedInstitution = serverAccountSummary?.institution ?? statementIdentity?.institution ?? guessedIdentity?.institution ?? null;
        const confirmedAccountNumber = serverAccountSummary?.accountNumber ?? statementIdentity?.accountNumber ?? guessedIdentity?.accountNumber ?? null;
        const confirmedAccountType =
          serverAccountSummary?.accountType ??
          statementIdentity?.accountType ??
          statementAccountType ??
          inferAccountTypeFromStatement(confirmedInstitution, confirmedAccountName, "bank");
        const confirmedPreviewTransactions = await loadOrGetKnownPreviewTransactions({
          workspaceId,
          importFileId,
          accountId: serverConfirmedAccountId,
          optimisticAccountId: item.optimisticAccountId ?? null,
          accountName: confirmedAccountName ?? null,
          institution: confirmedInstitution,
          accountNumber: confirmedAccountNumber,
          accountType: confirmedAccountType,
        });
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
        const settledRows = Math.max(confirmedRows, confirmedPreviewTransactions.length);
        const confirmedSummary = buildResolvedOptimisticUploadSummary({
          accounts,
          workspaceId,
          fileName: item.file.name,
          importedRows: settledRows,
          accountId: serverConfirmedAccountId,
          accountName: confirmedAccountName ?? null,
          institution: confirmedInstitution,
          accountNumber: confirmedAccountNumber,
          accountType: confirmedAccountType,
          optimisticAccountId: null,
          balanceSources: [serverAccountSummary?.balance ?? null, typeof processPayload.accountBalance === "string" ? processPayload.accountBalance : null],
          previewTransactions: confirmedPreviewTransactions,
          insightMetrics: confirmedInsightSummary,
          accountSummaries: serverAccountSummary ? [serverAccountSummary] : undefined,
          optimistic: false,
        });

        if (confirmedSummary) {
          seedImportedWorkspaceCaches(workspaceId, confirmedSummary);
          await Promise.resolve(onImported(confirmedSummary));
        }

        const settledVisible = await waitForSettledVisibility(
          itemId,
          importFileId,
          serverConfirmedAccountId,
          settledRows,
          confirmedSummary.balance ?? null,
          "Import finished before the settled data became visible"
        );
        if (!settledVisible) {
          return {
            status: "staged",
            importedRows: settledRows,
            summary: confirmedSummary,
          };
        }

        updateItem(itemId, {
          status: "done",
          confirmationState: "confirmed",
          error: null,
          importFileId,
          targetAccountId: serverConfirmedAccountId,
          importedRows: settledRows,
          progress: 100,
          progressLabel: "Visible in Clover",
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
        window.setTimeout(closeVisibleImportModalIfPrimaryDataReady, 0);

        setMessage(`Imported ${item.file.name}.`);
        router.refresh();
        return {
          status: "done",
          importedRows: settledRows,
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
            ? await loadOrGetKnownPreviewTransactions({
                workspaceId,
                importFileId,
                accountId: optimisticAccountId,
                optimisticAccountId: item.optimisticAccountId ?? null,
                accountName: statementIdentity.accountName ?? null,
                institution: statementIdentity?.institution ?? null,
                accountNumber: statementIdentity?.accountNumber ?? null,
                accountType: statementIdentity?.accountType ?? statementAccountType,
              })
            : [];
        const visibleRows = Math.max(Number(processPayload?.imported ?? 0) || 0, previewTransactions.length);
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
          ? buildResolvedOptimisticUploadSummary({
              accounts,
              workspaceId,
              fileName: item.file.name,
              importedRows: visibleRows,
              accountId: optimisticAccountId,
              accountName: optimisticIdentity.accountName ?? null,
              institution: optimisticIdentity.institution ?? null,
              accountNumber: statementIdentity?.accountNumber ?? null,
              accountType: optimisticIdentity.accountType ?? statementAccountType,
              optimisticAccountId,
              balanceSources: [knownOptimisticBalance],
              previewTransactions,
              showBalanceEvenIfEmpty: true,
            })
          : null;
        const localPreparseSummary = localPreparseSummaryByItemIdRef.current.get(itemId) ?? null;
        const rawQueuedVisibleSummary = optimisticSummary ?? localPreparseSummary;
        const queuedVisibleSummary = shouldPublishImportSummary(item.file.name, rawQueuedVisibleSummary)
          ? rawQueuedVisibleSummary
          : null;
        const queuedVisibleRows = Math.max(visibleRows, queuedVisibleSummary?.rowsImported ?? 0);
        updateItem(itemId, {
          importFileId,
          targetAccountId: queuedVisibleSummary?.accountId ?? optimisticAccountId,
          confirmationState: "staged",
          progress: queuedVisibleSummary ? Math.max(IMPORT_PROGRESS.loadingAccount, 99) : IMPORT_PROGRESS.loadingAccount,
          progressLabel: queuedVisibleSummary
            ? "Accounts are visible"
            : hasStatementIdentity || canUseOptimisticGuess
              ? "Loading account"
              : "Waiting for account details",
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
          progress: queuedVisibleSummary ? Math.max(IMPORT_PROGRESS.loadingAccount, 99) : IMPORT_PROGRESS.loadingAccount,
          detail: queuedVisibleSummary
            ? "Accounts and transactions are visible. Clover will keep cleaning up names and categories in the background."
            : hasStatementIdentity || canUseOptimisticGuess
              ? getProgressDetail(
                  {
                    accountName: statementIdentity?.accountName ?? guessedIdentity?.accountName ?? null,
                    institution: statementIdentity?.institution ?? guessedIdentity?.institution ?? null,
                    accountNumber: statementIdentity?.accountNumber ?? null,
                  },
                  previewTransactions.length
                )
              : "Clover is reading the document",
          summary: queuedVisibleSummary,
          errorMessage: null,
        });
        if (queuedVisibleSummary) {
          seedImportedWorkspaceCaches(workspaceId, queuedVisibleSummary);
          await Promise.resolve(onImported(queuedVisibleSummary));

          updateItem(itemId, {
            status: "importing",
            confirmationState: "staged",
            error: null,
            importFileId,
            targetAccountId: queuedVisibleSummary.accountId ?? optimisticAccountId,
            importedRows: queuedVisibleRows,
            progress: Math.max(IMPORT_PROGRESS.loadingAccount, 99),
            progressLabel: "Saving visible rows",
          });
          publishImportActivity({
            workspaceId,
            surface: importActivitySurfaceRef.current,
            status: "active",
            fileName: item.file.name,
            fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
            fileTotal: items.length,
            completedFiles: completedFileCount,
            progress: Math.max(IMPORT_PROGRESS.loadingAccount, 99),
            detail: "Accounts and transactions are visible. Clover is saving them so they stay visible after refresh.",
            summary: queuedVisibleSummary,
            errorMessage: null,
          });

          await monitorQueuedImportAndConfirm(
            itemId,
            importFileId,
            optimisticAccountId,
            {
              fileName: item.file.name,
              fallbackAccountName:
                deriveStatementFallbackAccountName(
                  item.file.name,
                  statementIdentity?.institution ?? guessedIdentity?.institution ?? null,
                  statementIdentity?.accountNumber ?? guessedIdentity?.accountNumber ?? null,
                  statementIdentity?.accountType ??
                    (guessedIdentity
                      ? inferAccountTypeFromStatement(guessedIdentity.institution, guessedIdentity.accountName, "bank")
                      : null),
                ) ?? "Imported statement",
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
              initialBalance: queuedVisibleSummary.balance ?? null,
              password: item.password.trim() || undefined,
              previewTransactions: queuedVisibleSummary.previewTransactions ?? previewTransactions,
            },
            { backgroundOnly: false }
          );

          router.refresh();

          return {
            status: "done",
            importedRows: queuedVisibleRows,
            summary: queuedVisibleSummary,
          };
        }

        if (isLikelyLowQualityPnbStatementFile(item.file.name) && !hasStatementIdentity && visibleRows === 0) {
          updateItem(itemId, {
            status: "importing",
            confirmationState: "pending",
            error: null,
            errorCode: null,
            errorTitle: null,
            errorNextSteps: null,
            importFileId,
            importedRows: 0,
            progress: IMPORT_PROGRESS.loadingAccount,
            progressLabel: "Reading statement in background",
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
            detail: "Clover queued this low-quality scan for backup reading.",
            summary: null,
            errorMessage: null,
          });
          void monitorQueuedImportAndConfirm(
            itemId,
            importFileId,
            optimisticAccountId,
            {
              fileName: item.file.name,
              fallbackAccountName:
                deriveStatementFallbackAccountName(
                  item.file.name,
                  statementIdentity?.institution ?? guessedIdentity?.institution ?? null,
                  statementIdentity?.accountNumber ?? guessedIdentity?.accountNumber ?? null,
                  statementIdentity?.accountType ??
                    (guessedIdentity
                      ? inferAccountTypeFromStatement(guessedIdentity.institution, guessedIdentity.accountName, "bank")
                      : null),
                ) ?? "Imported statement",
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
              initialBalance: null,
              password: item.password.trim() || undefined,
              previewTransactions,
            },
            { backgroundOnly: true }
          ).finally(() => router.refresh());

          return {
            status: "staged",
            importedRows: 0,
            summary: null,
          };
        }

        updateItem(itemId, {
          status: "importing",
          confirmationState: "pending",
          error: null,
          importFileId,
          targetAccountId: optimisticAccountId,
          importedRows: visibleRows,
          progress: IMPORT_PROGRESS.loadingAccount,
          progressLabel: hasStatementIdentity || canUseOptimisticGuess ? "Loading account" : "Reading statement",
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
          detail: hasStatementIdentity || canUseOptimisticGuess
            ? getProgressDetail(
                {
                  accountName: statementIdentity?.accountName ?? guessedIdentity?.accountName ?? null,
                  institution: statementIdentity?.institution ?? guessedIdentity?.institution ?? null,
                  accountNumber: statementIdentity?.accountNumber ?? null,
                },
                previewTransactions.length
              )
            : "Clover is reading the statement and will keep this import open until rows are visible.",
          summary: null,
          errorMessage: null,
        });

        await monitorQueuedImportAndConfirm(itemId, importFileId, optimisticAccountId, {
          fileName: item.file.name,
          fallbackAccountName:
            deriveStatementFallbackAccountName(
              item.file.name,
              statementIdentity?.institution ?? guessedIdentity?.institution ?? null,
              statementIdentity?.accountNumber ?? guessedIdentity?.accountNumber ?? null,
              statementIdentity?.accountType ??
                (guessedIdentity
                  ? inferAccountTypeFromStatement(guessedIdentity.institution, guessedIdentity.accountName, "bank")
                  : null),
            ) ?? "Imported statement",
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
          initialBalance: null,
          password: item.password.trim() || undefined,
          previewTransactions,
        });

        return {
          status: "done",
          importedRows: visibleRows,
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
          ? await loadOrGetKnownPreviewTransactions({
              workspaceId,
              importFileId,
              accountId: targetAccountId,
              optimisticAccountId: item.optimisticAccountId ?? null,
              accountName: statementIdentity.accountName ?? null,
              institution: statementIdentity?.institution ?? null,
              accountNumber: statementIdentity?.accountNumber ?? null,
              accountType: statementAccountType,
            })
          : [];
      const localPreparseSummary = localPreparseSummaryByItemIdRef.current.get(itemId) ?? null;
      const optimisticPreviewSummary =
        targetAccountId
          ? buildResolvedOptimisticUploadSummary({
              accounts,
              workspaceId,
              fileName: item.file.name,
              importedRows: Number(processPayload?.imported ?? 0) || 0,
              accountId: targetAccountId,
              accountName: statementIdentity?.accountName ?? null,
              institution: statementIdentity?.institution ?? null,
              accountNumber: statementIdentity?.accountNumber ?? null,
              accountType: statementAccountType,
              optimisticAccountId: targetAccountId.startsWith("optimistic-") ? targetAccountId : null,
              previewTransactions,
              showBalanceEvenIfEmpty: true,
            })
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

      const publishableOptimisticPreviewSummary = shouldPublishImportSummary(item.file.name, optimisticPreviewSummary)
        ? optimisticPreviewSummary
        : shouldPublishImportSummary(item.file.name, localPreparseSummary)
          ? localPreparseSummary
          : null;

      if (publishableOptimisticPreviewSummary) {
        seedImportedWorkspaceCaches(workspaceId, publishableOptimisticPreviewSummary);
        await Promise.resolve(onImported(publishableOptimisticPreviewSummary));
      }

      if (targetAccountId) {
        let confirmationResult: ImportProcessResult | null = null;
        try {
          confirmationResult = await confirmItemImport(
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

          if (confirmationResult.summary) {
            seedImportedWorkspaceCaches(workspaceId, confirmationResult.summary);
            await Promise.resolve(onImported(confirmationResult.summary));
          }
        } catch (error) {
          console.warn("Background import confirmation failed", {
            importFileId,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        if (!confirmationResult || confirmationResult.status !== "done") {
          return confirmationResult ?? {
            status: "staged",
            importedRows: Number(processPayload?.imported ?? 0) || null,
            summary: publishableOptimisticPreviewSummary,
          };
        }

        updateItem(itemId, {
          status: "done",
          confirmationState: "confirmed",
          error: null,
          importFileId,
          targetAccountId,
          importedRows: Number(processPayload?.imported ?? 0) || 0,
          progress: 100,
          progressLabel: "Visible in Clover",
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
          summary: publishableOptimisticPreviewSummary,
          errorMessage: null,
        });
        window.setTimeout(closeVisibleImportModalIfPrimaryDataReady, 0);
      } else {
        // A screenshot can have parsed rows before Clover has enough identity
        // information to select an account. Do not mark it done here: that
        // produced a false 100% success while no transaction was visible.
        // The monitor resolves the account and owns the terminal outcome.
        await monitorQueuedImportAndConfirm(itemId, importFileId, null, {
          fileName: item.file.name,
          fallbackAccountName:
            deriveStatementFallbackAccountName(
              item.file.name,
              statementIdentity?.institution ?? guessedIdentity?.institution ?? null,
              statementIdentity?.accountNumber ?? guessedIdentity?.accountNumber ?? null,
              statementIdentity?.accountType ??
                (guessedIdentity
                  ? inferAccountTypeFromStatement(guessedIdentity.institution, guessedIdentity.accountName, "bank")
                  : null),
            ) ?? "Imported statement",
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
          backgroundOnly: false,
        });
        router.refresh();
        const reconciledItem = itemsRef.current.find((entry) => entry.id === itemId);
        return {
          status:
            reconciledItem?.status === "error"
              ? "error"
              : reconciledItem?.status === "done" || reconciledItem?.confirmationState === "confirmed"
                ? "done"
                : "staged",
          importedRows: reconciledItem?.importedRows ?? (Number(processPayload?.imported ?? 0) || null),
          summary: publishableOptimisticPreviewSummary,
        };
      }

        return {
          status: "done",
          importedRows: Number(processPayload?.imported ?? 0) || null,
          summary: publishableOptimisticPreviewSummary,
        };
    } catch (error) {
      if (isPasswordError(error)) {
        const currentImportFileId = importFileId ?? item.importFileId ?? null;
        setLaunchInBackground(false);
        if (item.password.trim()) {
          capturePostHogClientEvent("password_failed", {
            ...fileAnalyticsBase(item.file, workspaceId),
            import_file_id: currentImportFileId,
            error_stage: "process",
            error_code: getImportErrorCode(error),
          });
        }
        requestPasswordForItem(itemId, Boolean(item.password.trim()));
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
      const localRecoverableSummary = localPreparseSummaryByItemIdRef.current.get(itemId) ?? null;
      if (localRecoverableSummary && Number(localRecoverableSummary.rowsImported ?? 0) > 0) {
        retiredImportActivityFileNamesRef.current.add(item.file.name);
        seedImportedWorkspaceCaches(workspaceId, localRecoverableSummary);
        await Promise.resolve(onImported(localRecoverableSummary));
        updateItem(itemId, {
          status: "done",
          confirmationState: "confirmed",
          error: null,
          errorCode: null,
          errorTitle: null,
          errorNextSteps: null,
          importFileId,
          targetAccountId: localRecoverableSummary.accountId ?? item.targetAccountId,
          importedRows: localRecoverableSummary.rowsImported,
          progress: 100,
          progressLabel: "Visible in Clover",
        });
        publishImportActivity({
          workspaceId,
          surface: importActivitySurfaceRef.current,
          status: "done",
          fileName: item.file.name,
          fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
          fileTotal: items.length,
          completedFiles: Math.min(items.length, completedFileCount + 1),
          progress: 100,
          detail: "Accounts and transactions are visible. Clover will keep cleaning up names and categories in the background.",
          summary: localRecoverableSummary,
          errorMessage: null,
        });
        return {
          status: "done",
          importedRows: localRecoverableSummary.rowsImported,
          summary: localRecoverableSummary,
        };
      }
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
      const recoverableImportStatus =
        typeof recoverableStatus?.importFile?.status === "string" ? recoverableStatus.importFile.status : null;
      const recoverableProcessingPhase =
        typeof recoverableStatus?.importFile?.processingPhase === "string" ? recoverableStatus.importFile.processingPhase : null;
      const recoverableStillProcessing =
        recoverableImportStatus === "processing" &&
        (recoverableProcessingPhase === "queued_retry" ||
          recoverableProcessingPhase === "reading_account_details" ||
          recoverableProcessingPhase === "reading_receipt_vision" ||
          recoverableProcessingPhase === "identifying_transactions" ||
          recoverableProcessingPhase === "reconciling");
      const recoverableVisualRepairPending =
        recoverableImportFileId !== null &&
        isRecoverableVisualUploadFileName(item.file.name) &&
        recoverableParsedRowsCount === 0 &&
        recoverableConfirmedRowsCount === 0 &&
        (recoverableImportStatus === "failed" || recoverableProcessingPhase === "repair_needed");
      if (recoverableImportFileId && (recoverableStillProcessing || recoverableVisualRepairPending)) {
        updateItem(itemId, {
          status: "importing",
          confirmationState: "pending",
          error: null,
          errorCode: null,
          errorTitle: null,
          errorNextSteps: null,
          importFileId: recoverableImportFileId,
          targetAccountId: recoverableAccountId,
          importedRows: Math.max(recoverableParsedRowsCount, recoverableConfirmedRowsCount),
          progress: IMPORT_PROGRESS.loadingAccount,
          progressLabel: recoverableVisualRepairPending
            ? "Running backup reader"
            : isDocumentImport
              ? "Reading document in background"
              : "Reading statement in background",
        });
        publishImportActivity({
          workspaceId,
          surface: importActivitySurfaceRef.current,
          status: "active",
          importFileId: recoverableImportFileId,
          fileName: item.file.name,
          fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
          fileTotal: items.length,
          completedFiles: completedFileCount,
          progress: IMPORT_PROGRESS.loadingAccount,
          detail: recoverableVisualRepairPending
            ? "Clover is reopening this visual file for backup reading."
            : isDocumentImport
              ? "Clover is running the backup document reader."
              : "Clover is running the backup statement reader.",
          summary: null,
          errorMessage: null,
        });
        if (isDocumentImport) {
          void monitorQueuedDocumentImport(itemId, recoverableImportFileId, itemImportMode, item.file.name, {
            keepWatchingAfterVisible: itemImportMode === "receipt",
          }).finally(() => router.refresh());
        } else {
          void monitorQueuedImportAndConfirm(itemId, recoverableImportFileId, recoverableAccountId, {
            fileName: item.file.name,
            fallbackAccountName:
              deriveStatementFallbackAccountName(
                item.file.name,
                recoverableIdentity?.institution ?? guessedIdentity?.institution ?? null,
                recoverableIdentity?.accountNumber ?? guessedIdentity?.accountNumber ?? null,
                recoverableIdentity?.accountType ??
                  (guessedIdentity
                    ? inferAccountTypeFromStatement(guessedIdentity.institution, guessedIdentity.accountName, "bank")
                    : null),
              ) ?? "Imported statement",
            guessedAccountName: guessedIdentity?.accountName ?? null,
            guessedInstitution: guessedIdentity?.institution ?? null,
            guessedAccountNumber: null,
            guessedAccountType: guessedIdentity
              ? inferAccountTypeFromStatement(guessedIdentity.institution, guessedIdentity.accountName, "bank")
              : null,
            accountName: recoverableIdentity?.accountName ?? null,
            institution: recoverableIdentity?.institution ?? null,
            accountNumber: recoverableIdentity?.accountNumber ?? null,
            accountType: recoverableIdentity?.accountType ?? null,
            optimisticAccountId: recoverableAccountId,
            initialBalance: toBalanceString(recoverableStatus?.statementCheckpoint?.endingBalance),
            password: item.password.trim() || undefined,
          }, {
            backgroundOnly: true,
          }).finally(() => router.refresh());
        }

        return {
          status: "staged",
          importedRows: Math.max(recoverableParsedRowsCount, recoverableConfirmedRowsCount) || null,
          summary: null,
        };
      }
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
                recoverableIdentity?.institution ?? null,
                recoverableIdentity?.accountNumber ?? null
              ).catch(() => [])
            : [];
        const recoveredRowsCount = Math.max(
          recoverableConfirmedRowsCount,
          recoverableParsedRowsCount,
          recoverablePreviewTransactions.length
        );
        const recoveredSummary = buildResolvedOptimisticUploadSummary({
          accounts,
          workspaceId,
          fileName: item.file.name,
          importedRows: recoveredRowsCount,
          accountId: fallbackAccountId,
          accountName: recoverableIdentity?.accountName ?? item.file.name,
          institution: recoverableIdentity?.institution ?? null,
          accountNumber: recoverableIdentity?.accountNumber ?? null,
          accountType:
            recoverableIdentity?.accountType ??
            inferAccountTypeFromStatement(recoverableIdentity?.institution, recoverableIdentity?.accountName, "bank"),
          optimisticAccountId: item.optimisticAccountId ?? null,
          balanceSources: [toBalanceString(recoverableStatus?.statementCheckpoint?.endingBalance)],
          previewTransactions: recoverablePreviewTransactions,
        });
        const finalizedRecoveredSummary: UploadInsightsSummary = {
          ...recoveredSummary,
          optimistic: false,
        };

        if (recoveredRowsCount > 0) {
          seedImportedWorkspaceCaches(workspaceId, finalizedRecoveredSummary);
          await Promise.resolve(onImported(finalizedRecoveredSummary));
          updateItem(itemId, {
            status: "done",
            confirmationState: "confirmed",
            error: null,
            errorCode: null,
            errorTitle: null,
            errorNextSteps: null,
            importFileId,
            targetAccountId: fallbackAccountId,
            importedRows: recoveredRowsCount,
            progress: 100,
            progressLabel: "Visible in Clover",
          });
          publishImportActivity({
            workspaceId,
            surface: importActivitySurfaceRef.current,
            status: "done",
            fileName: item.file.name,
            fileIndex: items.findIndex((entry) => entry.id === itemId) + 1,
            fileTotal: items.length,
            completedFiles: Math.min(items.length, completedFileCount + 1),
            progress: 100,
            detail: "Accounts and transactions are visible. Clover will keep cleaning up names and categories in the background.",
            summary: finalizedRecoveredSummary,
            errorMessage: null,
          });

          return {
            status: "done",
            importedRows: recoveredRowsCount,
            summary: finalizedRecoveredSummary,
          };
        }

        updateItem(itemId, {
          status: "importing",
          confirmationState: "staged",
          error: null,
          importFileId,
          targetAccountId: fallbackAccountId,
          importedRows: recoveredRowsCount || 0,
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
            recoveredRowsCount
          ),
          summary: null,
          errorMessage: null,
        });
        if (recoverableImportFileId && fallbackAccountId) {
          void monitorQueuedImportAndConfirm(itemId, recoverableImportFileId, fallbackAccountId, {
            fileName: item.file.name,
            fallbackAccountName:
              deriveStatementFallbackAccountName(
                item.file.name,
                recoverableIdentity?.institution ?? null,
                recoverableIdentity?.accountNumber ?? null,
                recoverableIdentity?.accountType ?? null,
              ) ?? "Imported statement",
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
          importedRows: recoveredRowsCount || null,
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
      const errorItem =
        itemsRef.current.find((candidate) => processError.includes(`${candidate.file.name}:`)) ?? item;
      closeImportAfterError(errorItem.id, "process", errorItem.file.name, processError);
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
  const currentErrorItem = items.find((item) => item.status === "error") ?? null;
  const isSettledForProgress = (item: QueuedFile) =>
    item.confirmationState === "confirmed" ||
    item.status === "done" ||
    item.status === "error" ||
    hasVisibleImportData(item, localPreparseSummaryByItemIdRef.current.get(item.id));
  const progressSettledFileCount = items.filter(isSettledForProgress).length;
  const activeProgressContribution =
    activeProgressItem && !isSettledForProgress(activeProgressItem) ? activeProgressItem.progress / 100 : 0;
  const overallProgress = items.length > 0
    ? ((progressSettledFileCount + activeProgressContribution) / items.length) * 100
    : 0;
  const activitySnapshotForDisplay =
    lastImportActivityRef.current?.workspaceId === workspaceId &&
    lastImportActivityRef.current.fileTotal === items.length
      ? lastImportActivityRef.current
      : null;
  const activityCompletedFileCount = Math.min(
    items.length,
    Math.max(0, Number(activitySnapshotForDisplay?.completedFiles ?? 0))
  );
  const displayedCompletedFileCount = Math.max(progressSettledFileCount, activityCompletedFileCount);
  const activityProgressFloor = Math.max(0, Math.min(100, Number(activitySnapshotForDisplay?.progress ?? 0)));
  // `displayedOverallProgress` is intentionally animated only for the compact
  // background surface. A foreground upload must render the durable item
  // progress directly; otherwise its dock is reset to 0% for the whole import.
  const visibleOverallProgress = Math.max(overallProgress, activityProgressFloor);
  const hasCompletedBatch = items.length > 0 && items.every((item) => item.status === "done" || item.confirmationState === "confirmed");
  const completedImportSummary = hasCompletedBatch
    ? activitySnapshotForDisplay?.summary ?? buildVisibleImportSummary(items)
    : null;
  const progressSessionActive = busy || Boolean(activeItem) || hasCompletedBatch || Boolean(currentErrorItem);
  // Standard uploads stay in the modal until there is an explicit outcome.
  // The compact dock is reserved for imports the caller intentionally sends to
  // the background, so a completed import cannot silently disappear.
  const showCompactProgress = launchInBackground && compactProgressUnlocked && progressSessionActive;
  // Once a file has entered the queue, the file picker is no longer useful and
  // obscures the only progress the user needs to see. Keep the password prompt
  // as its own explicit interruption; every other upload uses one progress UI.
  const showImportProgressDock = items.length > 0 && progressSessionActive && !activePasswordItem;
  const targetDisplayProgress = showCompactProgress ? Math.max(overallProgress, activityProgressFloor) : 0;
  const shouldLockPageInteraction =
    open && !backgroundOnly && !launchInBackground && Boolean(activePasswordItem);
  const hasImportIssue = items.some((item) => item.status === "error" || item.status === "needs_password") || Boolean(validationNotice);
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

  const handleToggleUploadPause = () => {
    if (!busy || currentErrorItem) {
      return;
    }

    setUploadPaused((current) => {
      const next = !current;
      uploadPausedRef.current = next;
      setMessage(next ? "Upload paused. Clover will continue when you resume." : "Upload resumed.");
      publishImportActivity({
        workspaceId,
        surface: importActivitySurfaceRef.current,
        status: "active",
        fileName: activeProgressItem?.file.name ?? null,
        fileIndex: activeProgressItem ? items.findIndex((item) => item.id === activeProgressItem.id) + 1 : completedFileCount,
        fileTotal: items.length,
        completedFiles: completedFileCount,
        progress: displayedOverallProgress,
        detail: next ? "Upload paused. Clover will continue when you resume." : "Upload resumed.",
        summary: null,
        errorMessage: null,
      });
      return next;
    });
  };

  const handleCancelUpload = () => {
    if (!busy && !items.some((item) => item.status === "pending" || item.status === "parsing" || item.status === "importing")) {
      return;
    }

    uploadCancelRequestedRef.current = true;
    setUploadPaused(false);
    uploadPausedRef.current = false;
    for (const controller of activeUploadAbortControllersRef.current) {
      controller.abort();
    }
    activeUploadAbortControllersRef.current.clear();
    if (visibilityHardStopTimerRef.current) {
      window.clearTimeout(visibilityHardStopTimerRef.current);
      visibilityHardStopTimerRef.current = null;
    }
    visibilityDeadlineRef.current = null;
    const activeId = activeProgressItem?.id ?? null;
    markQueuedUploadsCanceled(activeId);
    setBusy(false);
    setMessage("Upload canceled.");
    publishImportActivity({
      workspaceId,
      surface: importActivitySurfaceRef.current,
      status: "error",
      fileName: activeProgressItem?.file.name ?? items.find((item) => item.status === "pending")?.file.name ?? null,
      fileIndex: activeProgressItem ? items.findIndex((item) => item.id === activeProgressItem.id) + 1 : completedFileCount,
      fileTotal: items.length,
      completedFiles: completedFileCount,
      progress: displayedOverallProgress,
      detail: "Upload canceled.",
      summary: null,
      errorMessage: "Upload canceled.",
      errorTitle: "Upload canceled",
      errorNextSteps: null,
    });
  };

  useEffect(() => {
    if (compactProgressUnlockTimerRef.current) {
      window.clearTimeout(compactProgressUnlockTimerRef.current);
      compactProgressUnlockTimerRef.current = null;
    }

    if (!open || backgroundOnly || !progressSessionActive) {
      compactProgressStartedAtRef.current = null;
      setCompactProgressUnlocked(false);
      return;
    }

    const startedAt = compactProgressStartedAtRef.current ?? Date.now();
    compactProgressStartedAtRef.current = startedAt;
    const remainingMs = Math.max(0, MIN_FULLSCREEN_IMPORT_MODAL_MS - (Date.now() - startedAt));

    if (remainingMs === 0) {
      setCompactProgressUnlocked(true);
      return;
    }

    setCompactProgressUnlocked(false);
    compactProgressUnlockTimerRef.current = window.setTimeout(() => {
      compactProgressUnlockTimerRef.current = null;
      setCompactProgressUnlocked(true);
    }, remainingMs);

    return () => {
      if (compactProgressUnlockTimerRef.current) {
        window.clearTimeout(compactProgressUnlockTimerRef.current);
        compactProgressUnlockTimerRef.current = null;
      }
    };
  }, [backgroundOnly, open, progressSessionActive]);

  useEffect(() => {
    if (!showCompactProgress) {
      setDisplayedOverallProgress(0);
      return;
    }

    let cancelled = false;

    const tick = () => {
      if (cancelled) {
        return;
      }

      setDisplayedOverallProgress((current) => {
        const target = Math.max(0, Math.min(100, targetDisplayProgress));

        if (target < current) {
          return target;
        }

        if (Math.abs(target - current) < 0.5) {
          return target;
        }

        const remaining = target - current;
        const step = target >= 100 ? Math.min(remaining, Math.max(2, remaining * 0.22)) : Math.min(remaining, Math.max(1, remaining * 0.35));
        return Math.min(target, current + step);
      });

      window.setTimeout(tick, targetDisplayProgress >= 100 ? 120 : 90);
    };

    tick();

    return () => {
      cancelled = true;
    };
  }, [showCompactProgress, targetDisplayProgress]);

  useEffect(() => {
    if (typeof document === "undefined" || !shouldLockPageInteraction) {
      return;
    }

    const body = document.body;
    const nextLockCount = Number(body.dataset.cloverImportModalLocks ?? "0") + 1;
    body.dataset.cloverImportModalLocks = String(nextLockCount);
    body.dataset.cloverImportModalOpen = "true";

    return () => {
      const currentLockCount = Number(body.dataset.cloverImportModalLocks ?? "1");
      const nextCount = Math.max(0, currentLockCount - 1);

      if (nextCount > 0) {
        body.dataset.cloverImportModalLocks = String(nextCount);
        return;
      }

      delete body.dataset.cloverImportModalLocks;
      delete body.dataset.cloverImportModalOpen;
    };
  }, [shouldLockPageInteraction]);

  useEffect(() => {
    if (typeof document === "undefined" || shouldLockPageInteraction) {
      return;
    }

    const body = document.body;
    if (open && (backgroundOnly || launchInBackground || showImportProgressDock)) {
      delete body.dataset.cloverImportModalLocks;
      delete body.dataset.cloverImportModalOpen;
    }
  }, [backgroundOnly, launchInBackground, open, shouldLockPageInteraction, showImportProgressDock]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    if (!open || backgroundOnly || launchInBackground || showImportProgressDock) {
      clearImportInteractionLocks();
    }
  }, [backgroundOnly, launchInBackground, open, showImportProgressDock]);

  useEffect(() => {
    if (typeof document === "undefined" || !open || backgroundOnly || launchInBackground || showImportProgressDock) {
      return;
    }

    const body = document.body;
    const nextVisibleCount = Number(body.dataset.cloverImportModalVisibleCount ?? "0") + 1;
    body.dataset.cloverImportModalVisibleCount = String(nextVisibleCount);
    body.dataset.cloverImportModalVisible = "true";

    return () => {
      const currentVisibleCount = Number(body.dataset.cloverImportModalVisibleCount ?? "1");
      const nextCount = Math.max(0, currentVisibleCount - 1);

      if (nextCount > 0) {
        body.dataset.cloverImportModalVisibleCount = String(nextCount);
        return;
      }

      delete body.dataset.cloverImportModalVisibleCount;
      delete body.dataset.cloverImportModalVisible;
    };
  }, [backgroundOnly, launchInBackground, open, showImportProgressDock]);

  useEffect(() => {
    if (!open || !workspaceId) {
      return;
    }

    if (primaryVisibilityCompletedRef.current) {
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
    const nextStatus = hasCompletedBatchNow ? "done" : items.some((item) => item.status === "error") ? "error" : "active";
    const nextDetail = activeProgressItem
      ? friendlyImportProgressLabel(activeProgressItem.progressLabel, activeProgressItem.file.name, activeProgressItem.importMode)
      : validationNotice ?? message;
    const activeErrorItem = items.find((item) => item.status === "error") ?? null;
    const previousSummary =
      lastImportActivityRef.current?.summary ??
      (hasCompletedBatchNow ? buildVisibleImportSummary(items) : null);
    const nextSnapshot: ImportActivitySnapshot = {
      importFileId: activeProgressItem?.importFileId ?? lastImportActivityRef.current?.importFileId ?? null,
      workspaceId,
      surface: importActivitySurfaceRef.current,
      status: nextStatus,
      fileName: activeProgressItem?.file.name ?? items[items.length - 1]?.file.name ?? null,
      fileIndex: activeProgressItem
        ? Math.max(
            items.findIndex((item) => item.id === activeProgressItem.id) + 1,
            Number(activitySnapshotForDisplay?.fileIndex ?? 0)
          )
        : displayedCompletedFileCount,
      fileTotal: items.length,
      completedFiles: displayedCompletedFileCount,
      progress: visibleOverallProgress,
      detail: nextDetail,
      summary: nextStatus === "done" ? previousSummary : null,
      errorCode: activeErrorItem?.errorCode ?? (validationNotice ? lastImportActivityRef.current?.errorCode ?? null : null),
      errorMessage: activeErrorItem?.error ?? validationNotice ?? null,
      errorTitle: activeErrorItem?.errorTitle ?? null,
      errorNextSteps: activeErrorItem?.errorNextSteps ?? null,
      timing: lastImportActivityRef.current?.timing ?? null,
      updatedAt: Date.now(),
    };
    if (
      nextSnapshot.status === "active" &&
      nextSnapshot.fileName &&
      retiredImportActivityFileNamesRef.current.has(nextSnapshot.fileName)
    ) {
      return;
    }
    if (nextSnapshot.status === "done" && nextSnapshot.fileName) {
      retiredImportActivityFileNamesRef.current.add(nextSnapshot.fileName);
    }

    lastImportActivityRef.current = nextSnapshot;
    setImportActivity(nextSnapshot);
  }, [activeProgressItem, activityProgressFloor, activitySnapshotForDisplay, busy, completedFileCount, displayedCompletedFileCount, items, message, open, progressSettledFileCount, validationNotice, visibleOverallProgress, workspaceId]);
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
    primaryVisibilityCompletedRef.current = false;
    uploadCancelRequestedRef.current = false;
    setUploadPaused(false);
    uploadPausedRef.current = false;
    // Keep a normal upload visible through its terminal success or failure.
    // Only callers that explicitly launch in the background use the compact
    // progress dock.
    setLaunchInBackground(backgroundOnly);
    importActivitySurfaceRef.current = backgroundOnly ? "background" : "modal";
    setBusy(true);
    setValidationNotice(null);
    setMessage("Clover is lining up your files...");
    const queuedItems = itemsRef.current;
    const visibilityTimeoutMs = getImportVisibilityTimeoutMsForItems(queuedItems);
    visibilityDeadlineRef.current = Date.now() + visibilityTimeoutMs;
    if (visibilityHardStopTimerRef.current) {
      window.clearTimeout(visibilityHardStopTimerRef.current);
    }
    visibilityHardStopTimerRef.current = window.setTimeout(() => {
      visibilityHardStopTimerRef.current = null;
      if (busy || itemsRef.current.some((item) => item.status === "pending" || item.status === "parsing" || item.status === "importing")) {
        if (hasActiveServerImport(itemsRef.current)) {
          visibilityDeadlineRef.current = null;
          return;
        }
        hardStopVisibleImportModal("deadline");
      }
    }, visibilityTimeoutMs);
    closeVisibleImportModalIfPrimaryDataReady();
    capturePostHogClientEventOnce(
      "first_import_started",
      {
        file_count: queuedItems.length,
        workspace_id: workspaceId || null,
      },
      analyticsOnceKey("first_import_started", "session")
    );

    let importedCount = 0;
    let blockedCount = 0;
    let stagedCount = 0;
    let errorCount = 0;
    const alreadyConfirmedCount = queuedItems.filter((item) => item.confirmationState === "confirmed").length;
    const uploadInsightsSummaries: UploadInsightsSummary[] = [];

    const itemsToProcess = queuedItems.filter(
      (item) => item.confirmationState !== "confirmed" && item.status !== "needs_password"
    );

    const processItemsSequentially = async (queue: QueuedFile[]) => {
      const results: Array<{ itemId: string; result: ImportProcessResult }> = [];

      for (const item of queue) {
        await waitForUploadResume();
        if (uploadCancelRequestedRef.current) {
          break;
        }

        const controller = new AbortController();
        activeUploadAbortControllersRef.current.add(controller);
        try {
          results.push({
            itemId: item.id,
            result: await processFile(item.id, { signal: controller.signal }),
          });
        } finally {
          activeUploadAbortControllersRef.current.delete(controller);
        }

        if (uploadCancelRequestedRef.current) {
          break;
        }
      }

      return results;
    };
    const getBatchImportMode = (item: QueuedFile) => inferImportModeForFile(item.file, item.importMode ?? "statement");
    const isFastImageBatchItem = (item: QueuedFile) => {
      const mode = getBatchImportMode(item);
      return isImageImportFile(item.file) && (mode === "statement" || mode === "receipt");
    };
    const processItemsForBatch = async (queue: QueuedFile[]) => {
      const canParallelizeQueue =
        queue.length > 1 &&
        (queue.every(isFastImageBatchItem) || queue.every(isServerHeavyStatementBatchItem));
      if (!canParallelizeQueue) {
        return processItemsSequentially(queue);
      }

      const results: Array<{ itemId: string; result: ImportProcessResult }> = [];
      let nextIndex = 0;
      const workerCount = Math.min(queue.every(isServerHeavyStatementBatchItem) ? 4 : 6, queue.length);

      const runWorker = async () => {
        while (!uploadCancelRequestedRef.current) {
          const item = queue[nextIndex];
          nextIndex += 1;
          if (!item) {
            return;
          }

          await waitForUploadResume();
          if (uploadCancelRequestedRef.current) {
            return;
          }

          const controller = new AbortController();
          activeUploadAbortControllersRef.current.add(controller);
          try {
            results.push({
              itemId: item.id,
              result: await processFile(item.id, { signal: controller.signal }),
            });
          } finally {
            activeUploadAbortControllersRef.current.delete(controller);
          }
        }
      };

      await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
      return results;
    };
    const hasBrowserParsableStatements = itemsToProcess.some((item) => {
      const mode = item.importMode ?? "statement";
      const lowerName = item.file.name.toLowerCase();
      return (
        mode === "statement" &&
        (lowerName.endsWith(".pdf") || lowerName.endsWith(".csv")) &&
        !shouldSkipClientStatementPreparse(item.file.name)
      );
    });

    const canContinueBatchInBackground = itemsToProcess.length <= 1;

    if (hasBrowserParsableStatements) {
      for (const item of itemsToProcess) {
        if (shouldSkipClientStatementPreparse(item.file.name)) {
          continue;
        }
        void preparsePendingItemLocally(item.id);
      }

      const preUploadVisibilityReady = await waitForLocalPrimaryVisibility(Math.min(3_000, 1_200 + queuedItems.length * 450));
      if (
        canContinueBatchInBackground &&
        preUploadVisibilityReady &&
        !uploadPausedRef.current &&
        !uploadCancelRequestedRef.current
      ) {
        void processItemsForBatch(itemsToProcess).finally(() => {
          router.refresh();
        });
        setBusy(false);
        visibilityDeadlineRef.current = null;
        if (visibilityHardStopTimerRef.current) {
          window.clearTimeout(visibilityHardStopTimerRef.current);
          visibilityHardStopTimerRef.current = null;
        }
        return;
      }
    }

    const processResultsPromise = processItemsForBatch(itemsToProcess);
    const localVisibilityReady = await waitForLocalPrimaryVisibility(Math.min(12_000, 4_000 + queuedItems.length * 2_000));

    if (
      canContinueBatchInBackground &&
      localVisibilityReady &&
      itemsToProcess.length > 0 &&
      !uploadPausedRef.current &&
      !uploadCancelRequestedRef.current
    ) {
      void processResultsPromise.finally(() => {
        router.refresh();
      });
      setBusy(false);
      visibilityDeadlineRef.current = null;
      if (visibilityHardStopTimerRef.current) {
        window.clearTimeout(visibilityHardStopTimerRef.current);
        visibilityHardStopTimerRef.current = null;
      }
      return;
    }

    const processResults = await processResultsPromise;

    if (uploadCancelRequestedRef.current) {
      setBusy(false);
      setUploadPaused(false);
      uploadPausedRef.current = false;
      visibilityDeadlineRef.current = null;
      if (visibilityHardStopTimerRef.current) {
        window.clearTimeout(visibilityHardStopTimerRef.current);
        visibilityHardStopTimerRef.current = null;
      }
      return;
    }

    const postProcessVisibilityDeadline = visibilityDeadlineRef.current;
    if (postProcessVisibilityDeadline && Date.now() >= postProcessVisibilityDeadline) {
      hardStopVisibleImportModal("deadline");
    }

    for (const { result } of processResults) {
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
    visibilityDeadlineRef.current = null;
    if (visibilityHardStopTimerRef.current) {
      window.clearTimeout(visibilityHardStopTimerRef.current);
      visibilityHardStopTimerRef.current = null;
    }

    const finishedEnough = blockedCount === 0 && errorCount === 0 && (importedCount > 0 || alreadyConfirmedCount === queuedItems.length);

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

        const completedSummary = combineUploadInsightsSummaries(uploadInsightsSummaries);
        if (completedSummary) {
          publishImportActivity({
            status: "done",
            fileName: completedSummary.fileName,
            fileIndex: queuedItems.length,
            fileTotal: queuedItems.length,
            completedFiles: queuedItems.length,
            progress: 100,
            detail: "Accounts and transactions are visible in Clover. Clover will keep cleaning up names and categories in the background.",
            summary: completedSummary,
          });
        }

        // Each file publishes its own account-specific summary as soon as it is visible.
        // Replaying a combined multi-file summary here makes single-account pages merge
        // unrelated previews and can cause accounts/transactions from different files to
        // replace each other during cache hydration.
        if (uploadInsightsSummaries.length === 1) {
          await Promise.resolve(onImported(uploadInsightsSummaries[0]));
        } else {
          router.refresh();
        }
      }
      // Stop the active-state effect from refreshing the completed snapshot and
      // allow the scheduled success dismissal to close the visible modal.
      primaryVisibilityCompletedRef.current = true;
      scheduleSuccessfulImportAutoClose();
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
      confirmationState: "pending",
      error: null,
      errorCode: null,
      errorTitle: null,
      errorNextSteps: null,
      progress: 0,
      progressLabel: "Preparing file",
    });
    publishImportActivity({
      workspaceId,
      surface: importActivitySurfaceRef.current,
      status: "active",
      fileName: item?.file.name ?? null,
      fileIndex: item ? itemsRef.current.findIndex((entry) => entry.id === itemId) + 1 : 0,
      fileTotal: itemsRef.current.length,
      completedFiles: completedFileCount,
      progress: IMPORT_PROGRESS.uploading,
      detail: "Password accepted. Clover is opening the statement.",
      summary: null,
      errorMessage: null,
    });

    const remainingLockedFiles = items.filter((item) => item.id !== itemId && item.status === "needs_password");
    if (remainingLockedFiles.length > 0) {
      setMessage("Password saved. Enter the next password to continue.");
      return;
    }

    setMessage("All passwords saved. Clover is starting the rest.");
    autoStartRef.current = true;
    scheduleQueuedImport();
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
          fallbackAccountName:
            deriveStatementFallbackAccountName(item.file.name, null, null, null) ?? "Imported statement",
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

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      reportImportClientStage("file_input_changed", {
        fileCount: event.target.files.length,
        workspaceReady: Boolean(workspaceId),
      });
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

  if (backgroundOnly && !activePasswordItem) {
    return null;
  }

  const portalTarget = typeof document === "undefined" ? null : document.body;
  if (!portalTarget) {
    return null;
  }

  const compactErrorSpec = currentErrorItem?.errorCode ? getImportErrorSpecForCode(currentErrorItem.errorCode) : null;

  const modalContent = activePasswordItem ? (
      <ImportPasswordModal
        open
        files={passwordItems.map((item) => ({
          id: item.id,
          name: item.file.name,
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
    ) : showImportProgressDock ? (
      <ImportUploadDock
        open
        tone={currentErrorItem ? "error" : hasCompletedBatch ? "success" : "default"}
        fileName={currentErrorItem?.file.name ?? activitySnapshotForDisplay?.fileName ?? activeProgressItem?.file.name ?? null}
        fileIndex={
          currentErrorItem
            ? items.findIndex((item) => item.id === currentErrorItem.id) + 1
            : activeProgressItem
              ? Math.max(
                  items.findIndex((item) => item.id === activeProgressItem.id) + 1,
                  Number(activitySnapshotForDisplay?.fileIndex ?? 0)
                )
              : displayedCompletedFileCount
        }
        fileTotal={items.length}
        completedFiles={displayedCompletedFileCount}
        progress={visibleOverallProgress}
        summary={completedImportSummary}
        detail={
          (currentErrorItem ? compactErrorSpec?.message ?? currentErrorItem.errorTitle ?? "Clover could not finish this import." : null) ??
          (activityProgressFloor > overallProgress && activitySnapshotForDisplay?.detail
            ? activitySnapshotForDisplay.detail
            : null) ??
          ((!activeProgressItem && hasCompletedBatch && message)
            ? message
            : friendlyImportProgressLabel(
                activeProgressItem ? activeProgressItem.progressLabel : completedFileCount > 0 ? "Done" : "Queued",
                activeProgressItem?.file.name ?? null,
                activeProgressItem?.importMode ?? null
              ))
        }
        errorCode={currentErrorItem?.errorCode ?? null}
        errorTitle={currentErrorItem?.errorTitle ?? null}
        errorNextSteps={currentErrorItem?.errorNextSteps ?? null}
        paused={uploadPaused}
        canControl={busy && !currentErrorItem}
        onPauseToggle={handleToggleUploadPause}
        onCancel={handleCancelUpload}
        phaseLabel={
          activeProgressItem
            ? friendlyImportPhaseLabel(activeProgressItem.progressLabel, activeProgressItem.file.name, activeProgressItem.importMode)
            : null
        }
        onClose={() => {
          if (currentErrorItem) {
            clearImportActivity();
            lastImportActivityRef.current = null;
          }
          onClose();
        }}
        />
    ) : (
    <div className="modal-backdrop modal-backdrop--import-fullscreen" role="presentation" onClick={onClose}>
      <section
        className="modal-card modal-card--wide accounts-import-modal glass"
        role="dialog"
        aria-modal="true"
        aria-label="Upload files"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="accounts-import-modal__toolbar">
          <button className="accounts-import-close" type="button" onClick={onClose} aria-label="Close upload files">
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
          <strong>Drop statements, receipts, and screenshots here</strong>
          <button className="button button-secondary button-small" type="button" onClick={openFilePicker}>
            Choose files
          </button>
        </div>

        <div className="accounts-import-footer-copy">
          {validationNotice ? <p className="accounts-import-footer-copy__warning">{validationNotice}</p> : null}
          {message ? <p className="accounts-import-footer-copy__status">{message}</p> : null}
          <p>
            Accepted files: PDF, CSV, JPG, JPEG, PNG, WEBP, HEIC, and HEIF.
            <br />
            Password-protected PDFs are supported.
          </p>
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
              {showManualTransactionLink ? (
                <Link className="button button-secondary button-small" href="/transactions?manual=1">
                  Add transactions manually
                </Link>
              ) : null}
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
                      <p>{item.errorCode ? getImportErrorSpecForCode(item.errorCode).message : item.error}</p>
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
                                : "Preparing file"}
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
          <button className="button button-primary" type="button" onClick={() => scheduleQueuedImport()} disabled={busy || !readyToImport || !workspaceId}>
            {busy ? "Uploading..." : "Upload files"}
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
