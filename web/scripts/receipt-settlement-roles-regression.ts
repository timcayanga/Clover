import assert from "node:assert/strict";
import { readReceiptSettlementEvidence, readReceiptTenders, reconcileReceiptSettlement, splitTenderDifference } from "../lib/receipt-settlement-evidence";
import { incompleteReceiptFields } from "../lib/receipt-review";
import { parseReceiptText } from "../lib/split-bill";

const receipt = (...lines: string[]) => [
  "Harbour Coffee", "OFFICIAL RECEIPT", "2026-11-15", "Espresso PHP 180.00", ...lines,
].join("\n");
const correct = receipt("Subtotal PHP 180.00", "Grand Total PHP 201.60", "Cash tendered PHP 500.00",
  "Change PHP 298.40", "VAT breakdown", "VATable amount PHP 180.00", "Total VAT PHP 21.60",
  "Total PHP 21.60", "Settlement", "Total PHP 201.60");
assert.deepEqual(readReceiptSettlementEvidence(correct), { kind: "payable", amount: 201.6 });
const parsed = parseReceiptText(correct);
assert.equal(parsed.total, "201.60");
assert.equal(parsed.subtotal, "180.00");
assert.equal(parsed.receiptText, correct);

assert.deepEqual(readReceiptSettlementEvidence(receipt("Total 180.00", "Grand Total 201.60", "Cash 500.00", "Change 298.40")),
  { kind: "payable", amount: 201.6 });
assert.deepEqual(readReceiptSettlementEvidence(receipt("Total 201.60", "Total 500.00", "Cash 500.00", "Change 298.40")),
  { kind: "payable", amount: 201.6 });
assert.deepEqual(readReceiptSettlementEvidence(receipt("Total 201.60", "Cash 100.00", "Card 101.60", "Change 0")),
  { kind: "payable", amount: 201.6 });
assert.deepEqual(readReceiptSettlementEvidence(receipt("Grand Total USD 12.50", "Cash PHP 800", "Change PHP 100")),
  { kind: "payable", amount: 12.5 });
assert.deepEqual(readReceiptSettlementEvidence(receipt("Amount payable:", "PHP 201.60", "Total item count 1")),
  { kind: "payable", amount: 201.6 });
assert.deepEqual(readReceiptSettlementEvidence(receipt("Grand total PHP 201.60", "Refund policy: within 7 days")),
  { kind: "payable", amount: 201.6 });

const noisyTotal = receipt("Bill Total     1,668.13           i       :");
assert.deepEqual(readReceiptSettlementEvidence(noisyTotal), { kind: "payable", amount: 1668.13 });
assert.equal(parseReceiptText(noisyTotal).receiptText, noisyTotal);
assert.equal(parseReceiptText(noisyTotal).total, "1668.13");
const noisyDuplicate = receipt("Amount due /1 L666 1S)", "Bill Total     1,668.13           i       :");
const noisyEvidence = readReceiptSettlementEvidence(noisyDuplicate);
assert.deepEqual(noisyEvidence, { kind: "conflict", observedAmount: 1668.13 });
assert.equal(parseReceiptText(noisyDuplicate).total, "1668.13");
assert.equal(parseReceiptText(noisyDuplicate).requiresReview, true);
assert.equal(reconcileReceiptSettlement({ total: 1668.13, parser_evidence: { reason: "" } }, noisyEvidence).total, null);
const garbledCharge = receipt("Subtotal 1570.00", "SERVICE CHARGE Th F019", "Amount due /1.668 Sie", "Bill Total 1,668.13");
const garbledPreview = parseReceiptText(garbledCharge);
assert.equal(garbledPreview.total, "1668.13");
assert.equal(garbledPreview.serviceCharge, null);
assert.equal(garbledPreview.requiresReview, true);


for (const source of [
  receipt("Bill Total 1,668.1     i :"),
  receipt("Bill Total 1,668.13     2.00"),
  receipt("Bill Total 1,668.13     PENDING"),
  receipt("Subtotal 180.00", "Cash 500.00", "Change 298.40"),
  receipt("Tax summary", "Total VAT 21.60"),
  receipt("Grand Total 201.60", "Amount Paid 301.60"),
  receipt("Grand Total 201.60", "Cash 500.00", "Change 198.40"),
  receipt("TOTAL 201.60", "Grand Total ?"),
]) {
  const preview = parseReceiptText(source);
  assert.equal(preview.total, null);
  assert.equal(preview.requiresReview, true);
  assert.equal(incompleteReceiptFields({ merchant_raw: preview.merchantName, transaction_date: "2026-11-15",
    currency: "PHP", total: null }).includes("total"), true);
}
for (const source of [
  receipt("Refund receipt", "Amount refunded PHP 180.00"),
  receipt("Total (PHP 180.00)"),
]) {
  assert.deepEqual(readReceiptSettlementEvidence(source), { kind: "refund", amount: 180 });
  assert.equal(parseReceiptText(source).total, null);
}

