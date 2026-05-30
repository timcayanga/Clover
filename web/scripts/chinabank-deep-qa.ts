import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { detectStatementMetadataFromText } from "@/lib/data-engine";
import { readUploadedFileText } from "@/lib/import-file-text.server";
import { parseImportText } from "@/lib/import-parser";
import { prisma } from "@/lib/prisma";

const webRoot = basename(process.cwd()) === "web" ? process.cwd() : join(process.cwd(), "web");
loadEnvConfig(webRoot);

const sampleRoot =
  process.env.CLOVER_CHINABANK_SAMPLE_ROOT ??
  "/Users/TimCayanga1/Documents/Bank Statements/Samples/China Bank";

type ExpectedChinaBankTransaction = {
  date: string;
  transactionName: string;
  normalizedName: string;
  description: string | null;
  amount: number;
  type: "Debit" | "Credit";
  categoryName: string;
};

type ExpectedChinaBankStatement = {
  bankName: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  openingBalance: number;
  endingBalance: number;
  statementStartDate: string;
  statementEndDate: string;
  confidence: number;
  transactions: ExpectedChinaBankTransaction[];
};

const readPdfText = async (path: string) => {
  const bytes = await readFile(path);
  return readUploadedFileText({
    name: basename(path),
    type: "application/pdf",
    arrayBuffer: async () => {
      const copy = new Uint8Array(bytes.length);
      copy.set(bytes);
      return copy.buffer as ArrayBuffer;
    },
  });
};

const getExpectedCheckNo = (description: string | null) =>
  description?.match(/\bCheck No\.\s*(\d+)\b/i)?.[1] ?? null;

const main = async () => {
  const pdfPath = join(sampleRoot, "860976948-CHINA-BANK-STATEMENT.pdf");
  const expectedStatements = await Promise.all(
    ["July", "August"].map(async (month) => {
      const path = join(
        sampleRoot,
        "chinabank_only_clover_json",
        `860976948-CHINA-BANK-STATEMENT-${month}-2024.json`
      );
      return JSON.parse(await readFile(path, "utf8")) as ExpectedChinaBankStatement;
    })
  );
  const expectedRows = expectedStatements.flatMap((statement) => statement.transactions);
  const text = await readPdfText(pdfPath);
  const metadata = detectStatementMetadataFromText(text);
  const rows = parseImportText(text, basename(pdfPath), "application/pdf", {
    institution: metadata.institution,
    accountName: metadata.accountName,
    accountNumber: metadata.accountNumber,
  });

  assert.equal(metadata.institution, "China Bank", "metadata should identify China Bank.");
  assert.equal(metadata.accountNumber, "1407-00-00679-0", "metadata should preserve formatted account number.");
  assert.equal(
    metadata.accountName,
    "CELERINO BAUTISTA SUSANO JR. DBA A.J. SUSANO SURPLUS AND CONSTRUCTION SERVICES",
    "metadata should preserve wrapped account holder name."
  );
  assert.equal(metadata.openingBalance, 1_983_467.16, "metadata should use first statement opening balance.");
  assert.equal(metadata.endingBalance, 2_914_645.28, "metadata should use final statement ending balance.");
  assert.equal(rows.length, expectedRows.length, "parser should return all July and August rows.");

  const rowMismatches: string[] = [];
  for (const [index, expected] of expectedRows.entries()) {
    const row = rows[index];
    assert.ok(row, `row ${index + 1} should exist.`);
    const expectedType = expected.type === "Debit" ? "expense" : "income";
    const checks = [
      ["date", row.date, expected.date],
      ["merchantRaw", row.merchantRaw, expected.transactionName],
      ["merchantClean", row.merchantClean, expected.normalizedName],
      ["amount", Number(row.amount).toFixed(2), expected.amount.toFixed(2)],
      ["type", row.type, expectedType],
      ["categoryName", row.categoryName, expected.categoryName],
    ] as const;

    for (const [field, actual, expectedValue] of checks) {
      if (actual !== expectedValue) {
        rowMismatches.push(
          `row ${index + 1} ${field}: ${actual ?? "missing"} != ${expectedValue ?? "missing"} ` +
            `(${row.date ?? "no date"} ${row.merchantRaw ?? "no merchant"} ${row.amount ?? "no amount"}) ` +
            `line="${String((row.rawPayload as Record<string, unknown> | undefined)?.line ?? "").slice(0, 240)}"`
        );
      }
    }

    const rawPayload = row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
      ? row.rawPayload as Record<string, unknown>
      : {};
    assert.equal(rawPayload.bank, "China Bank", `row ${index + 1} should keep source bank in raw payload.`);
    assert.equal(rawPayload.kind, "china_bank_statement_transaction", `row ${index + 1} should keep raw payload kind.`);
    const actualReference = typeof rawPayload.reference === "string" ? rawPayload.reference : null;
    const expectedReference = getExpectedCheckNo(expected.description);
    if (actualReference !== expectedReference) {
      rowMismatches.push(
        `row ${index + 1} reference: ${actualReference ?? "missing"} != ${expectedReference ?? "missing"}`
      );
    }
    if (row.institution !== "China Bank") {
      rowMismatches.push(`row ${index + 1} institution: ${row.institution ?? "missing"} != China Bank`);
    }
    if (row.accountNumber !== "1407-00-00679-0") {
      rowMismatches.push(`row ${index + 1} accountNumber: ${row.accountNumber ?? "missing"} != 1407-00-00679-0`);
    }
  }

  assert.equal(rowMismatches.length, 0, `row mismatches:\n${rowMismatches.slice(0, 80).join("\n")}`);

  const julyRows = rows.filter((row) => row.date?.startsWith("2024-07-"));
  const augustRows = rows.filter((row) => row.date?.startsWith("2024-08-"));
  const categoryCounts = rows.reduce<Record<string, number>>((counts, row) => {
    const key = `${row.type}:${row.categoryName}`;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});

  assert.equal(julyRows.length, 49, "China Bank July row count should match expected output.");
  assert.equal(augustRows.length, 55, "China Bank August row count should match expected output.");
  assert.equal(categoryCounts["expense:Financial"], 42, "Financial debit count should match expected output.");
  assert.equal(categoryCounts["expense:Cash & ATM"], 16, "Cash withdrawal count should match expected output.");
  assert.equal(categoryCounts["income:Income"], 45, "Income credit count should match expected output.");
  assert.equal(categoryCounts["income:Financial"], 1, "Credit Memo financial count should match expected output.");

  console.log(
    `[PASS] China Bank deep QA | ${rows.length} rows | ${julyRows.length} July / ${augustRows.length} August | account ${metadata.accountNumber}`
  );
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => null);
    process.exit(process.exitCode ?? 0);
  });
