import { Worker } from "bullmq";
import { getRedisConnection } from "@/lib/import-queue";
import {
  countParsedTransactionRows,
  countTransactionsByImportFileCompat,
  fetchImportFileCompat,
  updateImportFileCompat,
} from "@/lib/data-engine";
import { getConfiguredPdfJsBaseUrl } from "@/lib/import-file-text.server";
import {
  getNextVisualImportAttempt,
  getVisualImportRetryMessage,
  shouldKeepFailedVisualImportRecoverable,
  type VisualImportRecoveryMode,
} from "@/lib/import-visual-recovery";
import { processImportEnrichmentJobs, processImportFileText } from "@/workers/import-processor";
import { summarizeErrorForLog } from "@/lib/security-logging";
import { purgeExpiredImportFiles } from "@/lib/import-retention";

void purgeExpiredImportFiles({ limit: 50 }).catch((error) => {
  console.warn("Unable to purge expired raw import files at worker startup", { error: summarizeErrorForLog(error) });
});

const connection = getRedisConnection();

const worker = new Worker(
  "import-processing",
  async (job) => {
    const { importFileId, actorUserId, password, allowDuplicateStatement, bankName, importMode, pdfJsBaseUrl } = job.data;
    return processImportFileText(importFileId, {
      actorUserId: actorUserId ?? null,
      password,
      allowDuplicateStatement,
      importMode,
      qaSource: "import_processing",
      pdfJsBaseUrl: pdfJsBaseUrl ?? getConfiguredPdfJsBaseUrl(),
      statementMetadataOverride: bankName
        ? {
            institution: bankName,
          }
        : null,
    });
  },
  {
    connection,
    concurrency: 2,
  }
);

worker.on("completed", (job) => {
  console.log(`Import job completed: ${job.id}`);
  const importFileId = job.data?.importFileId;
  if (importFileId) {
    void processImportEnrichmentJobs({
      importFileId,
      limit: 1,
      workerId: `bullmq-import-enrichment-${job.id}`,
    }).catch((error) => {
      console.warn("Unable to continue import enrichment after import job completed", {
        importFileId,
        error: summarizeErrorForLog(error),
      });
    });
  }
});

worker.on("failed", async (job, error) => {
  console.error("Import job failed", { jobId: job?.id ?? null, error: summarizeErrorForLog(error) });
  const importFileId = job?.data?.importFileId;
  if (importFileId) {
    const latestImportFile = await fetchImportFileCompat(importFileId).catch(() => null);
    const fileName = String(latestImportFile?.fileName ?? "");
    const fileType = String(latestImportFile?.fileType ?? "");
    const isVisualImport =
      fileType.toLowerCase().startsWith("image/") ||
      fileType.toLowerCase() === "application/pdf" ||
      /\.(jpe?g|png|webp|heic|heif|gif|bmp|avif|pdf)$/i.test(fileName);
    const importMode: VisualImportRecoveryMode =
      job.data?.importMode === "receipt" ? "receipt" : "statement";
    const [savedTransactionsCount, parsedRowsCount] = await Promise.all([
      countTransactionsByImportFileCompat(importFileId).catch(() => 0),
      countParsedTransactionRows(importFileId).catch(() => 0),
    ]);
    if (savedTransactionsCount > 0) {
      await updateImportFileCompat(importFileId, {
        status: "done",
        processingPhase: "complete",
        processingMessage: "Transactions are visible. Clover is cleaning up names and categories in the background.",
        confirmedTransactionsCount: savedTransactionsCount,
      });
      return;
    }
    if (parsedRowsCount > 0 && isVisualImport) {
      await updateImportFileCompat(importFileId, {
        status: "processing",
        processingPhase: "reconciling",
        processingMessage: "Clover parsed rows from this file and is retrying the final save step.",
        confirmedTransactionsCount: 0,
      });
      return;
    }
    if (
      shouldKeepFailedVisualImportRecoverable({
        importMode,
        isVisualImport,
        processingAttempt: latestImportFile?.processingAttempt,
      })
    ) {
      const nextAttempt = getNextVisualImportAttempt(latestImportFile?.processingAttempt);
      await updateImportFileCompat(importFileId, {
        status: "processing",
        processingPhase: "queued_retry",
        processingAttempt: nextAttempt,
        processingMessage: getVisualImportRetryMessage(importMode, nextAttempt),
        parsedRowsCount: 0,
        confirmedTransactionsCount: 0,
      });
      return;
    }

    const errorMessage =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : "Import failed. Waiting for the recovery loop to retry this file.";
    await updateImportFileCompat(importFileId, {
      status: "failed",
      processingPhase: "failed",
      processingMessage: errorMessage,
    });
  }
});

const shutdown = async () => {
  await worker.close();
  await connection.quit();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
