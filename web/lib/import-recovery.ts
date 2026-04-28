import { isLocalDevHost } from "@/lib/auth";
import { enqueueImportProcessing } from "@/lib/import-queue";
import { ensureImportProcessingWorker } from "@/lib/import-worker-runtime";
import { prisma } from "@/lib/prisma";
import { updateImportFileCompat } from "@/lib/data-engine";

const FAILED_IMPORT_RECOVERY_DELAY_MS = 10_000;
const STALLED_IMPORT_RECOVERY_DELAY_MS = 2 * 60 * 1000;

const recoverImportFiles = async (limit: number) => {
  if (!(await isLocalDevHost())) {
    return { recovered: [] as Array<{ importFileId: string; fileName: string }> };
  }

  await ensureImportProcessingWorker();

  const failedThreshold = new Date(Date.now() - FAILED_IMPORT_RECOVERY_DELAY_MS);
  const stalledThreshold = new Date(Date.now() - STALLED_IMPORT_RECOVERY_DELAY_MS);
  const importFiles = await prisma.importFile.findMany({
    where: {
      dataQaRuns: {
        none: {},
      },
      OR: [
        {
          status: "failed",
          updatedAt: {
            lt: failedThreshold,
          },
        },
        {
          status: {
            in: ["processing"],
          },
          updatedAt: {
            lt: stalledThreshold,
          },
        },
      ],
    },
    orderBy: {
      updatedAt: "asc",
    },
    take: limit,
    select: {
      id: true,
      fileName: true,
      status: true,
      updatedAt: true,
    },
  });

  const recovered: Array<{ importFileId: string; fileName: string }> = [];

  for (const importFile of importFiles) {
    await updateImportFileCompat(importFile.id, {
      status: "processing",
      processingPhase: "queued_retry",
      processingMessage:
        importFile.status === "failed"
          ? `Retrying failed file ${importFile.fileName}...`
          : `Retrying stalled file ${importFile.fileName}...`,
      processingCurrentScore: null,
    });

    await enqueueImportProcessing({
      importFileId: importFile.id,
    });

    recovered.push({
      importFileId: importFile.id,
      fileName: importFile.fileName,
    });
  }

  return { recovered };
};

export const recoverFailedImportFiles = async (limit = 10) => recoverImportFiles(limit);

export const recoverStalledImportFiles = async (limit = 10) => recoverImportFiles(limit);
