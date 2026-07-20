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
import type { AccountType } from "@/lib/domain-types";

type ImportAccountSummary = {
  accountId: string;
  accountName: string | null;
  institution: string | null;
  accountNumber: string | null;
  accountType: AccountType | null;
  balance: string | null;
  rowsImported: number;
};

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
    createdAt: string;
  } | null;
  timing: {
    uploadedAt: string;
    importUpdatedAt: string;
    confirmedAt: string | null;
    receiptDocumentCreatedAt: string | null;
    receiptTransactionCreatedAt: string | null;
    secondsSinceUpload: number;
    secondsToReceiptDocument: number | null;
    secondsToReceiptTransaction: number | null;
    secondsToConfirmation: number | null;
  };
  parsedRowsCount: number;
  confirmedTransactionsCount: number;
  visibleImportComplete: boolean;
  accountDetailOnlyImport: boolean;
  accountSummaries: ImportAccountSummary[];
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

const loadVisibleImportAccountSummaries = async (importFileId: string): Promise<ImportAccountSummary[]> => {
  const transactionGroups = await prisma.transaction.groupBy({
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
    by: ["accountId"],
    _count: { _all: true },
  }).catch(() => []);

  if (transactionGroups.length === 0) return [];

  const accounts = await prisma.account.findMany({
    where: { id: { in: transactionGroups.map((group) => group.accountId) } },
    select: {
      id: true,
      name: true,
      institution: true,
      accountNumber: true,
      type: true,
      balance: true,
    },
  }).catch(() => []);
  const accountById = new Map(accounts.map((account) => [account.id, account] as const));

  return transactionGroups.map((group) => {
    const account = accountById.get(group.accountId);
    return {
      accountId: group.accountId,
      accountName: account?.name ?? null,
      institution: account?.institution ?? null,
      accountNumber: account?.accountNumber ?? null,
      accountType: (account?.type ?? null) as AccountType | null,
      balance: account?.balance?.toString() ?? null,
      rowsImported: group._count._all,
    };
  }).sort((left, right) =>
    (left.accountName ?? left.accountId).localeCompare(right.accountName ?? right.accountId)
  );
};

const buildCheckpointAccountSummary = async (
  statementCheckpoint: Awaited<ReturnType<(typeof prisma)["accountStatementCheckpoint"]["findUnique"]>>,
  importFileAccountId?: string | null
): Promise<ImportAccountSummary[]> => {
  const checkpointMetadata =
    statementCheckpoint?.sourceMetadata && typeof statementCheckpoint.sourceMetadata === "object" && !Array.isArray(statementCheckpoint.sourceMetadata)
      ? (statementCheckpoint.sourceMetadata as Record<string, unknown>)
      : null;
  const resolvedAccountId = statementCheckpoint?.accountId ?? importFileAccountId ?? null;
  const accountRecord = resolvedAccountId
    ? await prisma.account.findUnique({
        where: { id: resolvedAccountId },
        select: {
          id: true,
          name: true,
          institution: true,
          accountNumber: true,
          type: true,
          balance: true,
        },
      }).catch(() => null)
    : null;

  const accountName =
    accountRecord?.name ??
    (typeof checkpointMetadata?.accountName === "string" ? checkpointMetadata.accountName.trim() : null) ??
    null;
  const institution =
    accountRecord?.institution ??
    (typeof checkpointMetadata?.institution === "string" ? checkpointMetadata.institution.trim() : null) ??
    null;
  const accountNumber =
    accountRecord?.accountNumber ??
    (typeof checkpointMetadata?.accountNumber === "string" ? checkpointMetadata.accountNumber.trim() : null) ??
    null;
  const accountType =
    (accountRecord?.type as AccountType | null | undefined) ??
    (typeof checkpointMetadata?.accountType === "string" ? (checkpointMetadata.accountType as AccountType) : null) ??
    null;
  const balance =
    statementCheckpoint?.endingBalance?.toString() ??
    accountRecord?.balance?.toString() ??
    null;

  if (!resolvedAccountId || (!accountName && !institution && !accountNumber && !balance)) {
    return [];
  }

  return [
    {
      accountId: resolvedAccountId,
      accountName,
      institution,
      accountNumber,
      accountType,
      balance,
      rowsImported: 0,
    },
  ];
};

