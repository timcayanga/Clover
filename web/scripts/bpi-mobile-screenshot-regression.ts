import assert from "node:assert/strict";
import { detectStatementMetadata, parseImportText } from "@/lib/import-parser";

const inferMostRecentApplicableYear = (monthIndex: number, day: number) => {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const todayUtc = Date.UTC(currentYear, now.getUTCMonth(), now.getUTCDate(), 12, 0, 0);
  const candidateUtc = Date.UTC(currentYear, monthIndex, day, 12, 0, 0);
  return candidateUtc <= todayUtc ? currentYear : currentYear - 1;
};

const samples = [
  {
    fileName: "IMG_1367.PNG",
    text: `10:084
(81
Deposit accounts
CHECKING ACCOUNT
0290007909
Pay bills
• My Statements
PHP 64,859.36
Available balance
Transaction history
• Show running balance
APR 13
Fund Transfer
TO: MARGARITA S CAY,A/C#0296028777
Amount
- PHP 50,000.00
Fund Transfer
FROM:MARGARITA S CAYANGA
Amount
PHP 3,494.94
MAR 31
2020 IOD INTEREST PAID
Amount
PHP 20.94
2121 TAX WITHHELD
Amount
- PHP 4.19`,
    expectedRows: 4,
    accountNumber: "0290007909",
    endingBalance: 64859.36,
  },
  {
    fileName: "IMG_1368.PNG",
    text: `10:08
•ol
81)
Deposit accounts
DEPENDENT SAVINGS
0299097005
APR 13
PHP 8,028.72
Available balance
Fund Transfer
TO: MARGARITA S CAY,A/C#0290007909
Amount
- PHP 3,494.94
APR 6
InstaPay Transfer
TRANSFER TO OTHER BANK
Amount
- PHP 50,000.00
InstaPay Transfer Fee
TRANSFER TO OTHER BANK
Amount
- PHP 10.00
MAR 31
0601 TAX WITHHELD
Amount
- PHP 0.85
01 INTEREST EARNED
Amount
PHP 4.25
MAR 20
Fund Transfer
FROM:MARGARITA S CAYANGA`,
    expectedRows: 5,
    accountNumber: "0299097005",
    endingBalance: 8028.72,
  },
  {
    fileName: "IMG_1369.PNG",
    text: `10:09 Al
81
Deposit accounts
PERSONAL SAVINGS
V
Available balance
PHP 536,502.85
Total balance
PHP 536,502.85
v Show details
→ Transfer money
El Pay bills
• My Statements
Transaction history
• Show running balance
MAR 31
0601 TAX WITHHELD
Amount
- PHP 16.76
01 INTEREST EARNED
Amount
PHP 83.82`,
    expectedRows: 2,
    accountNumber: "0299183012",
    endingBalance: 536502.85,
  },
  {
    fileName: "IMG_1370.PNG",
    text: `10:09 Al
Good morning,
Timothy
81
Deposit accounts
3
^
CHECKING ACCOUNT
0290007909
PHP 64,859.36
Available balance
DEPENDENT SAVINGS
0299097005
PHP 8,028.72
Available balance
PERSONAL SAVINGS
0299183012
PHP 536,502.85
Available balance
To Manage My Accounts
0*
5
My Accounts
Move money
Products
More`,
    expectedRows: 3,
    accountNumber: null,
    endingBalance: null,
  },
] as const;

for (const sample of samples) {
  const metadata = detectStatementMetadata(sample.text, sample.fileName);
  assert.equal(metadata?.institution, "BPI", `${sample.fileName} should detect BPI metadata.`);
  if (sample.fileName === "IMG_1369.PNG") {
    assert.equal(metadata?.accountNumber, "0299183012", "IMG_1369.PNG metadata should recover the hidden account number.");
  }

  const rows = parseImportText(sample.text, sample.fileName, "image/png", { institution: "BPI" });
  assert.equal(rows.length, sample.expectedRows, `${sample.fileName} row count mismatch.`);

  if (sample.accountNumber) {
    assert.equal(rows[0]?.accountNumber, sample.accountNumber, `${sample.fileName} account number should be stable.`);
  }

  if (sample.endingBalance !== null) {
    assert.equal(
      rows.at(-1)?.rawPayload?.statementEndingBalance,
      sample.endingBalance,
      `${sample.fileName} ending balance should be preserved in raw payload.`
    );
  }
}

const checkingRows = parseImportText(samples[0].text, samples[0].fileName, "image/png", { institution: "BPI" });
assert.equal(checkingRows[0]?.type, "expense");
assert.equal(checkingRows[1]?.type, "income");
assert.equal(checkingRows[2]?.categoryName, "Income");
assert.equal(checkingRows[3]?.categoryName, "Financial");

const dependentRows = parseImportText(samples[1].text, samples[1].fileName, "image/png", { institution: "BPI" });
assert.equal(
  dependentRows[0]?.date,
  `${inferMostRecentApplicableYear(3, 13)}-04-13`,
  "BPI screenshot rows without a visible year should use the most recent applicable year."
);
assert.equal(
  dependentRows.find((row) => /InstaPay Transfer Fee/i.test(String(row.merchantClean ?? row.merchantRaw ?? row.description ?? "")))?.categoryName,
  "Transfers",
  "BPI screenshot transfer fees should stay in Transfers."
);

const snapshotRows = parseImportText(samples[3].text, samples[3].fileName, "image/png", { institution: "BPI" });
assert.deepEqual(
  snapshotRows.map((row) => row.accountNumber),
  ["0290007909", "0299097005", "0299183012"],
  "BPI account snapshot screenshot should surface all three account numbers."
);
assert.ok(
  snapshotRows.every((row) => row.rawPayload?.kind === "account_snapshot_marker"),
  "BPI account snapshot rows should remain hidden account markers."
);

console.log("[PASS] BPI mobile screenshot parser handles account cards, transaction screenshots, and hidden account markers.");
