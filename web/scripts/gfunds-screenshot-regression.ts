import assert from "node:assert/strict";
import { detectStatementMetadata, parseImportText } from "@/lib/import-parser";

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

console.log("[PASS] GFunds screenshot parser surfaces investment accounts and visible transaction rows.");
