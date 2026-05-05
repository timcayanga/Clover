import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { readUploadedFileText } from "@/lib/import-file-text.server";
import {
  getTrailingBalanceFromParsedRows,
  inferAccountTypeFromStatement,
  parseGenericStatementMetadata,
  parseImportTextGenericOnly,
} from "@/lib/import-parser";

type ExpectedTransaction = {
  date?: string | null;
  transactionName?: string | null;
  normalizedName?: string | null;
  categoryName?: string | null;
  amount?: number | string | null;
  type?: string | null;
};

type ExpectedFixture = {
  bankName?: string | null;
  accountNumber?: string | null;
  accountName?: string | null;
  accountType?: string | null;
  openingBalance?: number | null;
  endingBalance?: number | null;
  paymentDueDate?: string | null;
  paymentAmountDue?: number | null;
  statementStartDate?: string | null;
  statementEndDate?: string | null;
  transactions?: ExpectedTransaction[];
};

type FixturePair = {
  bankFolder: string;
  pdfPath: string;
  jsonPath: string;
};

const samplesRoot = "/Users/TimCayanga1/Documents/Bank Statements/Samples";

const preferredJsonDirs = [
  "aub_only_clover_json",
  "bdo_only_clover_json",
  "bpi_only_clover_json",
  "cimb_only_clover_json",
  "chinabank_only_clover_json",
  "eastwest_only_clover_json",
  "gcash_only_clover_json",
  "seabank_maribank_merged_clover_json",
  "metrobank_only_clover_json",
  "pnb_only_clover_json",
  "rcbc_only_clover_json",
  "securitybank_only_clover_json",
  "unionbank_only_clover_json",
];

const normalizeStem = (value: string) =>
  value
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "");

const approxEqual = (a: number | null | undefined, b: number | null | undefined, tolerance = 0.01) => {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) <= tolerance;
};

const dateOnly = (value?: string | null) => (value ? value.slice(0, 10) : null);

const parseAmount = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[^0-9.-]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const listFiles = async (dir: string) => {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
};

const findJsonDirectory = async (bankDir: string) => {
  const entries = await readdir(bankDir, { withFileTypes: true });
  for (const name of preferredJsonDirs) {
    const found = entries.find((entry) => entry.isDirectory() && entry.name === name);
    if (found) return path.join(bankDir, found.name);
  }

  const fallback = entries.find((entry) => entry.isDirectory() && entry.name.toLowerCase().includes("json"));
  return fallback ? path.join(bankDir, fallback.name) : null;
};

const findJsonMatch = async (jsonDir: string, pdfName: string) => {
  const jsonFiles = (await listFiles(jsonDir)).filter((name) => name.endsWith(".json"));
  const exact = jsonFiles.find((name) => normalizeStem(name) === normalizeStem(pdfName));
  if (exact) return path.join(jsonDir, exact);

  const pdfStem = normalizeStem(pdfName);
  const byContainment = jsonFiles.find((name) => {
    const jsonStem = normalizeStem(name);
    return jsonStem.includes(pdfStem) || pdfStem.includes(jsonStem);
  });
  return byContainment ? path.join(jsonDir, byContainment) : null;
};

