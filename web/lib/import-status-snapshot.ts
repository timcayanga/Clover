import { prisma } from "@/lib/prisma";
import { buildImportTelemetrySnapshot } from "@/lib/import-telemetry";
import { readCheckpointWorkflowStage } from "@/lib/import-workflow";
import {
  countTransactionsByImportFileCompat,
  fetchImportFileCompat,
  hasCompatibleTable,
  updateImportFileCompat,
} from "@/lib/data-engine";
import { getImportEnrichmentJobByImportFileId, MAX_IMPORT_ENRICHMENT_ATTEMPTS } from "@/lib/import-enrichment-jobs";

export type ImportStatusSnapshot = {
  importFile: {
    id: string;
    fileName: string | null;
    fileType: string | null;
    status: string;
    processingPhase: string | null;
    processingMessage: string | null;
    processingAttempt: number;
    processingTargetScore: number | null;
    processingCurrentScore: number | null;
    accountId: string | null;
    confirmedAt: string | null;
    uploadedAt: string;
    updatedAt: string;
  };
  parsedRowsCount: number;
  confirmedTransactionsCount: number;
  confirmationStatus: string;
  telemetryPhase: string;
  telemetryLabel: string;
  telemetryMessage: string;
  canResume: boolean;
  resumeReason: string | null;
  workflowStage: string | null;
  enrichmentJob: Awaited<ReturnType<typeof getImportEnrichmentJobByImportFileId>>;
  finalizationStatus: string | null;
  finalizationPhase: string | null;
  finalizationProcessedRows: number | null;
  finalizationTotalRows: number | null;
  finalizationEstimatedSecondsRemaining: number;
  finalizationAttempts: number | null;
  finalizationMaxAttempts: number;
  finalizationNeedsReview: boolean;
  statementCheckpoint: Awaited<ReturnType<(typeof prisma)["accountStatementCheckpoint"]["findUnique"]>>;
};

const estimateFinalizationSecondsRemaining = (job: Awaited<ReturnType<typeof getImportEnrichmentJobByImportFileId>>) => {
  if (!job || job.status === "done" || job.status === "failed") {
    return 0;
  }

  const totalRows = Math.max(0, Number(job.totalRows ?? 0));
  const processedRows = Math.max(0, Number(job.processedRows ?? 0));
  const remainingRows = Math.max(0, totalRows - processedRows);
  if (remainingRows === 0) {
    return 0;
  }

  const startedAtMs = job.startedAt ? new Date(job.startedAt).getTime() : 0;
  const elapsedSeconds = startedAtMs > 0 ? Math.max(1, Math.floor((Date.now() - startedAtMs) / 1000)) : 0;
  if (processedRows > 0 && elapsedSeconds > 0) {
    const observedRowsPerSecond = processedRows / elapsedSeconds;
    return Math.max(15, Math.ceil((remainingRows / Math.max(0.1, observedRowsPerSecond)) * 1.25));
  }

  return Math.max(30, Math.ceil(remainingRows / 20) * 60);
};

