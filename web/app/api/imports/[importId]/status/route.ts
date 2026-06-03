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

const STALE_RECEIPT_PROCESSING_MS = 3 * 60 * 1000;
const STALE_STATEMENT_IMAGE_QUEUE_MS = 15 * 1000;
const STALE_STATEMENT_IMAGE_READING_MS = 45 * 1000;

const isImageImportFile = (fileName?: string | null, fileType?: string | null) =>
  String(fileType ?? "").toLowerCase().startsWith("image/") ||
  /\.(jpe?g|png|webp|heic|heif|gif|bmp|avif)$/i.test(String(fileName ?? "").toLowerCase());

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
              processingMessage: "Clover couldn't finish reading this screenshot. Please retry the upload.",
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
