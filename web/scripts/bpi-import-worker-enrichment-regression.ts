import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { strict as assert } from "node:assert";
import { prisma } from "@/lib/prisma";
import { readUploadedFileText } from "@/lib/import-file-text.server";
import { upsertImportEnrichmentJob } from "@/lib/import-enrichment-jobs";
import { confirmImportFile, processImportEnrichmentJobs, processImportFileText } from "@/workers/import-processor";

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

    const initialTransactions = await prisma.transaction.findMany({
      where: {
        workspaceId,
        deletedAt: null,
      },
      select: {
        id: true,
        importFileId: true,
        rawPayload: true,
      },
    });
    assert.equal(initialTransactions.length, 64, `Initial upload should keep 64 raw rows visible, got ${initialTransactions.length}.`);

    const initialTransactionIds = new Set(initialTransactions.map((transaction) => transaction.id));
    for (const importFileId of importIds) {
      await confirmImportFile(importFileId, null);
    }
    const reconfirmedTransactions = await prisma.transaction.findMany({
      where: {
        workspaceId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
    assert.equal(
      reconfirmedTransactions.length,
      initialTransactions.length,
      `Re-confirming imports must not duplicate or delete visible rows; got ${reconfirmedTransactions.length}.`
    );
    assert.equal(
      reconfirmedTransactions.filter((transaction) => !initialTransactionIds.has(transaction.id)).length,
      0,
      "Re-confirming imports must preserve existing transaction IDs instead of recreating rows."
    );

    const otherCategory =
      (await prisma.category.findFirst({
        where: { workspaceId, name: "Other" },
        select: { id: true },
      })) ??
      (await prisma.category.create({
        data: {
          workspaceId,
          name: "Other",
          type: "expense",
          isSystem: true,
        },
        select: { id: true },
      }));
    const incomeCategory =
      (await prisma.category.findFirst({
        where: { workspaceId, name: "Income" },
        select: { id: true },
      })) ??
      (await prisma.category.create({
        data: {
          workspaceId,
          name: "Income",
          type: "income",
          isSystem: true,
        },
        select: { id: true },
      }));

    // Previous bad imports may have taught broad income rules. Deterministic
    // statement categories should still win unless the user explicitly edited
    // that merchant to Income.
    for (const merchantText of ["ATM Withdrawal", "Service Charge"]) {
      await prisma.merchantRule.upsert({
        where: {
          workspaceId_merchantKey: {
            workspaceId,
            merchantKey: merchantText.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
          },
        },
        create: {
          workspaceId,
          merchantKey: merchantText.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
          merchantPattern: merchantText,
          normalizedName: merchantText,
          categoryId: incomeCategory.id,
          categoryName: "Income",
          source: "import_confirmation",
          confidence: 100,
          timesConfirmed: 20,
        },
        update: {
          categoryId: incomeCategory.id,
          categoryName: "Income",
          source: "import_confirmation",
          confidence: 100,
          timesConfirmed: 20,
        },
      });
    }

    // Deliberately degrade the visible rows after the raw import succeeds.
    // The enrichment worker must patch these same transaction IDs in place,
    // not delete, recreate, or collapse them into a different import.
    await prisma.transaction.updateMany({
      where: {
        workspaceId,
        deletedAt: null,
      },
      data: {
        categoryId: otherCategory.id,
        merchantClean: null,
        parserConfidence: 45,
        categoryConfidence: 0,
        reviewStatus: "suggested",
        normalizedPayload: null,
        learnedRuleIdsApplied: null,
      },
    });

    for (const importFileId of importIds) {
      const totalRows = await prisma.transaction.count({
        where: { workspaceId, importFileId, deletedAt: null },
      });
      await upsertImportEnrichmentJob({
        workspaceId,
        importFileId,
        totalRows,
        phase: "normalizing",
        forceRequeue: true,
      });
    }

    for (const importFileId of importIds) {
      for (let pass = 0; pass < 3; pass += 1) {
        await processImportEnrichmentJobs({
          importFileId,
          limit: 3,
          batchSize: 500,
          workerId: `${runId}-${importFileId}-${pass}`,
        });
        const job = await prisma.importEnrichmentJob.findUnique({ where: { importFileId } });
        if (!job || job.status === "done" || job.status === "failed") {
          break;
        }
      }
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
        type: true,
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
    const missingInitialRows = initialTransactions.filter(
      (initial) => !transactions.some((transaction) => transaction.id === initial.id)
    );
    const misclassifiedKnownRows = transactions.filter((transaction) => {
      const clean = String(transaction.merchantClean ?? transaction.merchantRaw ?? "").toLowerCase();
      const categoryName = transaction.category?.name ?? "Other";
      if (/atm withdrawal|expressnet|megalink/.test(clean)) {
        return categoryName !== "Cash & ATM" || transaction.type !== "expense";
      }
      if (/service charge|tax withheld/.test(clean)) {
        return categoryName !== "Financial" || transaction.type !== "expense";
      }
      return false;
    });
    const overNormalizedPayrollRows = transactions.filter((transaction) => {
      const clean = String(transaction.merchantClean ?? "").trim().toLowerCase();
      const raw = String(transaction.merchantRaw ?? "").trim().toLowerCase();
      return clean === "payroll credit" && !/payroll|salary/.test(raw);
    });

    console.table(
      imports.map((importFile) => ({
        fileName: importFile.fileName,
        phase: importFile.processingPhase,
        confirmedRows: importFile.confirmedTransactionsCount,
        job: jobs.find((job) => job.importFileId === importFile.id)?.status ?? "not-needed",
      }))
    );

    assert.equal(transactions.length, 64, `Expected 64 visible BPI transactions, got ${transactions.length}.`);
    assert.equal(missingInitialRows.length, 0, `Expected enrichment to preserve every initial row, lost ${missingInitialRows.length}.`);
    assert.equal(otherRows.length, 0, `Expected 0 BPI rows in Other, got ${otherRows.length}.`);
    assert.equal(
      misclassifiedKnownRows.length,
      0,
      `Expected deterministic BPI categories to beat stale learned Income rules, got ${misclassifiedKnownRows
        .map((row) => `${row.merchantClean ?? row.merchantRaw}:${row.category?.name ?? "Other"}/${row.type}`)
        .join(", ")}.`
    );
    assert.equal(
      overNormalizedPayrollRows.length,
      0,
      `Expected BPI enrichment to preserve non-payroll merchant labels, got ${overNormalizedPayrollRows
        .map((row) => `${row.merchantRaw} -> ${row.merchantClean}`)
        .join(", ")}.`
    );
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
