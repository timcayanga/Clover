import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

type ImportedAccountType = "bank" | "wallet" | "credit_card" | "cash" | "investment" | "other";

type Fixture = {
  label: string;
  relativePath: string;
  institution: string;
  accountName: string;
  accountNumber: string;
  accountType: ImportedAccountType;
  minRows: number;
  exactRows?: number;
  expectedOpeningBalance?: number;
  expectedTrailingBalance?: number;
  expectedStartDate?: string;
  expectedEndDate?: string;
  minConfidence?: number;
  expectParsedAccountName?: boolean;
};

const defaultStatementRoot = "/Users/TimCayanga1/Documents/Bank Statements";

const fixtures: Fixture[] = [
  {
    label: "BPI Personal",
    relativePath: "Actual SOAs/BPI/BPI Savings/SA20260110 Q4 2025 Personal.pdf",
    institution: "BPI",
    accountName: "BPI 3012",
    accountNumber: "0299183012",
    accountType: "bank",
    minRows: 4,
    exactRows: 4,
    expectedOpeningBalance: 498867.67,
    expectedTrailingBalance: 536435.79,
    expectedStartDate: "2025-10-07",
    expectedEndDate: "2026-01-07",
    minConfidence: 90,
  },
  {
    label: "BPI Dependent",
    relativePath: "Actual SOAs/BPI/BPI Savings/SA20260110 Q4 2025 Dependent.pdf",
    institution: "BPI",
    accountName: "BPI 7005",
    accountNumber: "0299097005",
    accountType: "bank",
    minRows: 18,
    exactRows: 18,
    expectedOpeningBalance: 392185.25,
    expectedTrailingBalance: 21678.26,
    expectedStartDate: "2025-10-07",
    expectedEndDate: "2026-01-07",
    minConfidence: 90,
  },
  {
    label: "CIMB Mixed Pages",
    relativePath: "Samples/CIMB/840624470-CIMB-Statement-of-account-pdf.pdf",
    institution: "CIMB",
    accountName: "CIMB 1971",
    accountNumber: "20867602571971",
    accountType: "bank",
    minRows: 7,
    expectedTrailingBalance: 4294.66,
    minConfidence: 85,
  },
  {
    label: "CIMB GSave October 2025",
    relativePath: "Samples/CIMB/927858715-CIMB-Statement-of-Account-20251004-155400-0000.pdf",
    institution: "CIMB",
    accountName: "CIMB 1091",
    accountNumber: "30865602571091",
    accountType: "bank",
    minRows: 7,
    expectedTrailingBalance: 4294.66,
    expectedStartDate: "2025-05-01",
    expectedEndDate: "2025-06-10",
    minConfidence: 85,
  },
  {
    label: "CIMB GSave November 2025",
    relativePath: "Samples/CIMB/947472452-CIMB-Statement-of-Account-20251112-141921-0000.pdf",
    institution: "CIMB",
    accountName: "CIMB 1091",
    accountNumber: "30865602571091",
    accountType: "bank",
    minRows: 7,
    expectedTrailingBalance: 4294.66,
    minConfidence: 85,
  },
  {
    label: "GCash",
    relativePath: "Actual SOAs/GCash/GCash Statement Oct 2025 - Mar 2026_unlocked.pdf",
    institution: "GCash",
    accountName: "GCash 9926",
    accountNumber: "09173009926",
    accountType: "wallet",
    minRows: 100,
    exactRows: 163,
    expectedOpeningBalance: 25882.06,
    expectedTrailingBalance: 36331.94,
    expectedStartDate: "2025-10-01",
    expectedEndDate: "2026-04-15",
    minConfidence: 80,
    expectParsedAccountName: false,
  },
  {
    label: "RCBC Savings Sample",
    relativePath: "Samples/RCBC/879866459-Statement.pdf",
    institution: "RCBC",
    accountName: "RCBC Savings 5080",
    accountNumber: "7591325080",
    accountType: "bank",
    minRows: 20,
    exactRows: 22,
    expectedOpeningBalance: 0.54,
    expectedTrailingBalance: 0.54,
    expectedStartDate: "2025-04-01",
    expectedEndDate: "2025-04-30",
    minConfidence: 90,
  },
  {
    label: "RCBC Visa Gold Sample",
    relativePath: "Samples/RCBC/728919236-Acfroga47rrwerw7v8xwjcyqjxnpvi1hv5climj2qkpdzsqlabwmr51pzid4mt-Ao-Swizece4lt1ycaubzsilpqnzohhyzqxuv2cfbldosfajyekhfijmkceso8yzz1vgjmwntbprxb5ribspge-G.pdf",
    institution: "RCBC",
    accountName: "RCBC 2006",
    accountNumber: "4293820865522006",
    accountType: "credit_card",
    minRows: 4,
    exactRows: 4,
    expectedOpeningBalance: 5244.14,
    expectedTrailingBalance: 12359.11,
    expectedStartDate: "2024-04-03",
    expectedEndDate: "2024-04-29",
    minConfidence: 90,
  },
  {
    label: "RCBC October 2025",
    relativePath: "Actual SOAs/RCBC/eStatement_VISA PLATINUM_OCT 22 2025_1014_unlocked.pdf",
    institution: "RCBC",
    accountName: "RCBC 1014",
    accountNumber: "4279341138681014",
    accountType: "credit_card",
    minRows: 40,
    exactRows: 53,
    expectedOpeningBalance: 8994.44,
    expectedTrailingBalance: 37246.38,
    expectedStartDate: "2025-10-22",
    expectedEndDate: "2025-11-17",
    minConfidence: 90,
  },
  {
    label: "RCBC November 2025",
    relativePath: "Actual SOAs/RCBC/eStatement_VISA PLATINUM_NOV 23 2025_1014_unlocked.pdf",
    institution: "RCBC",
    accountName: "RCBC 1014",
    accountNumber: "4279341138681014",
    accountType: "credit_card",
    minRows: 1,
    minConfidence: 90,
  },
  {
    label: "RCBC December 2025",
    relativePath: "Actual SOAs/RCBC/eStatement_VISA PLATINUM_DEC 22 2025_1014_unlocked.pdf",
    institution: "RCBC",
    accountName: "RCBC 1014",
    accountNumber: "4279341138681014",
    accountType: "credit_card",
    minRows: 1,
    minConfidence: 90,
  },
  {
    label: "RCBC January 2026",
    relativePath: "Actual SOAs/RCBC/eStatement_VISA PLATINUM_JAN 22 2026_1014_unlocked.pdf",
    institution: "RCBC",
    accountName: "RCBC 1014",
    accountNumber: "4279341138681014",
    accountType: "credit_card",
    minRows: 1,
    minConfidence: 90,
  },
  {
    label: "RCBC February 2026",
    relativePath: "Actual SOAs/RCBC/eStatement_VISA PLATINUM_FEB 22 2026_1014_unlocked.pdf",
    institution: "RCBC",
    accountName: "RCBC 1014",
    accountNumber: "4279341138681014",
    accountType: "credit_card",
    minRows: 1,
    minConfidence: 90,
  },
  {
    label: "RCBC March 2026",
    relativePath: "Actual SOAs/RCBC/eStatement_VISA PLATINUM_MAR 22 2026_1014_unlocked.pdf",
    institution: "RCBC",
    accountName: "RCBC 1014",
    accountNumber: "4279341138681014",
    accountType: "credit_card",
    minRows: 1,
    minConfidence: 90,
  },
  {
    label: "UnionBank November 2025",
    relativePath: "Actual SOAs/UnionBank/UnionBank SOA November 2025_unlocked.pdf",
    institution: "UnionBank",
    accountName: "UnionBank 8037",
    accountNumber: "109678428037",
    accountType: "bank",
    minRows: 5,
    exactRows: 5,
    expectedEndDate: "2026-04-14",
    minConfidence: 85,
  },
  {
    label: "UnionBank December 2025",
    relativePath: "Actual SOAs/UnionBank/UnionBank SOA December 2025_unlocked.pdf",
    institution: "UnionBank",
    accountName: "UnionBank 8037",
    accountNumber: "109678428037",
    accountType: "bank",
    minRows: 1,
    minConfidence: 85,
  },
  {
    label: "UnionBank January 2026",
    relativePath: "Actual SOAs/UnionBank/UnionBank SOA January 2026_unlocked.pdf",
    institution: "UnionBank",
    accountName: "UnionBank 8037",
    accountNumber: "109678428037",
    accountType: "bank",
    minRows: 1,
    minConfidence: 85,
  },
  {
    label: "UnionBank February 2026",
    relativePath: "Actual SOAs/UnionBank/UnionBank SOA February 2026_unlocked.pdf",
    institution: "UnionBank",
    accountName: "UnionBank 8037",
    accountNumber: "109678428037",
    accountType: "bank",
    minRows: 1,
    minConfidence: 85,
  },
  {
    label: "UnionBank March 2026",
    relativePath: "Actual SOAs/UnionBank/UnionBank SOA March 2026_unlocked.pdf",
    institution: "UnionBank",
    accountName: "UnionBank 8037",
    accountNumber: "109678428037",
    accountType: "bank",
    minRows: 1,
    minConfidence: 85,
  },
];

