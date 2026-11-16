import assert from "node:assert/strict";
import { assessPdfStatementCoverage } from "../lib/pdf-statement-coverage";

const ledger = (page: number) =>
  `Statement transaction details. Opening balance and dated purchases for the account. 2026-11-${String(page).padStart(2, "0")} Sample merchant PHP 12.99.`;
const first = ledger(1) + "\nPage 1 of 2";
const second = ledger(2) + "\nPage 2 of 2";
assert.equal(assessPdfStatementCoverage([first, second], [], first + "\n" + second).complete, true);
assert.deepEqual(assessPdfStatementCoverage([first]).missingPrintedPages, [2]);
assert.equal(assessPdfStatementCoverage([second, first]).complete, false);
assert.deepEqual(assessPdfStatementCoverage([first, first]).duplicatePages, [{ original: 1, duplicate: 2 }]);
assert.deepEqual(assessPdfStatementCoverage([first, second], [], first).unverifiedPages, [2]);
assert.equal(assessPdfStatementCoverage(["", second]).complete, false);
assert.equal(assessPdfStatementCoverage(["", ""], [
  { page: 1, text: first, imageDigest: "page-one" },
  { page: 2, text: second, imageDigest: "page-two" },
], first + "\n" + second).complete, true);
assert.deepEqual(assessPdfStatementCoverage(["", ""], [
  { page: 1, text: first, imageDigest: "page-one" },
  { page: 2, text: second, imageDigest: "page-two" },
], first).unverifiedPages, [2]);
assert.equal(assessPdfStatementCoverage([
  ledger(1) + "\nPage 1 of 1",
  ledger(2) + "\nPage 1 of 1",
]).complete, true, "Separate account sections may legitimately restart page numbering");
assert.equal(assessPdfStatementCoverage([ledger(1), ledger(2)]).complete, true);
console.log("PDF statement page coverage checks passed.");
