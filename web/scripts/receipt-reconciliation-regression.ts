import assert from "node:assert/strict";
import { assessReceiptPreviewQuality, parseReceiptText } from "../lib/split-bill";
import { receiptReconciliationIssues } from "../lib/receipt-reconciliation";
import { getTransactionReviewReasons } from "../lib/transaction-review-reasons";

const raw = [
  "HARBOUR COFFEE", "OFFICIAL RECEIPT", "2026-11-15",
  "Coffee 2 x 10.00 20.00", "Subtotal PHP 20.00", "VAT Amount 2.40",
  "Service Charge 1.00", "Discount 0.20", "Rounding -0.01", "Grand Total PHP 23.19",
].join("\n");
const preview = parseReceiptText(raw);
assert.equal(preview.rounding, "-0.01");
assert.equal(preview.total, "23.19");
assert.equal(preview.serviceCharge, "1.00");
const checked = assessReceiptPreviewQuality(preview);
assert.ok(!checked.issues.some(issue => /^Receipt (?:total|line item)/u.test(issue)));

const damaged = raw.replace("Coffee 2 x 10.00 20.00", "Coffee 2 x 10.00 19.00").replace("Grand Total PHP 23.19", "Grand Total PHP 23.49");
const damagedPreview = parseReceiptText(damaged);
assert.equal(damagedPreview.items[0]?.amount, "19.00", "Preserve the printed extension");
assert.equal(damagedPreview.serviceCharge, "1.00", "Preserve the printed service charge");
const issues = assessReceiptPreviewQuality(damagedPreview).issues.filter(issue => /^Receipt (?:total|line item)/u.test(issue));
assert.deepEqual(issues, [
  "Receipt total differs from the subtotal and adjustments by 0.30 PHP.",
  "Receipt line item 1 differs from quantity × unit price by 1.00 PHP.",
  "Receipt line items differ from the subtotal by 1.00 PHP.",
]);
assert.equal(assessReceiptPreviewQuality(damagedPreview).reliableForFastPath, false);
assert.deepEqual(getTransactionReviewReasons({
  reviewStatus: "pending_review", rawPayload: { receiptValidation: { issues } },
}).filter(issue => /^Receipt /u.test(issue)), issues);

const includedTax = { subtotal: 20, total: 20.79, tax: 2.4, service_charge: 1, tip: null, discount: -0.20, rounding: -0.01, currency: "PHP" };
assert.deepEqual(receiptReconciliationIssues(includedTax, []), []);
assert.deepEqual(receiptReconciliationIssues({ ...includedTax, subtotal: 1, total: 1, tax: null, service_charge: null, rounding: null, discount: null },
  [{ quantity: 0.333, unit_price: 3, amount: 1 }]), []);
console.log("Receipt reconciliation passed for printed extensions, discrepancies, included tax, signed adjustments, and review display.");

const grossPriced = {subtotal:21818,total:24000,tax:2182,service_charge:null,tip:null,discount:null,currency:"KRW"};
assert.deepEqual(receiptReconciliationIssues(grossPriced,[{quantity:2,amount:24000}]),[]);
assert.deepEqual(receiptReconciliationIssues({...grossPriced,service_charge:1000,total:25000},[{amount:24000}]),[]);
assert(receiptReconciliationIssues(grossPriced,[{amount:24000.01}]).some(issue=>issue.includes("line items differ")),"An unexplained cent remains reviewable");
assert(receiptReconciliationIssues({...grossPriced,total:24001},[{amount:24000}]).some(issue=>issue.includes("total differs")));
assert(receiptReconciliationIssues({...grossPriced,subtotal:24000,total:24000},[{amount:26182}]).some(issue=>issue.includes("line items differ")),"Informational tax cannot be added twice");
assert(receiptReconciliationIssues(grossPriced,[{quantity:2,unit_price:11000,amount:24000}]).some(issue=>issue.includes("quantity × unit price")),"Tax basis cannot hide a printed extension mismatch");
