import assert from "node:assert/strict";
import { assessPdfStatementRowEvidence as assess } from "../lib/pdf-statement-row-evidence";

const pages = [
  "Account Number: 12345678\nDate Description Amount Balance\n2026-11-05 North Star Cafe 120.00 880.00\n2026-11-05 North Star Cafe 120.00 760.00\n2026-11-06 Reconciliation adjustment 40.00 800.00",
  "Card Number: ****9012\nDate Description Amount\n07 Nov 2026 Market Grocery\n   1.200,50",
];
const purchase = { date: "2026-11-05", merchantRaw: "North Star Cafe", amount: "120.00", accountNumber: "12345678" };
const grocery = { date: "2026-11-07", merchantRaw: "Market Grocery", amount: "1200.50", accountNumber: "****9012" };
const verified = assess(pages, [purchase, purchase, grocery], "12345678");
assert.deepEqual(verified.evidence, [{ page: 1, line: 3 }, { page: 1, line: 4 }, { page: 2, line: 3 }]);
assert.equal(verified.complete, true);
assert.equal(assess(pages, [purchase, purchase, purchase]).complete, false);
assert.equal(assess(pages, [{ ...purchase, date: "2026-11-06" }]).complete, false);
assert.equal(assess(pages, [{ ...purchase, amount: "880.00" }]).complete, false);
assert.equal(assess(pages, [{ ...purchase, merchantRaw: "Invented merchant" }]).complete, false);
assert.equal(assess(pages, [{ ...purchase, rawPayload: { parserEvidence: { page: 2, source_text: "2026-11-05 North Star Cafe 120.00" } } }]).complete, false);
assert.equal(assess(pages, [{ ...purchase, amount: "40.00", date: "2026-11-06", merchantRaw: "Reconciliation adjustment" }]).complete, false);
assert.equal(assess(pages, [{ ...purchase, rawPayload: { kind: "balance_plug" } }]).complete, false);
assert.equal(assess(pages, [{ ...grocery, accountNumber: "12349012" }]).complete, false);
assert.equal(assess(pages, [{ ...grocery, accountNumber: "12345678" }]).complete, false);
assert.equal(assess(pages, [purchase], "55555678").complete, false);
assert.equal(assess([
  "Date Description Amount Balance\n2026-11-05 North Star Cafe REF 123123 120.00 880.00",
], [{ ...purchase, accountNumber: undefined, amount: "123123" }]).complete, false);
console.log("PDF row evidence regression passed.");

assert.deepEqual(assess(pages, [{ ...grocery, date: "2026-11-08" }]).issues, [
  { row: 1, reason: "unverified_transaction_date", page: 2 },
]);
assert.deepEqual(assess(pages, [{ ...grocery, accountNumber: "12345678" }]).issues, [
  { row: 1, reason: "unverified_account_number", page: 2 },
]);
