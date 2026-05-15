import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { countTransactionsByImportFileCompat, fetchImportFileCompat, hasCompatibleTable, updateImportFileCompat } from "@/lib/data-engine";
import { buildImportTelemetrySnapshot } from "@/lib/import-telemetry";
import { readCheckpointWorkflowStage } from "@/lib/import-workflow";
import { getImportEnrichmentJobByImportFileId, MAX_IMPORT_ENRICHMENT_ATTEMPTS } from "@/lib/import-enrichment-jobs";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

  // Before the first checkpoint, use a conservative generic estimate so the
  // UI does not promise a fake countdown while the worker is still warming up.
  return Math.max(30, Math.ceil(remainingRows / 20) * 60);
};

export async function GET(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const { importId } = await params;
    const localDev = await isLocalDevHost();
    const { userId } = localDev ? { userId: "local-admin" } : await requireAuth();

    let importFile = await fetchImportFileCompat(importId);

    if (!importFile) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    if (!localDev) {
      await assertWorkspaceAccess(userId, importFile.workspaceId as string);
    }

    const parsedRowsCountBefore = Number(importFile.parsedRowsCount ?? 0);
    const confirmedTransactionsCountBefore = Number(importFile.confirmedTransactionsCount ?? 0);
    let statementCheckpoint = (await hasCompatibleTable("AccountStatementCheckpoint"))
      ? await prisma.accountStatementCheckpoint.findUnique({
          where: { importFileId: importId },
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
    if (importFile.status === "failed" && hasVisibleImportData) {
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

    return NextResponse.json({
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
    });
  } catch {
    return NextResponse.json({ error: "Unable to load import status" }, { status: 400 });
  }
}
