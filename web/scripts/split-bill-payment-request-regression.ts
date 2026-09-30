import assert from "node:assert/strict";
import { paymentRequestSchema } from "../lib/split-bill-payment-request-schema";
const payload = { recipientParticipantId: "bea", payeeParticipantId: "alex", amount: "450.00", paymentProfileId: "gcash" };
for (const recipientEmail of [undefined, null, "", "   "]) {
  const result = paymentRequestSchema.parse({ ...payload, recipientEmail });
  assert.equal(result.paymentProfileId, "gcash");
  assert.equal(result.amount, "450.00");
  assert(!result.recipientEmail, "Messaging requests must not require an email.");
}
assert.equal(paymentRequestSchema.parse({ ...payload, recipientEmail: " bea@example.com " }).recipientEmail, "bea@example.com");
assert(!paymentRequestSchema.safeParse({ ...payload, recipientEmail: "not an email" }).success);
assert(!paymentRequestSchema.safeParse({ ...payload, recipientParticipantId: "" }).success);
assert(!paymentRequestSchema.safeParse({ ...payload, note: "x".repeat(241) }).success);
console.log("Payment request validation: email optional for sharing, nonempty invalid addresses rejected, saved option preserved.");

import { mobileSplitBillInput, mobileSplitBillPayload } from "../lib/mobile-together-input";
const receipt = { fileName: "dinner.pdf", mimeType: "application/pdf", storageKey: "split-bill-receipts/demo/receipt", text: "RAW COFFEE 150 PASTA 450 SERVICE 60", confidence: 85, items: [{ description: "COFFEE", amount: "150" }, { description: "PASTA", amount: "450" }] };
const dinner = { title: "Dinner", note: "", billDate: "2026-09-30", currency: "PHP", total: "660", participants: [{ name: "Alex" }, { name: "Bea" }], paidByIndex: 0, receipt, reviewedItems: [{ description: "Coffee", amount: "150" }, { description: "Pasta", amount: "450" }, { description: "Service charge", amount: "60" }] };
const converted = mobileSplitBillPayload(mobileSplitBillInput.parse(dinner));
assert.equal(converted.items.length, 3, "Review must preserve assignable items rather than collapsing to a total.");
assert.deepEqual(converted.rawPayload?.receipt, { text: receipt.text, items: receipt.items, confidence: 85 });
assert.equal(converted.items.reduce((sum, item) => sum + Number(item.amount), 0), 660);
assert.equal(converted.payments[0].amount, "660");
assert(converted.items.every(item => item.participantIds.length === 2));
assert(!mobileSplitBillInput.safeParse({ ...dinner, reviewedItems: dinner.reviewedItems.slice(0, 2) }).success, "Missing service charge cannot silently be lost.");
assert(!mobileSplitBillInput.safeParse({ ...dinner, reviewedItems: [{ description: "Bad", amount: "NaN" }] }).success);
assert.equal(mobileSplitBillPayload(mobileSplitBillInput.parse({ ...dinner, reviewedItems: undefined })).items.length, 1, "Old clients keep their explicitly confirmed total behavior.");
console.log("Receipt review: line items retained, totals reconciled, raw extraction untouched, old clients compatible.");
