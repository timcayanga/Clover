import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { fetchImportFileCompat, updateImportFileCompat } from "@/lib/data-engine";
import {
  completeImportEnrichmentJob,
  MAX_IMPORT_ENRICHMENT_ATTEMPTS,
  isImportEnrichmentJobStale,
  upsertImportEnrichmentJob,
} from "@/lib/import-enrichment-jobs";
import { loadImportStatusSnapshot } from "@/lib/import-status-snapshot";
import { readCheckpointImportMode } from "@/lib/import-workflow";
import { prisma } from "@/lib/prisma";
import { processImportEnrichmentJobs } from "@/workers/import-processor";
import { after, NextResponse } from "next/server";
import {
  VISUAL_IMPORT_RETRY_LIMIT,
  coerceVisualImportAttempt,
  getNextVisualImportAttempt,
  getVisualImportRepairMessage,
  getVisualImportRetryMessage,
  shouldStopStaleVisualImportRetry,
  type VisualImportRecoveryMode,
} from "@/lib/import-visual-recovery";

export const dynamic = "force-dynamic";

const STALE_RECEIPT_PROCESSING_MS = 75 * 1000;
const STALE_RECEIPT_QUEUE_MS = 25 * 1000;
const STALE_RECEIPT_RECONCILING_MS = 45 * 1000;
const STALE_RECEIPT_STAGED_MS = 45 * 1000;
const STALE_RECEIPT_EMPTY_DONE_MS = 30 * 1000;
const STALE_STATEMENT_IMAGE_QUEUE_MS = 25 * 1000;
const STALE_STATEMENT_IMAGE_READING_MS = 75 * 1000;
const STALE_STATEMENT_IMAGE_RECONCILING_MS = 45 * 1000;
const STALE_STATEMENT_IMAGE_STAGED_MS = 45 * 1000;
const STALE_STATEMENT_IMAGE_EMPTY_DONE_MS = 30 * 1000;

const isImageImportFile = (fileName?: string | null, fileType?: string | null) =>
  String(fileType ?? "").toLowerCase().startsWith("image/") ||
  /\.(jpe?g|png|webp|heic|heif|gif|bmp|avif)$/i.test(String(fileName ?? "").toLowerCase());

const isPdfImportFile = (fileName?: string | null, fileType?: string | null) =>
  String(fileType ?? "").toLowerCase() === "application/pdf" ||
  /\.pdf$/i.test(String(fileName ?? "").toLowerCase());

const isVisualImportFile = (fileName?: string | null, fileType?: string | null) =>
  isImageImportFile(fileName, fileType) || isPdfImportFile(fileName, fileType);

