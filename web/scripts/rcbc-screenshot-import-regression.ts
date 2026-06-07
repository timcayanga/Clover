import { readFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { basename, join } from "node:path";
import { loadEnvConfig } from "@next/env";

const webRoot = basename(process.cwd()) === "web" ? process.cwd() : join(process.cwd(), "web");
loadEnvConfig(webRoot);

const loadRuntime = async () => {
  const [{ prisma }, { readUploadedFileText }, { processImportFileText }, { loadImportStatusSnapshot }, { uploadObject }] = await Promise.all([
    import("@/lib/prisma"),
    import("@/lib/import-file-text.server"),
    import("@/workers/import-processor"),
    import("@/lib/import-status-snapshot"),
    import("@/lib/s3"),
  ]);

  return { prisma, readUploadedFileText, processImportFileText, loadImportStatusSnapshot, uploadObject };
};

const screenshotRoot = process.env.CLOVER_SCREENSHOT_ROOT ?? "/Users/TimCayanga1/Documents/Bank Screenshots";
const rcbcRoot = join(screenshotRoot, "RCBC");

const savingsFiles = ["IMG_1371.PNG", "IMG_1372.PNG", "IMG_1373.PNG"] as const;
const creditFiles = ["IMG_1374.PNG", "IMG_1375.PNG", "IMG_1376.PNG"] as const;
const allFiles = [...savingsFiles, ...creditFiles] as const;

const readScreenshotText = async (
  fileName: string,
  readUploadedFileText: Awaited<ReturnType<typeof loadRuntime>>["readUploadedFileText"],
) => {
  const absolutePath = join(rcbcRoot, fileName);
  const bytes = await readFile(absolutePath);
  return readUploadedFileText({
    name: fileName,
    type: "image/png",
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
      `Database is not reachable${code ? ` (${code})` : ""}. Start or link the local database before running qa:rcbc-screenshot-import.`
    );
  }
};

const main = async () => {
  const { prisma, readUploadedFileText, processImportFileText, loadImportStatusSnapshot, uploadObject } = await loadRuntime();
  await assertDatabaseReady(prisma);

  const runId = `rcbc-screenshots-${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      clerkUserId: `qa-${runId}`,
      email: `${runId}@qa.clover.local`,
      verified: true,
      environment: "test",
      workspaces: {
        create: {
          name: "RCBC screenshot regression",
          type: "personal",
        },
      },
    },
    include: { workspaces: true },
  });

  const workspaceId = user.workspaces[0]?.id;
  assert.ok(workspaceId, "Expected QA workspace to be created.");

  try {
    const texts = new Map<string, string>();
    for (const fileName of allFiles) {
      texts.set(fileName, await readScreenshotText(fileName, readUploadedFileText));
    }

    const importFileIds = new Map<string, string>();

    for (const fileName of allFiles) {
      const storageKey = `qa/${runId}/${fileName}`;
      const absolutePath = join(rcbcRoot, fileName);
      const bytes = await readFile(absolutePath);
      await uploadObject(storageKey, bytes, "image/png");

      const importFile = await prisma.importFile.create({
        data: {
          workspaceId,
          fileName,
          fileType: "image/png",
          storageKey,
          status: "processing",
        },
      });
      importFileIds.set(fileName, importFile.id);

      await processImportFileText(importFile.id, {
        text: texts.get(fileName) ?? "",
        actorUserId: user.clerkUserId,
        qaSource: "import_processing",
        allowDuplicateStatement: false,
        importMode: "statement",
      });
    }

    const savingsAccount = await prisma.account.findFirst({
      where: {
        workspaceId,
        institution: "RCBC",
        accountNumber: "0000009048500272",
        source: "upload",
      },
    });
    assert.ok(savingsAccount, "Expected uploaded RCBC 0272 savings account.");
    assert.equal(savingsAccount?.name, "RCBC 0272", "Expected savings account name RCBC 0272.");
    assert.equal(savingsAccount?.type, "bank", "Expected RCBC 0272 to stay in Banks & savings.");
    assert.equal(savingsAccount?.balance?.toString(), "101068.23", "Expected RCBC 0272 balance to persist.");

    const creditAccount = await prisma.account.findFirst({
      where: {
        workspaceId,
        institution: "RCBC",
        accountNumber: "1014",
        source: "upload",
      },
    });
    assert.ok(creditAccount, "Expected uploaded RCBC 1014 credit card account.");
    assert.equal(creditAccount?.name, "RCBC 1014", "Expected credit card name RCBC 1014.");
    assert.equal(creditAccount?.type, "credit_card", "Expected RCBC 1014 to stay in Credit Cards.");
    assert.equal(creditAccount?.balance?.toString(), "3914.4", "Expected RCBC 1014 balance to persist.");

    const filenameAccounts = await prisma.account.findMany({
      where: {
        workspaceId,
        source: "upload",
        name: { startsWith: "IMG_" },
      },
      select: { id: true, name: true, institution: true, accountNumber: true, type: true },
    });
    assert.equal(
      filenameAccounts.length,
      0,
      `RCBC screenshot import should not persist IMG_* accounts, got ${JSON.stringify(filenameAccounts)}`
    );

    const cashDepositRows = await prisma.transaction.findMany({
      where: {
        workspaceId,
        accountId: savingsAccount.id,
        deletedAt: null,
      },
      select: {
        merchantClean: true,
        date: true,
        amount: true,
      },
    });
    assert.equal(cashDepositRows.length, 1, `Expected one visible RCBC 0272 transaction, got ${cashDepositRows.length}.`);
    assert.equal(cashDepositRows[0]?.merchantClean, "Cash Deposit", "Expected Cash Deposit on RCBC 0272.");
    assert.equal(cashDepositRows[0]?.date.toISOString().slice(0, 10), "2026-04-29", "Expected Apr 29, 2026 cash deposit.");
    assert.equal(cashDepositRows[0]?.amount.toString(), "39225", "Expected RCBC 0272 cash deposit amount.");

    const creditRows = await prisma.transaction.findMany({
      where: {
        workspaceId,
        accountId: creditAccount.id,
        deletedAt: null,
      },
      select: {
        merchantClean: true,
        amount: true,
      },
    });
    assert.equal(creditRows.length, 11, `Expected 11 visible RCBC 1014 transactions, got ${creditRows.length}.`);
    assert.ok(creditRows.some((row) => row.merchantClean === "Apple / iTunes"), "Expected Apple / iTunes on RCBC 1014.");
    assert.ok(creditRows.some((row) => row.merchantClean === "Globe Bills Pay"), "Expected Globe Bills Pay on RCBC 1014.");

    for (const fileName of ["IMG_1371.PNG", "IMG_1373.PNG", "IMG_1376.PNG"] as const) {
      const snapshot = await loadImportStatusSnapshot(importFileIds.get(fileName)!, { promoteFailedVisibleImport: true });
      assert.ok(snapshot, `Expected status snapshot for ${fileName}.`);
      assert.ok(snapshot?.accountSummaries.length, `Expected account summaries for snapshot-only file ${fileName}.`);
      assert.ok(
        snapshot?.accountSummaries.some((summary) =>
          fileName === "IMG_1376.PNG"
            ? summary.accountNumber === "1014" && summary.accountType === "credit_card"
            : summary.accountNumber === "0000009048500272" && summary.accountType === "bank"
        ),
        `Expected ${fileName} status snapshot to expose the resolved RCBC account identity.`
      );
    }

    const transactionStatuses = await Promise.all(
      ["IMG_1372.PNG", "IMG_1374.PNG", "IMG_1375.PNG"].map(async (fileName) => {
        const snapshot = await loadImportStatusSnapshot(importFileIds.get(fileName)!, { promoteFailedVisibleImport: true });
        return { fileName, snapshot };
      })
    );

    for (const { fileName, snapshot } of transactionStatuses) {
      assert.ok(snapshot?.visibleImportComplete, `${fileName} should be visible to the UI.`);
      assert.ok(
        snapshot?.accountSummaries.every((summary) => !String(summary.accountName ?? "").startsWith("IMG_")),
        `${fileName} should not surface IMG_* account names in status summaries.`
      );
    }

    console.log("[PASS] RCBC screenshot import regression keeps RCBC 0272 and RCBC 1014 stable end-to-end.");
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
