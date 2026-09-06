import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { getBillingPlanById } from "@/lib/billing-plans";
import { addCalendarMonths } from "@/lib/pro-access-rules";
import { refreshProAccess } from "@/lib/pro-access";
import {
  campaignEligibility,
  campaignRulesSchema,
  jsonSnapshot,
} from "@/lib/growth-rules";

type Tx = Prisma.TransactionClient;
// Serialize reward mutations across webhooks, Admin edits, and user redemption.
async function lockGrowth(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(728194231)`;
}
export async function growthTransaction<T>(fn: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(
    async (tx) => {
      await lockGrowth(tx);
      return fn(tx);
    },
    { timeout: 15000 },
  );
}

export async function prepareReferralCheckout(
  userId: string,
  provider: "paypal" | "paddle",
  planId: string,
  code: string,
  country: string,
) {
  const env = getEnv();
  const interval =
    provider === "paypal"
      ? getBillingPlanById(planId)?.interval
      : planId === env.PADDLE_MONTHLY_PRICE_ID
        ? "monthly"
        : planId === env.PADDLE_ANNUAL_PRICE_ID
          ? "annual"
          : null;
  if (!interval) throw new Error("This checkout plan is not configured.");
  return growthTransaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      include: { billingSubscription: true },
    });
    const recent = await tx.referralCheckout.count({
      where: { userId, createdAt: { gt: new Date(Date.now() - 3600000) } },
    });
    if (recent >= 30)
      throw new Error("Too many checkout attempts. Please try again later.");
    const previousPayments = await tx.growthPayment.count({
      where: { userId, paidAt: { not: null } },
    });
    const oldPayments = await tx.billingEvent.count({
      where: {
        userId,
        eventType: { in: ["PAYMENT.SALE.COMPLETED", "transaction.completed"] },
      },
    });
    const normalized = code.trim().toUpperCase();
    const referral = normalized
      ? await tx.referralCode.findUnique({
          where: { code: normalized },
          include: { campaign: true, user: true },
        })
      : null;
    if (
      normalized &&
      (!referral || referral.campaign.environment !== user.environment)
    )
      throw new Error("Referral code is invalid.");
    if (referral) {
      if (!user.verified || !referral.user.verified)
        throw new Error("Both accounts must have verified email addresses.");
      if (
        referral.userId === userId ||
        referral.user.email.toLowerCase() === user.email.toLowerCase()
      )
        throw new Error("You cannot refer yourself.");
      if (
        previousPayments ||
        oldPayments ||
        user.billingSubscription?.approvedAt ||
        user.billingSubscription?.paidThrough
      )
        throw new Error(
          "Referral codes are available for first paid purchases only.",
        );
      const error = campaignEligibility(referral.campaign, interval, country);
      if (error) throw new Error(error);
    }
    const rules = campaignRulesSchema.parse(referral?.campaign.rules ?? {});
    const checkout = await tx.referralCheckout.create({
      data: {
        id: `clvref_${randomUUID()}`,
        userId,
        environment: user.environment,
        provider,
        planId,
        interval,
        country,
        campaignId: referral?.campaignId,
        referrerId: referral?.userId,
        code: referral?.code,
        rules,
        terms: referral?.campaign.terms ?? "",
        expiresAt: new Date(Date.now() + rules.purchaseDays * 86400000),
      },
    });
    return {
      checkoutId: checkout.id,
      terms: checkout.terms,
      referralApplied: Boolean(referral),
    };
  });
}

export type QualifiedPayment = {
  provider: "paypal" | "paddle";
  paymentId: string;
  subscriptionId: string;
  checkoutId: string | null;
  userId: string;
  planId: string;
  amount: string;
  currency: string;
  paidAt: Date;
  paidThrough: Date | null;
};

// Called only after provider signature verification and identity/plan validation.
export async function recordGrowthPayment(payment: QualifiedPayment) {
  if (
    !Number.isFinite(Number(payment.amount)) ||
    Number(payment.amount) <= 0 ||
    !Number.isFinite(+payment.paidAt)
  )
    return;
  if (payment.paidThrough && !Number.isFinite(+payment.paidThrough))
    throw new Error(
      "Invalid paid-through date; retry after provider verification.",
    );
  await growthTransaction(async (tx) => {
    const key = `${payment.provider}:${payment.paymentId}`;
    const existing = await tx.growthPayment.findUnique({ where: { id: key } });
    if (existing?.paidAt) return;
    const previous = await tx.growthPayment.count({
      where: { userId: payment.userId, paidAt: { not: null } },
    });
    await tx.growthPayment.upsert({
      where: { id: key },
      create: {
        id: key,
        provider: payment.provider,
        paymentId: payment.paymentId,
        userId: payment.userId,
        checkoutId: payment.checkoutId,
        subscriptionId: payment.subscriptionId,
        amount: payment.amount,
        currency: payment.currency,
        paidAt: payment.paidAt,
        paidThrough: payment.paidThrough,
      },
      update: {
        userId: payment.userId,
        checkoutId: payment.checkoutId,
        subscriptionId: payment.subscriptionId,
        amount: payment.amount,
        currency: payment.currency,
        paidAt: payment.paidAt,
        paidThrough: payment.paidThrough,
      },
    });
    if (payment.paidThrough && !existing?.reversedAt) {
      await tx.billingSubscription.updateMany({
        where: {
          userId: payment.userId,
          provider: payment.provider,
          providerSubscriptionId: payment.subscriptionId,
          OR: [
            { paidThrough: null },
            { paidThrough: { lt: payment.paidThrough } },
          ],
        },
        data: { paidThrough: payment.paidThrough },
      });
    }
    if (previous || existing?.reversedAt || !payment.checkoutId) return;
    const checkout = await tx.referralCheckout.findUnique({
      where: { id: payment.checkoutId },
    });
    if (
      !checkout?.referrerId ||
      !checkout.campaignId ||
      checkout.userId !== payment.userId ||
      checkout.provider !== payment.provider ||
      checkout.planId !== payment.planId ||
      checkout.createdAt > payment.paidAt ||
      checkout.expiresAt < payment.paidAt
    )
      return;
    const buyer = await tx.user.findUnique({ where: { id: payment.userId } });
    const owner = await tx.user.findUnique({
      where: { id: checkout.referrerId },
    });
    if (
      !buyer?.verified ||
      !owner?.verified ||
      buyer.environment !== checkout.environment ||
      owner.environment !== checkout.environment ||
      buyer.id === owner.id
    )
      return;
    const rules = campaignRulesSchema.parse(checkout.rules);
    const [count, total, already] = await Promise.all([
      tx.referralReward.count({
        where: {
          campaignId: checkout.campaignId,
          referrerId: checkout.referrerId,
          status: { not: "revoked" },
        },
      }),
      tx.referralReward.count({
        where: { campaignId: checkout.campaignId, status: { not: "revoked" } },
      }),
      tx.referralReward.findUnique({ where: { referredId: payment.userId } }),
    ]);
    if (already) return;
    const availableAt = new Date(+payment.paidAt + rules.holdDays * 86400000);
    const capped = count >= rules.maxPerReferrer || total >= rules.maxRewards;
    await tx.referralReward.create({
      data: {
        campaignId: checkout.campaignId,
        referrerId: owner.id,
        referredId: buyer.id,
        paymentId: key,
        checkoutId: checkout.id,
        months: rules.months,
        availableAt,
        expiresAt: rules.redemptionDays
          ? new Date(+availableAt + rules.redemptionDays * 86400000)
          : null,
        status: capped ? "review" : "pending",
        reason: capped
          ? "Campaign reward limit reached; Admin review required."
          : null,
      },
    });
  });
  await refreshProAccess(payment.userId);
}

export async function reverseGrowthPayment(
  provider: string,
  paymentId: string,
) {
  await growthTransaction(async (tx) => {
    const key = `${provider}:${paymentId}`;
    await tx.growthPayment.upsert({
      where: { id: key },
      create: { id: key, provider, paymentId, reversedAt: new Date() },
      update: { reversedAt: new Date() },
    });
    const reward = await tx.referralReward.findUnique({
      where: { paymentId: key },
    });
    if (!reward) return;
    await tx.referralReward.update({
      where: { id: reward.id },
      data: {
        status: reward.claimedAt ? "review" : "revoked",
        reason: "Qualifying payment was refunded, reversed, or disputed.",
      },
    });
    await tx.growthAudit.create({
      data: {
        actorId: "billing-webhook",
        targetId: reward.id,
        action: "payment_reversed",
        reason: "Refund or payment reversal",
        before: jsonSnapshot(reward),
      },
    });
  });
}

export async function claimReferralReward(userId: string, rewardId: string) {
  const grant = await growthTransaction(async (tx) => {
    const reward = await tx.referralReward.findFirstOrThrow({
      where: { id: rewardId, referrerId: userId },
    });
    if (
      reward.status !== "pending" ||
      reward.availableAt > new Date() ||
      (reward.expiresAt && reward.expiresAt <= new Date())
    )
      throw new Error("This reward is not available to activate.");
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      include: { billingSubscription: true, proGrants: true },
    });
    if (user.planTierLocked)
      throw new Error(
        "An Admin plan override is active. Contact support before activating rewards.",
      );
    if (user.billingSubscription?.status === "active")
      throw new Error(
        "Your reward is banked. It can be activated after renewal is cancelled; your existing billing is unchanged.",
      );
    let start = new Date(
      Math.max(Date.now(), +(user.billingSubscription?.paidThrough ?? 0)),
    );
    for (const g of user.proGrants
      .filter((g) => !g.revokedAt)
      .sort((a, b) => +a.startsAt - +b.startsAt)) {
      if (g.startsAt <= start && g.endsAt > start) start = g.endsAt;
    }
    const created = await tx.proAccessGrant.create({
      data: {
        userId,
        startsAt: start,
        endsAt: addCalendarMonths(start, reward.months),
        reason: "Earned referral reward",
        actorId: userId,
        source: "referral",
        rewardId,
      },
    });
    await tx.referralReward.update({
      where: { id: rewardId },
      data: { status: "claimed", claimedAt: new Date() },
    });
    await tx.growthAudit.create({
      data: {
        actorId: userId,
        targetId: rewardId,
        action: "reward_claimed",
        reason: "User activated banked reward",
        after: jsonSnapshot(created),
      },
    });
    return created;
  });
  await refreshProAccess(userId);
  return grant;
}
