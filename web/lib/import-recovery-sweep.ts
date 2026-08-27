import { countParsedTransactionRows, countTransactionsByImportFileCompat, updateImportFileCompat } from "@/lib/data-engine";
import { readCheckpointImportMode } from "@/lib/import-workflow";
import { prisma } from "@/lib/prisma";
import { summarizeErrorForLog } from "@/lib/security-logging";
import { confirmImportFile, processImportEnrichmentJobs, processImportFileText } from "@/workers/import-processor";

const QUEUED_IMPORT_STALE_MS = 30_000;
const ACTIVE_IMPORT_STALE_MS = 2 * 60_000;

type ClaimedImport = {
  id: string;
  workspaceId: string;
  processingPhase: string | null;
  processingAttempt: number;
};

const claimRecoverableImports = async (limit: number) => {
  const rows = await prisma.$queryRawUnsafe<ClaimedImport[]>(
    `
      WITH candidates AS (
        SELECT "id"
        FROM "ImportFile"
        WHERE
          "status" = 'processing'
          AND COALESCE("confirmedTransactionsCount", 0) = 0
          AND "rawPurgedAt" IS NULL
          AND (
            (
              "processingPhase" = 'queued_retry'
              AND "updatedAt" < NOW() - ($1::text || ' milliseconds')::interval
            )
            OR (
              "processingPhase" IN (
                'reading_account_details',
                'reading_receipt_vision',
                'identifying_transactions',
                'reconciling',
                'auto_rerunning'
              )
              AND "updatedAt" < NOW() - ($2::text || ' milliseconds')::interval
            )
          )
        ORDER BY "uploadedAt" ASC
        LIMIT $3
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "ImportFile" import_file
      SET
        "processingPhase" = CASE
          WHEN import_file."parsedRowsCount" > 0 THEN 'reconciling'
          ELSE 'reading_account_details'
        END,
        "processingMessage" = CASE
          WHEN import_file."parsedRowsCount" > 0 THEN 'Clover is saving the transactions it already identified.'
          ELSE 'Clover is resuming this import from its saved file.'
        END,
        "updatedAt" = NOW()
      FROM candidates
      WHERE import_file."id" = candidates."id"
      RETURNING import_file."id", import_file."workspaceId", import_file."processingPhase", import_file."processingAttempt"
    `,
    String(QUEUED_IMPORT_STALE_MS),
    String(ACTIVE_IMPORT_STALE_MS),
    Math.max(1, Math.min(limit, 3))
  );
  return rows;
};

const loadCheckpointImportMode = async (importFileId: string) => {
  const checkpoint = await prisma.accountStatementCheckpoint
    .findUnique({
      where: { importFileId },
      select: { sourceMetadata: true },
    })
    .catch(() => null);
  return readCheckpointImportMode(checkpoint?.sourceMetadata) ?? "statement";
};

const recoverClaimedImport = async (claimed: ClaimedImport) => {
  const [visibleRows, parsedRows] = await Promise.all([
    countTransactionsByImportFileCompat(claimed.id).catch(() => 0),
    countParsedTransactionRows(claimed.id).catch(() => 0),
  ]);

  if (visibleRows > 0) {
    await updateImportFileCompat(claimed.id, {
      status: "done",
      processingPhase: "complete",
      processingMessage: "Transactions are visible. Clover is cleaning up names and categories in the background.",
      confirmedTransactionsCount: visibleRows,
    });
    return { importFileId: claimed.id, action: "already_visible" as const, visibleRows };
  }

  if (parsedRows > 0) {
    const result = await confirmImportFile(claimed.id, null);
    return {
      importFileId: claimed.id,
      action: "confirmed_checkpoint" as const,
      visibleRows: Number(result.confirmedTransactionsCount ?? result.imported ?? 0),
    };
  }

  const importMode = await loadCheckpointImportMode(claimed.id);
  const result = await processImportFileText(claimed.id, {
    actorUserId: null,
    importMode,
    qaSource: "import_processing",
  });
  return {
    importFileId: claimed.id,
    action: "reprocessed_raw_file" as const,
    visibleRows: Number(result.confirmedTransactionsCount ?? result.imported ?? 0),
  };
};

export const runImportRecoverySweep = async (options: {
  importLimit?: number;
  enrichmentLimit?: number;
  workerId?: string;
} = {}) => {
  const workerId = options.workerId ?? `scheduled-import-recovery-${Date.now()}`;
  const claimedImports = await claimRecoverableImports(options.importLimit ?? 1);
  const recoveredImports: Array<{
    importFileId: string;
    action: "already_visible" | "confirmed_checkpoint" | "reprocessed_raw_file" | "retry_scheduled";
    visibleRows: number;
    error?: ReturnType<typeof summarizeErrorForLog>;
  }> = [];

  for (const claimed of claimedImports) {
    try {
      recoveredImports.push(await recoverClaimedImport(claimed));
    } catch (error) {
      const visibleRows = await countTransactionsByImportFileCompat(claimed.id).catch(() => 0);
      await updateImportFileCompat(claimed.id, {
        status: visibleRows > 0 ? "done" : "processing",
        processingPhase: visibleRows > 0 ? "complete" : "queued_retry",
        processingMessage:
          visibleRows > 0
            ? "Transactions are visible. Clover is cleaning up names and categories in the background."
            : "Clover saved this import and will retry from its last checkpoint.",
        ...(visibleRows > 0 ? { confirmedTransactionsCount: visibleRows } : {}),
      }).catch(() => null);
      recoveredImports.push({
        importFileId: claimed.id,
        action: "retry_scheduled",
        visibleRows,
        error: summarizeErrorForLog(error),
      });
    }
  }

  const enrichment = await processImportEnrichmentJobs({
    limit: Math.max(1, Math.min(options.enrichmentLimit ?? 2, 5)),
    batchSize: 250,
    workerId,
  }).catch((error) => ({
    processedJobs: 0,
    results: [],
    error: summarizeErrorForLog(error),
  }));

  return {
    claimedImports: claimedImports.length,
    recoveredImports,
    enrichment,
  };
};