const formatMoney = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  return value.toFixed(2);
};

const approxEqual = (actual: number | null | undefined, expected: number, tolerance = 0.01) => {
  return typeof actual === "number" && Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
};

const parseDatePrefix = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  return value.slice(0, 10);
};

const main = async () => {
  const rootArgIndex = process.argv.indexOf("--root");
  const root =
    rootArgIndex >= 0 && process.argv[rootArgIndex + 1]
      ? process.argv[rootArgIndex + 1]
      : process.env.CLOVER_STATEMENT_ROOT || defaultStatementRoot;

  const importFileTextModule = await import("../lib/import-file-text.server");
  const dataEngine = await import("../lib/data-engine");
  const parser = await import("../lib/import-parser");

  const readUploadedFileText = importFileTextModule.readUploadedFileText as (
    file: { name?: string; type?: string; arrayBuffer: () => Promise<ArrayBuffer | SharedArrayBuffer> },
    password?: string
  ) => Promise<string>;
  const detectStatementMetadataFromText = dataEngine.detectStatementMetadataFromText as (text: string) => {
    institution: string | null;
    accountNumber: string | null;
    accountName: string | null;
    openingBalance: number | null;
    endingBalance: number | null;
    startDate: string | null;
    endDate: string | null;
    confidence: number;
  };
  const inferAccountTypeFromStatement = parser.inferAccountTypeFromStatement as (
      institution?: string | null,
      accountName?: string | null,
      fallback?: ImportedAccountType
    ) => ImportedAccountType;

  const failures: string[] = [];

  for (const fixture of fixtures) {
    const absolutePath = join(root, fixture.relativePath);

    let bytes: Buffer;
    try {
      bytes = await readFile(absolutePath);
    } catch {
      failures.push(`[${fixture.label}] missing file: ${absolutePath}`);
      continue;
    }

    const fileName = basename(absolutePath);
    const text = await readUploadedFileText({
      name: fileName,
      type: "application/pdf",
      arrayBuffer: async () => {
        const copy = new Uint8Array(bytes.length);
        copy.set(bytes);
        return copy.buffer as ArrayBuffer;
      },
    });

    const metadata = detectStatementMetadataFromText(text);
    const rows = parser.parseImportText(text, fileName, "application/pdf", {
      institution: metadata.institution,
      accountName: metadata.accountName,
      accountNumber: metadata.accountNumber,
    });
    const trailingBalance = parser.getTrailingBalanceFromParsedRows(rows);
    const accountType = inferAccountTypeFromStatement(metadata.institution, metadata.accountName, "bank");

    const errors: string[] = [];

    if (metadata.institution !== fixture.institution) {
      errors.push(`institution expected ${fixture.institution} but got ${metadata.institution ?? "null"}`);
    }
    if (metadata.accountName !== fixture.accountName) {
      errors.push(`accountName expected ${fixture.accountName} but got ${metadata.accountName ?? "null"}`);
    }
    if (metadata.accountNumber !== fixture.accountNumber) {
      errors.push(`accountNumber expected ${fixture.accountNumber} but got ${metadata.accountNumber ?? "null"}`);
    }
    if (accountType !== fixture.accountType) {
      errors.push(`accountType expected ${fixture.accountType} but got ${accountType}`);
    }
    if (rows.length < fixture.minRows) {
      errors.push(`rowCount expected at least ${fixture.minRows} but got ${rows.length}`);
    }
    if (fixture.exactRows !== undefined && rows.length !== fixture.exactRows) {
      errors.push(`rowCount expected ${fixture.exactRows} but got ${rows.length}`);
    }
    if (typeof fixture.minConfidence === "number" && metadata.confidence < fixture.minConfidence) {
      errors.push(`confidence expected at least ${fixture.minConfidence} but got ${metadata.confidence}`);
    }
    if (fixture.expectedOpeningBalance !== undefined && !approxEqual(metadata.openingBalance, fixture.expectedOpeningBalance)) {
      errors.push(`openingBalance expected ${formatMoney(fixture.expectedOpeningBalance)} but got ${formatMoney(metadata.openingBalance)}`);
    }
    const derivedEndingBalance = metadata.endingBalance ?? trailingBalance;
    if (fixture.expectedTrailingBalance !== undefined && !approxEqual(derivedEndingBalance, fixture.expectedTrailingBalance)) {
      errors.push(`endingBalance expected ${formatMoney(fixture.expectedTrailingBalance)} but got ${formatMoney(derivedEndingBalance)}`);
    }
    if (fixture.expectedStartDate && parseDatePrefix(metadata.startDate) !== fixture.expectedStartDate) {
      errors.push(`startDate expected ${fixture.expectedStartDate} but got ${parseDatePrefix(metadata.startDate) ?? "null"}`);
    }
    if (fixture.expectedEndDate && parseDatePrefix(metadata.endDate) !== fixture.expectedEndDate) {
      errors.push(`endDate expected ${fixture.expectedEndDate} but got ${parseDatePrefix(metadata.endDate) ?? "null"}`);
    }
    if (fixture.expectParsedAccountName !== false && !rows.some((row) => row.accountName === fixture.accountName)) {
      errors.push("parsed rows do not include the expected account name");
    }
    if (!rows.some((row) => row.institution === fixture.institution)) {
      errors.push("parsed rows do not include the expected institution");
    }
    if (fixture.expectedTrailingBalance !== undefined && rows.length > 0) {
      const lastRow = rows[rows.length - 1];
      const lastBalance = lastRow.rawPayload?.balance;
      if (typeof lastBalance === "number" && !approxEqual(lastBalance, fixture.expectedTrailingBalance)) {
        errors.push(`last row balance expected ${formatMoney(fixture.expectedTrailingBalance)} but got ${formatMoney(lastBalance)}`);
      }
    }

    if (errors.length > 0) {
      failures.push(`[${fixture.label}] ${errors.join("; ")}`);
      continue;
    }

    console.log(
      `[PASS] ${fixture.label} | ${fixture.accountName} | ${rows.length} rows | ${accountType} | opening ${formatMoney(metadata.openingBalance)} | trailing ${formatMoney(trailingBalance)}`
    );
  }

  if (failures.length > 0) {
    throw new Error(`Parser regression checks failed:\n${failures.map((entry) => `- ${entry}`).join("\n")}`);
  }

  console.log(`Parser regression checks passed for ${fixtures.length} fixtures.`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
