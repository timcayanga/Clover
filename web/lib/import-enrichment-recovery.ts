import {
  completeImportEnrichmentJob,
  isImportEnrichmentJobStale,
  listImportEnrichmentJobsByWorkspace,
  upsertImportEnrichmentJob,
} from "@/lib/import-enrichment-jobs";
import { updateImportFileCompat } from "@/lib/data-engine";
import { prisma } from "@/lib/prisma";
import { processImportEnrichmentJobs } from "@/workers/import-processor";

const countVisibleImportTransactions = (importFileId: string) =>
  prisma.transaction.count({
    where: {
      deletedAt: null,
      OR: [
        { importFileId },
        {
          rawPayload: {
            path: ["sourceImportFileId"],
            equals: importFileId,
          },
        },
      ],
    },
  });

const countImportTransactionsNeedingCleanup = (importFileId: string) =>
  prisma.transaction.count({
    where: {
      deletedAt: null,
      OR: [
        { importFileId },
        {
          rawPayload: {
            path: ["sourceImportFileId"],
            equals: importFileId,
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
  });

export const recoverWorkspaceImportEnrichment = async (params: {
  workspaceId: string;
  workerId: string;
  maxJobs?: number;
}) => {
  const jobs = await listImportEnrichmentJobsByWorkspace(params.workspaceId).catch(() => []);
  const candidateByImportFileId = new Map(
    [
      ...jobs.filter(
        (job) =>
          job.status === "queued" ||
          job.status === "retrying" ||
          isImportEnrichmentJobStale(job)
      ),
    ].map((job) => [job.importFileId, job])
  );
  const candidates = Array.from(candidateByImportFileId.values())
    .filter(
      (job) =>
        job.status === "queued" ||
        job.status === "retrying" ||
        isImportEnrichmentJobStale(job)
    )
    .slice(0, Math.max(1, Math.min(params.maxJobs ?? 2, 5)));

  const results: Array<{
    importFileId: string;
    action: "completed" | "processed" | "skipped";
    visibleRows: number;
    parsedRows: number;
    cleanupRows: number;
  }> = [];

  for (const job of candidates) {
    const [visibleRows, parsedRows, cleanupRows] = await Promise.all([
      countVisibleImportTransactions(job.importFileId).catch(() => 0),
      prisma.parsedTransaction.count({ where: { importFileId: job.importFileId } }).catch(() => 0),
      countImportTransactionsNeedingCleanup(job.importFileId).catch(() => 0),
    ]);

    if (visibleRows <= 0 || parsedRows <= 0) {
      results.push({ importFileId: job.importFileId, action: "skipped", visibleRows, parsedRows, cleanupRows });
      continue;
    }

    if (cleanupRows <= 0) {
      await completeImportEnrichmentJob({ id: job.id, totalRows: parsedRows }).catch(() => null);
      await updateImportFileCompat(job.importFileId, {
        processingPhase: "complete",
        processingMessage: "Transaction details finalized.",
      }).catch(() => null);
      results.push({ importFileId: job.importFileId, action: "completed", visibleRows, parsedRows, cleanupRows });
      continue;
    }

    await upsertImportEnrichmentJob({
      workspaceId: params.workspaceId,
      importFileId: job.importFileId,
      totalRows: parsedRows,
      phase: "queued",
      forceRequeue: false,
    }).catch(() => null);
    await processImportEnrichmentJobs({
      importFileId: job.importFileId,
      limit: 1,
      batchSize: 100,
      workerId: params.workerId,
    }).catch(() => null);
    results.push({ importFileId: job.importFileId, action: "processed", visibleRows, parsedRows, cleanupRows });
  }

  return results;
};
