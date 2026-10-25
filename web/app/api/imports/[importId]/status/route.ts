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
import { shouldPersistPublishedAccountSummaries, persistPublishedAccountSummaries } from "@/lib/import-checkpoint-publication";
import { readCheckpointImportMode } from "@/lib/import-workflow";
import { prisma } from "@/lib/prisma";
import { processImportEnrichmentJobs } from "@/workers/import-processor";
import {
  VISUAL_IMPORT_RETRY_LIMIT,
  getNextVisualImportAttempt,
} from "@/lib/import-visual-recovery";
import { after, NextResponse } from "next/server";
import {
  createTransientDataUnavailableResponse,
  isTransientDataError,
  isUnauthorizedDataError,
} from "@/lib/transient-data";
import { summarizeErrorForLog } from "@/lib/security-logging";
import { recoverFailedImportResume, queueStaleEmptyImportRecovery } from "@/lib/import-resume-recovery";
import { persistSourceReviewFailure } from "@/lib/import-source-review.server";
import { getImportUserControl } from "@/lib/import-user-control";

async function persistStatusRecoveryFailure(importId: string, error: unknown) {
  const sourceReview = await persistSourceReviewFailure(importId, error).catch(() => ({kind:"unavailable" as const}));
  if (sourceReview && sourceReview.kind !== "existing_rows") return;
  await recoverFailedImportResume(importId).catch(() => null);
}

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

const STALE_RECEIPT_PROCESSING_MS = 3 * 60 * 1000;
const STALE_STATEMENT_IMAGE_QUEUE_MS = 15 * 1000;
const STALE_STATEMENT_IMAGE_READING_MS = 45 * 1000;
const STALE_STATEMENT_IMAGE_BACKUP_HANDOFF_MS = 90 * 1000;
const STALE_STATEMENT_IMAGE_RECONCILING_MS = 30 * 1000;
const STALE_STATEMENT_IMAGE_STAGED_MS = 30 * 1000;
const STALE_STATEMENT_IMAGE_EMPTY_DONE_MS = 15 * 1000;

const isRecoverableStatementFile = (fileName?: string | null, fileType?: string | null) =>
  String(fileType ?? "").toLowerCase().startsWith("image/") ||
  String(fileType ?? "").toLowerCase() === "application/pdf" ||
  /\.(jpe?g|png|webp|heic|heif|gif|bmp|avif|pdf)$/i.test(String(fileName ?? "").toLowerCase());

const isBackupParserHandoffMessage = (value?: string | null) =>
  /backup parser|double-checking this file|local parse looks incomplete/i.test(String(value ?? ""));

