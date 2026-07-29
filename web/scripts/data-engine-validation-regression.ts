import assert from "node:assert/strict";
import { applyImportValidationToRows, calibrateConfidenceScore, validateParsedImportRows } from "@/lib/data-engine-validation";
import { MAX_IMPORT_FILE_SIZE, validateImportFile, validateImportFileBytes } from "@/lib/import-file-validation";

const goodRows = [
  { date: "2026-01-02", amount: "-100.00", merchantRaw: "SHOP", merchantClean: "Shop", type: "expense" as const, rawPayload: { parserEvidence: { page: 1, source_text: "SHOP -100.00" } } },
  { date: "2026-01-03", amount: "500.00", merchantRaw: "PAYROLL", merchantClean: "Payroll", type: "income" as const, rawPayload: { parserEvidence: { page: 1, source_text: "PAYROLL 500.00" } } },
];
const good = validateParsedImportRows({ rows: goodRows, metadata: { startDate: "2026-01-01", endDate: "2026-01-31" } });
assert.equal(good.critical, false);
assert.ok(good.score >= 80);

const badRows = [{ date: "not-a-date", amount: null, merchantRaw: "noise", type: undefined, rawPayload: {} }] as unknown as Parameters<typeof validateParsedImportRows>[0]["rows"];
const bad = validateParsedImportRows({ rows: badRows });
assert.equal(bad.critical, true);
assert.equal((applyImportValidationToRows(badRows, bad)[0] as unknown as { reviewStatus?: string })?.reviewStatus, "pending_review");
assert.equal(calibrateConfidenceScore({ rawConfidence: 99, validationScore: 80, hasEvidence: false }), 68);
assert.equal(calibrateConfidenceScore({ rawConfidence: 40, validationScore: 80, hasEvidence: true, userConfirmed: true }), 100);

const unsafeStatementRows = [
  {
    date: "2024-12-07",
    amount: "6399114.88",
    merchantRaw: "Internet Transfer",
    merchantClean: "Internet Transfer",
    type: "income" as const,
    rawPayload: {
      kind: "generic_bank_statement_transaction",
      line: "07 Dec 24 TFR INTERNET TRANSFER 63.99 114.88",
      amountText: "63.99 114.88",
    },
  },
  {
    date: "2024-12-04",
    amount: "50.89",
    merchantRaw: "Balance Brought Forward",
    merchantClean: "Balance Brought Forward",
    type: "expense" as const,
    rawPayload: { line: "04 Dec 24 BALANCE BROUGHT FORWARD 50.89" },
  },
];
const unsafeStatement = validateParsedImportRows({ rows: unsafeStatementRows });
assert.equal(unsafeStatement.critical, true);
assert.ok(unsafeStatement.findings.some((finding) => finding.code === "amount.implausible"));
assert.ok(unsafeStatement.findings.some((finding) => finding.code === "row.balance_anchor"));

assert.equal(validateImportFileBytes({ fileName: "statement.pdf", contentType: "application/pdf", bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]) }), null);
assert.match(String(validateImportFileBytes({ fileName: "statement.pdf", contentType: "application/pdf", bytes: new Uint8Array([1, 2, 3]) })), /valid PDF/i);
assert.equal(MAX_IMPORT_FILE_SIZE, 2 * 1024 * 1024);
assert.equal(validateImportFile({ fileName: "statement.pdf", contentType: "application/pdf", fileSize: MAX_IMPORT_FILE_SIZE }), null);
assert.match(
  String(validateImportFile({ fileName: "statement.pdf", contentType: "application/pdf", fileSize: 3 * 1024 * 1024 })),
  /2 MB or smaller/i
);
console.log("Data Engine validation regression passed.");