export const loadImportStatusSnapshot = async (
  importFileId: string,
  options?: {
    importFile?: Awaited<ReturnType<typeof fetchImportFileCompat>> | null;
    promoteFailedVisibleImport?: boolean;
  }
): Promise<ImportStatusSnapshot | null> => {
  let importFile = options?.importFile ?? (await fetchImportFileCompat(importFileId));
  if (!importFile) {
    return null;
  }

  const parsedRowsCountBefore = Number(importFile.parsedRowsCount ?? 0);
  const confirmedTransactionsCountBefore = Number(importFile.confirmedTransactionsCount ?? 0);
  let statementCheckpoint = (await hasCompatibleTable("AccountStatementCheckpoint"))
    ? await prisma.accountStatementCheckpoint.findUnique({
        where: { importFileId },
      })
    : null;
  let checkpointRowCount = Number(statementCheckpoint?.rowCount ?? 0);
  const checkpointWorkflowStage = readCheckpointWorkflowStage(statementCheckpoint?.sourceMetadata);
  const hasParsedRows = parsedRowsCountBefore > 0 || checkpointRowCount > 0;
  const hasConfirmedRows = confirmedTransactionsCountBefore > 0 || statementCheckpoint?.status === "reconciled";

  let parsedRowsCount = Math.max(Number(importFile.parsedRowsCount ?? 0), checkpointRowCount);
  const savedTransactionsCount = await countTransactionsByImportFileCompat(importId).catch(() => 0);
  let confirmedTransactionsCount = Math.max(
    Number(importFile.confirmedTransactionsCount ?? 0),
    savedTransactionsCount,
    statementCheckpoint?.status === "reconciled" ? checkpointRowCount : 0
  );
  const visibleImportComplete = confirmedTransactionsCount > 0 || hasConfirmedRows;
  const hasVisibleImportData = visibleImportComplete || parsedRowsCount > 0 || checkpointRowCount > 0;

  if (options?.promoteFailedVisibleImport && importFile.status === "failed" && hasVisibleImportData) {
    importFile =
      (await updateImportFileCompat(importId, {
        status: "done",
        processingPhase: "finalizing_enrichment",
        processingMessage:
          confirmedTransactionsCount > 0
            ? "Transactions are visible. Clover is cleaning up names and categories in the background."
            : "Account details are visible. Clover is finishing transaction cleanup in the background.",
        confirmedTransactionsCount,
      }).catch(() => null)) ?? importFile;
  }

  const enrichmentJob = await getImportEnrichmentJobByImportFileId(importId).catch(() => null);
  const finalizationRemainingRows = enrichmentJob
    ? Math.max(0, Number(enrichmentJob.totalRows ?? 0) - Number(enrichmentJob.processedRows ?? 0))
    : 0;
  const finalizationEstimatedSecondsRemaining = estimateFinalizationSecondsRemaining(enrichmentJob);
  const finalizationNeedsReview =
    visibleImportComplete &&
    Boolean(enrichmentJob) &&
    (enrichmentJob?.status === "failed" ||
      (Number(enrichmentJob?.attempts ?? 0) >= MAX_IMPORT_ENRICHMENT_ATTEMPTS && finalizationRemainingRows > 0));
  const confirmationStatus =
    confirmedTransactionsCount > 0
      ? "confirmed"
      : importFile.status === "failed"
        ? "failed"
        : importFile.status === "done" && hasParsedRows
          ? "staged"
          : importFile.status === "done"
            ? "done"
            : parsedRowsCount > 0
              ? "staged"
              : "processing";
  const telemetry = buildImportTelemetrySnapshot({
    status: importFile.status,
    processingPhase: importFile.processingPhase,
    processingMessage: importFile.processingMessage,
    parsedRowsCount,
    confirmedTransactionsCount,
    visibleImportComplete,
    confirmationStatus,
    checkpointStatus: statementCheckpoint?.status ?? null,
    workflowStage: checkpointWorkflowStage,
  });
  const resolvedWorkflowStage = checkpointWorkflowStage ?? telemetry.phase;

  return {
    importFile: {
      id: importFile.id,
      fileName: importFile.fileName,
      fileType: importFile.fileType,
      status: importFile.status,
      processingPhase: importFile.processingPhase ?? null,
      processingMessage: importFile.processingMessage ?? null,
      processingAttempt: Number(importFile.processingAttempt ?? 0),
      processingTargetScore: importFile.processingTargetScore ?? null,
      processingCurrentScore: importFile.processingCurrentScore ?? null,
      accountId: importFile.accountId,
      confirmedAt: importFile.confirmedAt?.toISOString() ?? null,
      uploadedAt: importFile.uploadedAt.toISOString(),
      updatedAt: importFile.updatedAt.toISOString(),
    },
    parsedRowsCount,
    confirmedTransactionsCount,
    confirmationStatus,
    telemetryPhase: telemetry.phase,
    telemetryLabel: telemetry.phaseLabel,
    telemetryMessage: telemetry.message,
    canResume: telemetry.canResume,
    resumeReason: telemetry.resumeReason,
    workflowStage: resolvedWorkflowStage,
    enrichmentJob,
    finalizationStatus: enrichmentJob?.status ?? null,
    finalizationPhase: enrichmentJob?.phase ?? null,
    finalizationProcessedRows: enrichmentJob?.processedRows ?? null,
    finalizationTotalRows: enrichmentJob?.totalRows ?? null,
    finalizationEstimatedSecondsRemaining,
    finalizationAttempts: enrichmentJob?.attempts ?? null,
    finalizationMaxAttempts: MAX_IMPORT_ENRICHMENT_ATTEMPTS,
    finalizationNeedsReview,
    statementCheckpoint,
  };
};