const isRecoverableImageImportMode = (value?: string | null) =>
  value === "statement" || value === "account_detail" || value === "portfolio";

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

    const control = await getImportUserControl(importId, String(importFile.workspaceId));
    if (control !== "running") return NextResponse.json({
      importFile: { id: importFile.id, status: importFile.status, fileName: importFile.fileName, fileType: importFile.fileType, workspaceId: importFile.workspaceId, accountId: importFile.accountId, updatedAt: importFile.updatedAt, processingPhase: control, processingMessage: control === "paused" ? "Import paused" : "Import cancelled" },
      control, canResume: control === "paused", visibleImportComplete: false,
      parsedRowsCount: Number(importFile.parsedRowsCount ?? 0), confirmedTransactionsCount: Number(importFile.confirmedTransactionsCount ?? 0),
      telemetryPhase: control, telemetryLabel: control === "paused" ? "Import paused" : "Import cancelled",
    });

    const snapshot = await loadImportStatusSnapshot(importId, {
      importFile,
      promoteFailedVisibleImport: true,
    });

    if (!snapshot) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    if (shouldPersistPublishedAccountSummaries(snapshot)) {
      after(async () => {
        await persistPublishedAccountSummaries(snapshot).catch(() => null);
      });
    }

    const importMode = readCheckpointImportMode(snapshot.statementCheckpoint?.sourceMetadata);
    const updatedAtMs = new Date(snapshot.importFile.updatedAt).getTime();
    const statementImageProcessingAgeMs = Number.isFinite(updatedAtMs) ? Date.now() - updatedAtMs : 0;
    const backupParserHandoffInProgress = isBackupParserHandoffMessage(snapshot.importFile.processingMessage);
    const staleStatementImageQueue =
      isRecoverableImageImportMode(importMode) &&
      snapshot.importFile.status === "processing" &&
      (snapshot.importFile.processingPhase === "queued_retry" || snapshot.importFile.processingPhase === "reading_account_details") &&
      isRecoverableStatementFile(snapshot.importFile.fileName, snapshot.importFile.fileType) &&
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
      const queuedFile = await updateImportFileCompat(importId, {
        status: "processing",
        processingPhase: "queued_retry",
        processingMessage: "Clover saved this file and is restarting the background reader.",
      }, { progressOnly: true });
      // Status reads must remain fast. The global import activity starts the
      // separate resume request, which can safely continue from this durable
      // checkpoint without making every progress poll run the parser.
      const refreshedSnapshot = await loadImportStatusSnapshot(importId, {
        importFile: (await fetchImportFileCompat(importId)) ?? importFile,
        promoteFailedVisibleImport: true,
      });
      if (refreshedSnapshot) {
        return NextResponse.json({
          ...refreshedSnapshot,
          statementSelfHeal: {
            ...(queuedFile ? {reason: "stale_statement_image_queue"} : {}),
            staleAfterSeconds: Math.round(STALE_STATEMENT_IMAGE_QUEUE_MS / 1000),
          },
        });
      }
    }

    const staleStatementImageEmptyDone =
      isRecoverableImageImportMode(importMode) &&
      snapshot.importFile.status === "done" &&
      snapshot.importFile.processingPhase !== "non_financial" &&
      isRecoverableStatementFile(snapshot.importFile.fileName, snapshot.importFile.fileType) &&
      snapshot.confirmedTransactionsCount === 0 &&
      snapshot.parsedRowsCount === 0 &&
      Number.isFinite(updatedAtMs) &&
      statementImageProcessingAgeMs > STALE_STATEMENT_IMAGE_EMPTY_DONE_MS;

    if (staleStatementImageEmptyDone && await queueStaleEmptyImportRecovery(importId, new Date(snapshot.importFile.updatedAt))) {
      /* Durable queue recovery is picked up by the activity controller or sweep. */
      const refreshedSnapshot = await loadImportStatusSnapshot(importId, {
        importFile: (await fetchImportFileCompat(importId)) ?? importFile,
        promoteFailedVisibleImport: true,
      });
      if (refreshedSnapshot) {
        return NextResponse.json({
          ...refreshedSnapshot,
          statementSelfHeal: {
            reason: "stale_statement_image_queue",
            staleAfterSeconds: Math.round(STALE_STATEMENT_IMAGE_EMPTY_DONE_MS / 1000),
          },
        });
      }
    }

    const staleStatementImageReconciling =
      isRecoverableImageImportMode(importMode) &&
      snapshot.importFile.status === "processing" &&
      snapshot.importFile.processingPhase === "reconciling" &&
      isRecoverableStatementFile(snapshot.importFile.fileName, snapshot.importFile.fileType) &&
      snapshot.confirmedTransactionsCount === 0 &&
      snapshot.parsedRowsCount > 0 &&
      Number.isFinite(updatedAtMs) &&
      Date.now() - updatedAtMs > STALE_STATEMENT_IMAGE_RECONCILING_MS;

    if (staleStatementImageReconciling) {
      await updateImportFileCompat(importId, {
        status: "processing",
        processingPhase: "reconciling",
        processingMessage: "Saving screenshot transactions...",
      }, { progressOnly: true });
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
      } catch (error) {
        await persistStatusRecoveryFailure(importId, error);
      }
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
      isRecoverableStatementFile(snapshot.importFile.fileName, snapshot.importFile.fileType) &&
      snapshot.confirmedTransactionsCount === 0 &&
      snapshot.parsedRowsCount > 0 &&
      Number.isFinite(updatedAtMs) &&
      Date.now() - updatedAtMs > STALE_STATEMENT_IMAGE_STAGED_MS;

    if (staleStatementImageStaged) {
      await updateImportFileCompat(importId, {
        status: "processing",
        processingPhase: "reconciling",
        processingMessage: "Finalizing screenshot transactions...",
      }, { progressOnly: true });
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
        } catch (error) {
          await persistStatusRecoveryFailure(importId, error);
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
      const nextAttempt = getNextVisualImportAttempt(snapshot.importFile.processingAttempt);
      const snapshotTime = new Date(snapshot.importFile.updatedAt);
      const queued = nextAttempt <= VISUAL_IMPORT_RETRY_LIMIT &&
        await queueStaleEmptyImportRecovery(importId, snapshotTime, { expectedStatus: "processing", nextAttempt });
      if (!queued && nextAttempt > VISUAL_IMPORT_RETRY_LIMIT) {
        await recoverFailedImportResume(importId, snapshotTime);
      }
      const refreshedSnapshot = await loadImportStatusSnapshot(importId, {
        importFile: (await fetchImportFileCompat(importId)) ?? importFile,
        promoteFailedVisibleImport: true,
      });
      if (refreshedSnapshot) {
        return NextResponse.json({
          ...refreshedSnapshot,
          ...(queued ? {statementSelfHeal: {reason: "stale_statement_image_queue"}} : {}),
          receiptSelfHeal: {
            reason: queued ? "stale_receipt_retry" : "stale_receipt_processing",
            attempt: nextAttempt, retryLimit: VISUAL_IMPORT_RETRY_LIMIT,
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
      after(async () => {
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
          await processImportEnrichmentJobs({
            importFileId: importId,
            limit: MAX_IMPORT_ENRICHMENT_ATTEMPTS,
            batchSize: 500,
            workerId: `status-import-enrichment-${userId}`,
          });
        } else if (snapshot.enrichmentJob && needsCleanupCount === 0 && snapshot.enrichmentJob.status !== "done") {
          await completeImportEnrichmentJob({ id: snapshot.enrichmentJob.id, totalRows: parsedRowCount });
        }
      });
    }

    // Bracket this server clock anchor with client request/response times when
    // comparing UI propagation; the network round trip bounds clock uncertainty.
    return NextResponse.json(snapshot, { headers: { "X-Clover-Server-Time": String(Date.now()) } });
  } catch (error) {
    if (isTransientDataError(error)) {
      console.warn("[import-status] database temporarily unavailable", summarizeErrorForLog(error));
      return createTransientDataUnavailableResponse("Clover is reconnecting while this import continues in the background.");
    }

    if (isUnauthorizedDataError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("[import-status] unable to load import status", summarizeErrorForLog(error));
    return NextResponse.json({ error: "Unable to load import status" }, { status: 400 });
  }
}
