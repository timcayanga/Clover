import assert from "node:assert/strict";
import { detectStatementMetadata, parseImportText } from "@/lib/import-parser";
import { buildGfundsScreenshotFallbackText } from "@/lib/gfunds-screenshot-samples";
import {
  deriveStatementFallbackAccountName,
  guessStatementIdentity,
  resolveMobileWalletIdentityFromParsedRows,
} from "@/lib/import-statement-identity";

const samples = [
  {
    fileName: "IMG_1415.PNG",
    text: `Transaction History
ATRAM Philippine Equity Smart Index Fund
Sell Order Completed
April 23, 2025
-PHP 28,414.89
Philippine Stock Index Fund (Units)
Sell Order Completed
April 23, 2025
-PHP 20,063.18
ATRAM Global Technology Feeder Fund
Sell Order Completed
April 24, 2025
-PHP 2,854.14
ATRAM Peso Money Market Fund
Sell Order Completed
April 22, 2025
-PHP 26,804.31
ATRAM Medium Term Peso Bond Fund
Sell Order Completed
April 23, 2025
-PHP 4,342.40`,
    expectedRows: 5,
  },
  {
    fileName: "IMG_1416.PNG",
    text: `Transaction History
ATRAM Global Consumer Trends Feeder Fund
Sell Order Completed
April 24, 2025
-PHP 16,559.45
ATRAM Philippine Equity Smart Index Fund
Sell Order Completed
December 27, 2024
-PHP 10,144.61
ATRAM Medium Term Peso Bond Fund
Buy Order Completed
August 1, 2022
+PHP 4,000.00
ATRAM Philippine Equity Smart Index Fund
Buy Order Completed
July 11, 2022
+PHP 20,000.00
Philippine Stock Index Fund (Units)
Buy Order Completed
July 11, 2022
+PHP 20,000.00`,
    expectedRows: 5,
  },
  {
    fileName: "IMG_1417.PNG",
    text: `Transaction History
ATRAM Peso Money Market Fund
Sell Order Completed
August 24, 2021
-PHP 1,000.00
ATRAM Peso Money Market Fund
Buy Order Completed
August 13, 2021
+PHP 10,000.00
ATRAM Global Consumer Trends Feeder Fund
Buy Order Completed
August 13, 2021
+PHP 20,000.00
ATRAM Philippine Equity Smart Index Fund
Buy Order Completed
August 13, 2021
+PHP 15,000.00
ATRAM Peso Money Market Fund
Buy Order Completed
June 7, 2021
+PHP 15,000.00`,
    expectedRows: 5,
  },
  {
    fileName: "IMG_1418.PNG",
    text: `Transaction History
ATRAM Global Consumer Trends Feeder Fund
Buy Order Completed
May 20, 2021
+PHP 1,500.00
ATRAM Philippine Equity Smart Index Fund
Buy Order Completed
May 10, 2021
+PHP 1,500.00
ATRAM Global Technology Feeder Fund
Buy Order Completed
May 10, 2021
+PHP 2,000.00
ATRAM Global Consumer Trends Feeder Fund
Buy Order Completed
April 16, 2021
+PHP 1,000.00
ATRAM Philippine Equity Smart Index Fund
Buy Order Completed
April 16, 2021
+PHP 1,000.00`,
    expectedRows: 5,
  },
] as const;

const allRows = samples.flatMap((sample) => {
  const metadata = detectStatementMetadata(sample.text, sample.fileName);
  assert.equal(metadata?.institution, "ATRAM", `${sample.fileName} should detect ATRAM metadata.`);
  assert.equal(metadata?.accountType, "investment", `${sample.fileName} should detect an investment import.`);

  const rows = parseImportText(sample.text, sample.fileName, "image/png", {
    institution: metadata?.institution ?? "ATRAM",
    accountName: metadata?.accountName ?? "GFunds Investments",
    accountNumber: metadata?.accountNumber ?? null,
  });

  assert.equal(rows.length, sample.expectedRows, `${sample.fileName} visible row count mismatch.`);
  assert.ok(rows.every((row) => row.institution === "ATRAM"), `${sample.fileName} should keep ATRAM as institution.`);
  assert.ok(rows.every((row) => row.categoryName === "Investments"), `${sample.fileName} rows should map to Investments.`);
  assert.ok(
    rows.every((row) => row.accountName && !/^IMG_/i.test(String(row.accountName))),
    `${sample.fileName} should never surface IMG_* as the account name.`
  );

  return rows;
});

assert.equal(allRows.length, 20, "GFunds training bundle should surface 20 fully visible transactions.");

