import assert from "node:assert/strict";
import "./growth-regression";
import { createHmac } from "node:crypto";
import { BillingProvider, BillingSubscriptionStatus, PlanTier } from "@prisma/client";
import { shouldCancelBillingSubscription } from "@/lib/account-management";
import {
  getPaddleBillingStatus,
  getPaddleCustomerPortalLinks,
  getPaddlePlanTier,
  verifyPaddleWebhookSignature,
} from "@/lib/paddle-billing";
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
    shouldCancelBillingSubscription({
      provider: BillingProvider.paypal,
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
    shouldCancelBillingSubscription({
      provider: BillingProvider.paypal,
      providerSubscriptionId: "I-SUBSCRIPTION",
      status,
    }),
    false,
    `${status} subscriptions should not be cancelled twice`
  );
}

assert.equal(
  shouldCancelBillingSubscription({
    provider: BillingProvider.paypal,
    providerSubscriptionId: null,
    status: BillingSubscriptionStatus.active,
  }),
  false,
  "a local record without a provider subscription cannot call PayPal cancellation"
);

assert.equal(getPaddleBillingStatus("active"), BillingSubscriptionStatus.active);
assert.equal(getPaddleBillingStatus("canceled"), BillingSubscriptionStatus.cancelled);
assert.equal(getPaddleBillingStatus("paused"), BillingSubscriptionStatus.suspended);
assert.equal(getPaddleBillingStatus("past_due"), BillingSubscriptionStatus.suspended);
assert.equal(getPaddleBillingStatus("unexpected"), BillingSubscriptionStatus.unknown);
assert.equal(
  getPaddlePlanTier(BillingSubscriptionStatus.active, "annual"),
  PlanTier.pro,
  "an active configured Paddle price should grant Pro"
);
assert.equal(
  getPaddlePlanTier(BillingSubscriptionStatus.active, null),
  PlanTier.free,
  "an unrecognized Paddle price must not grant Pro"
);
assert.equal(
  shouldCancelBillingSubscription({
    provider: BillingProvider.paddle,
    providerSubscriptionId: "sub_123",
    status: BillingSubscriptionStatus.active,
  }),
  true,
  "an active Paddle subscription must be cancelled before account deletion"
);

const paddlePortalLinks = getPaddleCustomerPortalLinks(
  {
    data: {
      urls: {
        general: {
          overview: "https://sandbox-customer-portal.paddle.com/overview",
        },
        subscriptions: [
          {
            id: "sub_other",
            cancel_subscription: "https://example.com/wrong-subscription",
          },
          {
            id: "sub_test",
            update_subscription_payment_method:
              "https://sandbox-customer-portal.paddle.com/payment-method",
            cancel_subscription:
              "https://sandbox-customer-portal.paddle.com/cancel",
          },
        ],
      },
    },
  },
  "sub_test"
);
assert.deepEqual(paddlePortalLinks, {
  overview: "https://sandbox-customer-portal.paddle.com/overview",
  updatePaymentMethod:
    "https://sandbox-customer-portal.paddle.com/payment-method",
  cancel: "https://sandbox-customer-portal.paddle.com/cancel",
});

const paddleSecret = "pdl_ntfset_test";
const paddleTimestamp = 1_800_000_000;
const paddleBody = JSON.stringify({ event_id: "evt_test", event_type: "subscription.updated" });
const paddleSignature = createHmac("sha256", paddleSecret)
  .update(`${paddleTimestamp}:${paddleBody}`)
  .digest("hex");
assert.equal(
  verifyPaddleWebhookSignature({
    rawBody: paddleBody,
    signatureHeader: `ts=${paddleTimestamp};h1=${paddleSignature}`,
    secret: paddleSecret,
    now: new Date(paddleTimestamp * 1000),
  }),
  true,
  "Paddle webhook signatures should be verified over the untouched raw body"
);
assert.equal(
  verifyPaddleWebhookSignature({
    rawBody: `${paddleBody} `,
    signatureHeader: `ts=${paddleTimestamp};h1=${paddleSignature}`,
    secret: paddleSecret,
    now: new Date(paddleTimestamp * 1000),
  }),
  false,
  "mutating the Paddle webhook body must invalidate its signature"
);

console.log("Billing lifecycle regression checks passed.");
