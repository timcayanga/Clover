import { prisma } from "@/lib/prisma";
import { getDeploymentEnvironment } from "@/lib/deployment-environment";
import {
  fetchPayPalSubscription,
  snapshotPayPalSubscription,
  resolvePayPalUser,
  type PayPalWebhookBody,
} from "@/lib/paypal-billing";
import type { PaddleWebhookEvent } from "@/lib/paddle-billing";
import { getEnv } from "@/lib/env";
import { recordGrowthPayment, reverseGrowthPayment } from "@/lib/growth";
import { addCalendarMonths } from "@/lib/pro-access-rules";

const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const str = (v: unknown) => (typeof v === "string" ? v : "");

export async function handlePayPalGrowth(event: PayPalWebhookBody) {
  const resource = record(event.resource),
    type = event.event_type;
  if (type === "PAYMENT.SALE.REFUNDED" || type === "PAYMENT.SALE.REVERSED") {
    const id = str(resource.sale_id) || str(resource.id);
    if (id) await reverseGrowthPayment("paypal", id);
    return;
  }
  if (type === "CUSTOMER.DISPUTE.CREATED") {
    for (const item of Array.isArray(resource.disputed_transactions)
      ? resource.disputed_transactions
      : []) {
      const id = str(record(item).seller_transaction_id);
      if (id) await reverseGrowthPayment("paypal", id);
    }
    return;
  }
  if (type !== "PAYMENT.SALE.COMPLETED") return;
  const { user, subscriptionId } = await resolvePayPalUser(event);
  if (!user || !subscriptionId)
    throw new Error("Payment identity is not available yet; retry webhook.");
  const subscription = await fetchPayPalSubscription(subscriptionId);
  if (!subscription)
    throw new Error("Subscription verification unavailable; retry webhook.");
  const snapshot = snapshotPayPalSubscription(subscription);
  if (!snapshot?.interval || !snapshot.providerPlanId) return;
  const amount = record(resource.amount),
    paymentId = str(resource.id);
  if (!paymentId) throw new Error("Missing payment id.");
  await recordGrowthPayment({
    provider: "paypal",
    paymentId,
    userId: user.id,
    subscriptionId,
    planId: snapshot.providerPlanId,
    checkoutId: snapshot.customId?.startsWith("clvref_")
      ? snapshot.customId
      : null,
    amount: str(amount.total) || str(amount.value),
    currency: str(amount.currency) || str(amount.currency_code),
    paidAt: new Date(str(resource.create_time)),
    paidThrough: addCalendarMonths(
      new Date(str(resource.create_time)),
      snapshot.interval === "annual" ? 12 : 1,
    ),
  });
}

export async function handlePaddleGrowth(event: PaddleWebhookEvent) {
  const data = record(event.data);
  if (
    (event.event_type === "adjustment.created" ||
      event.event_type === "adjustment.updated") &&
    data.status === "approved" &&
    ["refund", "chargeback", "chargeback_warning"].includes(str(data.action))
  ) {
    const id = str(data.transaction_id);
    if (id) await reverseGrowthPayment("paddle", id);
    return;
  }
  if (
    event.event_type !== "transaction.completed" ||
    data.status !== "completed"
  )
    return;
  const env = getEnv(),
    custom = record(data.custom_data);
  const subscriptionId = str(data.subscription_id),
    paymentId = str(data.id);
  const user = await prisma.user.findFirst({
    where: {
      environment: getDeploymentEnvironment(),
      OR: [
        { id: str(custom.cloverUserId) },
        { clerkUserId: str(custom.cloverUserId) },
        ...(subscriptionId
          ? [
              {
                billingSubscription: {
                  is: {
                    provider: "paddle" as const,
                    providerSubscriptionId: subscriptionId,
                  },
                },
              },
            ]
          : []),
      ],
    },
  });
  if (!user)
    throw new Error("Payment identity is not available yet; retry webhook.");
  const items = Array.isArray(data.items) ? data.items : [];
  const planId = items
    .map((i) => str(record(record(i).price).id))
    .find(
      (id) =>
        id &&
        [env.PADDLE_MONTHLY_PRICE_ID, env.PADDLE_ANNUAL_PRICE_ID].includes(id),
    );
  if (!planId || !subscriptionId || !paymentId) return;
  const captured = (Array.isArray(data.payments) ? data.payments : [])
    .map(record)
    .filter((p) => p.status === "captured" && Number(p.amount) > 0);
  if (!captured.length) return; // A credit-only or zero-price transaction is not a paid referral.
  const endsAt = str(record(data.billing_period).ends_at);
  await recordGrowthPayment({
    provider: "paddle",
    paymentId,
    userId: user.id,
    subscriptionId,
    planId,
    checkoutId: str(custom.cloverCheckoutId) || null,
    amount: String(captured.reduce((sum, p) => sum + Number(p.amount), 0)),
    currency: str(data.currency_code),
    paidAt: new Date(str(event.occurred_at)),
    paidThrough: endsAt ? new Date(endsAt) : null,
  });
}
