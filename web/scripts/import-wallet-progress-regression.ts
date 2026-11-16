import assert from "node:assert/strict";
import { detectStatementMetadataFromText } from "../lib/data-engine";
import {
  detectExplicitAccountTypeFromStatementText,
  inferAccountTypeFromStatement,
  normalizeInstitutionCurrency,
} from "../lib/import-parser";
import { hasPdfEncryptionMarker } from "../lib/import-file-text";
import { normalizeBatchImportProgress, preserveMonotonicImportProgress } from "../lib/import-progress";
import { applyStatementFilenameCoverage, getStatementFilenameCoverage } from "../lib/statement-filename-coverage";

const unknownWalletStatement = `
  Northstar Pay
  Account Type: Wallet
  Wallet Statement
  Statement period 01 July 2026 to 31 July 2026
  Current balance PHP 1,250.00
`;

assert.equal(detectExplicitAccountTypeFromStatementText(unknownWalletStatement), "wallet");
assert.equal(
  detectStatementMetadataFromText(unknownWalletStatement, "northstar-july.pdf").accountType,
  "wallet",
  "An explicit wallet product label must outrank the generic bank fallback."
);

const ordinaryBankStatement = `
  Northstar Bank
  Savings Account Statement
  Account Number 1234567890
  Wallet transfer to merchant PHP 250.00
`;
assert.equal(detectExplicitAccountTypeFromStatementText(ordinaryBankStatement), null);
assert.equal(
  detectStatementMetadataFromText(ordinaryBankStatement, "northstar-bank.pdf").accountType,
  "bank",
  "A transaction description mentioning a wallet must not reclassify a bank account."
);

assert.equal(
  hasPdfEncryptionMarker(new TextEncoder().encode("%PDF-1.7\ntrailer << /Encrypt 12 0 R >>\n%%EOF")),
  true
);
assert.equal(
  hasPdfEncryptionMarker(new TextEncoder().encode("%PDF-1.7\ntrailer << /Root 1 0 R >>\n%%EOF")),
  false
);

assert.equal(
  normalizeBatchImportProgress({ fileTotal: 4, completedFiles: 0, fileProgress: 100, fileSettled: false }),
  25,
  "One file reaching 100% in a four-file batch is only 25% batch progress."
);
assert.equal(
  normalizeBatchImportProgress({ fileTotal: 4, completedFiles: 1, fileProgress: 50, fileSettled: false }),
  37.5
);
assert.equal(
  normalizeBatchImportProgress({ fileTotal: 1, completedFiles: 0, fileProgress: 70, fileSettled: false }),
  70
);
assert.equal(
  preserveMonotonicImportProgress(87, 33),
  87,
  "A batch status transition must never make visible progress move backward."
);
assert.equal(preserveMonotonicImportProgress(87, 100), 100);
assert.equal(
  inferAccountTypeFromStatement(null, "BTC Cash", "cash"),
  "investment",
  "A crypto ticker must outrank the generic Cash label when resolving account type."
);
assert.equal(normalizeInstitutionCurrency("PDAX", "BTC", "BTC"), "PHP");
assert.equal(
  normalizeInstitutionCurrency(null, "BTC", "BTC"),
  null,
  "A crypto asset ticker must never become an account currency."
);

const mayaSavingsStatement = `
  Maya
  Maya Savings Statement of Account
  Account Name: Sample User
  Transaction Reference: 9999 8888 7777
  Account Number: 1234 5678 9012
  Account Summary
  Starting Balance PHP 100.00
  Ending Balance PHP 150.00
  Transaction Details
`;
const mayaSavingsMetadata = detectStatementMetadataFromText(
  mayaSavingsStatement,
  "MayaSavings_SoA_very-long-generated-identifier_2026JUN.pdf"
);
assert.equal(mayaSavingsMetadata.accountType, "bank", "Maya Savings must not inherit Maya Wallet classification.");
assert.equal(
  mayaSavingsMetadata.accountNumber?.replace(/\D/g, ""),
  "123456789012",
  "The labeled Maya Savings account number must outrank unrelated reference numbers."
);

const sparseMayaSavingsMetadata = detectStatementMetadataFromText(
  "Maya Statement of Account\nAccount Number: 1234 5678 9012",
  "MayaSavings_SoA_generated-id_2026JUN.pdf"
);
assert.equal(
  sparseMayaSavingsMetadata.accountType,
  "bank",
  "A MayaSavings filename should preserve the bank product when extracted PDF text is sparse."
);

const unlabeledMayaSavingsMetadata = detectStatementMetadataFromText(
  `Statement of Account
Statement date: 1 July 2026
Consumer Savings
0.00 PHP
8052 8070 2608
100.00 PHP
- 1.00 PHP
Maya Savings (2608) Statement date: 1 July 2026`,
  "MayaSavings_SoA_generated-id_2026JUN.pdf"
);
assert.equal(unlabeledMayaSavingsMetadata.accountType, "bank");
assert.equal(unlabeledMayaSavingsMetadata.accountName, "Maya Savings");
assert.equal(
  unlabeledMayaSavingsMetadata.accountNumber?.replace(/\D/g, ""),
  "805280702608",
  "A standalone Maya Savings account number must stop before the following balance."
);

const mayaWalletCoverage = getStatementFilenameCoverage(
  "MayaWallet_SoA_95f-baf23d860e15_01-Jul-2026_31-Jul-2026.pdf"
);
assert.equal(mayaWalletCoverage?.startDate, "2026-07-01T12:00:00.000Z");
assert.equal(mayaWalletCoverage?.endDate, "2026-07-31T12:00:00.000Z");
assert.deepEqual(
  applyStatementFilenameCoverage(
    { startDate: "2026-07-07T12:00:00.000Z", endDate: "2026-07-29T12:00:00.000Z" },
    "MayaWallet_SoA_95f-baf23d860e15_01-Jul-2026_31-Jul-2026.pdf"
  ),
  {
    startDate: "2026-07-01T12:00:00.000Z",
    endDate: "2026-07-31T12:00:00.000Z",
  },
  "Maya statement filename coverage must outrank transaction-date gaps."
);

console.log("[PASS] password prompting, wallet identity, and multi-file progress regressions");
