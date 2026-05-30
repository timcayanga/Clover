import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { strict as assert } from "node:assert";
import { prisma } from "@/lib/prisma";
import { readUploadedFileText } from "@/lib/import-file-text.server";
import { processImportFileText } from "@/workers/import-processor";

const statementRoot = process.env.CLOVER_STATEMENT_ROOT ?? "/Users/TimCayanga1/Documents/Bank Statements";
const cimbMixedFile = "Samples/CIMB/840624470-CIMB-Statement-of-account-pdf.pdf";
const expectedAccounts = [
  { accountNumber: "20867602571971", lastFour: "1971" },
  { accountNumber: "20867602571932", lastFour: "1932" },
] as const;

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

const assertDatabaseReady = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
    throw new Error(
      `Database is not reachable${code ? ` (${code})` : ""}. Start or link the local database before running qa:cimb-multi-account.`
    );
  }
};

const main = async () => {
  await assertDatabaseReady();

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
    const importFile = await prisma.importFile.create({
      data: {
        workspaceId,
        fileName,
        fileType: "application/pdf",
        storageKey: `qa/${runId}/${fileName}`,
        status: "processing",
      },
    });

    const text = await readStatementText(cimbMixedFile);
    const result = await processImportFileText(importFile.id, {
      text,
      actorUserId: user.clerkUserId,
      qaSource: "import_processing",
      allowDuplicateStatement: false,
      importMode: "statement",
    });

    assert.equal(result.status, "done", "CIMB mixed statement should finish import.");
    assert.equal(result.imported, 12, `CIMB mixed statement should import 12 visible rows, got ${result.imported}.`);
    assert.equal(result.accountSummaries?.length, 2, "CIMB mixed statement should report two account summaries.");

    for (const expected of expectedAccounts) {
      const summary = result.accountSummaries?.find((entry) => entry.accountNumber === expected.accountNumber);
      assert.ok(summary, `Expected account summary for CIMB ${expected.lastFour}.`);
      assert.equal(summary.rowsImported, 6, `Expected CIMB ${expected.lastFour} to have 6 rows.`);
      assert.equal(summary.balance, "4294.66", `Expected CIMB ${expected.lastFour} balance to be 4294.66.`);

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
      assert.equal(account.balance?.toString(), "4294.66", `Expected account ${expected.lastFour} balance to persist.`);

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

    console.log("[PASS] CIMB mixed import creates two GSave accounts with correct rows and balances.");
  } finally {
    await prisma.user.delete({
      where: { id: user.id },
    }).catch(() => null);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
