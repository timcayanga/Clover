import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { strict as assert } from "node:assert";
import { prisma } from "@/lib/prisma";
import { readUploadedFileText } from "@/lib/import-file-text.server";
import { processImportFileText } from "@/workers/import-processor";

const statementRoot = process.env.CLOVER_STATEMENT_ROOT ?? "/Users/TimCayanga1/Documents/Bank Statements";

const files = [
  "Samples/BPI/289783509-Statement-Bpi.pdf",
  "Samples/BPI/432739654-Statement.pdf",
  "Samples/BPI/527005183-9595490-e-79.pdf",
  "Samples/BPI/583720503-BPI-BANK-STATEMENT.pdf",
];

const readStatementText = async (relativePath: string) => {
  const absolutePath = join(statementRoot, relativePath);
  const bytes = await readFile(absolutePath);
  return readUploadedFileText({
    name: basename(absolutePath),
    type: "application/pdf",
    arrayBuffer: async () => {
      const copy = new Uint8Array(bytes.length);
      copy.set(bytes);
      return copy.buffer as ArrayBuffer;
    },
  });
};

const main = async () => {
  const runId = `bpi-enrichment-${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      clerkUserId: `qa-${runId}`,
      email: `${runId}@qa.clover.local`,
      verified: true,
      environment: "test",
      workspaces: {
        create: {
          name: "BPI enrichment regression",
          type: "personal",
        },
      },
    },
    include: { workspaces: true },
  });
  const workspaceId = user.workspaces[0]?.id;
  assert.ok(workspaceId, "Expected QA workspace to be created.");

  try {
    const importIds: string[] = [];
    for (const relativePath of files) {
      const fileName = basename(relativePath);
      const importFile = await prisma.importFile.create({
        data: {
          workspaceId,
          fileName,
          fileType: "application/pdf",
          storageKey: `qa/${runId}/${fileName}`,
          status: "processing",
        },
      });
      importIds.push(importFile.id);
      const text = await readStatementText(relativePath);
      const result = await processImportFileText(importFile.id, {
        text,
        actorUserId: user.clerkUserId,
        qaSource: "import_processing",
        allowDuplicateStatement: false,
        importMode: "statement",
      });
      assert.equal(result.status, "done", `${fileName} should finish initial import.`);
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        workspaceId,
        deletedAt: null,
      },
      select: {
        id: true,
        importFileId: true,
        date: true,
        amount: true,
        merchantRaw: true,
        merchantClean: true,
        category: { select: { name: true } },
        rawPayload: true,
      },
    });
    const imports = await prisma.importFile.findMany({
      where: { id: { in: importIds } },
      select: { id: true, fileName: true, processingPhase: true, confirmedTransactionsCount: true },
    });
    const jobs = await prisma.importEnrichmentJob.findMany({
      where: { importFileId: { in: importIds } },
      select: { importFileId: true, status: true, attempts: true, processedRows: true, totalRows: true },
    });

    const otherRows = transactions.filter((transaction) => (transaction.category?.name ?? "Other") === "Other");
    const rawishRows = transactions.filter((transaction) => {
      const clean = String(transaction.merchantClean ?? "").trim();
      if (!clean) {
        return true;
      }
      // Some canonical labels are intentionally the same as the raw statement text
      // once title-cased, e.g. "Tax Withheld" and "Interest Earned".
      return /^[A-Z0-9/._-]{6,}$/.test(clean) || /\s{2,}/.test(clean);
    });
    const duplicateKeys = new Map<string, number>();
    for (const transaction of transactions) {
      const rawPayload =
        transaction.rawPayload && typeof transaction.rawPayload === "object" && !Array.isArray(transaction.rawPayload)
          ? (transaction.rawPayload as Record<string, unknown>)
          : {};
      const key = [
        transaction.importFileId,
        rawPayload.sourceRowIndex,
        transaction.date.toISOString().slice(0, 10),
        transaction.amount.toString(),
        transaction.merchantRaw,
      ].join("|");
      duplicateKeys.set(key, (duplicateKeys.get(key) ?? 0) + 1);
    }
    const duplicateCount = Array.from(duplicateKeys.values()).filter((count) => count > 1).length;

    console.table(
      imports.map((importFile) => ({
        fileName: importFile.fileName,
        phase: importFile.processingPhase,
        confirmedRows: importFile.confirmedTransactionsCount,
        job: jobs.find((job) => job.importFileId === importFile.id)?.status ?? "not-needed",
      }))
    );

    assert.equal(transactions.length, 64, `Expected 64 visible BPI transactions, got ${transactions.length}.`);
    assert.equal(otherRows.length, 0, `Expected 0 BPI rows in Other, got ${otherRows.length}.`);
    assert.equal(rawishRows.length, 0, `Expected no compact/all-caps BPI raw labels, got ${rawishRows.length}.`);
    assert.equal(duplicateCount, 0, `Expected no duplicate rows by import/source index, got ${duplicateCount}.`);
    assert.equal(
      imports.filter((importFile) => importFile.processingPhase !== "complete").length,
      0,
      "Initial upload should stay complete while enrichment runs."
    );
    assert.ok(
      jobs.every((job) => job.attempts <= 3),
      "Enrichment jobs should not exceed 3 attempts."
    );
    console.log("BPI import worker enrichment regression passed");
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => null);
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
