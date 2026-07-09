import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { strict as assert } from "node:assert";
import { evaluateDataQaRun, type DataQaRunInput } from "@/lib/data-qa";

const buildGoodSample = (): DataQaRunInput => ({
  workspaceId: "workspace-test",
  importFileId: "import-good",
  source: "local_training",
  fileName: "bpi-sample.pdf",
  fileType: "application/pdf",
  parserVersion: "v2",
  parsedRows: [
    {
      date: "2026-01-07",
      amount: "-129.50",
      merchantRaw: "STARBUCKS 001",
      merchantClean: "Starbucks",
      categoryName: "Food & Dining",
      type: "expense",
      confidence: 97,
    },
    {
      date: "2026-01-08",
      amount: "2500.00",
      merchantRaw: "SALARY",
      merchantClean: "Salary",
      categoryName: "Income",
      type: "income",
      confidence: 98,
    },
  ],
  metadata: {
    institution: "BPI",
    accountNumber: "1234567890",
    accountName: "BPI 7890",
    accountType: "bank",
    openingBalance: 1000,
    endingBalance: 3370.5,
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    confidence: 96,
  },
  account: {
    id: "account-test",
    name: "BPI 7890",
    institution: "BPI",
    type: "bank",
    balance: "3370.50",
  },
  checkpoint: {
    openingBalance: "1000.00",
    endingBalance: "3370.50",
    rowCount: 2,
    status: "reconciled",
  },
  timings: {
    totalMs: 1250,
    parsingMs: 850,
    usedDeterministicParser: true,
  },
});

const buildBadSample = (): DataQaRunInput => ({
  workspaceId: "workspace-test",
  importFileId: "import-bad",
  source: "local_training",
  fileName: "broken.pdf",
  fileType: "application/pdf",
  parserVersion: "v2",
  parsedRows: [
    {
      merchantRaw: "UNKNOWN",
      confidence: 40,
    },
  ],
  metadata: {
    institution: null,
    accountNumber: null,
    accountName: null,
    accountType: null,
    confidence: 22,
  },
  timings: {
    totalMs: 8200,
    parsingMs: 7900,
    usedVisionFallback: true,
    usedOpenAiFallback: true,
    pageCount: 12,
  },
});

const buildUnseenMerchantSample = (): DataQaRunInput => ({
  workspaceId: "workspace-test",
  importFileId: "import-unseen-merchant",
  source: "local_training",
  fileName: "fresh-credit-card.pdf",
  fileType: "application/pdf",
  parserVersion: "v2",
  parsedRows: [
    {
      date: "2026-02-02",
      amount: "-220.00",
      merchantRaw: "UNSEEN PAYEE 001",
      merchantClean: "UNSEEN PAYEE 001",
      categoryName: "Other",
      type: "expense",
      confidence: 74,
    },
    {
      date: "2026-02-03",
      amount: "-180.00",
      merchantRaw: "ANOTHER STRANGE RAW ROW",
      merchantClean: "ANOTHER STRANGE RAW ROW",
      categoryName: "Other",
      type: "expense",
      confidence: 72,
    },
    {
      date: "2026-02-04",
      amount: "-120.00",
      merchantRaw: "TRANSFER LIKE NOISE",
      merchantClean: "TRANSFER LIKE NOISE",
      categoryName: "Transfers",
      type: "expense",
      confidence: 71,
    },
    {
      date: "2026-02-05",
      amount: "-95.00",
      merchantRaw: "TRANSFER LIKE NOISE TWO",
      merchantClean: "TRANSFER LIKE NOISE TWO",
      categoryName: "Transfers",
      type: "expense",
      confidence: 73,
    },
    {
      date: "2026-02-06",
      amount: "-88.00",
      merchantRaw: "TRANSFER LIKE NOISE THREE",
      merchantClean: "TRANSFER LIKE NOISE THREE",
      categoryName: "Transfers",
      type: "expense",
      confidence: 70,
    },
  ],
  metadata: {
    institution: "BPI",
    accountNumber: "000011112222",
    accountName: "BPI 2222",
    accountType: "credit_card",
    openingBalance: null,
    endingBalance: null,
    startDate: "2026-02-01",
    endDate: "2026-02-28",
    confidence: 84,
  },
  timings: {
    totalMs: 1800,
    parsingMs: 1200,
    usedDeterministicParser: true,
  },
});

