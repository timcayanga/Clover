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
  receiptTransaction: {
    id: string;
    accountId: string;
    accountName: string;
    institution: string | null;
    accountNumber: string | null;
    categoryId: string | null;
    reviewStatus: string | null;
    date: string;
    amount: string;
    currency: string;
    type: "income" | "expense" | "transfer";
    merchantRaw: string;
    merchantClean: string | null;
    description: string | null;
    rawPayload: Record<string, unknown> | null;
    normalizedPayload: Record<string, unknown> | null;
    isTransfer: boolean;
    isExcluded: boolean;
    createdAt: string;
  } | null;
  receiptDocument: {
    id: string;
    accountId: string | null;
    transactionId: string | null;
    merchantRaw: string | null;
    merchantClean: string | null;
    transactionDate: string | null;
    transactionTime: string | null;
    currency: string | null;
    subtotal: string | null;
    tax: string | null;
    total: string | null;
    paymentMethod: string | null;
    accountMatch: Record<string, unknown> | null;
    rawPayload: Record<string, unknown> | null;
  } | null;
  parsedRowsCount: number;
  confirmedTransactionsCount: number;
  visibleImportComplete: boolean;
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
  const documentImport = (await hasCompatibleTable("DocumentImport"))
    ? await prisma.documentImport.findUnique({
        where: { importFileId },
        select: { id: true },
      }).catch(() => null)
    : null;
  const receiptDocument =
    documentImport?.id && (await hasCompatibleTable("ReceiptDocument"))
      ? await prisma.receiptDocument.findUnique({
          where: { documentImportId: documentImport.id },
          select: {
            id: true,
            accountId: true,
            transactionId: true,
            merchantRaw: true,
            merchantClean: true,
            transactionDate: true,
            transactionTime: true,
            currency: true,
            subtotal: true,
            tax: true,
            total: true,
            paymentMethod: true,
            accountMatch: true,
            rawPayload: true,
          },
        }).catch(() => null)
      : null;
  const receiptTransaction =
    importFile.status === "done"
      ? await prisma.transaction.findFirst({
          where: {
            importFileId,
            deletedAt: null,
          },
          select: {
            id: true,
            accountId: true,
            date: true,
            amount: true,
            currency: true,
            type: true,
            merchantRaw: true,
            merchantClean: true,
            description: true,
            rawPayload: true,
            normalizedPayload: true,
            reviewStatus: true,
            isTransfer: true,
            isExcluded: true,
            createdAt: true,
            account: {
              select: {
                name: true,
                institution: true,
                accountNumber: true,
              },
            },
          },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        }).catch(() => null)
      : null;
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
  const savedTransactionsCount = await countTransactionsByImportFileCompat(importFileId).catch(() => 0);
  let confirmedTransactionsCount = Math.max(
    Number(importFile.confirmedTransactionsCount ?? 0),
    savedTransactionsCount,
    statementCheckpoint?.status === "reconciled" ? checkpointRowCount : 0
  );
  const visibleImportComplete = confirmedTransactionsCount > 0 || hasConfirmedRows;
  const hasVisibleImportData = visibleImportComplete || parsedRowsCount > 0 || checkpointRowCount > 0;

  if (options?.promoteFailedVisibleImport && importFile.status === "failed" && hasVisibleImportData) {
    importFile =
      (await updateImportFileCompat(importFileId, {
        status: "done",
        processingPhase: "complete",
        processingMessage:
          confirmedTransactionsCount > 0
            ? "Transactions are visible. Clover is cleaning up names and categories in the background."
            : "Account details are visible. Clover is finishing transaction cleanup in the background.",
        confirmedTransactionsCount,
      }).catch(() => null)) ?? importFile;
  }

  const enrichmentJob = await getImportEnrichmentJobByImportFileId(importFileId).catch(() => null);
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
    receiptDocument: receiptDocument
      ? {
          id: receiptDocument.id,
          accountId: receiptDocument.accountId ?? null,
          transactionId: receiptDocument.transactionId ?? null,
          merchantRaw: receiptDocument.merchantRaw ?? null,
          merchantClean: receiptDocument.merchantClean ?? null,
          transactionDate: receiptDocument.transactionDate?.toISOString() ?? null,
          transactionTime: receiptDocument.transactionTime ?? null,
          currency: receiptDocument.currency ?? null,
          subtotal: receiptDocument.subtotal?.toString() ?? null,
          tax: receiptDocument.tax?.toString() ?? null,
          total: receiptDocument.total?.toString() ?? null,
          paymentMethod: receiptDocument.paymentMethod ?? null,
          accountMatch:
            receiptDocument.accountMatch && typeof receiptDocument.accountMatch === "object" && !Array.isArray(receiptDocument.accountMatch)
              ? (receiptDocument.accountMatch as Record<string, unknown>)
              : null,
          rawPayload:
            receiptDocument.rawPayload && typeof receiptDocument.rawPayload === "object" && !Array.isArray(receiptDocument.rawPayload)
              ? (receiptDocument.rawPayload as Record<string, unknown>)
              : null,
        }
      : null,
    receiptTransaction: receiptTransaction
      ? {
          id: receiptTransaction.id,
          accountId: receiptTransaction.accountId,
          accountName: receiptTransaction.account?.name ?? "Receipt",
          institution: receiptTransaction.account?.institution ?? null,
          accountNumber: receiptTransaction.account?.accountNumber ?? null,
          categoryId: null,
          reviewStatus: receiptTransaction.reviewStatus,
          date: receiptTransaction.date.toISOString(),
          amount: receiptTransaction.amount.toString(),
          currency: receiptTransaction.currency,
          type: receiptTransaction.type,
          merchantRaw: receiptTransaction.merchantRaw,
          merchantClean: receiptTransaction.merchantClean ?? null,
          description: receiptTransaction.description ?? null,
          rawPayload:
            receiptTransaction.rawPayload && typeof receiptTransaction.rawPayload === "object" && !Array.isArray(receiptTransaction.rawPayload)
              ? (receiptTransaction.rawPayload as Record<string, unknown>)
              : null,
          normalizedPayload:
            receiptTransaction.normalizedPayload && typeof receiptTransaction.normalizedPayload === "object" && !Array.isArray(receiptTransaction.normalizedPayload)
              ? (receiptTransaction.normalizedPayload as Record<string, unknown>)
              : null,
          isTransfer: receiptTransaction.isTransfer,
          isExcluded: receiptTransaction.isExcluded,
          createdAt: receiptTransaction.createdAt.toISOString(),
        }
      : null,
    parsedRowsCount,
    confirmedTransactionsCount,
    visibleImportComplete,
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