export async function GET(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const { importId } = await params;
    const localDev = await isLocalDevHost();
    const { userId } = localDev ? { userId: "local-admin" } : await requireAuth();

    const importFile = await fetchImportFileCompat(importId);
    if (!importFile) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    if (!localDev) {
      await assertWorkspaceAccess(userId, importFile.workspaceId as string);
    }

    const snapshot = await loadImportStatusSnapshot(importId, {
      importFile,
      promoteFailedVisibleImport: true,
    });

    if (!snapshot) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    const importMode = readCheckpointImportMode(snapshot.statementCheckpoint?.sourceMetadata);
    const updatedAtMs = new Date(snapshot.importFile.updatedAt).getTime();
    const statementImageProcessingAgeMs = Number.isFinite(updatedAtMs) ? Date.now() - updatedAtMs : 0;
    const visualProcessingAttempt = coerceVisualImportAttempt(snapshot.importFile.processingAttempt);
    const visualImportIsOutOfRetryBudget = shouldStopStaleVisualImportRetry({
      processingAttempt: snapshot.importFile.processingAttempt,
      processingPhase: snapshot.importFile.processingPhase,
    });
    const countVisibleTransactions = async () =>
      prisma.transaction
        .count({
          where: {
            deletedAt: null,
            OR: [
              { importFileId: importId },
              {
                rawPayload: {
                  path: ["sourceImportFileId"],
                  equals: importId,
                },
              },
            ],
          },
        })
        .catch(() => 0);
    const keepVisualImportRecoverableAfterFailure = async (
      recoveryMode: VisualImportRecoveryMode,
      options?: { parsedRowsMessage?: string; parsedRowsCount?: number | null }
    ) => {
      const refreshedRows = await countVisibleTransactions();
      if (refreshedRows > 0) {
        await updateImportFileCompat(importId, {
          status: "done",
          processingPhase: "complete",
          processingMessage: "Transactions are visible. Clover is cleaning up names and categories in the background.",
          confirmedTransactionsCount: refreshedRows,
        }).catch(() => null);
        return;
      }

      const parsedRowsCount = Number(options?.parsedRowsCount ?? snapshot.parsedRowsCount ?? 0);
      if (parsedRowsCount > 0) {
        await updateImportFileCompat(importId, {
          status: "processing",
          processingPhase: "reconciling",
          processingMessage:
            options?.parsedRowsMessage ?? "Clover parsed rows from this file and is retrying the final save step.",
          confirmedTransactionsCount: 0,
        }).catch(() => null);
        return;
      }

      const nextAttempt = getNextVisualImportAttempt(snapshot.importFile.processingAttempt);
      if (nextAttempt <= VISUAL_IMPORT_RETRY_LIMIT) {
        await updateImportFileCompat(importId, {
          status: "processing",
          processingPhase: "queued_retry",
          processingAttempt: nextAttempt,
          processingMessage: getVisualImportRetryMessage(recoveryMode, nextAttempt),
          parsedRowsCount: 0,
          confirmedTransactionsCount: 0,
        }).catch(() => null);
        return;
      }

      await updateImportFileCompat(importId, {
        status: "failed",
        processingPhase: "repair_needed",
        processingMessage: getVisualImportRepairMessage(recoveryMode),
        parsedRowsCount: 0,
        confirmedTransactionsCount: 0,
      }).catch(() => null);
    };
    const staleStatementImageQueue =
      importMode === "statement" &&
      snapshot.importFile.status === "processing" &&
      (snapshot.importFile.processingPhase === "queued_retry" || snapshot.importFile.processingPhase === "reading_account_details") &&
      isVisualImportFile(snapshot.importFile.fileName, snapshot.importFile.fileType) &&
      snapshot.confirmedTransactionsCount === 0 &&
      snapshot.parsedRowsCount === 0 &&
      Number.isFinite(updatedAtMs) &&
      statementImageProcessingAgeMs >
        (snapshot.importFile.processingPhase === "reading_account_details"
          ? STALE_STATEMENT_IMAGE_READING_MS
          : STALE_STATEMENT_IMAGE_QUEUE_MS);

    if (staleStatementImageQueue) {
      if (visualImportIsOutOfRetryBudget) {
        await updateImportFileCompat(importId, {
          status: "failed",
          processingPhase: "repair_needed",
          processingMessage: getVisualImportRepairMessage("statement"),
          parsedRowsCount: 0,
          confirmedTransactionsCount: 0,
        });
        const refreshedSnapshot = await loadImportStatusSnapshot(importId, {
          importFile: (await fetchImportFileCompat(importId)) ?? importFile,
          promoteFailedVisibleImport: true,
        });
        if (refreshedSnapshot) {
          return NextResponse.json({
            ...refreshedSnapshot,
            statementSelfHeal: {
              reason: "statement_image_retry_budget_exhausted",
              retryLimit: VISUAL_IMPORT_RETRY_LIMIT,
            },
          });
        }
      }
      await updateImportFileCompat(importId, {
        status: "processing",
        processingPhase: "reading_account_details",
        processingMessage: "Starting screenshot import...",
      });
      after(async () => {
        try {
          const { getConfiguredPdfJsBaseUrl } = await import("@/lib/import-file-text.server");
          const { processImportFileText } = await import("@/workers/import-processor");
          await processImportFileText(importId, {
            actorUserId: userId,
            qaSource: "import_processing",
            importMode: "statement",
            pdfJsBaseUrl: getConfiguredPdfJsBaseUrl(),
          });
        } catch {
          await keepVisualImportRecoverableAfterFailure("statement");
        }
      });
      const refreshedSnapshot = await loadImportStatusSnapshot(importId, {
        importFile: (await fetchImportFileCompat(importId)) ?? importFile,
        promoteFailedVisibleImport: true,
      });
      if (refreshedSnapshot) {
        return NextResponse.json({
          ...refreshedSnapshot,
          statementSelfHeal: {
            reason: "stale_statement_image_queue",
            staleAfterSeconds: Math.round(STALE_STATEMENT_IMAGE_QUEUE_MS / 1000),
          },
        });
      }
    }

    const staleReceiptQueue =
      importMode === "receipt" &&
      snapshot.importFile.status === "processing" &&
      (snapshot.importFile.processingPhase === "queued_retry" ||
        snapshot.importFile.processingPhase === "reading_receipt_vision" ||
        snapshot.importFile.processingPhase === "reading_account_details") &&
      isVisualImportFile(snapshot.importFile.fileName, snapshot.importFile.fileType) &&
      snapshot.confirmedTransactionsCount === 0 &&
      snapshot.parsedRowsCount === 0 &&
      Number.isFinite(updatedAtMs) &&
      statementImageProcessingAgeMs > STALE_RECEIPT_QUEUE_MS;

    if (staleReceiptQueue) {
      if (visualImportIsOutOfRetryBudget) {
        await updateImportFileCompat(importId, {
          status: "failed",
          processingPhase: "repair_needed",
          processingMessage: getVisualImportRepairMessage("receipt"),
          parsedRowsCount: 0,
          confirmedTransactionsCount: 0,
        });
        const refreshedSnapshot = await loadImportStatusSnapshot(importId, {
          importFile: (await fetchImportFileCompat(importId)) ?? importFile,
          promoteFailedVisibleImport: true,
        });
        if (refreshedSnapshot) {
          return NextResponse.json({
            ...refreshedSnapshot,
            receiptSelfHeal: {
              reason: "receipt_retry_budget_exhausted",
              retryLimit: VISUAL_IMPORT_RETRY_LIMIT,
            },
          });
        }
      }
      await updateImportFileCompat(importId, {
        status: "processing",
        processingPhase: "reading_receipt_vision",
        processingMessage: "Retrying receipt import...",
      });
      after(async () => {
        try {
          const { getConfiguredPdfJsBaseUrl } = await import("@/lib/import-file-text.server");
          const { processImportFileText } = await import("@/workers/import-processor");
          await processImportFileText(importId, {
            actorUserId: userId,
            qaSource: "import_processing",
            importMode: "receipt",
            pdfJsBaseUrl: getConfiguredPdfJsBaseUrl(),
          });
        } catch {
          await keepVisualImportRecoverableAfterFailure("receipt");
        }
      });
      const refreshedSnapshot = await loadImportStatusSnapshot(importId, {
        importFile: (await fetchImportFileCompat(importId)) ?? importFile,
        promoteFailedVisibleImport: true,
      });
      if (refreshedSnapshot) {
        return NextResponse.json({
          ...refreshedSnapshot,
          receiptSelfHeal: {
            reason: "stale_receipt_queue",
            staleAfterSeconds: Math.round(STALE_RECEIPT_QUEUE_MS / 1000),
          },
        });
      }
    }

    const visualImportWithoutMode =
      importMode === null && isVisualImportFile(snapshot.importFile.fileName, snapshot.importFile.fileType);
    const staleStatementImageEmptyDone =
      (importMode === "statement" || visualImportWithoutMode) &&
      (snapshot.importFile.status === "done" || snapshot.importFile.status === "failed") &&
      isVisualImportFile(snapshot.importFile.fileName, snapshot.importFile.fileType) &&
      snapshot.confirmedTransactionsCount === 0 &&
      snapshot.parsedRowsCount === 0 &&
      Number.isFinite(updatedAtMs) &&
      (snapshot.importFile.status === "failed" || statementImageProcessingAgeMs > STALE_STATEMENT_IMAGE_EMPTY_DONE_MS);

    if (staleStatementImageEmptyDone) {
      if (visualProcessingAttempt >= VISUAL_IMPORT_RETRY_LIMIT) {
        await updateImportFileCompat(importId, {
          status: "failed",
          processingPhase: "repair_needed",
          processingMessage: getVisualImportRepairMessage("statement"),
          parsedRowsCount: 0,
          confirmedTransactionsCount: 0,
        });
        const refreshedSnapshot = await loadImportStatusSnapshot(importId, {
          importFile: (await fetchImportFileCompat(importId)) ?? importFile,
          promoteFailedVisibleImport: true,
        });
        if (refreshedSnapshot) {
          return NextResponse.json({
            ...refreshedSnapshot,
            statementSelfHeal: {
              reason: "statement_image_empty_done_retry_budget_exhausted",
              retryLimit: VISUAL_IMPORT_RETRY_LIMIT,
            },
          });
        }
      }
      await updateImportFileCompat(importId, {
        status: "processing",
        processingPhase: "reading_account_details",
        processingMessage: "Retrying screenshot import...",
      });
      after(async () => {
        try {
          const { getConfiguredPdfJsBaseUrl } = await import("@/lib/import-file-text.server");
          const { processImportFileText } = await import("@/workers/import-processor");
          await processImportFileText(importId, {
            actorUserId: userId,
            qaSource: "import_processing",
            importMode: "statement",
            pdfJsBaseUrl: getConfiguredPdfJsBaseUrl(),
          });
        } catch {
          await keepVisualImportRecoverableAfterFailure("statement");
        }
      });
      const refreshedSnapshot = await loadImportStatusSnapshot(importId, {
        importFile: (await fetchImportFileCompat(importId)) ?? importFile,
        promoteFailedVisibleImport: true,
      });
      if (refreshedSnapshot) {
        return NextResponse.json({
          ...refreshedSnapshot,
          statementSelfHeal: {
            reason: "stale_statement_image_empty_done",
            staleAfterSeconds: Math.round(STALE_STATEMENT_IMAGE_EMPTY_DONE_MS / 1000),
          },
        });
      }
    }

    const staleReceiptEmptyDone =
      importMode === "receipt" &&
      (snapshot.importFile.status === "done" || snapshot.importFile.status === "failed") &&
      isVisualImportFile(snapshot.importFile.fileName, snapshot.importFile.fileType) &&
      snapshot.confirmedTransactionsCount === 0 &&
      snapshot.parsedRowsCount === 0 &&
      Number.isFinite(updatedAtMs) &&
      (snapshot.importFile.status === "failed" || statementImageProcessingAgeMs > STALE_RECEIPT_EMPTY_DONE_MS);

    if (staleReceiptEmptyDone) {
      if (visualProcessingAttempt >= VISUAL_IMPORT_RETRY_LIMIT) {
        await updateImportFileCompat(importId, {
          status: "failed",
          processingPhase: "repair_needed",
          processingMessage: getVisualImportRepairMessage("receipt"),
          parsedRowsCount: 0,
          confirmedTransactionsCount: 0,
        });
        const refreshedSnapshot = await loadImportStatusSnapshot(importId, {
          importFile: (await fetchImportFileCompat(importId)) ?? importFile,
          promoteFailedVisibleImport: true,
        });
        if (refreshedSnapshot) {
          return NextResponse.json({
            ...refreshedSnapshot,
            receiptSelfHeal: {
              reason: "receipt_empty_done_retry_budget_exhausted",
              retryLimit: VISUAL_IMPORT_RETRY_LIMIT,
            },
          });
        }
      }
      await updateImportFileCompat(importId, {
        status: "processing",
        processingPhase: "reading_receipt_vision",
        processingMessage: "Retrying receipt import...",
      });
      after(async () => {
        try {
          const { getConfiguredPdfJsBaseUrl } = await import("@/lib/import-file-text.server");
          const { processImportFileText } = await import("@/workers/import-processor");
          await processImportFileText(importId, {
            actorUserId: userId,
            qaSource: "import_processing",
            importMode: "receipt",
            pdfJsBaseUrl: getConfiguredPdfJsBaseUrl(),
          });
        } catch {
          await keepVisualImportRecoverableAfterFailure("receipt");
        }
      });
      const refreshedSnapshot = await loadImportStatusSnapshot(importId, {
        importFile: (await fetchImportFileCompat(importId)) ?? importFile,
        promoteFailedVisibleImport: true,
      });
      if (refreshedSnapshot) {
        return NextResponse.json({
          ...refreshedSnapshot,
          receiptSelfHeal: {
            reason: "stale_receipt_empty_done",
            staleAfterSeconds: Math.round(STALE_RECEIPT_EMPTY_DONE_MS / 1000),
          },
        });
      }
    }

    const staleStatementImageReconciling =
      importMode === "statement" &&
      snapshot.importFile.status === "processing" &&
      snapshot.importFile.processingPhase === "reconciling" &&
      isVisualImportFile(snapshot.importFile.fileName, snapshot.importFile.fileType) &&
      !snapshot.accountDetailOnlyImport &&
      snapshot.confirmedTransactionsCount === 0 &&
      snapshot.parsedRowsCount > 0 &&
      Number.isFinite(updatedAtMs) &&
      Date.now() - updatedAtMs > STALE_STATEMENT_IMAGE_RECONCILING_MS;

    if (staleStatementImageReconciling) {
      await updateImportFileCompat(importId, {
        status: "processing",
        processingPhase: "reconciling",
        processingMessage: "Saving screenshot transactions...",
      });
      after(async () => {
        try {
          const { confirmImportFile } = await import("@/workers/import-processor");
          const result = await confirmImportFile(importId, null);
          if (result.status === "done") {
            await updateImportFileCompat(importId, {
              status: "done",
              processingPhase: "complete",
              processingMessage: "Screenshot transactions imported.",
              confirmedTransactionsCount: result.confirmedTransactionsCount ?? result.imported,
            }).catch(() => null);
          }
        } catch {
          await keepVisualImportRecoverableAfterFailure("statement", {
            parsedRowsMessage: "Clover read rows from this screenshot and is retrying the final save step.",
            parsedRowsCount: snapshot.parsedRowsCount,
          });
        }
      });
      const refreshedSnapshot = await loadImportStatusSnapshot(importId, {
        importFile: (await fetchImportFileCompat(importId)) ?? importFile,
        promoteFailedVisibleImport: true,
      });
      if (refreshedSnapshot) {
        return NextResponse.json({
          ...refreshedSnapshot,
          statementSelfHeal: {
            reason: "stale_statement_image_reconciling",
            staleAfterSeconds: Math.round(STALE_STATEMENT_IMAGE_RECONCILING_MS / 1000),
          },
        });
      }
    }

    const staleReceiptReconciling =
      importMode === "receipt" &&
      snapshot.importFile.status === "processing" &&
      snapshot.importFile.processingPhase === "reconciling" &&
      isVisualImportFile(snapshot.importFile.fileName, snapshot.importFile.fileType) &&
      snapshot.confirmedTransactionsCount === 0 &&
      snapshot.parsedRowsCount > 0 &&
      Number.isFinite(updatedAtMs) &&
      Date.now() - updatedAtMs > STALE_RECEIPT_RECONCILING_MS;

    if (staleReceiptReconciling) {
      await updateImportFileCompat(importId, {
        status: "processing",
        processingPhase: "reconciling",
        processingMessage: "Saving receipt transaction...",
      });
      after(async () => {
        try {
          const { confirmImportFile } = await import("@/workers/import-processor");
          const result = await confirmImportFile(importId, null);
          if (result.status === "done") {
            await updateImportFileCompat(importId, {
              status: "done",
              processingPhase: "complete",
              processingMessage: "Receipt transaction imported.",
              confirmedTransactionsCount: result.confirmedTransactionsCount ?? result.imported,
            }).catch(() => null);
          }
        } catch {
          await keepVisualImportRecoverableAfterFailure("receipt", {
            parsedRowsMessage: "Clover read this receipt and is retrying the final save step.",
            parsedRowsCount: snapshot.parsedRowsCount,
          });
        }
      });
      const refreshedSnapshot = await loadImportStatusSnapshot(importId, {
        importFile: (await fetchImportFileCompat(importId)) ?? importFile,
        promoteFailedVisibleImport: true,
      });
      if (refreshedSnapshot) {
        return NextResponse.json({
          ...refreshedSnapshot,
          receiptSelfHeal: {
            reason: "stale_receipt_reconciling",
            staleAfterSeconds: Math.round(STALE_RECEIPT_RECONCILING_MS / 1000),
          },
        });
      }
    }

    const staleStatementImageStaged =
      importMode === "statement" &&
      snapshot.importFile.status === "processing" &&
      snapshot.importFile.processingPhase === "staged" &&
      isVisualImportFile(snapshot.importFile.fileName, snapshot.importFile.fileType) &&
      !snapshot.accountDetailOnlyImport &&
      snapshot.confirmedTransactionsCount === 0 &&
      snapshot.parsedRowsCount > 0 &&
      Number.isFinite(updatedAtMs) &&
      Date.now() - updatedAtMs > STALE_STATEMENT_IMAGE_STAGED_MS;

    if (staleStatementImageStaged) {
      await updateImportFileCompat(importId, {
        status: "processing",
        processingPhase: "reconciling",
        processingMessage: "Finalizing screenshot transactions...",
      });
      after(async () => {
        try {
          const { confirmImportFile } = await import("@/workers/import-processor");
          const result = await confirmImportFile(importId, null);
          if (result.status === "done") {
            await updateImportFileCompat(importId, {
              status: "done",
              processingPhase: "complete",
              processingMessage: "Screenshot transactions imported.",
              confirmedTransactionsCount: result.confirmedTransactionsCount ?? result.imported,
            }).catch(() => null);
          }
        } catch {
          await keepVisualImportRecoverableAfterFailure("statement", {
            parsedRowsMessage: "Clover saved rows from this screenshot and is retrying the final linking step.",
            parsedRowsCount: snapshot.parsedRowsCount,
          });
        }
      });
      const refreshedSnapshot = await loadImportStatusSnapshot(importId, {
        importFile: (await fetchImportFileCompat(importId)) ?? importFile,
        promoteFailedVisibleImport: true,
      });
      if (refreshedSnapshot) {
        return NextResponse.json({
          ...refreshedSnapshot,
          statementSelfHeal: {
            reason: "stale_statement_image_staged",
            staleAfterSeconds: Math.round(STALE_STATEMENT_IMAGE_STAGED_MS / 1000),
          },
        });
      }
    }

    const staleReceiptStaged =
      importMode === "receipt" &&
      snapshot.importFile.status === "processing" &&
      snapshot.importFile.processingPhase === "staged" &&
      isVisualImportFile(snapshot.importFile.fileName, snapshot.importFile.fileType) &&
      snapshot.confirmedTransactionsCount === 0 &&
      snapshot.parsedRowsCount > 0 &&
      Number.isFinite(updatedAtMs) &&
      Date.now() - updatedAtMs > STALE_RECEIPT_STAGED_MS;

    if (staleReceiptStaged) {
      await updateImportFileCompat(importId, {
        status: "processing",
        processingPhase: "reconciling",
        processingMessage: "Finalizing receipt transaction...",
      });
      after(async () => {
        try {
          const { confirmImportFile } = await import("@/workers/import-processor");
          const result = await confirmImportFile(importId, null);
          if (result.status === "done") {
            await updateImportFileCompat(importId, {
              status: "done",
              processingPhase: "complete",
              processingMessage: "Receipt transaction imported.",
              confirmedTransactionsCount: result.confirmedTransactionsCount ?? result.imported,
            }).catch(() => null);
          }
        } catch {
          await keepVisualImportRecoverableAfterFailure("receipt", {
            parsedRowsMessage: "Clover saved this receipt and is retrying the final linking step.",
            parsedRowsCount: snapshot.parsedRowsCount,
          });
        }
      });
      const refreshedSnapshot = await loadImportStatusSnapshot(importId, {
        importFile: (await fetchImportFileCompat(importId)) ?? importFile,
        promoteFailedVisibleImport: true,
      });
      if (refreshedSnapshot) {
        return NextResponse.json({
          ...refreshedSnapshot,
          receiptSelfHeal: {
            reason: "stale_receipt_staged",
            staleAfterSeconds: Math.round(STALE_RECEIPT_STAGED_MS / 1000),
          },
        });
      }
    }

    const receiptHasVisibleData =
      Boolean(snapshot.receiptDocument) ||
      Boolean(snapshot.receiptTransaction) ||
      snapshot.confirmedTransactionsCount > 0 ||
      snapshot.parsedRowsCount > 0;
    const staleReceiptProcessing =
      importMode === "receipt" &&
      snapshot.importFile.status === "processing" &&
      !receiptHasVisibleData &&
      Number.isFinite(updatedAtMs) &&
      Date.now() - updatedAtMs >
        (snapshot.importFile.processingPhase === "queued_retry"
          ? STALE_RECEIPT_QUEUE_MS
          : STALE_RECEIPT_PROCESSING_MS);

    if (staleReceiptProcessing) {
      await updateImportFileCompat(importId, {
        status: "processing",
        processingPhase: "reading_receipt_vision",
        processingMessage: "Restarting receipt reading...",
        parsedRowsCount: 0,
        confirmedTransactionsCount: 0,
      });
      after(async () => {
        try {
          const { getConfiguredPdfJsBaseUrl } = await import("@/lib/import-file-text.server");
          const { processImportFileText } = await import("@/workers/import-processor");
          await processImportFileText(importId, {
            actorUserId: userId,
            qaSource: "import_processing",
            importMode: "receipt",
            pdfJsBaseUrl: getConfiguredPdfJsBaseUrl(),
          });
        } catch {
          const refreshedSnapshot = await loadImportStatusSnapshot(importId, {
            importFile: (await fetchImportFileCompat(importId)) ?? importFile,
            promoteFailedVisibleImport: true,
          }).catch(() => null);
          const refreshedHasVisibleData =
            Boolean(refreshedSnapshot?.receiptDocument) ||
            Boolean(refreshedSnapshot?.receiptTransaction) ||
            Number(refreshedSnapshot?.confirmedTransactionsCount ?? 0) > 0 ||
            Number(refreshedSnapshot?.parsedRowsCount ?? 0) > 0;
          if (!refreshedHasVisibleData) {
            await keepVisualImportRecoverableAfterFailure("receipt", {
              parsedRowsCount: refreshedSnapshot?.parsedRowsCount ?? snapshot.parsedRowsCount,
            });
          }
        }
      });
      const refreshedSnapshot = await loadImportStatusSnapshot(importId, {
        importFile: (await fetchImportFileCompat(importId)) ?? importFile,
        promoteFailedVisibleImport: true,
      });
      if (refreshedSnapshot) {
        return NextResponse.json({
          ...refreshedSnapshot,
          receiptSelfHeal: {
            reason: "stale_receipt_processing",
            staleAfterSeconds: Math.round(
              (snapshot.importFile.processingPhase === "queued_retry"
                ? STALE_RECEIPT_QUEUE_MS
                : STALE_RECEIPT_PROCESSING_MS) / 1000
            ),
          },
        });
      }
    }

    const shouldSelfHealEnrichment =
      snapshot.visibleImportComplete &&
      (!snapshot.enrichmentJob ||
        snapshot.enrichmentJob.status === "queued" ||
        snapshot.enrichmentJob.status === "retrying" ||
        snapshot.enrichmentJob.status === "failed" ||
        isImportEnrichmentJobStale(snapshot.enrichmentJob));
    if (shouldSelfHealEnrichment) {
      const [parsedRowCount, needsCleanupCount] = await Promise.all([
        prisma.parsedTransaction.count({ where: { importFileId: importId } }),
        prisma.transaction.count({
          where: {
            deletedAt: null,
            OR: [
              { importFileId: importId },
              {
                rawPayload: {
                  path: ["sourceImportFileId"],
                  equals: importId,
                },
              },
            ],
            reviewStatus: { notIn: ["edited", "rejected", "duplicate_skipped"] },
            AND: [
              {
                OR: [{ merchantClean: null }, { categoryId: null }, { category: { is: { name: "Other" } } }],
              },
            ],
          },
        }),
      ]);
      if (parsedRowCount > 0 && needsCleanupCount > 0) {
        await upsertImportEnrichmentJob({
            workspaceId: String(importFile.workspaceId),
            importFileId: importId,
            totalRows: parsedRowCount,
            phase: "queued",
            forceRequeue: snapshot.enrichmentJob?.status === "failed",
          });
        const result = await processImportEnrichmentJobs({
          importFileId: importId,
          limit: MAX_IMPORT_ENRICHMENT_ATTEMPTS,
          batchSize: 500,
          workerId: `status-import-enrichment-${userId}`,
        });
        const refreshedSnapshot = await loadImportStatusSnapshot(importId, {
          importFile: (await fetchImportFileCompat(importId)) ?? importFile,
          promoteFailedVisibleImport: true,
        });
        if (refreshedSnapshot) {
          return NextResponse.json({ ...refreshedSnapshot, enrichmentSelfHeal: result });
        }
      } else if (snapshot.enrichmentJob && needsCleanupCount === 0 && snapshot.enrichmentJob.status !== "done") {
        await completeImportEnrichmentJob({ id: snapshot.enrichmentJob.id, totalRows: parsedRowCount });
        const refreshedSnapshot = await loadImportStatusSnapshot(importId, {
          importFile: (await fetchImportFileCompat(importId)) ?? importFile,
          promoteFailedVisibleImport: true,
        });
        if (refreshedSnapshot) {
          return NextResponse.json({ ...refreshedSnapshot, enrichmentSelfHeal: { processedJobs: 0, results: [] } });
        }
      }
    }

    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json({ error: "Unable to load import status" }, { status: 400 });
  }
}
