import assert from "node:assert/strict";
import { resolveImportDocumentDisagreement, verifyImportDocumentVerdict } from "../lib/import-document-verdict";

const receipt = { document_type: "receipt", visible_evidence: ["Official Receipt", "Total PHP 125.00"] } as const;
const verifyReceipt = (visible_evidence: string[], source: string) =>
  verifyImportDocumentVerdict({ document_type: receipt.document_type, visible_evidence }, "receipt", source);
assert.deepEqual(verifyReceipt([...receipt.visible_evidence], "Clover Cafe\nOFFICIAL RECEIPT\nTotal PHP 125.00"), {
  documentType: "receipt", evidence: [...receipt.visible_evidence],
});
for (const [evidence, source] of [
  [[], "Official Receipt"],
  [["Total PHP 125.00"], "Shopping cart\nTotal PHP 125.00"],
  [["Official Receipt"], "Shopping cart"],
  [["Receipt scanner"], "Receipt scanner"],
  [["Official Receipt", "Total PHP 900.00"], "Official Receipt\nTotal PHP 125.00"],
] as [string[], string][]) assert.equal(verifyReceipt(evidence, source).documentType, "uncertain");
assert.equal(verifyImportDocumentVerdict(null, "statement", "Transaction History").documentType, "uncertain");
assert.equal(verifyImportDocumentVerdict({ document_type: "receipt", visible_evidence: ["Receipt"] }, "statement", "Receipt").documentType, "uncertain");
assert.equal(verifyImportDocumentVerdict({ document_type: "statement", visible_evidence: ["Transaction History"] },
  "statement", "Wallet\nTransaction History\n2026-09-10").documentType, "statement");
console.log("Document verdicts: corroborated type, absent evidence, mismatched type and unrelated evidence passed");

assert.equal(resolveImportDocumentDisagreement("receipt", "statement", []), "review");
assert.equal(resolveImportDocumentDisagreement("statement", "receipt", ["statement", "receipt"]), "review");
assert.equal(resolveImportDocumentDisagreement("receipt", "statement", ["portfolio"]), "review");
assert.equal(resolveImportDocumentDisagreement("receipt", "statement", ["receipt"]), "use_local");
assert.equal(resolveImportDocumentDisagreement("receipt", "statement", ["statement"]), "use_backup");
assert.equal(resolveImportDocumentDisagreement("uncertain", "receipt", []), "use_backup");
assert.equal(resolveImportDocumentDisagreement("receipt", "uncertain", []), "use_backup");
assert.equal(resolveImportDocumentDisagreement("receipt", "receipt", []), "use_backup");
console.log("Classification disagreements: conflicting, uniquely verified, and uncertain verdicts passed");
