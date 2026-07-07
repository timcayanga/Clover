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
const gcryptoRoot = join(screenshotRoot, "GCrypto");
const files = ["IMG_1427.PNG", "IMG_1428.PNG", "IMG_1429.PNG"] as const;

const readScreenshotText = async (
  fileName: string,
  readUploadedFileText: Awaited<ReturnType<typeof loadRuntime>>["readUploadedFileText"],
) => {
  const absolutePath = join(gcryptoRoot, fileName);
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
      `Database is not reachable${code ? ` (${code})` : ""}. Start or link the local database before running qa:gcrypto-screenshot-import.`
    );
  }
};

const main = async () => {
  const { prisma, readUploadedFileText, processImportFileText, loadImportStatusSnapshot, uploadObject } = await loadRuntime();
  await assertDatabaseReady(prisma);

  const runId = `gcrypto-screenshots-${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      clerkUserId: `qa-${runId}`,
      email: `${runId}@qa.clover.local`,
      verified: true,
      environment: "test",
      workspaces: {
        create: {
          name: "GCrypto screenshot regression",
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
    for (const fileName of files) {
      texts.set(fileName, await readScreenshotText(fileName, readUploadedFileText));
    }

    const importFileIds = new Map<string, string>();

    for (const fileName of files) {
      const storageKey = `qa/${runId}/${fileName}`;
      const absolutePath = join(gcryptoRoot, fileName);
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

      const result = await processImportFileText(importFile.id, {
        text: texts.get(fileName) ?? "",
        actorUserId: user.clerkUserId,
        qaSource: "import_processing",
        allowDuplicateStatement: false,
        importMode: "statement",
      });

      assert.notEqual(result.status, "error", `${fileName} should not fail import processing.`);
    }

    const uploadedAccounts = await prisma.account.findMany({
      where: {
        workspaceId,
        source: "upload",
      },
      select: {
        id: true,
        name: true,
        institution: true,
        accountNumber: true,
        type: true,
        balance: true,
      },
    });

    const gcryptoAccounts = uploadedAccounts.filter((account) => account.institution === "GCrypto");
    assert.equal(gcryptoAccounts.length, 1, `Expected exactly one uploaded GCrypto account, got ${JSON.stringify(gcryptoAccounts)}`);
    assert.equal(gcryptoAccounts[0]?.name, "GCrypto", "Expected canonical GCrypto account name.");
    assert.equal(gcryptoAccounts[0]?.type, "investment", "Expected GCrypto to land in Investments.");

    const filenameAccounts = uploadedAccounts.filter((account) => String(account.name ?? "").startsWith("IMG_"));
    assert.equal(
      filenameAccounts.length,
      0,
      `GCrypto screenshot import should not persist IMG_* accounts, got ${JSON.stringify(filenameAccounts)}`
    );

    const visibleTransactions = await prisma.transaction.findMany({
      where: {
        workspaceId,
        accountId: gcryptoAccounts[0]!.id,
        deletedAt: null,
      },
      select: {
        merchantClean: true,
        date: true,
        amount: true,
        type: true,
        categoryId: true,
        rawPayload: true,
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });

    assert.equal(visibleTransactions.length, 9, `Expected 9 visible deduped GCrypto transactions, got ${visibleTransactions.length}.`);
    assert.ok(
      visibleTransactions.some((row) => row.merchantClean === "Buy Bitcoin" && row.type === "expense"),
      "Expected a GCrypto buy transaction to remain an investment expense."
    );
    assert.ok(
      visibleTransactions.some((row) => row.merchantClean === "Sell Solana" && row.type === "income"),
      "Expected a GCrypto sell transaction to remain investment income."
    );
    for (const fileName of files) {
      const snapshot = await loadImportStatusSnapshot(importFileIds.get(fileName)!, { promoteFailedVisibleImport: true });
      assert.ok(snapshot, `Expected status snapshot for ${fileName}.`);
      assert.ok(snapshot?.accountSummaries.length, `Expected account summaries for ${fileName}.`);
      assert.ok(
        snapshot?.accountSummaries.some(
          (summary) =>
            summary.accountName === "GCrypto" &&
            summary.accountType === "investment" &&
            summary.institution === "GCrypto"
        ),
        `${fileName} should surface the canonical GCrypto investment account in status snapshots.`
      );
    }

    console.log("[PASS] GCrypto screenshot import regression keeps one investment account and 9 visible deduped transactions end-to-end.");
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
