import type { Prisma, TransactionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { deriveReconciledBalance, type BalanceLikeTransaction } from "@/lib/account-balance";
import { parseAmountValue, parseImportText } from "@/lib/import-parser";
import { readImportedFileText, readImportedPdfPageImages } from "@/lib/import-file-text.server";
import {
  DATA_ENGINE_VERSION,
  buildParsedTransactionInsertData,
  buildStatementFingerprint,
  detectStatementMetadataFromText,
  findExistingImportedStatement,
  fetchImportFileCompat,
  fetchParsedTransactionRows,
  enrichParsedRowsWithTraining,
  defaultCategoryForType,
  insertParsedTransactionsCompat,
  hasCompatibleTable,
  recordTrainingSignal,
  loadStatementTemplate,
  mergeStatementMetadataWithTemplate,
  normalizeAccountRuleKey,
  updateImportFileCompat,
  upsertAccountRule,
  upsertStatementTemplate,
} from "@/lib/data-engine";
import { getTrailingBalanceFromParsedRows, inferAccountTypeFromStatement } from "@/lib/import-parser";
import { parseImportTextWithOpenAIFallback } from "@/lib/openai-import-parser";

type ImportInsightSummary = {
  incomeTotal: number;
  expenseTotal: number;
  netTotal: number;
  topCategoryName: string | null;
  topCategoryAmount: number | null;
  topCategoryShare: number | null;
  topMerchantName: string | null;
  topMerchantCount: number | null;
};

type ImportInsightSourceRow = {
  amount?: unknown;
  type?: unknown;
  merchantRaw?: unknown;
  merchantClean?: unknown;
  description?: unknown;
  categoryName?: unknown;
  rawPayload?: unknown;
};

type PreparedImportTransaction = {
  transactionId: string | null;
  insertRow: Record<string, unknown>;
  insightRow: ImportInsightSourceRow;
  trainingSignal: {
    merchantText: string;
    categoryId: string;
    categoryName: string;
    type: "income" | "expense" | "transfer";
    confidence: number;
    notes: string | null;
  };
};

type ProcessImportResult = {
  imported: number;
  duplicate: boolean;
  metadata: ReturnType<typeof detectStatementMetadataFromText>;
  insightSummary?: ImportInsightSummary;
  accountBalance?: string | null;
};

const shouldRouteToReview = (params: { confidence: number; categoryName?: string | null; type?: string | null }) => {
  if (params.confidence < 90) {
    return true;
  }

  if ((params.categoryName ?? "").trim() === "Other") {
    return true;
  }

  if (!params.type) {
    return true;
  }

  return false;
};

const isTruthyEnvValue = (value?: string | null) => {
  if (!value) {
    return false;
  }

  return /^(1|true|yes|on|primary)$/i.test(value.trim());
};

const chunkArray = <T,>(items: T[], size: number) => {
  if (size <= 0) {
    return [items];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const resolveConfirmationAccount = async (params: {
  importFile: { workspaceId: unknown; fileName?: unknown };
  statementMetadata?: {
    accountName?: unknown;
    institution?: unknown;
    accountType?: unknown;
    accountNumber?: unknown;
  } | null;
  parsedRows: Array<{
    accountName?: unknown;
    institution?: unknown;
  }>;
  accountId: string;
}) => {
  const workspaceId = String(params.importFile.workspaceId);
  const candidateRow =
    (typeof params.statementMetadata?.accountName === "string" && params.statementMetadata.accountName.trim()
      ? params.statementMetadata
      : null) ??
    (typeof params.statementMetadata?.institution === "string" && params.statementMetadata.institution.trim()
      ? params.statementMetadata
      : null) ??
    params.parsedRows.find((row) => typeof row.accountName === "string" && row.accountName.trim()) ??
    params.parsedRows.find((row) => typeof row.institution === "string" && row.institution.trim()) ??
    null;

  const inferredAccountName =
    typeof candidateRow?.accountName === "string" && candidateRow.accountName.trim()
    ? String(candidateRow.accountName).trim()
      : typeof candidateRow?.institution === "string" && candidateRow.institution.trim()
        ? candidateRow.institution.trim()
        : typeof params.importFile.fileName === "string"
          ? params.importFile.fileName.replace(/\.[^.]+$/, "").trim()
          : null;

  const inferredInstitution =
    typeof candidateRow?.institution === "string" && candidateRow.institution.trim()
      ? candidateRow.institution.trim()
      : null;
  const inferredAccountNumber =
    typeof params.statementMetadata?.accountNumber === "string" && params.statementMetadata.accountNumber.trim()
      ? params.statementMetadata.accountNumber.trim()
      : null;
  const inferredAccountType =
    typeof params.statementMetadata?.accountType === "string" &&
    ["bank", "wallet", "credit_card", "cash", "investment", "other"].includes(params.statementMetadata.accountType)
      ? (params.statementMetadata.accountType as "bank" | "wallet" | "credit_card" | "cash" | "investment" | "other")
      : null;

  const isOptimisticId = params.accountId.startsWith("optimistic-");
  const directAccount = !isOptimisticId
    ? await prisma.account.findUnique({
        where: { id: params.accountId },
      })
    : null;
  if (directAccount) {
    return directAccount;
  }

  const candidateKey = normalizeAccountRuleKey(
    inferredAccountName || inferredAccountNumber || String(params.importFile.fileName ?? null),
    inferredInstitution
  );

  const workspaceAccounts = await prisma.account.findMany({
    where: { workspaceId },
  });
  const existingByKey = workspaceAccounts.find(
    (account) => normalizeAccountRuleKey(account.name, account.institution) === candidateKey
  );
  if (existingByKey) {
    return existingByKey;
  }

  if (inferredAccountName || inferredAccountNumber) {
    return prisma.account.create({
      data: {
        workspaceId,
        name:
          inferredAccountName ??
          (inferredInstitution && inferredAccountNumber ? `${inferredInstitution} ${inferredAccountNumber.slice(-4)}` : String(params.importFile.fileName ?? "Imported account").replace(/\.[^.]+$/, "").trim()),
        institution: inferredInstitution,
        type: inferredAccountType ?? inferAccountTypeFromStatement(inferredInstitution, inferredAccountName ?? inferredAccountNumber, "bank"),
        currency: "PHP",
        source: "upload",
      },
    });
  }

  return null;
};

const buildTransactionInsertRecord = (params: {
  workspaceId: string;
  accountId: string;
  importFileId?: string | null;
  categoryId?: string | null;
  reviewStatus?: string;
  parserConfidence?: number;
  categoryConfidence?: number;
  accountMatchConfidence?: number;
  duplicateConfidence?: number;
  transferConfidence?: number;
  rawPayload?: Prisma.InputJsonValue | null;
  normalizedPayload?: Prisma.InputJsonValue | null;
  learnedRuleIdsApplied?: Prisma.InputJsonValue | null;
  date: Date;
  amount: string | number;
  currency: string;
  type: TransactionType;
  merchantRaw: string;
  merchantClean?: string | null;
  description?: string | null;
  isTransfer?: boolean;
  isExcluded?: boolean;
}) => {
  const amount = parseAmountValue(typeof params.amount === "number" ? String(params.amount) : params.amount ?? null);
  if (amount === null) {
    throw new Error("Invalid transaction amount.");
  }

  const record: Record<string, unknown> = {
    id: crypto.randomUUID(),
    workspaceId: params.workspaceId,
    accountId: params.accountId,
    categoryId: params.categoryId ?? null,
    reviewStatus: params.reviewStatus ?? "suggested",
    parserConfidence: params.parserConfidence ?? 0,
    categoryConfidence: params.categoryConfidence ?? 0,
    accountMatchConfidence: params.accountMatchConfidence ?? 0,
    duplicateConfidence: params.duplicateConfidence ?? 0,
    transferConfidence: params.transferConfidence ?? 0,
    rawPayload: params.rawPayload ?? null,
    normalizedPayload: params.normalizedPayload ?? null,
    learnedRuleIdsApplied: params.learnedRuleIdsApplied ?? null,
    date: params.date,
    amount,
    currency: params.currency,
    type: params.type,
    merchantRaw: params.merchantRaw,
    merchantClean: params.merchantClean ?? null,
    description: params.description ?? null,
    isTransfer: params.isTransfer ?? false,
    isExcluded: params.isExcluded ?? false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  if (params.importFileId !== undefined) {
    record.importFileId = params.importFileId ?? null;
  }

  return record;
};

export const processImportFileText = async (
  importFileId: string,
  options: { text?: string; password?: string; actorUserId?: string | null } = {}
): Promise<ProcessImportResult> => {
  const importFile = await fetchImportFileCompat(importFileId);

  if (!importFile) {
    throw new Error("Import file not found");
  }

  await updateImportFileCompat(importFileId, {
    status: "processing",
  });

  let text = options.text ?? "";
  if (!text) {
    const storageKey = String(importFile.storageKey ?? "");
    if (!storageKey) {
      throw new Error("Missing imported file.");
    }

    text = await readImportedFileText(
      {
        storageKey,
        fileType: String(importFile.fileType ?? ""),
        fileName: String(importFile.fileName ?? ""),
      },
      options.password
    );
  }

  const metadata = detectStatementMetadataFromText(text);
  const statementFingerprint = buildStatementFingerprint(text, metadata, importFile.fileName, importFile.fileType);
  const existingTemplate = await loadStatementTemplate({
    workspaceId: String(importFile.workspaceId),
    fingerprint: statementFingerprint,
  });
  const templateMetadata =
    existingTemplate?.metadata && typeof existingTemplate.metadata === "object" && !Array.isArray(existingTemplate.metadata)
      ? (existingTemplate.metadata as Record<string, unknown>)
      : null;
  const mergedMetadata = mergeStatementMetadataWithTemplate(metadata, {
    institution:
      typeof templateMetadata?.institution === "string" && templateMetadata.institution.trim()
        ? templateMetadata.institution.trim()
        : null,
    accountNumber:
      typeof templateMetadata?.accountNumber === "string" && templateMetadata.accountNumber.trim()
        ? templateMetadata.accountNumber.trim()
        : null,
    accountName:
      typeof templateMetadata?.accountName === "string" && templateMetadata.accountName.trim()
        ? templateMetadata.accountName.trim()
        : null,
    openingBalance: typeof templateMetadata?.openingBalance === "number" ? templateMetadata.openingBalance : null,
    endingBalance: typeof templateMetadata?.endingBalance === "number" ? templateMetadata.endingBalance : null,
    startDate: typeof templateMetadata?.startDate === "string" ? templateMetadata.startDate : null,
    endDate: typeof templateMetadata?.endDate === "string" ? templateMetadata.endDate : null,
  });

  const parsedRows = parseImportText(text, importFile.fileName, importFile.fileType, {
    institution: mergedMetadata.institution,
    accountName: mergedMetadata.accountName,
    accountNumber: mergedMetadata.accountNumber,
  });
  const shouldUseVisionFallback =
    importFile.fileType === "application/pdf" &&
    (!text.trim() ||
      parsedRows.length === 0 ||
      (mergedMetadata.confidence ?? 0) < 70 ||
      !mergedMetadata.accountNumber);
  const pageImages =
    shouldUseVisionFallback
      ? await readImportedPdfPageImages(
          {
            storageKey: String(importFile.storageKey ?? ""),
            fileType: String(importFile.fileType ?? ""),
            fileName: String(importFile.fileName ?? ""),
          },
          options.password,
          2
        )
      : null;
  const openAiPrimaryMode = isTruthyEnvValue(getEnv().OPENAI_IMPORT_PARSER_PRIMARY);
  const openAiParsed = await parseImportTextWithOpenAIFallback({
    text,
    fileName: String(importFile.fileName ?? ""),
    fileType: String(importFile.fileType ?? ""),
    detectedMetadata: mergedMetadata,
    parsedRows,
    pageImages,
    preferPrimary: openAiPrimaryMode || Boolean(pageImages?.length),
  });

  const openAiMetadata = openAiParsed
    ? mergeStatementMetadataWithTemplate(openAiParsed.metadata, {
        institution:
          typeof templateMetadata?.institution === "string" && templateMetadata.institution.trim()
            ? templateMetadata.institution.trim()
            : null,
        accountNumber:
          typeof templateMetadata?.accountNumber === "string" && templateMetadata.accountNumber.trim()
            ? templateMetadata.accountNumber.trim()
            : null,
        accountName:
          typeof templateMetadata?.accountName === "string" && templateMetadata.accountName.trim()
            ? templateMetadata.accountName.trim()
            : null,
        openingBalance: typeof templateMetadata?.openingBalance === "number" ? templateMetadata.openingBalance : null,
        endingBalance: typeof templateMetadata?.endingBalance === "number" ? templateMetadata.endingBalance : null,
        startDate: typeof templateMetadata?.startDate === "string" ? templateMetadata.startDate : null,
        endDate: typeof templateMetadata?.endDate === "string" ? templateMetadata.endDate : null,
      })
    : null;

  if (openAiParsed?.audit && options.actorUserId) {
    await prisma.auditLog.create({
      data: {
        workspaceId: importFile.workspaceId as string,
        actorUserId: options.actorUserId,
        action: "import.openai_fallback",
        entity: "ImportFile",
        entityId: importFileId,
        metadata: {
          model: openAiParsed.model,
          promptVersion: openAiParsed.promptVersion,
          sourceFilename: openAiParsed.audit.sourceFilename ?? importFile.fileName,
          confidence: openAiParsed.audit.confidence,
          schemaValidated: openAiParsed.audit.schemaValidated,
          schemaValidationResult: openAiParsed.audit.schemaValidationResult,
          rawResponse: openAiParsed.audit.rawResponse,
        },
      },
    });
  }

  const useOpenAiParse =
    Boolean(openAiParsed?.rows.length) &&
    Boolean(openAiParsed?.audit.schemaValidated) &&
    (openAiPrimaryMode ||
      (openAiMetadata
        ? (openAiMetadata?.confidence ?? 0) >= (mergedMetadata.confidence ?? 0)
        : parsedRows.length === 0));
  const effectiveRows = useOpenAiParse && openAiParsed ? openAiParsed.rows : parsedRows;
  const effectiveMetadataSource = useOpenAiParse && openAiMetadata ? openAiMetadata : mergedMetadata;
  const parsedEndingBalance = getTrailingBalanceFromParsedRows(effectiveRows);
  const resolvedMetadata = {
    ...effectiveMetadataSource,
    endingBalance: effectiveMetadataSource.endingBalance ?? parsedEndingBalance,
  };
  const duplicateImportFileId = await findExistingImportedStatement({
    workspaceId: importFile.workspaceId,
    statementFingerprint,
    importFileId,
  });
  if (duplicateImportFileId) {
    await updateImportFileCompat(importFileId, {
      status: "done",
    });
    return { imported: 0, duplicate: true, metadata: resolvedMetadata };
  }
  let rows: Awaited<ReturnType<typeof enrichParsedRowsWithTraining>> = effectiveRows as Awaited<
    ReturnType<typeof enrichParsedRowsWithTraining>
  >;
  try {
    rows = await enrichParsedRowsWithTraining({
      workspaceId: importFile.workspaceId,
      rows: effectiveRows,
      statementConfidence: resolvedMetadata.confidence ?? 0,
    });
  } catch (error) {
    console.warn("Import training enrichment failed; continuing with parsed rows", {
      importFileId,
      error,
    });
  }

  if (await hasCompatibleTable("ParsedTransaction")) {
    await prisma.parsedTransaction.deleteMany({
      where: { importFileId },
    });
  }

  const parsedTransactionData = await buildParsedTransactionInsertData({
    importFileId,
    workspaceId: importFile.workspaceId,
    rows,
    metadata: resolvedMetadata,
    statementFingerprint,
  });
  await insertParsedTransactionsCompat({
    importFileId,
    rows: parsedTransactionData,
  });
  await updateImportFileCompat(importFileId, {
    parsedRowsCount: rows.length,
  });

  let template: Awaited<ReturnType<typeof upsertStatementTemplate>> | null = null;
  try {
    template = await upsertStatementTemplate({
      workspaceId: importFile.workspaceId,
      fingerprint: statementFingerprint,
      metadata: resolvedMetadata,
      fileType: importFile.fileType,
      parserConfig: {
        accountType: resolvedMetadata.accountType ?? inferAccountTypeFromStatement(resolvedMetadata.institution, resolvedMetadata.accountName, "bank"),
        rowCount: rows.length,
        firstMerchant:
          typeof rows[0]?.merchantClean === "string"
            ? rows[0]?.merchantClean
            : typeof rows[0]?.merchantRaw === "string"
              ? rows[0]?.merchantRaw
              : null,
        lastMerchant:
          typeof rows.at(-1)?.merchantClean === "string"
            ? rows.at(-1)?.merchantClean
            : typeof rows.at(-1)?.merchantRaw === "string"
              ? rows.at(-1)?.merchantRaw
              : null,
      } as Prisma.InputJsonValue,
    });
  } catch (error) {
    console.warn("Statement template upsert failed; continuing import", {
      importFileId,
      error,
    });
  }

  if (await hasCompatibleTable("AccountStatementCheckpoint")) {
    try {
      const metadataStartDate = metadata.startDate ? new Date(metadata.startDate) : null;
      const metadataEndDate = resolvedMetadata.endDate ? new Date(resolvedMetadata.endDate) : null;
      await prisma.accountStatementCheckpoint.upsert({
        where: { importFileId },
        update: {
          workspaceId: importFile.workspaceId,
          statementStartDate: metadataStartDate,
          statementEndDate: metadataEndDate,
          openingBalance: resolvedMetadata.openingBalance === null ? null : resolvedMetadata.openingBalance.toString(),
          endingBalance: resolvedMetadata.endingBalance === null ? null : resolvedMetadata.endingBalance.toString(),
          status: "pending",
          mismatchReason: null,
          sourceMetadata: resolvedMetadata as Prisma.InputJsonValue,
          rowCount: rows.length,
        },
        create: {
          workspaceId: importFile.workspaceId,
          importFileId,
          statementStartDate: metadataStartDate,
          statementEndDate: metadataEndDate,
          openingBalance: resolvedMetadata.openingBalance === null ? null : resolvedMetadata.openingBalance.toString(),
          endingBalance: resolvedMetadata.endingBalance === null ? null : resolvedMetadata.endingBalance.toString(),
          status: "pending",
          sourceMetadata: resolvedMetadata as Prisma.InputJsonValue,
          rowCount: rows.length,
        },
      });
    } catch (error) {
      console.warn("Statement checkpoint upsert failed; continuing import", {
        importFileId,
        error,
      });
    }
  }

  await updateImportFileCompat(importFileId, {
    status: "done",
  });

  return { imported: rows.length, duplicate: false, metadata: resolvedMetadata, insightSummary: undefined, accountBalance: undefined };
};

const normalizeImportMerchant = (transaction: {
  merchantRaw?: unknown;
  merchantClean?: unknown;
  description?: unknown;
}) => {
  return String(transaction.merchantClean ?? transaction.merchantRaw ?? transaction.description ?? "Imported transaction")
    .trim()
    .toLowerCase();
};

const buildImportInsightSummary = (
  transactions: ImportInsightSourceRow[]
): ImportInsightSummary => {
  const categoryTotals = new Map<string, number>();
  const merchantCounts = new Map<string, { count: number; label: string }>();

  let incomeTotal = 0;
  let expenseTotal = 0;

  for (const transaction of transactions) {
    const amount = Math.abs(Number(transaction.amount ?? 0));
    const kind =
      transaction.rawPayload && typeof transaction.rawPayload === "object" && !Array.isArray(transaction.rawPayload)
        ? ((transaction.rawPayload as Record<string, unknown>).kind as string | undefined)
        : undefined;

    if (kind === "opening_balance") {
      continue;
    }

    if (transaction.type === "income") {
      incomeTotal += amount;
    } else if (transaction.type === "expense") {
      expenseTotal += amount;
      const categoryName = typeof transaction.categoryName === "string" && transaction.categoryName.trim() ? transaction.categoryName.trim() : "Other";
      categoryTotals.set(categoryName, (categoryTotals.get(categoryName) ?? 0) + amount);
    }

    const merchantKey = normalizeImportMerchant(transaction);
    const merchantLabel = String(transaction.merchantClean ?? transaction.merchantRaw ?? transaction.description ?? "Imported transaction").trim();
    const currentMerchant = merchantCounts.get(merchantKey);
    merchantCounts.set(merchantKey, {
      count: (currentMerchant?.count ?? 0) + 1,
      label: currentMerchant?.label ?? merchantLabel,
    });
  }

  const topCategory = Array.from(categoryTotals.entries()).sort((a, b) => b[1] - a[1])[0] ?? null;
  const topMerchant = Array.from(merchantCounts.values()).sort((a, b) => b.count - a.count)[0] ?? null;

  return {
    incomeTotal,
    expenseTotal,
    netTotal: incomeTotal - expenseTotal,
    topCategoryName: topCategory?.[0] ?? null,
    topCategoryAmount: topCategory?.[1] ?? null,
    topCategoryShare: topCategory && expenseTotal > 0 ? topCategory[1] / expenseTotal : null,
    topMerchantName: topMerchant?.label ?? null,
    topMerchantCount: topMerchant?.count ?? null,
  };
};

const snapshotBalanceToString = (value: unknown) => {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = parseAmountValue(typeof value === "number" ? String(value) : String(value));
  return parsed === null ? null : parsed.toFixed(2);
};

const looksLikeJsonBlob = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (!/^[\[{]/.test(trimmed)) {
    return false;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return parsed !== null && typeof parsed === "object";
  } catch {
    return true;
  }
};

const extractHumanReadableDescription = (rawPayload: Prisma.InputJsonValue | null | undefined) => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const payload = rawPayload as Record<string, unknown>;
  const candidates = [
    payload.description,
    payload.notes,
    payload.memo,
    payload.detail,
    payload.line,
    payload.merchant,
    payload.merchantRaw,
    payload.transactionDescription,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (!trimmed) {
        continue;
      }

      if (looksLikeJsonBlob(trimmed)) {
        continue;
      }

      return trimmed;
    }
  }

  return null;
};

export const confirmImportFile = async (importFileId: string, accountId: string) => {
  const importFile = await fetchImportFileCompat(importFileId);

  if (!importFile) {
    throw new Error("Import file not found");
  }

  let parsedRows: Array<Record<string, unknown>> = await fetchParsedTransactionRows(importFileId);
  if (parsedRows.length === 0) {
    try {
      await processImportFileText(importFileId, { actorUserId: null });
      parsedRows = await fetchParsedTransactionRows(importFileId);
    } catch (error) {
      console.warn("Unable to recover parsed rows before confirmation", {
        importFileId,
        error,
      });
    }
  }

  if (parsedRows.length === 0) {
    throw new Error("No parsed rows available");
  }

  const statementCheckpointRecord = (await hasCompatibleTable("AccountStatementCheckpoint"))
    ? await prisma.accountStatementCheckpoint.findUnique({
        where: { importFileId },
      })
    : null;
  const statementMetadata =
    statementCheckpointRecord?.sourceMetadata &&
    typeof statementCheckpointRecord.sourceMetadata === "object" &&
    !Array.isArray(statementCheckpointRecord.sourceMetadata)
      ? (statementCheckpointRecord.sourceMetadata as Record<string, unknown>)
      : null;

  const account = await resolveConfirmationAccount({
    importFile,
    statementMetadata: {
      accountName:
        typeof statementMetadata?.accountName === "string" ? statementMetadata.accountName : null,
      institution:
        typeof statementMetadata?.institution === "string" ? statementMetadata.institution : null,
      accountNumber:
        typeof statementMetadata?.accountNumber === "string" ? statementMetadata.accountNumber : null,
      accountType:
        typeof statementMetadata?.accountType === "string" ? statementMetadata.accountType : null,
    },
    parsedRows,
    accountId,
  });
  if (!account) {
    throw new Error("Account not found");
  }
  const resolvedAccountId = account.id;

  let statementRow: Record<string, unknown> | null = null;
  let statementConfidence = 0;
  let reconciledAccountBalance: string | null = null;
  const transactions: ImportInsightSourceRow[] = [];
  const trainingSignalJobs: Promise<unknown>[] = [];
  const preparedTransactions: PreparedImportTransaction[] = [];
  const coerceAmountToString = (value: unknown) => {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === "number" || typeof value === "string") {
      return String(value);
    }

    if (typeof value === "object" && "toString" in value && typeof (value as { toString?: unknown }).toString === "function") {
      return String(value);
    }

    return null;
  };

  await prisma.$transaction(async (tx) => {
    await tx.transaction.deleteMany({
      where: { importFileId },
    });

    await tx.trainingSignal.deleteMany({
      where: {
        importFileId,
        source: "import_confirmation",
      },
    });

    await tx.importFile.update({
      where: { id: importFileId },
      data: {
        accountId: resolvedAccountId,
        confirmedAt: new Date(),
        status: "done",
      },
    });

  const statementCheckpoint = (await hasCompatibleTable("AccountStatementCheckpoint"))
    ? await tx.accountStatementCheckpoint.findUnique({
        where: { importFileId },
      })
    : null;
  let openingBalanceInserted = false;

  if (statementCheckpoint) {
    const statementStartDate = statementCheckpoint.statementStartDate ?? null;
    const statementEndDate = statementCheckpoint.statementEndDate ?? null;
    const previousCheckpoint = statementStartDate
      ? await tx.accountStatementCheckpoint.findFirst({
          where: {
            accountId: resolvedAccountId,
            statementEndDate: {
              lt: statementStartDate,
            },
            status: {
              in: ["reconciled", "mismatch"],
            },
          },
          orderBy: [{ statementEndDate: "desc" }, { createdAt: "desc" }],
        })
      : null;

    let checkpointStatus: "pending" | "reconciled" | "mismatch" = "pending";
    let mismatchReason: string | null = null;

    if (statementCheckpoint.endingBalance !== null) {
      checkpointStatus = "reconciled";
    }

    if (
      previousCheckpoint &&
      previousCheckpoint.endingBalance !== null &&
      statementCheckpoint.openingBalance !== null &&
      previousCheckpoint.endingBalance.toString() !== statementCheckpoint.openingBalance.toString()
    ) {
      checkpointStatus = "mismatch";
      mismatchReason = "Opening balance does not match the previous statement ending balance.";
    }

    await tx.accountStatementCheckpoint.update({
      where: { id: statementCheckpoint.id },
      data: {
        accountId: resolvedAccountId,
        status: checkpointStatus,
        mismatchReason,
      },
    });

    if (
      statementCheckpoint.openingBalance !== null &&
      !(await tx.transaction.findFirst({
        where: {
          accountId: resolvedAccountId,
          merchantRaw: "Beginning balance",
        },
      }))
    ) {
      const openingBalanceCategory = await tx.category.findFirst({
        where: {
          workspaceId: importFile.workspaceId,
          name: "Opening Balance",
        },
      });

      const category =
        openingBalanceCategory ??
        (await tx.category.create({
          data: {
            workspaceId: importFile.workspaceId,
            name: "Opening Balance",
            type: "transfer",
          },
        }));

      await tx.transaction.create({
        data: buildTransactionInsertRecord({
          workspaceId: String(importFile.workspaceId),
          accountId: resolvedAccountId,
          importFileId,
          categoryId: category.id,
          reviewStatus: "confirmed",
          parserConfidence: 100,
          categoryConfidence: 100,
          accountMatchConfidence: 100,
          duplicateConfidence: 0,
          transferConfidence: 100,
          rawPayload: {
            bank: statementCheckpoint.sourceMetadata && typeof statementCheckpoint.sourceMetadata === "object"
              ? (statementCheckpoint.sourceMetadata as Record<string, unknown>).institution ?? "Statement"
              : "Statement",
            kind: "opening_balance",
            statementStartDate: statementStartDate?.toISOString() ?? null,
            statementEndDate: statementEndDate?.toISOString() ?? null,
            openingBalance: statementCheckpoint.openingBalance?.toString() ?? null,
          } as Prisma.InputJsonValue,
          normalizedPayload: {
            kind: "opening_balance",
            openingBalance: statementCheckpoint.openingBalance?.toString() ?? null,
            statementStartDate: statementStartDate?.toISOString() ?? null,
          } as Prisma.InputJsonValue,
          learnedRuleIdsApplied: [] as Prisma.InputJsonValue,
          date: statementStartDate ?? new Date(),
          amount: parseAmountValue(statementCheckpoint.openingBalance?.toString() ?? null) ?? 0,
          currency: "PHP",
          type: "transfer" as TransactionType,
          merchantRaw: "Beginning balance",
          merchantClean: "Beginning balance",
          description: statementCheckpoint.openingBalance !== null ? `Opening balance for statement ending ${statementEndDate?.toISOString().slice(0, 10) ?? "unknown"}` : "Opening balance",
          isTransfer: false,
          isExcluded: true,
        }) as Prisma.TransactionCreateInput,
      });
      openingBalanceInserted = true;
    }
  }

  statementRow = parsedRows.find((row) => typeof row.accountName === "string" && row.accountName.trim()) ?? parsedRows[0] ?? null;
  statementConfidence =
    typeof statementCheckpoint?.sourceMetadata === "object" && statementCheckpoint?.sourceMetadata !== null
      ? Number((statementCheckpoint.sourceMetadata as Record<string, unknown>).confidence ?? 0)
      : 0;

  const latestExplicitBalance = [...parsedRows]
    .reverse()
    .find((row) => {
      if (!row.rawPayload || typeof row.rawPayload !== "object" || Array.isArray(row.rawPayload)) {
        return false;
      }

      return snapshotBalanceToString((row.rawPayload as Record<string, unknown>).balance) !== null;
    });

  const statementEndingBalance = snapshotBalanceToString(statementCheckpoint?.endingBalance);
  const latestExplicitStatementBalance = snapshotBalanceToString(
    latestExplicitBalance && typeof latestExplicitBalance.rawPayload === "object" && !Array.isArray(latestExplicitBalance.rawPayload)
      ? (latestExplicitBalance.rawPayload as Record<string, unknown>).balance
      : null
  );
  const fallbackReconciledBalance = deriveReconciledBalance({
    transactions: parsedRows.map(
      (row) =>
        ({
          amount: row.amount,
          type: row.type ?? null,
          merchantRaw: row.merchantRaw ?? null,
          merchantClean: row.merchantClean ?? null,
          description: row.description ?? null,
          date: row.date ?? null,
          rawPayload:
            row.rawPayload && typeof row.rawPayload === "object"
              ? (row.rawPayload as { balance?: unknown; amountDelta?: unknown; openingBalance?: unknown; kind?: string })
              : null,
        }) as BalanceLikeTransaction
    ),
    checkpoints:
      statementCheckpoint && statementCheckpoint.endingBalance !== null
        ? [
            {
              endingBalance: statementCheckpoint.endingBalance.toString(),
              statementEndDate: statementCheckpoint.statementEndDate?.toISOString() ?? null,
              createdAt: statementCheckpoint.createdAt.toISOString(),
            },
          ]
        : [],
  });
  reconciledAccountBalance = statementEndingBalance ?? latestExplicitStatementBalance ?? fallbackReconciledBalance;

  if (reconciledAccountBalance !== null) {
    await tx.account.update({
      where: { id: resolvedAccountId },
      data: {
        balance: reconciledAccountBalance,
      },
    });
  }

  const existingCategories = await tx.category.findMany({
    where: { workspaceId: importFile.workspaceId },
  });
  const categoryByName = new Map(existingCategories.map((category) => [category.name.toLowerCase(), category.id]));

  for (const row of parsedRows) {
    const rowType =
      row.type === "income" || row.type === "expense" || row.type === "transfer" ? row.type : undefined;
    const rowConfidence = typeof row.confidence === "number" ? row.confidence : 0;
    const rowParserConfidence = typeof row.parserConfidence === "number" ? row.parserConfidence : rowConfidence;
    const rowCategoryConfidence = typeof row.categoryConfidence === "number" ? row.categoryConfidence : rowConfidence;
    const rowAccountMatchConfidence = typeof row.accountMatchConfidence === "number" ? row.accountMatchConfidence : 100;
    const rowDuplicateConfidence = typeof row.duplicateConfidence === "number" ? row.duplicateConfidence : 0;
    const rowTransferConfidence = typeof row.transferConfidence === "number" ? row.transferConfidence : rowType === "transfer" ? 100 : 0;
    const categoryName = (typeof row.categoryName === "string" && row.categoryName) || defaultCategoryForType((rowType as "income" | "expense" | "transfer") ?? "expense");
    let categoryId = categoryByName.get(categoryName.toLowerCase());

    if (!categoryId) {
      const created = await tx.category.create({
        data: {
          workspaceId: importFile.workspaceId,
          name: categoryName,
          type: (rowType ?? "expense") as "income" | "expense" | "transfer",
        },
      });

      categoryId = created.id;
      categoryByName.set(categoryName.toLowerCase(), categoryId);
    }

    const merchantText =
      (typeof row.merchantClean === "string" && row.merchantClean) ||
      (typeof row.merchantRaw === "string" && row.merchantRaw) ||
      "Imported transaction";
    const insertRow = buildTransactionInsertRecord({
      workspaceId: String(importFile.workspaceId),
      accountId: resolvedAccountId,
      importFileId,
      categoryId,
      reviewStatus: shouldRouteToReview({ confidence: rowConfidence, categoryName, type: rowType }) ? "pending_review" : "confirmed",
      parserConfidence: rowParserConfidence,
      categoryConfidence: rowCategoryConfidence,
      accountMatchConfidence: rowAccountMatchConfidence,
      duplicateConfidence: rowDuplicateConfidence,
      transferConfidence: rowTransferConfidence,
      rawPayload: (row.rawPayload ?? {}) as Prisma.InputJsonValue,
      normalizedPayload: (row.normalizedPayload ?? {}) as Prisma.InputJsonValue,
      learnedRuleIdsApplied: (row.learnedRuleIdsApplied ?? []) as Prisma.InputJsonValue,
      date: row.date instanceof Date ? row.date : row.date ? new Date(String(row.date)) : new Date(),
      amount: parseAmountValue(coerceAmountToString(row.amount)) ?? 0,
      currency: "PHP",
      type: (rowType ?? "expense") as TransactionType,
      merchantRaw: typeof row.merchantRaw === "string" ? row.merchantRaw : "Imported transaction",
      merchantClean: typeof row.merchantClean === "string" ? row.merchantClean : typeof row.merchantRaw === "string" ? row.merchantRaw : null,
      description: extractHumanReadableDescription(row.rawPayload ?? null),
      isTransfer: rowType === "transfer",
      isExcluded: typeof row.rawPayload === "object" && row.rawPayload !== null && (row.rawPayload as Record<string, unknown>).kind === "opening_balance",
    });
    const transactionId = String(insertRow.id ?? crypto.randomUUID());

    preparedTransactions.push({
      transactionId,
      insertRow,
      insightRow: {
        amount: row.amount,
        type: rowType ?? "expense",
        merchantRaw: typeof row.merchantRaw === "string" ? row.merchantRaw : null,
        merchantClean: typeof row.merchantClean === "string" ? row.merchantClean : typeof row.merchantRaw === "string" ? row.merchantRaw : null,
        description: extractHumanReadableDescription(row.rawPayload ?? null),
        categoryName,
        rawPayload: (row.rawPayload ?? {}) as Prisma.InputJsonValue,
      },
      trainingSignal: {
        merchantText,
        categoryId,
        categoryName,
        type: rowType ?? "expense",
        confidence: typeof row.confidence === "number" ? row.confidence : 100,
        notes: typeof row.categoryReason === "string" ? row.categoryReason : null,
      },
    });
  }

  for (const batch of chunkArray(preparedTransactions, 25)) {
    await tx.transaction.createMany({
      data: batch.map((entry) => entry.insertRow as any),
    });
  }

  await tx.importFile.update({
    where: { id: importFileId },
    data: {
      accountId: resolvedAccountId,
      confirmedAt: new Date(),
      status: "done",
      confirmedTransactionsCount: preparedTransactions.length + (openingBalanceInserted ? 1 : 0),
    },
  });

  for (const entry of preparedTransactions) {
    transactions.push(entry.insightRow);
    trainingSignalJobs.push(
      recordTrainingSignal({
        workspaceId: importFile.workspaceId,
        importFileId,
        transactionId: entry.transactionId,
        merchantText: entry.trainingSignal.merchantText,
        categoryId: entry.trainingSignal.categoryId,
        categoryName: entry.trainingSignal.categoryName,
        type: entry.trainingSignal.type,
        source: "import_confirmation",
        confidence: entry.trainingSignal.confidence,
        notes: entry.trainingSignal.notes,
      }).catch(() => null)
    );
  }

  const confirmedStatementRow = statementRow as unknown as { accountName?: unknown; institution?: unknown } | null;
  if (
    confirmedStatementRow &&
    typeof confirmedStatementRow.accountName === "string" &&
    confirmedStatementRow.accountName.trim() &&
    statementConfidence >= 70
  ) {
    void upsertAccountRule({
      workspaceId: importFile.workspaceId,
      accountId: resolvedAccountId,
      accountName: confirmedStatementRow.accountName.trim(),
      institution:
        typeof confirmedStatementRow.institution === "string" && confirmedStatementRow.institution.trim()
          ? confirmedStatementRow.institution.trim()
          : null,
      accountType: account.type,
      source: "import_confirmation",
      confidence: 100,
    }).catch(() => null);
  }

  void Promise.allSettled(trainingSignalJobs);

  const insightSummary = buildImportInsightSummary(transactions);

  return { imported: transactions.length, insightSummary, accountBalance: reconciledAccountBalance };
});
};