const uniqueFunds = new Set(allRows.map((row) => row.accountName));
assert.deepEqual(
  [...uniqueFunds].sort(),
  [
    "ATRAM Global Consumer Trends Feeder Fund",
    "ATRAM Global Technology Feeder Fund",
    "ATRAM Medium Term Peso Bond Fund",
    "ATRAM Peso Money Market Fund",
    "ATRAM Philippine Equity Smart Index Fund",
    "Philippine Stock Index Fund (Units)",
  ],
  "GFunds screenshots should surface the 6 visible investment accounts."
);

const buyRows = allRows.filter((row) => row.description?.includes("Buy Order Completed"));
const sellRows = allRows.filter((row) => row.description?.includes("Sell Order Completed"));
assert.ok(buyRows.length > 0 && buyRows.every((row) => row.type === "expense"), "Buy orders should map to investment expenses.");
assert.ok(sellRows.length > 0 && sellRows.every((row) => row.type === "income"), "Sell orders should map to investment income.");
assert.ok(
  allRows.every((row) => {
    const payload = row.rawPayload && typeof row.rawPayload === "object" ? (row.rawPayload as Record<string, unknown>) : null;
    return payload?.source === "gfunds_mobile_screenshot" && payload?.kind === "gfunds_mobile_screenshot";
  }),
  "GFunds rows should identify themselves as mobile screenshot imports for overlap collapse."
);

const fingerprintMatchedFallback = buildGfundsScreenshotFallbackText({
  fileName: "renamed-gfunds-export.png",
  fileFingerprint: "6110e688401f1a5eba1bccc799af93ecce5b9ed38c34c30cdd9cb502957f388d",
});
assert.ok(
  fingerprintMatchedFallback?.includes("ATRAM Global Technology Feeder Fund"),
  "Known GFunds screenshots should still resolve through file fingerprints after renaming."
);

const noisyOcrText = `Transaction History
ATRAM Global Consumer Trends Feeder Fund +PHP 1,500.00
Buy Order Completed May 20, 2021
ATRAM Philippine Equity Smart Index Fund +PHP 1,500.00
Buy Order Completed May 10, 2021`;
const noisyRows = parseImportText(noisyOcrText, "renamed-gfunds-export.png", "image/png", {
  institution: "ATRAM",
  accountName: "GFunds Investments",
  accountNumber: null,
});
assert.equal(noisyRows.length, 2, "The GFunds parser should tolerate combined OCR lines for fund, status, date, and amount.");
assert.ok(
  noisyRows.every((row) => row.accountName && !/^IMG_/i.test(String(row.accountName))),
  "Noisy OCR parses should still surface fund names instead of screenshot file names."
);

const collapsedOcrText = `Transaction History
ATRAM Global Technology Feeder Fund Sell Order Completed April 24, 2025 -PHP 2,854.14
ATRAM Peso Money Market Fund
Buy Order Completed
June 7, 2021 +PHP 15,000.00`;
const collapsedRows = parseImportText(collapsedOcrText, "renamed-gfunds-export.png", "image/png", {
  institution: "ATRAM",
  accountName: "GFunds Investments",
  accountNumber: null,
});
assert.equal(
  collapsedRows.length,
  2,
  "The GFunds parser should tolerate fully collapsed rows and date-plus-amount OCR lines."
);
assert.deepEqual(
  collapsedRows.map((row) => ({
    name: row.accountName,
    date: row.date,
    amount: row.amount,
    type: row.type,
  })),
  [
    {
      name: "ATRAM Global Technology Feeder Fund",
      date: "2025-04-24",
      amount: "2854.14",
      type: "income",
    },
    {
      name: "ATRAM Peso Money Market Fund",
      date: "2021-06-07",
      amount: "15000.00",
      type: "expense",
    },
  ],
  "Collapsed OCR parses should still preserve fund identity, dates, and signed amounts."
);

const screenshotIdentity = resolveMobileWalletIdentityFromParsedRows(allRows as Array<Record<string, unknown>>);
assert.deepEqual(
  screenshotIdentity,
  {
    accountName: "ATRAM Investments",
    institution: "ATRAM",
    accountType: "investment",
    accountNumber: null,
  },
  "GFunds screenshot rows should resolve to an investment screenshot identity."
);

assert.deepEqual(guessStatementIdentity("GFunds export.png"), {
  accountName: "ATRAM Investments",
  institution: "ATRAM",
  accountNumber: null,
  accountType: "investment",
});

assert.equal(
  deriveStatementFallbackAccountName("IMG_1415.PNG", "ATRAM", null, "investment"),
  "ATRAM Investments",
  "Generic investment screenshots should fall back to an investment-aware account label."
);

console.log("[PASS] GFunds screenshot parser surfaces investment accounts and visible transaction rows.");
