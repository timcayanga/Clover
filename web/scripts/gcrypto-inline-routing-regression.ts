import assert from "node:assert/strict";
import { detectStatementMetadataFromText } from "@/lib/data-engine";

const sample = `GCrypto
Transaction History
Past Transactions
As of May 02, 2026
Nov 08, 2022
Buy 9:35PM Successful
Bitcoin
0.005652
PHP 6,594.70
Buy 9:34 PM Successful
Stellar
227.5
PHP 1,400.03
Buy 9:33PM Successful
Ripple
95.54
PHP 2,501.04
Tap to see more
Powered by PDAX`;

const withoutFile = detectStatementMetadataFromText(sample);
const withFile = detectStatementMetadataFromText(sample, "IMG_1429.PNG");

assert.ok(withoutFile, "Expected GCrypto OCR text to detect metadata without a filename.");
assert.ok(withFile, "Expected GCrypto OCR text to detect metadata with a filename.");
assert.equal(withoutFile?.institution, "GCrypto", "GCrypto OCR text should still identify the institution.");
assert.equal(withFile?.institution, "GCrypto", "GCrypto OCR text plus filename should identify the institution.");
assert.equal(withoutFile?.accountType, "investment", "GCrypto OCR text should map to an investment account.");
assert.equal(withFile?.accountType, "investment", "GCrypto OCR text plus filename should map to an investment account.");
assert.equal(withoutFile?.confidence, 89, "Text-only GCrypto detection should stay below the inline image threshold.");
assert.equal(withFile?.confidence, 96, "Filename-assisted GCrypto detection should clear the inline image threshold.");

console.log("[PASS] GCrypto inline routing regression");
