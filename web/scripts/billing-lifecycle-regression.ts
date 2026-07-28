import assert from "node:assert/strict";
import { BillingSubscriptionStatus, PlanTier } from "@prisma/client";
import { shouldCancelPayPalSubscription } from "@/lib/account-management";
import {
  getBillingPlanTierForSubscription,
  getBillingStatus,
} from "@/lib/paypal-billing";

assert.equal(getBillingStatus("ACTIVE"), BillingSubscriptionStatus.active);
assert.equal(getBillingStatus("APPROVAL_PENDING"), BillingSubscriptionStatus.approval_pending);
assert.equal(getBillingStatus("CANCELLED"), BillingSubscriptionStatus.cancelled);
assert.equal(getBillingStatus("SUSPENDED"), BillingSubscriptionStatus.suspended);
assert.equal(getBillingStatus("EXPIRED"), BillingSubscriptionStatus.expired);
assert.equal(getBillingStatus("unexpected"), BillingSubscriptionStatus.unknown);

assert.equal(
  getBillingPlanTierForSubscription(BillingSubscriptionStatus.active, "monthly"),
  PlanTier.pro,
  "an active configured subscription should grant Pro"
);
assert.equal(
  getBillingPlanTierForSubscription(BillingSubscriptionStatus.active, null),
  PlanTier.free,
  "an unrecognized PayPal plan must not grant Pro"
);

for (const status of [
  BillingSubscriptionStatus.approval_pending,
  BillingSubscriptionStatus.active,
  BillingSubscriptionStatus.suspended,
  BillingSubscriptionStatus.unknown,
]) {
  assert.equal(
    shouldCancelPayPalSubscription({
      providerSubscriptionId: "I-SUBSCRIPTION",
      status,
    }),
    true,
    `${status} subscriptions should be cancelled before account deletion`
  );
}

for (const status of [
  BillingSubscriptionStatus.cancelled,
  BillingSubscriptionStatus.expired,
]) {
  assert.equal(
    shouldCancelPayPalSubscription({
      providerSubscriptionId: "I-SUBSCRIPTION",
      status,
    }),
    false,
    `${status} subscriptions should not be cancelled twice`
  );
}

assert.equal(
  shouldCancelPayPalSubscription({
    providerSubscriptionId: null,
    status: BillingSubscriptionStatus.active,
  }),
  false,
  "a local record without a provider subscription cannot call PayPal cancellation"
);

console.log("Billing lifecycle regression checks passed.");
