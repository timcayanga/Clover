import type { TransactionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseImportText } from "@/lib/import-parser";
import {
  DATA_ENGINE_VERSION,
  buildParsedTransactionInsertData,
  buildStatementFingerprint,
  detectStatementMetadataFromText,
  fetchParsedTransactionRows,
  enrichParsedRowsWithTraining,
  defaultCategoryForType,
  insertParsedTransactionsCompat,
  recordTrainingSignal,
  upsertStatementTemplate,
} from "@/lib/data-engine";

export const processImportFileText = async (importFileId: string, text: string) => {
  const importFile = await prisma.importFile.findUnique({
    where: { id: importFileId },
  });

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

  await prisma.importFile.update({
    where: { id: importFileId },
    data: {
      status: "done",
    },
  });

  return { count: rows.length };
};

export const confirmImportFile = async (importFileId: string, accountId: string) => {
  const parsedRows = await fetchParsedTransactionRows(importFileId);

  if (parsedRows.length === 0) {
    throw new Error("No parsed rows available");
  }

  const importFile = await prisma.importFile.findUnique({
    where: { id: importFileId },
  });

  if (!importFile) {
    throw new Error("Import file not found");
  }

  await prisma.transaction.deleteMany({
    where: { importFileId },
  });

  await prisma.trainingSignal.deleteMany({
    where: {
      importFileId,
      source: "import_confirmation",
    },
  });

  await prisma.importFile.update({
    where: { id: importFileId },
    data: {
      accountId,
      confirmedAt: new Date(),
    },
  });

  const existingCategories = await prisma.category.findMany({
    where: { workspaceId: importFile.workspaceId },
  });
  const categoryByName = new Map(existingCategories.map((category) => [category.name.toLowerCase(), category.id]));

  const transactions = [];

  for (const row of parsedRows) {
    const rowType =
      row.type === "income" || row.type === "expense" || row.type === "transfer" ? row.type : undefined;
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

    const transaction = await prisma.transaction.create({
      data: {
        workspaceId: importFile.workspaceId,
        accountId,
        importFileId,
        categoryId,
        date: row.date instanceof Date ? row.date : row.date ? new Date(String(row.date)) : new Date(),
        amount: typeof row.amount === "number" ? row.amount : Number(String(row.amount ?? "0").replace(/[^0-9.-]/g, "")) || 0,
        currency: "PHP",
        type: (rowType ?? "expense") as TransactionType,
        merchantRaw: typeof row.merchantRaw === "string" ? row.merchantRaw : "Imported transaction",
        merchantClean: typeof row.merchantClean === "string" ? row.merchantClean : typeof row.merchantRaw === "string" ? row.merchantRaw : null,
        description: typeof row.rawPayload === "object" && row.rawPayload !== null ? JSON.stringify(row.rawPayload) : null,
        isTransfer: rowType === "transfer",
        isExcluded: typeof row.rawPayload === "object" && row.rawPayload !== null && (row.rawPayload as Record<string, unknown>).kind === "opening_balance",
      },
    });

    transactions.push(transaction);

    await recordTrainingSignal({
      workspaceId: importFile.workspaceId,
      importFileId,
      transactionId: transaction.id,
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
    });
  }

  await prisma.importFile.update({
    where: { id: importFileId },
    data: {
      status: "done",
      accountId,
    },
  });

  return { imported: transactions.length };
};
