import { Worker } from "bullmq";
import { getRedisConnection } from "@/lib/import-queue";
import { processImportFileText } from "@/workers/import-processor";
import { prisma } from "@/lib/prisma";

const connection = getRedisConnection();

const worker = new Worker(
  "import-processing",
  async (job) => {
    const { importFileId, password } = job.data;
    return processImportFileText(importFileId, { password });
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
  console.error(`Import job failed: ${job?.id}`, error);
  const importFileId = job?.data?.importFileId;
  if (importFileId) {
    await prisma.importFile.update({
      where: { id: importFileId },
      data: { status: "failed" },
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
