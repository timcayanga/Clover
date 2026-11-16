import assert from "node:assert/strict";
import { repairReceiptDateFromEvidence } from "../lib/receipt-date-evidence";
import { parseReceiptText } from "../lib/split-bill";

const receipt = (...dates: string[]) =>
  ["HARBOUR COFFEE", "OFFICIAL RECEIPT", ...dates, "1 Coffee PHP 185.00", "TOTAL PHP 185.00"].join("\n");
const allRoles = receipt(
  "Print date: 2026-11-16 Purchase date: 2026-11-14",
  "Payment date: 2026-11-15",
  "Terminal timestamp: 2026-11-17 01:04",
  "Offer expires on 2026-12-01",
);
const wrapped = receipt("DATE: 2026-11-14", "Reprinted on:", "2026-11-19");
const conflicts = [
  receipt("Sale date: 2026-11-14", "Transaction date: 2026-11-15"),
  receipt("Purchase date: 09/10/2026", "Print date: 2026-10-10"),
  receipt("Print date: 2026-11-16", "Paid on: 2026-11-15", "Terminal timestamp: 2026-11-17"),
  receipt("2026-11-14", "2026-11-15"),
];
const model = { transaction_date: "2026-11-16", total: 185 };
for (const source of [allRoles, wrapped]) {
  assert.equal(parseReceiptText(source).billDate?.slice(0, 10), "2026-11-14");
  assert.deepEqual(repairReceiptDateFromEvidence(model, source), { ...model, transaction_date: "2026-11-14" });
}
for (const source of conflicts) {
  const preview = parseReceiptText(source);
  assert.equal(preview.billDate, null);
  assert.equal(preview.requiresReview, true);
  assert.equal(repairReceiptDateFromEvidence(model, source, { referenceDate: "2026-11-15" }).transaction_date, null);
}
assert.equal(model.transaction_date, "2026-11-16");
console.log("Receipt purchase dates passed for inline labels, wrapped print dates, and ambiguous or missing purchase evidence.");
