import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseAmountValue, parseDateValue, parseImportText } from "@/lib/import-parser";
import {
  DATA_ENGINE_VERSION,
  buildStatementFingerprint,
  detectStatementMetadataFromText,
  enrichParsedRowsWithTraining,
  defaultCategoryForType,
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

  await prisma.parsedTransaction.createMany({
    data: rows.map((row) => ({
      importFileId,
      workspaceId: importFile.workspaceId,
      institution: metadata.institution,
      accountNumber: metadata.accountNumber,
      accountName: row.accountName ?? null,
      date: parseDateValue(row.date ?? null),
      amount: parseAmountValue(row.amount ?? null),
      merchantRaw: row.merchantRaw ?? null,
      merchantClean: row.merchantClean ?? row.merchantRaw ?? null,
      type: row.type ?? "expense",
      categoryName: row.categoryName ?? defaultCategoryForType(row.type ?? "expense"),
      confidence: row.confidence ?? 0,
      categoryReason: row.categoryReason ?? null,
      parserVersion: row.parserVersion ?? DATA_ENGINE_VERSION,
      statementFingerprint: template?.fingerprint ?? statementFingerprint,
      rawPayload: (row.rawPayload ?? {}) as Prisma.InputJsonValue,
    })),
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
  const parsedRows = await prisma.parsedTransaction.findMany({
    where: { importFileId },
  });

  if (parsedRows.length === 0) {
    throw new Error("No parsed rows available");
  }

  const importFile = await prisma.importFile.findUnique({
    where: { id: importFileId },
  });

  if (!importFile) {
    throw new Error("Import file not found");
  }

  const existingCategories = await prisma.category.findMany({
    where: { workspaceId: importFile.workspaceId },
  });
  const categoryByName = new Map(existingCategories.map((category) => [category.name.toLowerCase(), category.id]));

  const transactions = [];

  for (const row of parsedRows) {
    const categoryName = row.categoryName || defaultCategoryForType(row.type ?? "expense");
    let categoryId = categoryByName.get(categoryName.toLowerCase());

    if (!categoryId) {
      const created = await prisma.category.create({
        data: {
          workspaceId: importFile.workspaceId,
          name: categoryName,
          type: row.type ?? "expense",
        },
      });

      categoryId = created.id;
      categoryByName.set(categoryName.toLowerCase(), categoryId);
    }

    const transaction = await prisma.transaction.create({
      data: {
        workspaceId: importFile.workspaceId,
        accountId,
        categoryId,
        date: row.date ?? new Date(),
        amount: row.amount ?? 0,
        currency: "PHP",
        type: row.type ?? "expense",
        merchantRaw: row.merchantRaw ?? "Imported transaction",
        merchantClean: row.merchantClean ?? row.merchantRaw ?? null,
        description: typeof row.rawPayload === "object" ? JSON.stringify(row.rawPayload) : null,
        isTransfer: row.type === "transfer",
        isExcluded: typeof row.rawPayload === "object" && row.rawPayload !== null && (row.rawPayload as Record<string, unknown>).kind === "opening_balance",
      },
    });

    transactions.push(transaction);

    await recordTrainingSignal({
      workspaceId: importFile.workspaceId,
      importFileId,
      transactionId: transaction.id,
      merchantText: row.merchantClean || row.merchantRaw || "Imported transaction",
      categoryId,
      categoryName,
      type: row.type ?? "expense",
      source: "import_confirmation",
      confidence: row.confidence ?? 100,
      notes: row.categoryReason ?? null,
    });
  }

  await prisma.importFile.update({
    where: { id: importFileId },
    data: {
      status: "done",
    },
  });

  return { imported: transactions.length };
};
