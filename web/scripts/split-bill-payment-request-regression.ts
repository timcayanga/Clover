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
