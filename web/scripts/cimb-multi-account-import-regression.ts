import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { strict as assert } from "node:assert";
import { loadEnvConfig } from "@next/env";

const webRoot = basename(process.cwd()) === "web" ? process.cwd() : join(process.cwd(), "web");
loadEnvConfig(webRoot);

const loadRuntime = async () => {
  const [{ prisma }, { readUploadedFileText }, { processImportFileText }, { loadImportStatusSnapshot }] = await Promise.all([
    import("@/lib/prisma"),
    import("@/lib/import-file-text.server"),
    import("@/workers/import-processor"),
    import("@/lib/import-status-snapshot"),
  ]);

  return { prisma, readUploadedFileText, processImportFileText, loadImportStatusSnapshot };
};

const statementRoot = process.env.CLOVER_STATEMENT_ROOT ?? "/Users/TimCayanga1/Documents/Bank Statements";
const cimbMixedFile = "Samples/CIMB/840624470-CIMB-Statement-of-account-pdf.pdf";
const expectedAccounts = [
  { accountNumber: "20867602571971", lastFour: "1971" },
  { accountNumber: "20867602571932", lastFour: "1932" },
] as const;
const expectedCimbMixedBalance = "2392.08";

const readStatementText = async (
  relativePath: string,
  readUploadedFileText: Awaited<ReturnType<typeof loadRuntime>>["readUploadedFileText"],
) => {
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

const assertDatabaseReady = async (prisma: Awaited<ReturnType<typeof loadRuntime>>["prisma"]) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
    throw new Error(
      `Database is not reachable${code ? ` (${code})` : ""}. Start or link the local database before running qa:cimb-multi-account.`
    );
  }
};

const assertCimbAccountSummaries = (
  summaries: Array<{
    accountNumber: string | null;
    rowsImported: number;
    balance: string | null;
  }> | null | undefined,
  source: string,
) => {
  const summaryList = summaries ?? [];
  assert.equal(summaryList.length, 2, `${source} should report two account summaries.`);

  for (const expected of expectedAccounts) {
    const summary = summaryList.find((entry) => entry.accountNumber === expected.accountNumber);
    assert.ok(summary, `${source} should include CIMB ${expected.lastFour}.`);
    assert.equal(summary.rowsImported, 6, `${source} should report 6 rows for CIMB ${expected.lastFour}.`);
    assert.equal(
      summary.balance,
      expectedCimbMixedBalance,
      `${source} should report balance ${expectedCimbMixedBalance} for CIMB ${expected.lastFour}.`
    );
  }
};

