import { sameNativeFinancialRows } from "../lib/pdf-native-row-proof";
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

const bpiPurchase = { ...purchase, accountNumber: "9999000000008263" };
const bpiPage = "BPI CREDIT CARD STATEMENT OF ACCOUNT\nCustomer Number: 9999 0000 0000 8263\nDate Description Amount\n2026-11-05 North Star Cafe 120.00";
assert.equal(assess([bpiPage], [bpiPurchase], bpiPurchase.accountNumber).complete, true,
  "BPI's printed customer number is its established card-ledger identity");
assert.equal(assess([bpiPage.replace("BPI CREDIT CARD", "OTHER BANK CREDIT CARD")], [bpiPurchase]).complete, false);
assert.equal(assess([bpiPage.replace("Customer Number: 9999 0000 0000 8263", "Customer Number: ****8263")], [bpiPurchase]).complete, false,
  "A masked suffix cannot prove an unprinted full account number");
assert.equal(assess([bpiPage.replace("Customer Number: 9999 0000 0000 8263", "Customer Number: 9999 0000 0000 9999")], [bpiPurchase]).complete, false);
assert.equal(assess([bpiPage.replace("Customer Number: 9999 0000 0000 8263\n", "").replace("North Star Cafe", "North Star Cafe Customer Number 9999000000008263")], [bpiPurchase]).complete, false,
  "Customer text inside a purchase cannot establish the ledger account");

assert.equal(assess([bpiPage, bpiPage.replace("BPI CREDIT CARD", "OTHER BANK CREDIT CARD").replaceAll("8263", "9999")],
  [{ ...bpiPurchase, accountNumber: "9999000000009999" }]).complete, false,
  "A BPI heading on another page cannot authorize a different institution's customer ID");

// Complete, independently reparsed native families must retain all core fields.

const native = [{date:'2026-11-05', amount:'120.00', currency:'PHP', type:'expense', merchantRaw:'North Star Cafe', accountNumber:'12345678'}];
assert.equal(sameNativeFinancialRows(native, native), true);
for (const change of [ {amount:'120.01'}, {currency:'USD'}, {type:'income'}, {date:'2026-11-06'},
  {accountNumber:'87654321'}, {merchantRaw:'Different cafe'} ]) {
  assert.equal(sameNativeFinancialRows(native, [{...native[0],...change}]), false);
}
assert.equal(sameNativeFinancialRows(native, [...native,...native]), false);
assert.equal(sameNativeFinancialRows([...native,...native], native), false);
assert.equal(sameNativeFinancialRows([], []), false);

const nativeBalance = [{...native[0],rawPayload:{line:'printed ledger row',balance:880}}];
assert.equal(sameNativeFinancialRows(nativeBalance,[{...nativeBalance[0],rawPayload:{line:'printed ledger row',balance:881}}]),false);
assert.equal(sameNativeFinancialRows(nativeBalance,[{...nativeBalance[0],rawPayload:{balance:880}}]),false);

async function verifyByteBoundNativeEvidence() {
  const { statementPdf } = await import('./fixtures/synthetic-statement-pdf');
  const { verifyPdfStatementPageCoverage, readPdfStatementEvidencePages } = await import('../lib/import-file-text.server');
  const text = 'Account Number: 12345678\nDate Description Amount\n2026-11-05 North Star Cafe 120.00\n2026-11-06 Market Grocery 30.00';
  const bytes = statementPdf(text.split('\n'));
  await verifyPdfStatementPageCoverage(bytes, text);
  const before = readPdfStatementEvidencePages(bytes, text).nativeStructuredText;
  assert.ok(before?.includes('North Star Cafe 120.00'));
  assert.equal(readPdfStatementEvidencePages(bytes, 'Invented payment 999.00').nativeStructuredText, before,
    'Caller-supplied evidence cannot replace the byte-derived native transcript');
  assert.equal(readPdfStatementEvidencePages(bytes.slice(), text).nativeStructuredText, null,
    'Another byte object has no native authority until the reader verifies it');
}
verifyByteBoundNativeEvidence().catch(error => { console.error(error); process.exitCode = 1; });

const timedNative = [{...native[0],date:'2026-11-05T13:45:00+08:00'}];
assert.equal(sameNativeFinancialRows(timedNative,[{...timedNative[0],date:'2026-11-05T13:46:00+08:00'}]),false);
assert.equal(sameNativeFinancialRows(timedNative,[{...timedNative[0],date:'2026-11-05T05:45:00.000Z'}]),true);
