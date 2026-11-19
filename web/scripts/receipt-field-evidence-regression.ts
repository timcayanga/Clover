import { columnReceipt } from "./receipt-column-settlement-regression";
import assert from "node:assert/strict";
import { keepVerifiedReceiptFields, receiptBackupQuestions, requireReceiptFieldEvidence } from "../lib/receipt-field-evidence";
import { hasIndependentReceiptCore, shouldRefineReceiptCore } from "../lib/receipt-detail-refinement";
import { incompleteReceiptFields } from "../lib/receipt-review";

const source = "OFFICIAL RECEIPT\nTrade name：Harbour Coffee\nPurchase Date:\n2026-11-16\nCoffee 100.00\nAmount Paid:\nPHP 100.00\nPrint date: 2026-11-17";
const details = {
  merchant_raw: "Harbour Coffee", merchant_clean: "Harbour Coffee", transaction_date: "2026-11-16", total: 100,
  currency: "PHP", parser_evidence: { source_text: "MODEL TRANSCRIPT" },
  currency_resolution: { source: "printed_currency", evidence: "PHP" },
};
const supported = requireReceiptFieldEvidence(details, source);
assert.deepEqual(supported.core_field_evidence, {
  source: "optical_text",
  merchant: { status: "supported", label: "Trade name：Harbour Coffee" },
  date: { status: "supported", label: "Purchase Date:\n2026-11-16" },
  total: { status: "supported", label: "Amount Paid:\nPHP 100.00" },
  currency: { status: "supported", label: "Amount Paid:\nPHP 100.00" },
});
assert.deepEqual(incompleteReceiptFields(supported), []);
assert.equal(supported.parser_evidence.source_text, "MODEL TRANSCRIPT");
const unsupported = requireReceiptFieldEvidence(details, "OFFICIAL RECEIPT\nCoffee 100.00\nCash 100.00\nPrint date: 2026-11-16");
assert.deepEqual(incompleteReceiptFields(unsupported), ["merchant", "date", "currency", "total"]);
assert.equal(unsupported.core_field_evidence.total.status, "uncertain");
assert.equal(requireReceiptFieldEvidence(details, source.replace("2026-11-16", "11/12/26")).transaction_date, null);
const suggested = requireReceiptFieldEvidence({ ...details, currency_resolution: { source: "user_default" } }, source.replace("PHP ", ""));
assert.equal(suggested.core_field_evidence.currency.status, "suggested");
assert.equal(suggested.currency, "PHP");
console.log("Core receipt evidence preserves printed labels and leaves unsupported fields for review.");

const incompleteLocal = requireReceiptFieldEvidence(details, source.replace("Purchase Date:\n2026-11-16", "Purchase Date: unreadable"));
assert.deepEqual(receiptBackupQuestions(incompleteLocal), [
  "Which purchase date is printed in the transaction header? Exclude print and expiry dates.",
]);
const model = { ...unsupported, merchant_raw: "Another Cafe", total: 120, transaction_date: "2026-11-15", currency: "USD" };
const protectedFields = keepVerifiedReceiptFields(model, incompleteLocal);
assert.equal(protectedFields.merchant_raw, "Harbour Coffee");
assert.equal(protectedFields.total, 100);
assert.equal(protectedFields.currency, "PHP");
assert.equal(protectedFields.transaction_date, "2026-11-15", "An unverified field is not protected from a separately grounded candidate");
assert.deepEqual(protectedFields.core_field_evidence.total, supported.core_field_evidence.total);


const deferred = { importMode: "receipt", coreOnly: false, localItemsDeferred: true, hasDocument: true, imageCount: 1, itemCount: 0, allocationCount: 0 };
assert(hasIndependentReceiptCore(supported.core_field_evidence));
assert(!hasIndependentReceiptCore(incompleteLocal.core_field_evidence));
assert(!hasIndependentReceiptCore(suggested.core_field_evidence));
assert(!hasIndependentReceiptCore(requireReceiptFieldEvidence(details, source.replace("Amount Paid:", "Cash tendered:")).core_field_evidence));
assert(shouldRefineReceiptCore(deferred));
assert(!shouldRefineReceiptCore({ ...deferred, imageCount: 0 }));
assert(!shouldRefineReceiptCore({ ...deferred, importMode: "statement" }));
assert(!shouldRefineReceiptCore({ ...deferred, localItemsDeferred: false }));

const columnEvidence = requireReceiptFieldEvidence({...details,merchant_raw:"QUICK MEALS CORPORATION",merchant_clean:"QUICK MEALS CORPORATION",transaction_date:"2026-10-23",total:250,parser_evidence:{source_text:columnReceipt},currency_resolution:{source:"receipt_location",evidence:"BIR"}},columnReceipt);
assert.equal(columnEvidence.total,250);
assert.equal(columnEvidence.core_field_evidence.total.status,"supported");
assert.equal(columnEvidence.core_field_evidence.currency.status,"suggested","Regional currency remains a suggestion");
assert.equal(columnEvidence.parser_evidence.source_text,columnReceipt,"Layout recovery never replaces original evidence");
assert.equal(requireReceiptFieldEvidence({...columnEvidence,core_field_evidence:undefined},columnReceipt.replace("750.00","749.00")).total,null,"Unreconciled columns cannot establish a payable total");