const candidate = { total: 500, parser_evidence: { source_text: correct, reason: "Initial extraction" } };
const repaired = reconcileReceiptSettlement(candidate, readReceiptSettlementEvidence(correct));
assert.equal(repaired.total, 201.6);
assert.equal(reconcileReceiptSettlement(repaired, readReceiptSettlementEvidence(correct)), repaired);
assert.equal(candidate.total, 500);
assert.equal(repaired.parser_evidence.source_text, correct);
console.log("Receipt settlement roles passed: tax and tender duplicates, split and foreign tender, missing and conflicting totals, refunds, and replay.");

const split = receipt("Grand Total PHP 201.60", "Cash tendered PHP 100.00", "Change PHP 20.00",
  "Visa ****1234 PHP 50.00", "GCash payment:", "PHP 71.60", "Card number 1234");
const preview = parseReceiptText(split);
assert.equal(preview.paymentMethod, "Mixed");
assert.equal(preview.total, "201.60");
assert.deepEqual(preview.tenders?.map(({ method, amount, currency, evidence }) => [method, amount, currency, evidence]), [
  ["cash", 100, "PHP", "Cash tendered PHP 100.00"],
  ["change", 20, "PHP", "Change PHP 20.00"],
  ["card", 50, "PHP", "Visa ****1234 PHP 50.00"],
  ["wallet", 71.6, "PHP", "GCash payment:\nPHP 71.60"],
]);
assert.equal(splitTenderDifference(preview.tenders!, 201.6, "PHP"), 0);
assert.equal(splitTenderDifference(preview.tenders!, 211.6, "PHP"), -10);
assert.equal(splitTenderDifference([...preview.tenders!, preview.tenders![0]], 201.6, "PHP"), null);
assert.equal(splitTenderDifference(preview.tenders!.map(tender => tender.method === "card" ? { ...tender, currency: "USD" } : tender), 201.6, "PHP"), null);
assert.deepEqual(readReceiptTenders("Card 1234\nGCash reference 0555"), []);

// The till prints the pre-rounding sale and the amount actually settled.
const rounded = "Total RM 33.92\nRounding Adjustment -RM 0.02\nTotal Rounded RM 33.90\nCash RM 50.00\nChange RM 16.10";
assert.deepEqual(readReceiptSettlementEvidence(rounded), { kind: "payable", amount: 33.90 });
assert.deepEqual(readReceiptSettlementEvidence(rounded.replace("16.10", "16.00")), { kind: "conflict" });
assert.deepEqual(readReceiptSettlementEvidence(rounded.replace("Rounded RM 33.90", "Rounded ?")), { kind: "conflict" });

const afterRounding = receipt("Total 72.93", "RND ADJ 0.02", "TTL ATF RND 72.95", "Cash 73.00", "Change Due 0.05");
assert.deepEqual(readReceiptSettlementEvidence(afterRounding), { kind: "payable", amount: 72.95 });
assert.deepEqual(readReceiptSettlementEvidence(afterRounding.replace("0.05", "0.03")), { kind: "conflict" });
assert.deepEqual(readReceiptSettlementEvidence(receipt("Amount To Be Paid 26.80", "Cash received 50.00", "Change 23.20")), {kind:"payable",amount:26.80});
assert.deepEqual(readReceiptSettlementEvidence(receipt("Total (Eat In) RM24.00", "Cash RM30.00", "Change RM6.00", "Total-Excl-GST RM22.65")), {kind:"payable",amount:24});
assert.deepEqual(readReceiptSettlementEvidence(afterRounding + "\nGrand Total 79.00"), {kind:"conflict"});

assert.deepEqual(readReceiptSettlementEvidence(receipt("Total 72.93", "TTL ATF RND ?", "Cash 72.93", "Change 0.00")), { kind: "conflict" });
