import { Worker } from "bullmq";
import { getRedisConnection } from "@/lib/import-queue";
import { updateImportFileCompat } from "@/lib/data-engine";
import { processImportFileText } from "@/workers/import-processor";
import { summarizeErrorForLog } from "@/lib/security-logging";

const connection = getRedisConnection();

const worker = new Worker(
  "import-processing",
  async (job) => {
    const { importFileId, password, allowDuplicateStatement, bankName } = job.data;
    return processImportFileText(importFileId, {
      password,
      allowDuplicateStatement,
      qaSource: "import_processing",
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
});

worker.on("failed", async (job, error) => {
  console.error("Import job failed", { jobId: job?.id ?? null, error: summarizeErrorForLog(error) });
  const importFileId = job?.data?.importFileId;
  if (importFileId) {
    await updateImportFileCompat(importFileId, {
      status: "failed",
      processingPhase: "failed",
      processingMessage: "Import failed. Waiting for the recovery loop to retry this file.",
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
