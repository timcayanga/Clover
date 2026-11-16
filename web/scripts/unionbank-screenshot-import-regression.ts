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
const unionbankRoot = join(screenshotRoot, "UnionBank");
const screenshotFiles = [
  "IMG_1387.PNG",
  "IMG_1388.PNG",
  "IMG_1389.PNG",
  "IMG_1390.PNG",
  "IMG_1391.PNG",
  "IMG_1392.PNG",
  "IMG_1393.PNG",
  "IMG_1394.PNG",
  "IMG_1395.PNG",
  "IMG_1396.PNG",
] as const;

const readScreenshotText = async (
  fileName: string,
  readUploadedFileText: Awaited<ReturnType<typeof loadRuntime>>["readUploadedFileText"],
) => {
  const absolutePath = join(unionbankRoot, fileName);
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
      `Database is not reachable${code ? ` (${code})` : ""}. Start or link the local database before running qa:unionbank-screenshot-import.`
    );
  }
};

const main = async () => {
  const { prisma, readUploadedFileText, processImportFileText, loadImportStatusSnapshot, uploadObject } = await loadRuntime();
  await assertDatabaseReady(prisma);

  const runId = `unionbank-screenshots-${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      clerkUserId: `qa-${runId}`,
      email: `${runId}@qa.clover.local`,
      verified: true,
      environment: "test",
      workspaces: {
        create: {
          name: "UnionBank screenshot regression",
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
    for (const fileName of screenshotFiles) {
      texts.set(fileName, await readScreenshotText(fileName, readUploadedFileText));
    }

    const importFileIds = new Map<string, string>();
    for (const fileName of screenshotFiles) {
      const storageKey = `qa/${runId}/${fileName}`;
      const absolutePath = join(unionbankRoot, fileName);
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

    const uploadAccounts = await prisma.account.findMany({
      where: { workspaceId, source: "upload" },
      select: { id: true, name: true, institution: true, accountNumber: true, type: true, balance: true },
    });

    const unionbankAccount = uploadAccounts.find(
      (account) =>
        account.accountNumber === "8037" ||
        account.name === "UnionBank 8037" ||
        /unionbank/i.test(`${account.institution ?? ""} ${account.name ?? ""}`)
    );
    assert.ok(unionbankAccount, `Expected one UnionBank upload account, got ${JSON.stringify(uploadAccounts)}.`);
    assert.equal(unionbankAccount?.name, "UnionBank 8037", "Expected UnionBank screenshot account name UnionBank 8037.");
    assert.equal(unionbankAccount?.accountNumber, "8037", "Expected UnionBank screenshot account number 8037.");
    assert.equal(unionbankAccount?.type, "bank", "Expected UnionBank screenshot account to stay in Banks & savings.");
    assert.equal(unionbankAccount?.balance?.toString(), "116465.28", "Expected UnionBank screenshot balance to persist.");

    const filenameAccounts = uploadAccounts.filter((account) => account.name.startsWith("IMG_"));
    assert.equal(
      filenameAccounts.length,
      0,
      `UnionBank screenshot import should not persist IMG_* accounts, got ${JSON.stringify(filenameAccounts)}`
    );

    const transactionRows = await prisma.transaction.findMany({
      where: {
        workspaceId,
        accountId: unionbankAccount.id,
        deletedAt: null,
      },
      select: {
        merchantClean: true,
        merchantRaw: true,
        description: true,
        date: true,
        amount: true,
      },
    });

    assert.ok(transactionRows.length >= 40, `Expected many UnionBank screenshot rows, got ${transactionRows.length}.`);
    assert.ok(
      transactionRows.some(
        (row) =>
          row.date.toISOString().slice(0, 10) === "2026-04-13" &&
          row.amount.toString() === "92627.65" &&
          /online payroll/i.test(String(row.description ?? row.merchantRaw ?? ""))
      ),
      "Expected the Apr 13, 2026 Online Payroll row on UnionBank 8037."
    );
    assert.ok(
      transactionRows.some(
        (row) =>
          row.date.toISOString().slice(0, 10) === "2025-12-12" &&
          row.amount.toString() === "42822.25" &&
          /bills payment/i.test(String(row.description ?? row.merchantRaw ?? ""))
      ),
      "Expected the Dec 12, 2025 Bills Payment row on UnionBank 8037."
    );
    assert.ok(
      transactionRows.some(
        (row) =>
          row.date.toISOString().slice(0, 10) === "2026-03-02" &&
          row.amount.toString() === "99000" &&
          /xendit/i.test(String(row.description ?? row.merchantRaw ?? ""))
      ),
      "Expected the Mar 2, 2026 Xendit row on UnionBank 8037."
    );

    const duplicateContentKeys = new Map<string, number>();
    for (const row of transactionRows) {
      const key = [
        row.date.toISOString().slice(0, 10),
        row.amount.toString(),
        String(row.description ?? row.merchantRaw ?? row.merchantClean ?? "").trim().toLowerCase(),
      ].join("|");
      duplicateContentKeys.set(key, (duplicateContentKeys.get(key) ?? 0) + 1);
    }
    const repeatedKeys = [...duplicateContentKeys.entries()].filter(([, count]) => count > 1);
    assert.equal(
      repeatedKeys.length,
      0,
      `UnionBank screenshot import should dedupe overlapping screenshot rows, got ${JSON.stringify(repeatedKeys)}`
    );

    const screenshotJunkRows = transactionRows.filter((row) =>
      /^(?:php|premier plus savings|available balance|april \d{1,2},?|may \d{1,2},?|download|account details|transaction history)$/i.test(
        String(row.description ?? row.merchantRaw ?? row.merchantClean ?? "").trim()
      )
    );
    assert.equal(
      screenshotJunkRows.length,
      0,
      `UnionBank screenshot import should not persist screenshot chrome as transactions, got ${JSON.stringify(screenshotJunkRows)}`
    );

    const snapshotStatus = await loadImportStatusSnapshot(importFileIds.get("IMG_1387.PNG")!, { promoteFailedVisibleImport: true });
    assert.ok(snapshotStatus, "Expected status snapshot for IMG_1387.PNG.");
    assert.ok(snapshotStatus?.accountSummaries.length, "Expected account summaries for UnionBank dashboard screenshot.");
    assert.ok(
      snapshotStatus?.accountSummaries.some(
        (summary) =>
          summary.accountName === "UnionBank 8037" &&
          summary.accountNumber === "8037" &&
          summary.accountType === "bank"
      ),
      `Expected IMG_1387.PNG snapshot to expose UnionBank 8037, got ${JSON.stringify(snapshotStatus?.accountSummaries ?? [])}`
    );

    for (const fileName of screenshotFiles.filter((fileName) => fileName !== "IMG_1387.PNG")) {
      const snapshot = await loadImportStatusSnapshot(importFileIds.get(fileName)!, { promoteFailedVisibleImport: true });
      assert.ok(snapshot?.visibleImportComplete, `${fileName} should be visible to the UI.`);
      assert.ok(
        snapshot?.accountSummaries.every((summary) => !String(summary.accountName ?? "").startsWith("IMG_")),
        `${fileName} should not surface IMG_* account names in status summaries.`
      );
    }

    console.log("[PASS] UnionBank screenshot import regression keeps UnionBank 8037 stable end-to-end.");
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
