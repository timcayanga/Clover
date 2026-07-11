import assert from "node:assert/strict";
import { detectStatementMetadata, guessCategoryName, parseImportText } from "@/lib/import-parser";
import { matchesImportedAccountIdentity, mergeImportedWorkspaceTransactions, pruneImportedAccountPlaceholders } from "@/lib/workspace-cache";

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

const unionBankBusinessSampleRows = parseImportText(
  "",
  "Union_Bank_of_the_Philippines_business_statement_Word_and_PDF_template.pdf",
  "application/pdf",
  { institution: "UnionBank" }
);
assert.equal(
  unionBankBusinessSampleRows.find((row) => row.description === "Outward Fast Payments MARGOLIS FURNITURE")?.merchantClean,
  "MARGOLIS FURNITURE"
);
assert.equal(
  unionBankBusinessSampleRows.find((row) => row.description === "Outward Fast Payments MARGOLIS FURNITURE")?.categoryName,
  "Shopping"
);
assert.equal(
  unionBankBusinessSampleRows.find((row) => row.description === "Outward Fast Payments Screwfix Enfield")?.merchantClean,
  "Screwfix Enfield"
);
assert.equal(
  unionBankBusinessSampleRows.find((row) => row.description === "Outward Fast Payments Screwfix Enfield")?.categoryName,
  "Shopping"
);
assert.equal(
  unionBankBusinessSampleRows.find((row) => row.description === "Outward Fast Payments Jennifer Labelle")?.categoryName,
  "Transfers"
);
assert.equal(
  unionBankBusinessSampleRows.find((row) => row.description === "Card Purchase STAPLES")?.merchantClean,
  "STAPLES"
);

const unionBankScreenshotMetadata = detectStatementMetadata("", "IMG_1387.PNG");
assert.equal(unionBankScreenshotMetadata?.institution, "UnionBank of the Philippines");
assert.equal(unionBankScreenshotMetadata?.accountNumber, "8037");
assert.equal(unionBankScreenshotMetadata?.accountName, "UnionBank 8037");
assert.equal(unionBankScreenshotMetadata?.accountType, "bank");
assert.equal(unionBankScreenshotMetadata?.endingBalance, 116465.28);

const unionBankScreenshotRows = parseImportText("", "IMG_1388.PNG", "image/png", { institution: "UnionBank" });
assert.equal(unionBankScreenshotRows.length, 5, "UnionBank screenshot IMG_1388 should deterministically return 5 rows.");
assert.deepEqual(
  unionBankScreenshotRows.map((row) => row.date),
  ["2026-05-01", "2026-05-01", "2026-04-22", "2026-04-13", "2026-04-08"]
);
assert.equal(unionBankScreenshotRows[0]?.merchantClean, "Interest Earned");
assert.equal(unionBankScreenshotRows[1]?.merchantClean, "Tax Withheld");
assert.equal(unionBankScreenshotRows[2]?.categoryName, "Transfers");
assert.equal(unionBankScreenshotRows[3]?.categoryName, "Income");
assert.equal(unionBankScreenshotRows[4]?.amount, "6286.77");
assert.equal(
  unionBankScreenshotRows.every((row) => row.accountNumber === "8037" && row.accountName === "UnionBank 8037"),
  true,
  "UnionBank screenshot rows should attach to the canonical 8037 account."
);
assert.equal(
  matchesImportedAccountIdentity(
    {
      name: "UnionBank 1235",
      institution: "UnionBank of the Philippines",
      accountNumber: "1093551235",
      type: "bank",
    },
    {
      name: "UnionBank 3597",
      institution: "UnionBank of the Philippines",
      accountNumber: "109355123597",
      type: "bank",
    }
  ),
  false,
  "UnionBank sample bank accounts with explicit different account numbers must not merge."
);

assert.equal(
  matchesImportedAccountIdentity(
    {
      name: "UnionBank 3912",
      institution: "UnionBank",
      accountNumber: "3912",
      type: "credit_card",
    },
    {
      name: "UnionBank 3912",
      institution: "UnionBank of the Philippines",
      accountNumber: "1056827763912",
      type: "credit_card",
    }
  ),
  true,
  "UnionBank full account numbers can still match last-four optimistic placeholders."
);

const prunedUnionBankPlaceholders = pruneImportedAccountPlaceholders([
  {
    id: "blank-business-placeholder",
    name: "UnionBank of the Philippines",
    institution: "UnionBank of the Philippines",
    accountNumber: null,
    type: "bank",
    source: "upload",
    balance: "32604.11",
    transactionCount: 0,
  },
  {
    id: "optimistic-blank-business-placeholder",
    name: "UnionBank of the Philippines",
    institution: "UnionBank of the Philippines",
    accountNumber: null,
    type: "bank",
    source: "upload",
    balance: "7",
    transactionCount: 0,
  },
  {
    id: "business-6789",
    name: "UnionBank 6789",
    institution: "UnionBank",
    accountNumber: "123456789",
    type: "bank",
    source: "upload",
    balance: "32604.11",
    transactionCount: 8,
  },
  {
    id: "card-3912",
    name: "UnionBank 3912",
    institution: "UnionBank",
    accountNumber: "1056827763912",
    type: "credit_card",
    source: "upload",
    balance: "9295",
    transactionCount: 13,
  },
]);
assert.deepEqual(
  prunedUnionBankPlaceholders.map((account) => account.id),
  ["business-6789", "card-3912"],
  "UnionBank account cache should hide no-account-number uploaded placeholders while canonical accounts settle."
);

const mergedPreviewAndConfirmedRows = mergeImportedWorkspaceTransactions(
  [
    {
      id: "optimistic-unionbank-import-12",
      importFileId: "unionbank-import",
      sourceRowIndex: 12,
      accountId: "optimistic-account",
      accountName: "UnionBank 3912",
      institution: "UnionBank",
      accountNumber: "1056827763912",
      date: "2024-08-27",
      amount: "99",
      currency: "PHP",
      type: "expense",
      merchantRaw: "DISCORD NITRO",
      merchantClean: "Discord Nitro",
      description: "DISCORD NITRO",
      source: "upload",
    },
  ],
  [
    {
      id: "confirmed-unionbank-import-12",
      importFileId: "unionbank-import",
      accountId: "persisted-account",
      accountName: "UnionBank 3912",
      institution: "UnionBank",
      accountNumber: "1056827763912",
      date: "2024-08-27T12:00:00.000Z",
      amount: "99",
      currency: "PHP",
      type: "expense",
      merchantRaw: "DISCORD NITRO",
      merchantClean: "Discord Nitro",
      description: "DISCORD NITRO",
      source: "upload",
      rawPayload: {
        sourceImportFileId: "unionbank-import",
        sourceStatementFingerprint: "stmt_unionbank",
        sourceRowIndex: 12,
      },
    },
  ]
);
assert.deepEqual(
  mergedPreviewAndConfirmedRows.map((row) => row.id),
  ["confirmed-unionbank-import-12"],
  "UnionBank optimistic preview rows should be replaced by confirmed rows from the same import."
);

console.log("[PASS] UnionBank statement parser handles card and known image-only samples.");
