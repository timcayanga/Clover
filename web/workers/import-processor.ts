import type { Prisma, TransactionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deriveReconciledBalance, type BalanceLikeTransaction } from "@/lib/account-balance";
import { parseAmountValue, parseImportText } from "@/lib/import-parser";
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
  deleteTransactionsByImportFileCompat,
  insertTransactionCompat,
  insertTransactionManyCompat,
  insertParsedTransactionsCompat,
  hasCompatibleTable,
  recordTrainingSignal,
  updateImportFileCompat,
  upsertAccountRule,
  upsertStatementTemplate,
} from "@/lib/data-engine";

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

export const processImportFileText = async (importFileId: string, text: string) => {
  const importFile = await fetchImportFileCompat(importFileId);

  if (!importFile) {
    throw new Error("Import file not found");
  }

  await updateImportFileCompat(importFileId, {
    status: "processing",
  });

  const parsedRows = parseImportText(text, importFile.fileName, importFile.fileType);
  const metadata = detectStatementMetadataFromText(text);
  const statementFingerprint = buildStatementFingerprint(text, metadata, importFile.fileName, importFile.fileType);
  const duplicateImportFileId = await findExistingImportedStatement({
    workspaceId: importFile.workspaceId,
    statementFingerprint,
    importFileId,
  });
  if (duplicateImportFileId) {
    await updateImportFileCompat(importFileId, {
      status: "done",
    });
    return { imported: 0, duplicate: true as const };
  }
  const template = await upsertStatementTemplate({
    workspaceId: importFile.workspaceId,
    fingerprint: statementFingerprint,
    metadata,
    fileType: importFile.fileType,
  });

  const rows = await enrichParsedRowsWithTraining({
    workspaceId: importFile.workspaceId,
    rows: parsedRows,
  });

  if (await hasCompatibleTable("ParsedTransaction")) {
    await prisma.parsedTransaction.deleteMany({
      where: { importFileId },
    });
  }

  const parsedTransactionData = await buildParsedTransactionInsertData({
    importFileId,
    workspaceId: importFile.workspaceId,
    rows,
    metadata,
    statementFingerprint: template?.fingerprint ?? statementFingerprint,
  });
  await insertParsedTransactionsCompat({
    importFileId,
    rows: parsedTransactionData,
  });

  if (await hasCompatibleTable("AccountStatementCheckpoint")) {
    const metadataStartDate = metadata.startDate ? new Date(metadata.startDate) : null;
    const metadataEndDate = metadata.endDate ? new Date(metadata.endDate) : null;
    await prisma.accountStatementCheckpoint.upsert({
      where: { importFileId },
      update: {
        workspaceId: importFile.workspaceId,
        statementStartDate: metadataStartDate,
        statementEndDate: metadataEndDate,
        openingBalance: metadata.openingBalance === null ? null : metadata.openingBalance.toString(),
        endingBalance: metadata.endingBalance === null ? null : metadata.endingBalance.toString(),
        status: "pending",
        mismatchReason: null,
        sourceMetadata: metadata as Prisma.InputJsonValue,
        rowCount: rows.length,
      },
      create: {
        workspaceId: importFile.workspaceId,
        importFileId,
        statementStartDate: metadataStartDate,
        statementEndDate: metadataEndDate,
        openingBalance: metadata.openingBalance === null ? null : metadata.openingBalance.toString(),
        endingBalance: metadata.endingBalance === null ? null : metadata.endingBalance.toString(),
        status: "pending",
        sourceMetadata: metadata as Prisma.InputJsonValue,
        rowCount: rows.length,
      },
    });
  }

  await updateImportFileCompat(importFileId, {
    status: "done",
  });

  return { imported: rows.length, duplicate: false as const };
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
  const parsedRows = await fetchParsedTransactionRows(importFileId);

  if (parsedRows.length === 0) {
    throw new Error("No parsed rows available");
  }

  const importFile = await fetchImportFileCompat(importFileId);

  if (!importFile) {
    throw new Error("Import file not found");
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
  });
  if (!account) {
    throw new Error("Account not found");
  }

  await deleteTransactionsByImportFileCompat(importFileId);

  await prisma.trainingSignal.deleteMany({
    where: {
      importFileId,
      source: "import_confirmation",
    },
  });

  await updateImportFileCompat(importFileId, {
    accountId,
    confirmedAt: new Date(),
  });

  const statementCheckpoint = (await hasCompatibleTable("AccountStatementCheckpoint"))
    ? await prisma.accountStatementCheckpoint.findUnique({
        where: { importFileId },
      })
    : null;

  if (statementCheckpoint) {
    const statementStartDate = statementCheckpoint.statementStartDate ?? null;
    const statementEndDate = statementCheckpoint.statementEndDate ?? null;
    const previousCheckpoint = statementStartDate
      ? await prisma.accountStatementCheckpoint.findFirst({
          where: {
            accountId,
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

    await prisma.accountStatementCheckpoint.update({
      where: { id: statementCheckpoint.id },
      data: {
        accountId,
        status: checkpointStatus,
        mismatchReason,
      },
    });

    if (
      statementCheckpoint.openingBalance !== null &&
      !(await prisma.transaction.findFirst({
        where: {
          accountId,
          merchantRaw: "Beginning balance",
        },
      }))
    ) {
      const openingBalanceCategory = await prisma.category.findFirst({
        where: {
          workspaceId: importFile.workspaceId,
          name: "Opening Balance",
        },
      });

      const category =
        openingBalanceCategory ??
        (await prisma.category.create({
          data: {
            workspaceId: importFile.workspaceId,
            name: "Opening Balance",
            type: "transfer",
          },
        }));

      await insertTransactionCompat({
        workspaceId: String(importFile.workspaceId),
        accountId,
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
      });
    }
  }

  const statementRow = parsedRows.find((row) => typeof row.accountName === "string" && row.accountName.trim()) ?? parsedRows[0] ?? null;
  if (statementRow && typeof statementRow.accountName === "string" && statementRow.accountName.trim()) {
    void upsertAccountRule({
      workspaceId: importFile.workspaceId,
      accountId,
      accountName: statementRow.accountName.trim(),
      institution: typeof statementRow.institution === "string" && statementRow.institution.trim() ? statementRow.institution.trim() : null,
      accountType: account.type,
      source: "import_confirmation",
      confidence: 100,
    }).catch(() => null);
  }

  const latestExplicitBalance = [...parsedRows]
    .reverse()
    .find((row) => {
      if (!row.rawPayload || typeof row.rawPayload !== "object" || Array.isArray(row.rawPayload)) {
        return false;
      }

      return snapshotBalanceToString((row.rawPayload as Record<string, unknown>).balance) !== null;
    });

  const reconciledBalance =
    snapshotBalanceToString(statementCheckpoint?.endingBalance) ??
    snapshotBalanceToString(
      latestExplicitBalance && typeof latestExplicitBalance.rawPayload === "object" && !Array.isArray(latestExplicitBalance.rawPayload)
        ? (latestExplicitBalance.rawPayload as Record<string, unknown>).balance
        : null
    ) ??
    deriveReconciledBalance({
    transactions: parsedRows.map((row) => ({
      amount: row.amount,
      type: row.type ?? null,
      merchantRaw: row.merchantRaw ?? null,
      merchantClean: row.merchantClean ?? null,
      description: row.description ?? null,
      date: row.date ?? null,
      rawPayload: row.rawPayload && typeof row.rawPayload === "object" ? (row.rawPayload as { balance?: unknown; amountDelta?: unknown; openingBalance?: unknown; kind?: string }) : null,
    } as BalanceLikeTransaction)),
    checkpoints: statementCheckpoint && statementCheckpoint.endingBalance !== null
      ? [
          {
            endingBalance: statementCheckpoint.endingBalance.toString(),
            statementEndDate: statementCheckpoint.statementEndDate?.toISOString() ?? null,
            createdAt: statementCheckpoint.createdAt.toISOString(),
          },
        ]
      : [],
  });

  if (reconciledBalance !== null) {
    await prisma.account.update({
      where: { id: accountId },
      data: {
        balance: reconciledBalance,
      },
    });
  }

  const existingCategories = await prisma.category.findMany({
    where: { workspaceId: importFile.workspaceId },
  });
  const categoryByName = new Map(existingCategories.map((category) => [category.name.toLowerCase(), category.id]));

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
      const created = await prisma.category.create({
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
      accountId,
      importFileId,
      categoryId,
      reviewStatus: rowConfidence < 80 ? "pending_review" : "confirmed",
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
    await insertTransactionManyCompat({
      records: batch.map((entry) => entry.insertRow as any),
    });
  }

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

  await updateImportFileCompat(importFileId, {
    status: "done",
    accountId,
  });

  void Promise.allSettled(trainingSignalJobs);

  const insightSummary = buildImportInsightSummary(transactions);

  return { imported: transactions.length, insightSummary };
};
