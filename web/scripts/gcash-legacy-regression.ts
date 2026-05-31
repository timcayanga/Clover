import { strict as assert } from "node:assert";
import { basename, join } from "node:path";
import { loadEnvConfig } from "@next/env";

const webRoot = basename(process.cwd()) === "web" ? process.cwd() : join(process.cwd(), "web");
loadEnvConfig(webRoot);

const loadRuntime = async () => {
  const [{ prisma }, { processImportFileText }] = await Promise.all([
    import("@/lib/prisma"),
    import("@/workers/import-processor"),
  ]);

  return { prisma, processImportFileText };
};

const syntheticGcashText = `
GCash Transaction History
Date and Time Description Reference No. Debit Credit Balance
STARTING BALANCE 0.00
2020-08-16 04:17 AM 023001701528350 14.95 469.05 for 09487219461 79444 Received GCash from BPI / BPI Family Savings Bank
2020-09-15 04:23 AM 1000431847153 11000.00 0.00 Savings Bank with account ending in 2099 Withdraw from GSave Account with Reference
2020-08-21 01:54 AM 1000367036736 3090.00 0.00 account ending in 4457 2020-08-30 10:45 PM
ENDING BALANCE 0.00
`.trim();

const main = async () => {
  const { prisma, processImportFileText } = await loadRuntime();

  const user = await prisma.user.create({
    data: {
      clerkUserId: `qa-gcash-legacy-${Date.now()}`,
      email: `qa-gcash-legacy-${Date.now()}@qa.clover.local`,
      verified: true,
      environment: "test",
      workspaces: {
        create: {
          name: "GCash legacy regression",
          type: "personal",
        },
      },
    },
    include: { workspaces: true },
  });

  const workspaceId = user.workspaces[0]?.id;
  assert.ok(workspaceId, "Expected QA workspace to be created.");

  try {
    const importFile = await prisma.importFile.create({
      data: {
        workspaceId,
        fileName: "gcash-legacy-regression.pdf",
        fileType: "application/pdf",
        storageKey: `qa/gcash-legacy/${Date.now()}.pdf`,
        status: "processing",
      },
    });

    const result = await processImportFileText(importFile.id, {
      text: syntheticGcashText,
      actorUserId: user.clerkUserId,
      qaSource: "import_processing",
      allowDuplicateStatement: false,
      importMode: "statement",
    });

    assert.equal(result.status, "done", "Expected the synthetic GCash import to finish.");
    assert.equal(result.imported, 3, `Expected 3 parsed rows, got ${result.imported}.`);

    const transactions = await prisma.transaction.findMany({
      where: {
        importFileId: importFile.id,
        deletedAt: null,
      },
      select: {
        merchantRaw: true,
        merchantClean: true,
        description: true,
        type: true,
        isTransfer: true,
        category: { select: { name: true } },
        rawPayload: true,
      },
      orderBy: { date: "asc" },
    });

    assert.equal(transactions.length, 3, "Expected 3 persisted transactions.");

    const received = transactions.find((entry) => /Received GCash from/i.test(entry.merchantRaw));
    assert.ok(received, "Expected a received GCash row.");
    assert.equal(received?.merchantClean, "Received GCash from BPI / BPI Family Savings Bank");
    assert.equal(received?.type, "income");
    assert.equal(received?.isTransfer, false);
    assert.equal(received?.category?.name, "Transfers");

    const gsave = transactions.find((entry) => /Withdraw from GSave Account/i.test(entry.merchantRaw));
    assert.ok(gsave, "Expected a GSave row.");
    assert.equal(gsave?.merchantClean, "Transfer from GSave");
    assert.equal(gsave?.type, "expense");
    assert.equal(gsave?.isTransfer, false);
    assert.equal(gsave?.category?.name, "Financial");
    assert.ok(
      typeof gsave?.rawPayload === "object" &&
        gsave.rawPayload !== null &&
        !Array.isArray(gsave.rawPayload) &&
        typeof (gsave.rawPayload as Record<string, unknown>).notes === "string" &&
        String((gsave.rawPayload as Record<string, unknown>).notes).includes("GSave savings account"),
      "Expected the GSave row to carry a helpful note."
    );

    const noisy = transactions.find((entry) => /account ending in 4457/i.test(entry.merchantRaw));
    assert.ok(noisy, "Expected a noisy legacy row.");
    assert.equal(noisy?.merchantClean, "GCash Transaction");

    const conflictingAccountText = `
GCash Transaction History
Wallet Number 09164013313
Wallet Number 09164013313
Wallet Number 09164013313
Wallet Number 09164013313
Wallet Number 09164013313
Wallet Number 09164013313
Date and Time Description Reference No. Debit Credit Balance
STARTING BALANCE 0.00
2024-02-07 06:59 PM 1015099065672 2900.00 705.31 Transfer from 09112223333 to 09112223333
2024-02-07 07:05 PM 1015099909989 700.00 5.31 Transfer from 09112223333 to 09112223333
ENDING BALANCE 0.00
`.trim();

    const conflictingImportFile = await prisma.importFile.create({
      data: {
        workspaceId,
        fileName: "gcash-account-precedence-regression.pdf",
        fileType: "application/pdf",
        storageKey: `qa/gcash-precedence/${Date.now()}.pdf`,
        status: "processing",
      },
    });

    const conflictingResult = await processImportFileText(conflictingImportFile.id, {
      text: conflictingAccountText,
      actorUserId: user.clerkUserId,
      qaSource: "import_processing",
      allowDuplicateStatement: false,
      importMode: "statement",
    });

    assert.equal(conflictingResult.status, "done", "Expected the conflicting GCash import to finish.");

    const conflictingTransactions = await prisma.transaction.findMany({
      where: {
        importFileId: conflictingImportFile.id,
        deletedAt: null,
      },
      select: {
        merchantRaw: true,
        type: true,
        account: {
          select: {
            name: true,
            accountNumber: true,
          },
        },
      },
      orderBy: { date: "asc" },
    });

    assert.equal(conflictingTransactions.length, 2, "Expected the conflicting GCash import to persist two rows.");
    assert.ok(
      conflictingTransactions.every((entry) => entry.account?.name === "GCash 3313" && entry.account?.accountNumber === "09164013313"),
      `Expected the conflicting GCash import to stay on GCash 3313, got ${JSON.stringify(conflictingTransactions)}`
    );

    console.log("[PASS] GCash legacy regression normalizes 2020-era rows correctly.");
  } finally {
    await prisma.user.delete({
      where: { id: user.id },
    }).catch(() => null);
  }
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
