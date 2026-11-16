import { createHash } from "node:crypto";
import { prisma } from "./prisma";
import { capturePostHogServerEvent } from "./analytics-server";
import { getProAccess } from "./pro-access";

type Provider = "paypal" | "paddle";
type VerifiedPayment = {
  id: string; provider: Provider; userId: string; subscriptionId: string;
  paidAt: Date; paidThrough: Date | null; checkoutId: string | null;
};

const paymentKey = (id: string) => createHash("sha256").update(`clover-web-payment:v1:${id}`).digest("hex");

export async function captureVerifiedWebPayment(payment: VerifiedPayment & { planId: string; currency: string }) {
  const user = await prisma.user.findUnique({ where: { id: payment.userId }, select: { environment: true } });
  if (user?.environment !== "production") return;
  const stored = await prisma.growthPayment.findUnique({ where: { id: payment.id }, select: { reversedAt: true, paidAt: true } });
  if (!stored?.paidAt || stored.reversedAt) return;

  const earlier = { userId: payment.userId, paidAt: { lt: payment.paidAt } };
  const [priorSubscription, priorPayment, checkout] = await Promise.all([
    prisma.growthPayment.findFirst({ where: { ...earlier, provider: payment.provider, subscriptionId: payment.subscriptionId }, select: { id: true } }),
    prisma.growthPayment.findFirst({ where: earlier, select: { id: true } }),
    payment.checkoutId ? prisma.referralCheckout.findUnique({ where: { id: payment.checkoutId } }) : null,
  ]);
  const attribution = !priorSubscription && checkout && checkout.userId === payment.userId &&
    checkout.environment === user.environment && checkout.provider === payment.provider &&
    checkout.planId === payment.planId && checkout.createdAt <= payment.paidAt && payment.paidAt <= checkout.expiresAt;
  const key = paymentKey(payment.id);
  await capturePostHogServerEvent("billing_payment_verified", payment.userId, {
    billing_provider: payment.provider, purchase_key: key,
    checkout_attempt_id: attribution ? checkout.id : undefined,
    billing_interval: attribution ? checkout.interval : undefined,
    payment_currency: /^[A-Z]{3}$/.test(payment.currency) ? payment.currency : undefined,
    payment_kind: priorSubscription ? "renewal" : priorPayment ? "returning_purchase" : attribution ? "initial_purchase" : "unattributed_payment",
    provider_paid_at_ms: +payment.paidAt,
    $insert_id: `verified-web-payment:${key}`,
  });
}

export async function captureLatestWebUnlock(userId: string, provider: Provider, subscriptionId: string) {
  const now = new Date();
  const subscription = await prisma.billingSubscription.findUnique({
    where: { userId },
    select: { provider: true, providerSubscriptionId: true, planTier: true, interval: true, paidThrough: true },
  });
  if (subscription?.provider !== provider || subscription.providerSubscriptionId !== subscriptionId ||
      !subscription.paidThrough || subscription.paidThrough <= now) return;
  const payment = await prisma.growthPayment.findFirst({
    where: { provider, subscriptionId, userId, reversedAt: null, paidAt: { lte: now },
      paidThrough: { gt: now, lte: subscription.paidThrough } },
    orderBy: [{ paidAt: "desc" }, { id: "desc" }],
  });
  if (!payment?.paidAt) return;
  const access = await getProAccess(userId);
  if (access.user.environment !== "production" || !access.hasPaidSubscription || access.planTier === "free" || subscription.planTier === "free") return;
  const key = paymentKey(payment.id);
  await capturePostHogServerEvent("billing_access_verified", userId, {
    billing_provider: provider, purchase_key: key,
    provider_paid_at_ms: +payment.paidAt, payment_to_access_ms: +now - +payment.paidAt,
    $insert_id: `verified-web-access:${key}`,
  });
}
