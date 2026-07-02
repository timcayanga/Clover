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
const VISUAL_IMPORT_RETRY_LIMIT = 2;

const isImageImportFile = (fileName?: string | null, fileType?: string | null) =>
  String(fileType ?? "").toLowerCase().startsWith("image/") ||
  /\.(jpe?g|png|webp|heic|heif|gif|bmp|avif)$/i.test(String(fileName ?? "").toLowerCase());

const getVisualRepairMessage = (importMode: "receipt" | "statement") =>
  importMode === "receipt"
    ? "Clover tried the local and backup receipt readers but still could not extract enough reliable details. Please retry with a clearer photo or a different angle."
    : "Clover tried the local and backup image readers but still could not extract enough reliable details. Please retry with a clearer file or a different angle.";

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
    const visualProcessingAttempt = Math.max(0, Math.floor(Number(snapshot.importFile.processingAttempt ?? 0) || 0));
    const visualImportIsOutOfRetryBudget =
      visualProcessingAttempt >= VISUAL_IMPORT_RETRY_LIMIT && snapshot.importFile.processingPhase !== "queued_retry";
    const staleStatementImageQueue =
      importMode === "statement" &&
      snapshot.importFile.status === "processing" &&
      (snapshot.importFile.processingPhase === "queued_retry" || snapshot.importFile.processingPhase === "reading_account_details") &&
      isImageImportFile(snapshot.importFile.fileName, snapshot.importFile.fileType) &&
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
          processingMessage: getVisualRepairMessage("statement"),
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
          const refreshedRows = await prisma.transaction
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
          if (refreshedRows === 0) {
            await updateImportFileCompat(importId, {
              status: "failed",
              processingPhase: "repair_needed",
              processingMessage: getVisualRepairMessage("statement"),
              parsedRowsCount: 0,
              confirmedTransactionsCount: 0,
            }).catch(() => null);
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
      isImageImportFile(snapshot.importFile.fileName, snapshot.importFile.fileType) &&
      snapshot.confirmedTransactionsCount === 0 &&
      snapshot.parsedRowsCount === 0 &&
      Number.isFinite(updatedAtMs) &&
      statementImageProcessingAgeMs > STALE_RECEIPT_QUEUE_MS;

    if (staleReceiptQueue) {
      if (visualImportIsOutOfRetryBudget) {
        await updateImportFileCompat(importId, {
          status: "failed",
          processingPhase: "repair_needed",
          processingMessage: getVisualRepairMessage("receipt"),
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
          const refreshedRows = await prisma.transaction
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
          if (refreshedRows === 0) {
            await updateImportFileCompat(importId, {
              status: "failed",
              processingPhase: "repair_needed",
              processingMessage: getVisualRepairMessage("receipt"),
              parsedRowsCount: 0,
              confirmedTransactionsCount: 0,
            }).catch(() => null);
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
            reason: "stale_receipt_queue",
            staleAfterSeconds: Math.round(STALE_RECEIPT_QUEUE_MS / 1000),
          },
        });
      }
    }

    const staleStatementImageEmptyDone =
      importMode === "statement" &&
      (snapshot.importFile.status === "done" || snapshot.importFile.status === "failed") &&
      isImageImportFile(snapshot.importFile.fileName, snapshot.importFile.fileType) &&
      snapshot.confirmedTransactionsCount === 0 &&
      snapshot.parsedRowsCount === 0 &&
      Number.isFinite(updatedAtMs) &&
      statementImageProcessingAgeMs > STALE_STATEMENT_IMAGE_EMPTY_DONE_MS;

    if (staleStatementImageEmptyDone) {
      if (visualProcessingAttempt >= VISUAL_IMPORT_RETRY_LIMIT) {
        await updateImportFileCompat(importId, {
          status: "failed",
          processingPhase: "repair_needed",
          processingMessage: getVisualRepairMessage("statement"),
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
          await updateImportFileCompat(importId, {
            status: "failed",
            processingPhase: "repair_needed",
            processingMessage: getVisualRepairMessage("statement"),
            parsedRowsCount: 0,
            confirmedTransactionsCount: 0,
          }).catch(() => null);
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
      isImageImportFile(snapshot.importFile.fileName, snapshot.importFile.fileType) &&
      snapshot.confirmedTransactionsCount === 0 &&
      snapshot.parsedRowsCount === 0 &&
      Number.isFinite(updatedAtMs) &&
      statementImageProcessingAgeMs > STALE_RECEIPT_EMPTY_DONE_MS;

    if (staleReceiptEmptyDone) {
      if (visualProcessingAttempt >= VISUAL_IMPORT_RETRY_LIMIT) {
        await updateImportFileCompat(importId, {
          status: "failed",
          processingPhase: "repair_needed",
          processingMessage: getVisualRepairMessage("receipt"),
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
          await updateImportFileCompat(importId, {
            status: "failed",
            processingPhase: "repair_needed",
            processingMessage: getVisualRepairMessage("receipt"),
            parsedRowsCount: 0,
            confirmedTransactionsCount: 0,
          }).catch(() => null);
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
      isImageImportFile(snapshot.importFile.fileName, snapshot.importFile.fileType) &&
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
          const refreshedRows = await prisma.transaction
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
          if (refreshedRows === 0) {
            await updateImportFileCompat(importId, {
              status: "failed",
              processingPhase: "repair_needed",
              processingMessage: "Clover read rows from this screenshot, but could not save them yet. Please retry the import.",
            }).catch(() => null);
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
      isImageImportFile(snapshot.importFile.fileName, snapshot.importFile.fileType) &&
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
          const refreshedRows = await prisma.transaction
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
          if (refreshedRows === 0) {
            await updateImportFileCompat(importId, {
              status: "failed",
              processingPhase: "repair_needed",
              processingMessage: "Clover read this receipt but couldn't save the transaction yet. Please retry the import.",
              confirmedTransactionsCount: 0,
            }).catch(() => null);
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
      isImageImportFile(snapshot.importFile.fileName, snapshot.importFile.fileType) &&
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
          const refreshedRows = await prisma.transaction
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
          if (refreshedRows === 0) {
            await updateImportFileCompat(importId, {
              status: "failed",
              processingPhase: "repair_needed",
              processingMessage: "Clover saved rows from this screenshot, but could not finish linking them yet. Please retry the import.",
            }).catch(() => null);
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
      isImageImportFile(snapshot.importFile.fileName, snapshot.importFile.fileType) &&
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
          const refreshedRows = await prisma.transaction
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
          if (refreshedRows === 0) {
            await updateImportFileCompat(importId, {
              status: "failed",
              processingPhase: "repair_needed",
              processingMessage: "Clover saved this receipt but couldn't finish linking the transaction yet. Please retry the import.",
              confirmedTransactionsCount: 0,
            }).catch(() => null);
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
            await updateImportFileCompat(importId, {
              status: "failed",
              processingPhase: "repair_needed",
              processingMessage: getVisualRepairMessage("receipt"),
              parsedRowsCount: 0,
              confirmedTransactionsCount: 0,
            }).catch(() => null);
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
