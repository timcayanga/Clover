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
import { mergeCheckpointSourceMetadata, readCheckpointImportMode } from "@/lib/import-workflow";
import { prisma } from "@/lib/prisma";
import { processImportEnrichmentJobs } from "@/workers/import-processor";
import { after, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const STALE_RECEIPT_PROCESSING_MS = 3 * 60 * 1000;
const STALE_STATEMENT_IMAGE_QUEUE_MS = 15 * 1000;
const STALE_STATEMENT_IMAGE_READING_MS = 45 * 1000;
const STALE_STATEMENT_IMAGE_BACKUP_HANDOFF_MS = 90 * 1000;
const STALE_STATEMENT_IMAGE_RECONCILING_MS = 30 * 1000;
const STALE_STATEMENT_IMAGE_STAGED_MS = 30 * 1000;
const STALE_STATEMENT_IMAGE_EMPTY_DONE_MS = 15 * 1000;

const isImageImportFile = (fileName?: string | null, fileType?: string | null) =>
  String(fileType ?? "").toLowerCase().startsWith("image/") ||
  /\.(jpe?g|png|webp|heic|heif|gif|bmp|avif)$/i.test(String(fileName ?? "").toLowerCase());

const isBackupParserHandoffMessage = (value?: string | null) =>
  /backup parser|double-checking this file|local parse looks incomplete/i.test(String(value ?? ""));

const isRecoverableImageImportMode = (value?: string | null) =>
  value === "statement" || value === "account_detail" || value === "portfolio";

const buildRecoverableImageImportLabel = (importMode?: string | null) => {
  switch (importMode) {
    case "account_detail":
      return "account screenshot";
    case "portfolio":
      return "portfolio screenshot";
    default:
      return "screenshot";
  }
};

const buildRecoverableImageImportSuccessMessage = (importMode?: string | null) => {
  switch (importMode) {
    case "account_detail":
      return "Account detail snapshot saved.";
    case "portfolio":
      return "Portfolio snapshot saved.";
    default:
      return "Screenshot transactions imported.";
  }
};

const shouldPersistPublishedAccountSummaries = (snapshot: Awaited<ReturnType<typeof loadImportStatusSnapshot>>) => {
  if (!snapshot?.statementCheckpoint || snapshot.accountSummaries.length === 0) {
    return false;
  }

  const sourceMetadata =
    snapshot.statementCheckpoint.sourceMetadata &&
    typeof snapshot.statementCheckpoint.sourceMetadata === "object" &&
    !Array.isArray(snapshot.statementCheckpoint.sourceMetadata)
      ? (snapshot.statementCheckpoint.sourceMetadata as Record<string, unknown>)
      : null;
  const existingVisibleFlag = sourceMetadata?.publishedVisibleImportComplete === true;
  const existingSummaries = Array.isArray(sourceMetadata?.publishedAccountSummaries) ? sourceMetadata.publishedAccountSummaries : [];
  const nextSerialized = JSON.stringify(snapshot.accountSummaries);
  const existingSerialized = JSON.stringify(existingSummaries);
  return !existingVisibleFlag || nextSerialized !== existingSerialized;
};

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

    if (shouldPersistPublishedAccountSummaries(snapshot)) {
      await prisma.accountStatementCheckpoint
        .update({
          where: { importFileId: importId },
          data: {
            sourceMetadata: mergeCheckpointSourceMetadata(snapshot.statementCheckpoint?.sourceMetadata, {
              publishedVisibleImportComplete: snapshot.visibleImportComplete,
              publishedAccountSummaries: snapshot.accountSummaries,
            }),
          },
        })
        .catch(() => null);
    }

    const importMode = readCheckpointImportMode(snapshot.statementCheckpoint?.sourceMetadata);
    const updatedAtMs = new Date(snapshot.importFile.updatedAt).getTime();
    const statementImageProcessingAgeMs = Number.isFinite(updatedAtMs) ? Date.now() - updatedAtMs : 0;
    const backupParserHandoffInProgress = isBackupParserHandoffMessage(snapshot.importFile.processingMessage);
    const imageImportLabel = buildRecoverableImageImportLabel(importMode);
    const staleStatementImageQueue =
      isRecoverableImageImportMode(importMode) &&
      snapshot.importFile.status === "processing" &&
      (snapshot.importFile.processingPhase === "queued_retry" || snapshot.importFile.processingPhase === "reading_account_details") &&
      isImageImportFile(snapshot.importFile.fileName, snapshot.importFile.fileType) &&
      snapshot.confirmedTransactionsCount === 0 &&
      snapshot.parsedRowsCount === 0 &&
      Number.isFinite(updatedAtMs) &&
      statementImageProcessingAgeMs >
        (snapshot.importFile.processingPhase === "reading_account_details"
          ? backupParserHandoffInProgress
            ? STALE_STATEMENT_IMAGE_BACKUP_HANDOFF_MS
            : STALE_STATEMENT_IMAGE_READING_MS
          : STALE_STATEMENT_IMAGE_QUEUE_MS);

    if (staleStatementImageQueue) {
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
            importMode: isRecoverableImageImportMode(importMode) ? importMode : "statement",
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
              processingMessage: `Clover couldn't finish reading this ${imageImportLabel}. Please retry the upload.`,
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

    const staleStatementImageEmptyDone =
      isRecoverableImageImportMode(importMode) &&
      (snapshot.importFile.status === "done" || snapshot.importFile.status === "failed") &&
      isImageImportFile(snapshot.importFile.fileName, snapshot.importFile.fileType) &&
      snapshot.confirmedTransactionsCount === 0 &&
      snapshot.parsedRowsCount === 0 &&
      Number.isFinite(updatedAtMs) &&
      statementImageProcessingAgeMs > STALE_STATEMENT_IMAGE_EMPTY_DONE_MS;

    if (staleStatementImageEmptyDone) {
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
            importMode: isRecoverableImageImportMode(importMode) ? importMode : "statement",
            pdfJsBaseUrl: getConfiguredPdfJsBaseUrl(),
          });
        } catch {
          await updateImportFileCompat(importId, {
            status: "failed",
            processingPhase: "repair_needed",
            processingMessage: `Clover couldn't finish reading this ${imageImportLabel}. Please retry the upload.`,
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

    const staleStatementImageReconciling =
      isRecoverableImageImportMode(importMode) &&
      snapshot.importFile.status === "processing" &&
      snapshot.importFile.processingPhase === "reconciling" &&
      isImageImportFile(snapshot.importFile.fileName, snapshot.importFile.fileType) &&
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
              processingMessage: buildRecoverableImageImportSuccessMessage(importMode),
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
              processingMessage: `Clover read rows from this ${imageImportLabel}, but could not save them yet. Please retry the import.`,
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

    const staleStatementImageStaged =
      isRecoverableImageImportMode(importMode) &&
      snapshot.importFile.status === "processing" &&
      snapshot.importFile.processingPhase === "staged" &&
      isImageImportFile(snapshot.importFile.fileName, snapshot.importFile.fileType) &&
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
              processingMessage: buildRecoverableImageImportSuccessMessage(importMode),
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
              processingMessage: `Clover saved rows from this ${imageImportLabel}, but could not finish linking them yet. Please retry the import.`,
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
      Date.now() - updatedAtMs > STALE_RECEIPT_PROCESSING_MS;

    if (staleReceiptProcessing) {
      await updateImportFileCompat(importId, {
        status: "failed",
        processingPhase: "repair_needed",
        processingMessage: "Clover couldn't finish reading this receipt. Please retry or use a clearer photo.",
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
            reason: "stale_receipt_processing",
            staleAfterSeconds: Math.round(STALE_RECEIPT_PROCESSING_MS / 1000),
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