const main = async () => {
  const { prisma, readUploadedFileText, processImportFileText, loadImportStatusSnapshot } = await loadRuntime();

  try {
    await assertDatabaseReady(prisma);

    const runId = `cimb-multi-account-${Date.now()}`;
    const user = await prisma.user.create({
      data: {
        clerkUserId: `qa-${runId}`,
        email: `${runId}@qa.clover.local`,
        verified: true,
        environment: "test",
        workspaces: {
          create: {
            name: "CIMB multi-account regression",
            type: "personal",
          },
        },
      },
      include: { workspaces: true },
    });
    const workspaceId = user.workspaces[0]?.id;
    assert.ok(workspaceId, "Expected QA workspace to be created.");

    try {
      const fileName = basename(cimbMixedFile);
      const text = await readStatementText(cimbMixedFile, readUploadedFileText);
      const processQaImport = async (label: string) => {
        const importFile = await prisma.importFile.create({
          data: {
            workspaceId,
            fileName,
            fileType: "application/pdf",
            storageKey: `qa/${runId}/${label}/${fileName}`,
            status: "processing",
          },
        });

        const result = await processImportFileText(importFile.id, {
          text,
          actorUserId: user.clerkUserId,
          qaSource: "import_processing",
          allowDuplicateStatement: false,
          importMode: "statement",
        });

        return { importFile, result };
      };

      const { importFile, result } = await processQaImport("fresh");

      assert.equal(result.status, "done", "CIMB mixed statement should finish import.");
      assert.equal(result.imported, 12, `CIMB mixed statement should import 12 visible rows, got ${result.imported}.`);
      assertCimbAccountSummaries(result.accountSummaries, "CIMB mixed import result");

      const statusSnapshot = await loadImportStatusSnapshot(importFile.id, { promoteFailedVisibleImport: true });
      assert.ok(statusSnapshot, "Expected CIMB import status snapshot.");
      assert.equal(statusSnapshot.visibleImportComplete, true, "CIMB status snapshot should be visible to the UI.");
      assert.equal(statusSnapshot.confirmedTransactionsCount, 12, "CIMB status snapshot should report 12 confirmed rows.");
      assertCimbAccountSummaries(statusSnapshot.accountSummaries, "CIMB status snapshot");

      for (const expected of expectedAccounts) {
        const account = await prisma.account.findFirst({
          where: {
            workspaceId,
            institution: "CIMB",
            accountNumber: expected.accountNumber,
            source: "upload",
          },
        });
        assert.ok(account, `Expected uploaded account CIMB ${expected.lastFour}.`);
        assert.equal(account.name, `CIMB ${expected.lastFour}`, `Expected account display name CIMB ${expected.lastFour}.`);
        assert.equal(account.balance?.toString(), expectedCimbMixedBalance, `Expected account ${expected.lastFour} balance to persist.`);

        const transactions = await prisma.transaction.findMany({
          where: {
            workspaceId,
            accountId: account.id,
            importFileId: importFile.id,
            deletedAt: null,
          },
        });
        assert.equal(transactions.length, 6, `Expected 6 persisted transactions for CIMB ${expected.lastFour}.`);
      }

      const genericCimbAccount = await prisma.account.findFirst({
        where: {
          workspaceId,
          institution: "CIMB",
          accountNumber: null,
          source: "upload",
        },
      });
      assert.equal(genericCimbAccount, null, "CIMB mixed import should not leave a generic uploaded CIMB account.");

      const staleGenericAccount = await prisma.account.create({
        data: {
          workspaceId,
          name: "CIMB",
          institution: "CIMB",
          type: "bank",
          currency: "PHP",
          balance: "4294.66",
          source: "upload",
        },
      });
      const staleWrongAccount = await prisma.account.create({
        data: {
          workspaceId,
          name: "CIMB 1091",
          institution: "CIMB",
          accountNumber: "20867602571091",
          type: "bank",
          currency: "PHP",
          balance: "4294.66",
          source: "upload",
        },
      });
      const staleRows = await prisma.transaction.findMany({
        where: {
          workspaceId,
          importFileId: importFile.id,
          deletedAt: null,
        },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      await prisma.transaction.updateMany({
        where: {
          id: { in: staleRows.slice(0, 6).map((row) => row.id) },
        },
        data: {
          accountId: staleWrongAccount.id,
        },
      });
      await prisma.transaction.updateMany({
        where: {
          id: { in: staleRows.slice(6).map((row) => row.id) },
        },
        data: {
          accountId: staleGenericAccount.id,
        },
      });

      const staleGenericRows = await prisma.transaction.count({
        where: {
          workspaceId,
          accountId: staleGenericAccount.id,
          deletedAt: null,
        },
      });
      assert.equal(staleGenericRows, 6, "Regression setup should mimic stale rows on a generic CIMB account.");
      const staleWrongRows = await prisma.transaction.count({
        where: {
          workspaceId,
          accountId: staleWrongAccount.id,
          deletedAt: null,
        },
      });
      assert.equal(staleWrongRows, 6, "Regression setup should mimic stale rows on a wrong-number CIMB account.");

      const { importFile: repairImportFile, result: repairResult } = await processQaImport("repair");
      assert.equal(repairResult.status, "done", "CIMB duplicate repair import should finish.");
      assertCimbAccountSummaries(repairResult.accountSummaries, "CIMB duplicate repair result");

      const repairStatusSnapshot = await loadImportStatusSnapshot(repairImportFile.id, { promoteFailedVisibleImport: true });
      assert.ok(repairStatusSnapshot, "Expected CIMB duplicate repair status snapshot.");
      assert.equal(repairStatusSnapshot.visibleImportComplete, true, "CIMB duplicate repair should be visible to the UI.");
      assert.equal(repairStatusSnapshot.confirmedTransactionsCount, 12, "CIMB duplicate repair should keep 12 visible rows.");
      assertCimbAccountSummaries(repairStatusSnapshot.accountSummaries, "CIMB duplicate repair status snapshot");

      const repairedGenericRows = await prisma.transaction.count({
        where: {
          workspaceId,
          accountId: staleGenericAccount.id,
          deletedAt: null,
        },
      });
      assert.equal(repairedGenericRows, 0, "CIMB duplicate repair should move stale generic rows to numbered accounts.");
      const repairedWrongRows = await prisma.transaction.count({
        where: {
          workspaceId,
          accountId: staleWrongAccount.id,
          deletedAt: null,
        },
      });
      assert.equal(repairedWrongRows, 0, "CIMB duplicate repair should remove stale rows from the wrong-number account.");
      const repairedGenericAccount = await prisma.account.findUnique({
        where: { id: staleGenericAccount.id },
      });
      assert.equal(repairedGenericAccount, null, "CIMB duplicate repair should delete the empty generic account card.");

      for (const expected of expectedAccounts) {
        const account = await prisma.account.findFirst({
          where: {
            workspaceId,
            institution: "CIMB",
            accountNumber: expected.accountNumber,
            source: "upload",
          },
        });
        assert.ok(account, `Expected repaired account CIMB ${expected.lastFour}.`);
        const transactions = await prisma.transaction.findMany({
          where: {
            workspaceId,
            accountId: account.id,
            importFileId: repairImportFile.id,
            deletedAt: null,
          },
        });
        assert.equal(transactions.length, 6, `Expected repaired 6 persisted transactions for CIMB ${expected.lastFour}.`);
      }

      console.log("[PASS] CIMB mixed import creates two GSave accounts with correct rows and balances.");
    } finally {
      await prisma.user.delete({
        where: { id: user.id },
      }).catch(() => null);
    }
  } finally {
    await prisma.$disconnect().catch(() => null);
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
