import type { Prisma, TransactionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseAmountValue, parseImportText } from "@/lib/import-parser";
import {
  DATA_ENGINE_VERSION,
  buildParsedTransactionInsertData,
  buildStatementFingerprint,
  detectStatementMetadataFromText,
  fetchImportFileCompat,
  fetchParsedTransactionRows,
  enrichParsedRowsWithTraining,
  defaultCategoryForType,
  deleteTransactionsByImportFileCompat,
  insertTransactionCompat,
  insertParsedTransactionsCompat,
  recordTrainingSignal,
  updateImportFileCompat,
  upsertStatementTemplate,
} from "@/lib/data-engine";

export const processImportFileText = async (importFileId: string, text: string) => {
  const importFile = await fetchImportFileCompat(importFileId);

  if (!importFile) {
    throw new Error("Import file not found");
  }

  const parsedRows = parseImportText(text, importFile.fileName, importFile.fileType);
  const metadata = detectStatementMetadataFromText(text);
  const statementFingerprint = buildStatementFingerprint(text, metadata, importFile.fileName, importFile.fileType);
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

  await prisma.parsedTransaction.deleteMany({
    where: { importFileId },
  });

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

  await updateImportFileCompat(importFileId, {
    status: "done",
  });

  return { count: rows.length };
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

  const statementCheckpoint = await prisma.accountStatementCheckpoint.findUnique({
    where: { importFileId },
  });

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

    const latestCheckpoint = await prisma.accountStatementCheckpoint.findFirst({
      where: {
        accountId,
        endingBalance: {
          not: null,
        },
      },
      orderBy: [
        { statementEndDate: "desc" },
        { createdAt: "desc" },
      ],
    });

    if (latestCheckpoint && latestCheckpoint.endingBalance !== null) {
      await prisma.account.update({
        where: { id: accountId },
        data: {
          balance: latestCheckpoint.endingBalance.toString(),
        },
      });
    }
  }

  const existingCategories = await prisma.category.findMany({
    where: { workspaceId: importFile.workspaceId },
  });
  const categoryByName = new Map(existingCategories.map((category) => [category.name.toLowerCase(), category.id]));

  const transactions = [];
  const trainingSignalJobs: Promise<unknown>[] = [];
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

    const transaction = await insertTransactionCompat({
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

    transactions.push(transaction);

    trainingSignalJobs.push(
      recordTrainingSignal({
        workspaceId: importFile.workspaceId,
        importFileId,
        transactionId: typeof transaction?.id === "string" ? transaction.id : null,
        merchantText:
          (typeof row.merchantClean === "string" && row.merchantClean) ||
          (typeof row.merchantRaw === "string" && row.merchantRaw) ||
          "Imported transaction",
        categoryId,
        categoryName,
        type: rowType ?? "expense",
        source: "import_confirmation",
        confidence: typeof row.confidence === "number" ? row.confidence : 100,
        notes: typeof row.categoryReason === "string" ? row.categoryReason : null,
      }).catch(() => null)
    );
  }

  await updateImportFileCompat(importFileId, {
    status: "done",
    accountId,
  });

  void Promise.allSettled(trainingSignalJobs);

  return { imported: transactions.length };
};
