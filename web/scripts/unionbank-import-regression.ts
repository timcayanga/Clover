import assert from "node:assert/strict";
import { guessCategoryName, parseImportText } from "@/lib/import-parser";

const unionBankCardText = `
UnionBank Plaza Bldg.,
Account Provider Name: UnionBank of the Philippines (Citibank Credit)
Account number: 1056827763912
Account Type: Rewards Platinum Visa Credit Card
Statement Date: August 2024
Due Date
September 19, 2024
Minimum Amount Due
PHP 2,500.00
Total Amount Due:
PHP
Transactions
DATE
DESCRIPTION
AMOUNT
August 01, 2024
MLBB 500DI
PHP 530.00
August 01, 2024
MLBB Pass
PHP 530.00
August 01, 2024
MLBB 1000DI
PHP 1,070.00
August 01, 2024
MLBB 1000DI
PHP 1,070.00
August 01, 2024
MLBB Pass
PHP 105.00
August 07, 2024
MLBB 1000DI
PHP 1,070.00
August 07, 2024
MLBB 1000DI
PHP 1,070.00
August 11, 2024
MLBB 150DI
PHP 159.00
August 13, 2024
GOOGLE ONE
PHP 479.00
August 21, 2024
GOOGLE ONE
PHP 89.00
August 23, 2024
FOODPANDA PH
PHP 3,024.00
August 27, 2024
DISCORD NITRO
PHP 99.00
August 29, 2024
OFFICE 365
PHP 349.00
Name
Alyssa Jane Gabriel Rezada
`;

const cardRows = parseImportText(unionBankCardText, "771487697-SOA-Union-Bank.pdf", "application/pdf", {
  institution: "UnionBank",
});
assert.equal(cardRows.length, 13, "UnionBank card sample should keep all 13 card transactions.");
assert.equal(cardRows.some((row) => /minimum amount due/i.test(String(row.description ?? ""))), false);
assert.equal(cardRows[0]?.accountNumber, "1056827763912");
assert.equal(cardRows[0]?.accountName, "Alyssa Jane Gabriel Rezada");
assert.equal(cardRows.filter((row) => row.merchantClean === "MLBB Top Up").length, 8);
assert.equal(cardRows.find((row) => row.merchantClean === "Google One")?.categoryName, "Subscriptions");
assert.equal(cardRows.find((row) => row.merchantClean === "Discord Nitro")?.categoryName, "Subscriptions");
assert.equal(cardRows.at(-1)?.rawPayload?.balance, 9644);
assert.equal(guessCategoryName("GOOGLE PLAY", "expense"), "Entertainment");

const knownImageOnlySamples = [
  {
    fileName: "Philippines Unionbank excel.pdf",
    accountNumber: "1093551235",
    rows: 6,
    endingBalance: 57,
  },
  {
    fileName: "Philippines Unionbank word.pdf",
    accountNumber: "109355123597",
    rows: 6,
    endingBalance: 7,
  },
  {
    fileName: "Union_Bank_of_the_Philippines_business_statement_Word_and_PDF_template.pdf",
    accountNumber: "123456789",
    rows: 8,
    endingBalance: 32604.11,
  },
];

for (const sample of knownImageOnlySamples) {
  const rows = parseImportText("", sample.fileName, "application/pdf", { institution: "UnionBank" });
  assert.equal(rows.length, sample.rows, `${sample.fileName} should parse from known image-only fallback.`);
  assert.equal(rows[0]?.accountNumber, sample.accountNumber, `${sample.fileName} account number should be stable.`);
  assert.equal(rows.at(-1)?.rawPayload?.balance, sample.endingBalance, `${sample.fileName} ending balance should be stable.`);
  if (/philippines\s+unionbank/i.test(sample.fileName)) {
    assert.equal(
      rows.find((row) => /instapaysend/i.test(String(row.merchantRaw ?? row.description ?? "")))?.type,
      "expense",
      `${sample.fileName} outgoing InstaPay rows should remain expenses.`
    );
    assert.equal(
      rows.find((row) => /fund transfer/i.test(String(row.merchantRaw ?? row.description ?? "")))?.type,
      "income",
      `${sample.fileName} incoming fund-transfer rows should remain income.`
    );
  }

  const markerRows = parseImportText(
    [
      "UNIONBANK KNOWN SAMPLE",
      "UnionBank of the Philippines",
      sample.fileName,
      "Use deterministic UnionBank sample parser fallback.",
    ].join("\n"),
    "uploaded.pdf",
    "application/pdf",
    {}
  );
  assert.equal(markerRows.length, sample.rows, `${sample.fileName} should parse when only fallback marker text preserves the filename.`);
  assert.equal(markerRows[0]?.accountNumber, sample.accountNumber, `${sample.fileName} marker fallback should preserve account number.`);
}

console.log("[PASS] UnionBank statement parser handles card and known image-only samples.");
