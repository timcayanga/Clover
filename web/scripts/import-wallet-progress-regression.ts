import assert from "node:assert/strict";
import { detectStatementMetadataFromText } from "../lib/data-engine";
import { detectExplicitAccountTypeFromStatementText } from "../lib/import-parser";
import { hasPdfEncryptionMarker } from "../lib/import-file-text";
import { normalizeBatchImportProgress } from "../lib/import-progress";

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

console.log("[PASS] password prompting, wallet identity, and multi-file progress regressions");