const buildReceiptDocumentAccountSummary = async (
  receiptDocument: {
    accountId: string | null;
    currency: string | null;
    total: { toString(): string } | null;
    accountMatch: unknown;
    rawPayload: unknown;
  } | null
): Promise<ImportAccountSummary[]> => {
  if (!receiptDocument) {
    return [];
  }

  const accountRecord = receiptDocument.accountId
    ? await prisma.account.findUnique({
        where: { id: receiptDocument.accountId },
        select: {
          id: true,
          name: true,
          institution: true,
          accountNumber: true,
          type: true,
          balance: true,
        },
      }).catch(() => null)
    : null;

  const accountMatch =
    receiptDocument.accountMatch && typeof receiptDocument.accountMatch === "object" && !Array.isArray(receiptDocument.accountMatch)
      ? (receiptDocument.accountMatch as Record<string, unknown>)
      : null;
  const rawPayload =
    receiptDocument.rawPayload && typeof receiptDocument.rawPayload === "object" && !Array.isArray(receiptDocument.rawPayload)
      ? (receiptDocument.rawPayload as Record<string, unknown>)
      : null;
  const receiptAccountResolution =
    rawPayload?.receiptAccountResolution && typeof rawPayload.receiptAccountResolution === "object" && !Array.isArray(rawPayload.receiptAccountResolution)
      ? (rawPayload.receiptAccountResolution as Record<string, unknown>)
      : null;

  const accountId =
    accountRecord?.id ??
    (typeof receiptDocument.accountId === "string" && receiptDocument.accountId.trim() ? receiptDocument.accountId.trim() : null) ??
    (typeof receiptAccountResolution?.accountId === "string" && receiptAccountResolution.accountId.trim()
      ? receiptAccountResolution.accountId.trim()
      : null);
  const accountName =
    accountRecord?.name ??
    (typeof receiptAccountResolution?.accountName === "string" ? receiptAccountResolution.accountName.trim() : null) ??
    (typeof accountMatch?.account_name === "string" ? accountMatch.account_name.trim() : null) ??
    null;
  const institution =
    accountRecord?.institution ??
    (typeof receiptAccountResolution?.institution === "string" ? receiptAccountResolution.institution.trim() : null) ??
    (typeof rawPayload?.bank === "string" ? rawPayload.bank.trim() : null) ??
    (typeof accountMatch?.account_name === "string" ? accountMatch.account_name.trim() : null) ??
    null;
  const accountNumber =
    accountRecord?.accountNumber ??
    (typeof receiptAccountResolution?.accountNumber === "string" ? receiptAccountResolution.accountNumber.trim() : null) ??
    (typeof accountMatch?.account_last4 === "string" ? accountMatch.account_last4.trim() : null) ??
    null;
  const accountType =
    (accountRecord?.type as AccountType | null | undefined) ??
    (typeof receiptAccountResolution?.accountType === "string" ? (receiptAccountResolution.accountType as AccountType) : null) ??
    (institution ? ("wallet" as AccountType) : null);
  const balance = accountRecord?.balance?.toString() ?? receiptDocument.total?.toString() ?? null;

  if (!accountId || (!accountName && !institution && !accountNumber && !balance)) {
    return [];
  }

  return [
    {
      accountId,
      accountName,
      institution,
      accountNumber,
      accountType,
      balance,
      rowsImported: 0,
    },
  ];
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
  const [supportsDocumentImports, supportsReceiptDocuments, supportsStatementCheckpoints] = await Promise.all([
    hasCompatibleTable("DocumentImport"),
    hasCompatibleTable("ReceiptDocument"),
    hasCompatibleTable("AccountStatementCheckpoint"),
  ]);
  const [documentImport, initialStatementCheckpoint, savedTransactionsCount, enrichmentJob] = await Promise.all([
    supportsDocumentImports
      ? prisma.documentImport.findUnique({
          where: { importFileId },
          select: { id: true },
        }).catch(() => null)
      : Promise.resolve(null),
    supportsStatementCheckpoints
      ? prisma.accountStatementCheckpoint.findUnique({ where: { importFileId } }).catch(() => null)
      : Promise.resolve(null),
    countTransactionsByImportFileCompat(importFileId).catch(() => 0),
    getImportEnrichmentJobByImportFileId(importFileId).catch(() => null),
  ]);
  const receiptDocument =
    documentImport?.id && supportsReceiptDocuments
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
            createdAt: true,
          },
        }).catch(() => null)
      : null;
  const receiptTransaction =
    documentImport?.id || confirmedTransactionsCountBefore > 0 || parsedRowsCountBefore === 0
      ? receiptDocument?.transactionId
        ? await prisma.transaction.findUnique({
            where: { id: receiptDocument.transactionId },
            select: {
              id: true,
              accountId: true,
              date: true,
              amount: true,
              currency: true,
              type: true,
              categoryId: true,
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
          }).catch(() => null)
        : await prisma.transaction.findFirst({
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
              categoryId: true,
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
  let statementCheckpoint = initialStatementCheckpoint;
  let checkpointRowCount = Number(statementCheckpoint?.rowCount ?? 0);
  const checkpointWorkflowStage = readCheckpointWorkflowStage(statementCheckpoint?.sourceMetadata);
  const hasParsedRows = parsedRowsCountBefore > 0 || checkpointRowCount > 0;
  const hasConfirmedRows = confirmedTransactionsCountBefore > 0 || savedTransactionsCount > 0;

  let parsedRowsCount = Math.max(Number(importFile.parsedRowsCount ?? 0), checkpointRowCount);
  let confirmedTransactionsCount = Math.max(
    Number(importFile.confirmedTransactionsCount ?? 0),
    savedTransactionsCount
  );
  const nonMarkerParsedRowsCount =
    parsedRowsCount > 0 && confirmedTransactionsCount === 0
      ? await prisma.parsedTransaction
          .count({
            where: {
              importFileId,
              NOT: {
                OR: [
                  {
                    rawPayload: {
                      path: ["kind"],
                      equals: "account_snapshot_marker",
                    },
                  },
                  {
                    rawPayload: {
                      path: ["kind"],
                      equals: "opening_balance",
                    },
                  },
                ],
              },
            },
          })
          .catch(() => parsedRowsCount)
      : confirmedTransactionsCount;
  const accountDetailOnlyImport =
    confirmedTransactionsCount === 0 &&
    parsedRowsCount > 0 &&
    nonMarkerParsedRowsCount === 0 &&
    Boolean(
      statementCheckpoint?.accountId ||
        statementCheckpoint?.endingBalance !== null ||
        (statementCheckpoint?.sourceMetadata &&
          typeof statementCheckpoint.sourceMetadata === "object" &&
          !Array.isArray(statementCheckpoint.sourceMetadata))
    );
  const receiptHasVisibleTransaction = Boolean(receiptTransaction);
  const receiptHasVisibleDocument = Boolean(receiptDocument);
  const visibleImportComplete =
    confirmedTransactionsCount > 0 || hasConfirmedRows || accountDetailOnlyImport || receiptHasVisibleTransaction;
  const hasVisibleImportData =
    visibleImportComplete || parsedRowsCount > 0 || checkpointRowCount > 0 || receiptHasVisibleDocument;
  const [checkpointAccountSummaries, visibleTransactionAccountSummaries] = await Promise.all([
    hasVisibleImportData
      ? buildCheckpointAccountSummary(statementCheckpoint, importFile.accountId ?? null)
      : Promise.resolve([]),
    confirmedTransactionsCount > 0 || hasConfirmedRows || receiptHasVisibleTransaction
      ? loadVisibleImportAccountSummaries(importFileId)
      : Promise.resolve([]),
  ]);
  const receiptDocumentAccountSummaries =
    receiptHasVisibleDocument && visibleTransactionAccountSummaries.length === 0
      ? await buildReceiptDocumentAccountSummary(receiptDocument)
      : [];
  const accountSummaries =
    visibleTransactionAccountSummaries.length > 0
      ? visibleTransactionAccountSummaries
      : receiptDocumentAccountSummaries.length > 0
        ? receiptDocumentAccountSummaries
      : checkpointAccountSummaries;
  const resolvedAccountId =
    importFile.accountId ??
    receiptTransaction?.accountId ??
    receiptDocument?.accountId ??
    statementCheckpoint?.accountId ??
    (accountSummaries.length === 1 ? accountSummaries[0]?.accountId ?? null : null);

  const shouldPersistResolvedAccountId =
    Boolean(resolvedAccountId) &&
    !importFile.accountId &&
    (visibleImportComplete ||
      Boolean(statementCheckpoint?.accountId) ||
      (checkpointAccountSummaries.length === 1 &&
        Boolean(checkpointAccountSummaries[0]?.accountName || checkpointAccountSummaries[0]?.accountNumber)));
  const shouldPersistConfirmedTransactionsCount =
    confirmedTransactionsCount > confirmedTransactionsCountBefore;

  if (shouldPersistResolvedAccountId || shouldPersistConfirmedTransactionsCount) {
    importFile =
      (await updateImportFileCompat(importFileId, {
        ...(shouldPersistResolvedAccountId && resolvedAccountId ? { accountId: resolvedAccountId } : {}),
        confirmedTransactionsCount,
      }).catch(() => null)) ?? importFile;
    if (shouldPersistResolvedAccountId && resolvedAccountId && statementCheckpoint && !statementCheckpoint.accountId) {
      await prisma.accountStatementCheckpoint.update({
        where: { importFileId },
        data: { accountId: resolvedAccountId },
      }).catch(() => null);
      statementCheckpoint = (await prisma.accountStatementCheckpoint.findUnique({
        where: { importFileId },
      }).catch(() => null)) ?? statementCheckpoint;
    }
  }

  if (options?.promoteFailedVisibleImport && importFile.status === "failed" && visibleImportComplete) {
    importFile =
      (await updateImportFileCompat(importFileId, {
        status: "done",
        processingPhase: "complete",
        processingMessage: "Transactions are visible. Clover is cleaning up names and categories in the background.",
        confirmedTransactionsCount,
      }).catch(() => null)) ?? importFile;
  }

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
    confirmedTransactionsCount > 0 || receiptHasVisibleTransaction
      ? "confirmed"
      : importFile.status === "failed"
        ? "failed"
        : accountDetailOnlyImport && importFile.status === "done"
          ? "done"
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
    processingMessage:
      !visibleImportComplete &&
      accountSummaries.length > 0 &&
      hasVisibleImportData &&
      importFile.status === "processing"
        ? "Clover found the account and is linking the visible rows."
        : importFile.processingMessage,
    parsedRowsCount,
    confirmedTransactionsCount,
    confirmationStatus,
    checkpointStatus: statementCheckpoint?.status ?? null,
    workflowStage: checkpointWorkflowStage,
  });
  const resolvedWorkflowStage = checkpointWorkflowStage ?? telemetry.phase;
  const uploadedAtMs = importFile.uploadedAt.getTime();
  const importUpdatedAtMs = importFile.updatedAt.getTime();
  const confirmedAtMs = importFile.confirmedAt?.getTime() ?? null;
  const receiptDocumentCreatedAtMs = receiptDocument?.createdAt?.getTime() ?? null;
  const receiptTransactionCreatedAtMs = receiptTransaction?.createdAt?.getTime() ?? null;
  const toSecondsSinceUpload = (timestampMs: number | null) =>
    timestampMs !== null && Number.isFinite(uploadedAtMs) ? Math.max(0, Math.round((timestampMs - uploadedAtMs) / 1000)) : null;

  const resolvedProcessingMessage =
    !visibleImportComplete &&
    accountSummaries.length > 0 &&
    hasVisibleImportData &&
    importFile.status === "processing"
      ? "Clover found the account and is linking the visible rows."
      : importFile.processingMessage ?? null;

  return {
    importFile: {
      id: importFile.id,
      fileName: importFile.fileName,
      fileType: importFile.fileType,
      status: importFile.status,
      processingPhase: importFile.processingPhase ?? null,
      processingMessage: resolvedProcessingMessage,
      processingAttempt: Number(importFile.processingAttempt ?? 0),
      processingTargetScore: importFile.processingTargetScore ?? null,
      processingCurrentScore: importFile.processingCurrentScore ?? null,
      accountId: resolvedAccountId,
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
          createdAt: receiptDocument.createdAt.toISOString(),
        }
      : null,
    receiptTransaction: receiptTransaction
      ? {
          id: receiptTransaction.id,
          accountId: receiptTransaction.accountId,
          accountName: receiptTransaction.account?.name ?? "Receipt",
          institution: receiptTransaction.account?.institution ?? null,
          accountNumber: receiptTransaction.account?.accountNumber ?? null,
          categoryId: receiptTransaction.categoryId,
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
    timing: {
      uploadedAt: importFile.uploadedAt.toISOString(),
      importUpdatedAt: importFile.updatedAt.toISOString(),
      confirmedAt: importFile.confirmedAt?.toISOString() ?? null,
      receiptDocumentCreatedAt: receiptDocument?.createdAt?.toISOString() ?? null,
      receiptTransactionCreatedAt: receiptTransaction?.createdAt.toISOString() ?? null,
      secondsSinceUpload:
        Number.isFinite(uploadedAtMs) && Number.isFinite(importUpdatedAtMs)
          ? Math.max(0, Math.round((Date.now() - uploadedAtMs) / 1000))
          : 0,
      secondsToReceiptDocument: toSecondsSinceUpload(receiptDocumentCreatedAtMs),
      secondsToReceiptTransaction: toSecondsSinceUpload(receiptTransactionCreatedAtMs),
      secondsToConfirmation: toSecondsSinceUpload(confirmedAtMs),
    },
    parsedRowsCount,
    confirmedTransactionsCount,
    visibleImportComplete,
    accountDetailOnlyImport,
    accountSummaries,
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
