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
const gstocksRoot = join(screenshotRoot, "GStocks");
const files = [
  "IMG_1419.PNG",
  "IMG_1420.PNG",
  "IMG_1421.PNG",
  "IMG_1422.PNG",
  "IMG_1423.PNG",
  "IMG_1424.PNG",
  "IMG_1425.PNG",
  "IMG_1426.PNG",
] as const;

const readScreenshotText = async (
  fileName: string,
  readUploadedFileText: Awaited<ReturnType<typeof loadRuntime>>["readUploadedFileText"],
) => {
  const absolutePath = join(gstocksRoot, fileName);
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
      `Database is not reachable${code ? ` (${code})` : ""}. Start or link the local database before running qa:gstocks-screenshot-import.`
    );
  }
};

const expectedHoldings = new Map([
  ["Aboitiz Power", { symbol: "AP", quantity: "300", costBasis: "12607.09", balance: "13596.07" }],
  ["AREIT Inc.", { symbol: "AREIT", quantity: "300", costBasis: "12787.63", balance: "11803.18" }],
  ["Citicore Energy REIT", { symbol: "CREIT", quantity: "2000", costBasis: "7381.72", balance: "7032.11" }],
  ["DMCI Holdings", { symbol: "DMC", quantity: "700", costBasis: "7975.47", balance: "6686.49" }],
  ["Manila Electric", { symbol: "MER", quantity: "30", costBasis: "16112.39", balance: "19482.73" }],
  ["MREIT, Inc.", { symbol: "MREIT", quantity: "600", costBasis: "8304.42", balance: "8426.58" }],
  ["RL Commercial REIT", { symbol: "RCR", quantity: "1000", costBasis: "7552.22", balance: "6882.70" }],
  ["Semirara Mining and Power", { symbol: "SCC", quantity: "300", costBasis: "10530.98", balance: "7769.19" }],
  ["PLDT, Inc.", { symbol: "TEL", quantity: "15", costBasis: "16699.13", balance: "18675.92" }],
]);

const main = async () => {
  const { prisma, readUploadedFileText, processImportFileText, loadImportStatusSnapshot, uploadObject } = await loadRuntime();
  await assertDatabaseReady(prisma);

  const runId = `gstocks-screenshots-${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      clerkUserId: `qa-${runId}`,
      email: `${runId}@qa.clover.local`,
      verified: true,
      environment: "test",
      workspaces: {
        create: {
          name: "GStocks screenshot regression",
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
      const absolutePath = join(gstocksRoot, fileName);
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
        institution: "GStocks",
      },
      select: {
        id: true,
        name: true,
        institution: true,
        type: true,
        balance: true,
        investmentSubtype: true,
        investmentSymbol: true,
        investmentQuantity: true,
        investmentCostBasis: true,
      },
      orderBy: { name: "asc" },
    });

    assert.equal(uploadedAccounts.length, 9, `Expected 9 uploaded GStocks holdings, got ${JSON.stringify(uploadedAccounts)}`);

    const filenameAccounts = uploadedAccounts.filter((account) => String(account.name ?? "").startsWith("IMG_"));
    assert.equal(
      filenameAccounts.length,
      0,
      `GStocks screenshot import should not persist IMG_* accounts, got ${JSON.stringify(filenameAccounts)}`
    );

    for (const account of uploadedAccounts) {
      const expected = expectedHoldings.get(account.name);
      assert.ok(expected, `Unexpected GStocks holding ${account.name}`);
      assert.equal(account.type, "investment", `${account.name} should stay in Investments.`);
      assert.equal(account.investmentSubtype, "stock", `${account.name} should be tagged as a stock.`);
      assert.equal(account.investmentSymbol, expected.symbol, `${account.name} symbol should match.`);
      assert.equal(String(account.investmentQuantity ?? ""), expected.quantity, `${account.name} quantity should match.`);
      assert.equal(String(account.investmentCostBasis ?? ""), expected.costBasis, `${account.name} cost basis should match.`);
      assert.equal(
        Number(account.balance?.toString() ?? "").toFixed(2),
        Number(expected.balance).toFixed(2),
        `${account.name} market value should match.`
      );
    }

    const transactionCount = await prisma.transaction.count({
      where: {
        workspaceId,
        deletedAt: null,
        account: {
          institution: "GStocks",
        },
      },
    });
    assert.equal(transactionCount, 0, "GStocks holdings screenshots should not create transactions.");

    const summarySnapshot = await loadImportStatusSnapshot(importFileIds.get("IMG_1426.PNG")!, { promoteFailedVisibleImport: true });
    assert.ok(summarySnapshot?.accountSummaries.length, "Expected GStocks account summaries in the status snapshot.");
    assert.ok(
      summarySnapshot?.accountSummaries.some(
        (summary) =>
          summary.institution === "GStocks" &&
          summary.accountType === "investment" &&
          (summary.accountName === "Semirara Mining and Power" || summary.accountName === "PLDT, Inc.")
      ),
      `Expected GStocks status snapshot to expose resolved holdings, got ${JSON.stringify(summarySnapshot?.accountSummaries ?? [])}`
    );

    console.log("[PASS] GStocks screenshot import resolves visible stock holdings into investment accounts end-to-end.");
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
