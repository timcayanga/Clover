import { Prisma, TransactionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseAmountValue, parseDateValue, parseImportText } from "@/lib/import-parser";

const defaultCategoryForType = (type: TransactionType) => {
  if (type === "income") return "Income";
  if (type === "transfer") return "Transfers";
  return "Other";
};

export const processImportFileText = async (importFileId: string, text: string) => {
  const importFile = await prisma.importFile.findUnique({
    where: { id: importFileId },
  });

  if (!importFile) {
    throw new Error("Import file not found");
  }

  const rows = parseImportText(text, importFile.fileName, importFile.fileType);

  await prisma.parsedTransaction.deleteMany({
    where: { importFileId },
  });

  await prisma.parsedTransaction.createMany({
    data: rows.map((row) => ({
      importFileId,
      workspaceId: importFile.workspaceId,
      accountName: row.accountName ?? null,
      date: parseDateValue(row.date ?? null),
      amount: parseAmountValue(row.amount ?? null),
      merchantRaw: row.merchantRaw ?? null,
      type: row.type ?? "expense",
      categoryName: row.categoryName ?? defaultCategoryForType(row.type ?? "expense"),
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
        merchantClean: row.merchantRaw ?? null,
        description: typeof row.rawPayload === "object" ? JSON.stringify(row.rawPayload) : null,
        isTransfer: row.type === "transfer",
        isExcluded: false,
      },
    });

    transactions.push(transaction);
  }

  await prisma.importFile.update({
    where: { id: importFileId },
    data: {
      status: "done",
    },
  });

  return { imported: transactions.length };
};
