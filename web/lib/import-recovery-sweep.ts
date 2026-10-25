import { coerceVisualImportAttempt } from "@/lib/import-visual-recovery";
import { countParsedTransactionRows, countTransactionsByImportFileCompat, updateImportFileCompat } from "@/lib/data-engine";
import { readCheckpointImportMode } from "@/lib/import-workflow";
import { requireImportMayContinue } from "@/lib/import-user-control";
import { persistSourceReviewFailure } from "@/lib/import-source-review.server";
import { recoverFailedImportResume } from "@/lib/import-resume-recovery";
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
          AND "confirmedAt" IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM "Transaction" saved
            WHERE saved."workspaceId" = "ImportFile"."workspaceId"
              AND (saved."importFileId" = "ImportFile"."id"
                OR saved."rawPayload"::jsonb->>'sourceImportFileId' = "ImportFile"."id")
          )
          AND COALESCE((
            SELECT control."metadata"::jsonb->>'control' FROM "AuditLog" control
            WHERE control."workspaceId" = "ImportFile"."workspaceId"
              AND control."entityId" = "ImportFile"."id"
              AND control."action" = 'import.user_control'
            ORDER BY control."createdAt" DESC, control."id" DESC LIMIT 1
          ), 'running') NOT IN ('paused', 'cancelled')
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
    });
  return readCheckpointImportMode(checkpoint?.sourceMetadata) ?? "statement";
};

const recoverClaimedImport = async (claimed: ClaimedImport) => {
  await requireImportMayContinue(claimed.id, claimed.workspaceId);
  const [visibleRows, parsedRows] = await Promise.all([
    countTransactionsByImportFileCompat(claimed.id),
    countParsedTransactionRows(claimed.id),
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
    autoRerunAttempt: coerceVisualImportAttempt(claimed.processingAttempt),
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
    action: "already_visible" | "confirmed_checkpoint" | "reprocessed_raw_file" | "held_for_review" | "retry_available" | "preserved" | "user_control" | "unavailable";
    visibleRows: number | null;
    error?: ReturnType<typeof summarizeErrorForLog>;
  }> = [];

  for (const claimed of claimedImports) {
    try {
      recoveredImports.push(await recoverClaimedImport(claimed));
    } catch (error) {
      // The worker may already have persisted a terminal source refusal. Never
      // turn it back into queued_retry, or the next sweep pays to repeat it.
      const sourceReview = await persistSourceReviewFailure(claimed.id, error).catch(() => ({ kind: "unavailable" as const }));
      const recovery = sourceReview?.kind === "review" || sourceReview?.kind === "unavailable"
        ? null : await recoverFailedImportResume(claimed.id).catch(() => null);
      recoveredImports.push({
        importFileId: claimed.id,
        action: sourceReview?.kind === "review" ? "held_for_review"
          : sourceReview?.kind === "unavailable" ? "unavailable"
          : recovery?.kind === "retryable" ? "retry_available"
          : recovery?.kind === "user_control" ? "user_control"
          : recovery?.kind === "preserved" ? "preserved" : "unavailable",
        visibleRows: null,
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
