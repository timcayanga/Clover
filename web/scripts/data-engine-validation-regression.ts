import assert from "node:assert/strict";
import { applyImportValidationToRows, calibrateConfidenceScore, validateParsedImportRows } from "@/lib/data-engine-validation";
import { validateImportFileBytes } from "@/lib/import-file-validation";

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

assert.equal(validateImportFileBytes({ fileName: "statement.pdf", contentType: "application/pdf", bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]) }), null);
assert.match(String(validateImportFileBytes({ fileName: "statement.pdf", contentType: "application/pdf", bytes: new Uint8Array([1, 2, 3]) })), /valid PDF/i);
console.log("Data Engine validation regression passed.");