const buildTransferOverreachSample = (): DataQaRunInput => ({
  workspaceId: "workspace-test",
  importFileId: "import-transfer-overreach",
  source: "local_training",
  fileName: "new-credit-card.pdf",
  fileType: "application/pdf",
  parserVersion: "v2",
  parsedRows: [
    {
      date: "2026-03-02",
      amount: "-480.00",
      merchantRaw: "GRABCAR PH",
      merchantClean: "GRABCAR PH",
      categoryName: "Transfers",
      type: "expense",
      confidence: 79,
    },
    {
      date: "2026-03-03",
      amount: "-220.00",
      merchantRaw: "DUNKIN DONUTS BGC",
      merchantClean: "DUNKIN DONUTS BGC",
      categoryName: "Other",
      type: "expense",
      confidence: 78,
    },
    {
      date: "2026-03-04",
      amount: "-399.00",
      merchantRaw: "PAYPAL * LINKEDIN PREMIUM",
      merchantClean: "PAYPAL * LINKEDIN PREMIUM",
      categoryName: "Transfers",
      type: "expense",
      confidence: 77,
    },
  ],
  metadata: {
    institution: "BPI",
    accountNumber: "4444333322221111",
    accountName: "BPI 1111",
    accountType: "credit_card",
    startDate: "2026-03-01",
    endDate: "2026-03-31",
    confidence: 88,
  },
  timings: {
    totalMs: 1400,
    parsingMs: 900,
    usedDeterministicParser: true,
  },
});

const buildImageSample = (): DataQaRunInput => ({
  workspaceId: "workspace-test",
  importFileId: "import-image-statement",
  source: "local_training",
  fileName: "statement-screenshot.png",
  fileType: "image/png",
  parserVersion: "v2",
  parsedRows: [
    {
      date: "2026-01-09",
      amount: "-199.00",
      merchantRaw: "GRAB PH",
      merchantClean: "Grab",
      description: "GRAB PH",
      categoryName: "Transport",
      type: "expense",
      confidence: 94,
      rawPayload: {
        importMode: "statement",
      },
    },
    {
      date: "2026-01-10",
      amount: "5000.00",
      merchantRaw: "SALARY",
      merchantClean: "Salary",
      description: "SALARY",
      categoryName: "Income",
      type: "income",
      confidence: 96,
      rawPayload: {
        importMode: "statement",
      },
    },
  ],
  metadata: {
    institution: "UnionBank",
    accountNumber: "123456789012",
    accountName: "UnionBank 9012",
    accountType: "bank",
    openingBalance: 1000,
    endingBalance: 5801,
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    confidence: 92,
  },
  account: {
    id: "account-image-test",
    name: "UnionBank 9012",
    institution: "UnionBank",
    type: "bank",
    balance: "5801.00",
  },
  checkpoint: {
    openingBalance: "1000.00",
    endingBalance: "5801.00",
    rowCount: 2,
    status: "reconciled",
  },
  timings: {
    totalMs: 2300,
    parsingMs: 1800,
    usedVisionFallback: true,
    usedOpenAiFallback: true,
    pageCount: 2,
  },
});

const buildReceiptSample = (): DataQaRunInput => ({
  workspaceId: "workspace-test",
  importFileId: "import-receipt",
  source: "local_training",
  fileName: "receipt-photo.jpg",
  fileType: "image/jpeg",
  parserVersion: "v2",
  parsedRows: [
    {
      date: "2026-01-12",
      amount: "-428.00",
      merchantRaw: "LUNCHBOX CAFE",
      merchantClean: "Lunchbox Cafe",
      description: "LUNCHBOX CAFE",
      categoryName: "Food & Dining",
      type: "expense",
      confidence: 90,
      rawPayload: {
        importMode: "receipt",
      },
    },
  ],
  metadata: {
    institution: null,
    accountNumber: "**** 4321",
    accountName: "Visa 4321",
    accountType: "credit_card",
    openingBalance: null,
    endingBalance: null,
    startDate: "2026-01-12",
    endDate: "2026-01-12",
    confidence: 76,
  },
  account: {
    id: "account-receipt-test",
    name: "Visa 4321",
    institution: null,
    type: "credit_card",
    balance: null,
  },
  checkpoint: {
    rowCount: 1,
    status: "parsed",
  },
  timings: {
    totalMs: 1400,
    parsingMs: 1100,
    usedVisionFallback: true,
    usedOpenAiFallback: true,
    pageCount: 1,
  },
});

const loadJsonInput = async (filePath: string): Promise<DataQaRunInput> => {
  const raw = await readFile(resolve(filePath), "utf8");
  return JSON.parse(raw) as DataQaRunInput;
};

type DataQaFixture = {
  name: string;
  input: DataQaRunInput;
  expectations?: {
    minScore?: number;
    maxScore?: number;
    requiredFindingCodes?: string[];
    forbiddenFindingCodes?: string[];
    metrics?: Record<string, boolean | number | null>;
  };
};

const loadFixture = async (filePath: string): Promise<DataQaFixture> => {
  const raw = await readFile(resolve(filePath), "utf8");
  return JSON.parse(raw) as DataQaFixture;
};