const discoverPairs = async (): Promise<FixturePair[]> => {
  const bankDirs = (await readdir(samplesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name !== "AAA Generic")
    .map((entry) => path.join(samplesRoot, entry.name));

  const pairs: FixturePair[] = [];
  for (const bankDir of bankDirs) {
    const jsonDir = await findJsonDirectory(bankDir);
    if (!jsonDir) continue;

    const files = await listFiles(bankDir);
    const pdfFiles = files.filter((name) => name.toLowerCase().endsWith(".pdf"));
    for (const pdfName of pdfFiles) {
      const jsonPath = await findJsonMatch(jsonDir, pdfName);
      if (!jsonPath) continue;
      pairs.push({
        bankFolder: path.basename(bankDir),
        pdfPath: path.join(bankDir, pdfName),
        jsonPath,
      });
    }
  }

  return pairs.sort((a, b) => a.pdfPath.localeCompare(b.pdfPath));
};

const loadFixture = async (jsonPath: string) => JSON.parse(await readFile(jsonPath, "utf8")) as ExpectedFixture;

const comparePair = async (pair: FixturePair) => {
  const expected = await loadFixture(pair.jsonPath);
  const bytes = await readFile(pair.pdfPath);
  const fileName = path.basename(pair.pdfPath);

  const start = Date.now();
  const text = await readUploadedFileText({
    name: fileName,
    type: "application/pdf",
    arrayBuffer: async () => {
      const copy = new Uint8Array(bytes.length);
      copy.set(bytes);
      return copy.buffer as ArrayBuffer;
    },
  });
  const textMs = Date.now() - start;

  const parseStart = Date.now();
  const metadata = parseGenericStatementMetadata(text, {});
  const rows = parseImportTextGenericOnly(text, fileName, "application/pdf", {
    institution: metadata?.institution,
    accountName: metadata?.accountName,
    accountNumber: metadata?.accountNumber,
  });
  const parseMs = Date.now() - parseStart;

  const expectedRows = expected.transactions ?? [];
  const derivedEndingBalance = metadata?.endingBalance ?? getTrailingBalanceFromParsedRows(rows);
  const derivedType = inferAccountTypeFromStatement(metadata?.institution, metadata?.accountName, "bank");

  const rowDates = rows.map((row) => dateOnly(row.date));
  const expectedDates = expectedRows.map((row) => dateOnly(row.date ?? null));
  const matchingDateCount = expectedDates.filter((date) => date && rowDates.includes(date)).length;

  const firstExpected = expectedRows[0];
  const firstActual = rows[0];

  const issues: string[] = [];
  if ((expected.bankName ?? null) !== (metadata?.institution ?? null)) {
    issues.push(`institution: expected ${expected.bankName ?? "null"} got ${metadata?.institution ?? "null"}`);
  }
  if ((expected.accountNumber ?? null) !== (metadata?.accountNumber ?? null)) {
    issues.push(`accountNumber: expected ${expected.accountNumber ?? "null"} got ${metadata?.accountNumber ?? "null"}`);
  }
  if ((expected.accountName ?? null) !== (metadata?.accountName ?? null)) {
    issues.push(`accountName: expected ${expected.accountName ?? "null"} got ${metadata?.accountName ?? "null"}`);
  }
  if ((expected.accountType ?? null) !== derivedType) {
    issues.push(`accountType: expected ${expected.accountType ?? "null"} got ${derivedType}`);
  }
  if (!approxEqual(expected.openingBalance ?? null, metadata?.openingBalance ?? null)) {
    issues.push(`openingBalance: expected ${expected.openingBalance ?? "null"} got ${metadata?.openingBalance ?? "null"}`);
  }
  if (!approxEqual(expected.endingBalance ?? null, derivedEndingBalance)) {
    issues.push(`endingBalance: expected ${expected.endingBalance ?? "null"} got ${derivedEndingBalance ?? "null"}`);
  }
  if (dateOnly(expected.statementStartDate) !== dateOnly(metadata?.startDate)) {
    issues.push(`startDate: expected ${expected.statementStartDate ?? "null"} got ${dateOnly(metadata?.startDate) ?? "null"}`);
  }
  if (dateOnly(expected.statementEndDate) !== dateOnly(metadata?.endDate)) {
    issues.push(`endDate: expected ${expected.statementEndDate ?? "null"} got ${dateOnly(metadata?.endDate) ?? "null"}`);
  }
  if ((expectedRows.length || 0) !== rows.length) {
    issues.push(`rowCount: expected ${expectedRows.length} got ${rows.length}`);
  }
  if (matchingDateCount < Math.max(1, Math.floor(expectedRows.length * 0.6))) {
    issues.push(`dateCoverage: matched ${matchingDateCount}/${expectedRows.length}`);
  }
  if (firstExpected && firstActual) {
    if (dateOnly(firstExpected.date) !== dateOnly(firstActual.date)) {
      issues.push(`firstRowDate: expected ${firstExpected.date ?? "null"} got ${firstActual.date ?? "null"}`);
    }
    if (!approxEqual(parseAmount(firstExpected.amount), parseAmount(firstActual.amount))) {
      issues.push(`firstRowAmount: expected ${firstExpected.amount ?? "null"} got ${firstActual.amount ?? "null"}`);
    }
  }

  return {
    ...pair,
    expected,
    metadata,
    rows,
    textMs,
    parseMs,
    matchingDateCount,
    issues,
  };
};

const main = async () => {
  const pairs = await discoverPairs();
  if (pairs.length === 0) {
    throw new Error("No PDF/JSON pairs discovered under Samples/");
  }

  const failures: Array<{ label: string; issues: string[] }> = [];
  let totalTextMs = 0;
  let totalParseMs = 0;

  for (const pair of pairs) {
    const result = await comparePair(pair);
    totalTextMs += result.textMs;
    totalParseMs += result.parseMs;
    const label = `${result.bankFolder}/${path.basename(result.pdfPath)}`;

    if (result.issues.length > 0) {
      failures.push({ label, issues: result.issues });
      console.log(`[FAIL] ${label}`);
      for (const issue of result.issues) {
        console.log(`  - ${issue}`);
      }
      continue;
    }

    console.log(
      `[PASS] ${label} | ${result.rows.length} rows | text ${result.textMs}ms | parse ${result.parseMs}ms | ${result.metadata?.institution ?? "Unknown"} ${result.metadata?.accountNumber ?? ""}`.trim()
    );
  }

  console.log(`\nScanned ${pairs.length} fixtures | text ${totalTextMs}ms | parse ${totalParseMs}ms`);

  if (failures.length > 0) {
    console.error(`\n${failures.length} fixture(s) failed generic-only regression.`);
    process.exitCode = 1;
  }
};

void main();