const loadFixtureFiles = async (rootDir: string): Promise<string[]> => {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const resolvedPath = `${rootDir}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await loadFixtureFiles(resolvedPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(resolvedPath);
    }
  }

  return files.sort();
};

const assertFixture = (fixture: DataQaFixture) => {
  const evaluation = evaluateDataQaRun(fixture.input);
  const expectations = fixture.expectations ?? {};

  if (typeof expectations.minScore === "number") {
    assert.ok(evaluation.score >= expectations.minScore, `${fixture.name} should score at least ${expectations.minScore}`);
  }

  if (typeof expectations.maxScore === "number") {
    assert.ok(evaluation.score <= expectations.maxScore, `${fixture.name} should score at most ${expectations.maxScore}`);
  }

  for (const code of expectations.requiredFindingCodes ?? []) {
    assert.ok(evaluation.findings.some((finding) => finding.code === code), `${fixture.name} should include ${code}`);
  }

  for (const code of expectations.forbiddenFindingCodes ?? []) {
    assert.ok(!evaluation.findings.some((finding) => finding.code === code), `${fixture.name} should not include ${code}`);
  }

  for (const [metric, expected] of Object.entries(expectations.metrics ?? {})) {
    assert.strictEqual(
      evaluation.metrics[metric as keyof typeof evaluation.metrics],
      expected,
      `${fixture.name} should set ${metric} to ${String(expected)}`
    );
  }
};

const main = async () => {
  const inputIndex = process.argv.indexOf("--input");
  const inputPath = inputIndex >= 0 ? process.argv[inputIndex + 1] : null;

  if (inputPath) {
    const input = await loadJsonInput(inputPath);
    const evaluation = evaluateDataQaRun(input);
    console.log(JSON.stringify(evaluation, null, 2));
    return;
  }

  const fixtureDir = resolve("scripts/fixtures/data-qa");
  const fixtureFiles = await loadFixtureFiles(fixtureDir);
  assert.ok(fixtureFiles.length > 0, "expected at least one Data QA fixture");

  for (const entry of fixtureFiles) {
    const fixture = await loadFixture(entry);
    assertFixture(fixture);
  }

  const good = evaluateDataQaRun(buildGoodSample());
  assert.ok(good.score >= 70, "the healthy sample should score well");
  assert.ok(!good.findings.some((finding) => finding.code === "transactions.empty"), "the healthy sample should have rows");
  assert.ok(good.metrics.uiTransactionsReady, "the healthy sample should be transaction-ready");
  assert.ok(good.metrics.repairCandidateCount <= 1, "the healthy sample should need little to no repair follow-up");

  const imageSample = evaluateDataQaRun(buildImageSample());
  assert.ok(imageSample.score >= 65, "the image statement sample should score reasonably well");
  assert.ok(
    imageSample.findings.some((finding) => finding.code === "performance.vision_fallback_used"),
    "the image statement sample should record the vision fallback"
  );

  const receiptSample = evaluateDataQaRun(buildReceiptSample());
  assert.ok(receiptSample.score >= 55, "the receipt sample should still be usable");
  assert.ok(
    receiptSample.findings.some((finding) => finding.code === "performance.vision_fallback_used"),
    "the receipt sample should record the vision fallback"
  );

  const bad = evaluateDataQaRun(buildBadSample());
  assert.ok(bad.findings.some((finding) => finding.code === "statement.identity_missing"), "the broken sample should flag missing identity");
  assert.ok(bad.findings.some((finding) => finding.code === "performance.slow_parse"), "the broken sample should flag slow parsing");
  assert.ok(bad.score < good.score, "the broken sample should score lower than the healthy sample");

  const unseenMerchantSample = evaluateDataQaRun(buildUnseenMerchantSample());
  assert.ok(
    unseenMerchantSample.findings.some((finding) => finding.code === "transactions.other_category_rate_high"),
    "the unseen-merchant sample should flag high Other-category drift"
  );
  assert.ok(
    unseenMerchantSample.findings.some((finding) => finding.code === "transactions.transfer_category_rate_high"),
    "the unseen-merchant sample should flag high Transfers-category drift"
  );
  assert.ok(unseenMerchantSample.metrics.repairCandidateCount > 0, "the unseen-merchant sample should surface repair candidates");

  const transferOverreachSample = evaluateDataQaRun(buildTransferOverreachSample());
  assert.ok(
    transferOverreachSample.findings.some((finding) => finding.code === "transactions.transfer_overreach"),
    "the transfer-overreach sample should flag transfer heuristics swallowing strong merchant hints"
  );
  assert.ok(
    transferOverreachSample.findings.some((finding) => finding.code === "transactions.recoverable_other_rows"),
    "the transfer-overreach sample should flag Other rows that are recoverable from merchant hints"
  );

  console.log("data-qa regression passed");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
