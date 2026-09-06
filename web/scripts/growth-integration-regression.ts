// Opt-in integration test. Only runs against the named disposable local fixture DB.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import {
  prepareReferralCheckout,
  recordGrowthPayment,
  claimReferralReward,
  reverseGrowthPayment,
} from "../lib/growth";
import { getProAccess, refreshProAccess } from "../lib/pro-access";
import { campaignRulesSchema } from "../lib/growth-rules";
import { POST as adminGrant } from "../app/api/admin/users/[userId]/plan/route";
import { POST as adminCampaign } from "../app/api/admin/campaigns/route";
import { addCalendarMonths } from "../lib/pro-access-rules";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.pathname, "/clover_growth_test");
  assert.notEqual(process.env.NODE_ENV, "production");
  const prefix = randomUUID().slice(0, 8),
    now = new Date(),
    later = new Date(+now + 86400000 * 90);
  const user = async (name: string, environment = "production") =>
    prisma.user.create({
      data: {
        clerkUserId: `growth-${prefix}-${name}`,
        email: `${name}-${prefix}@example.test`,
        verified: true,
        environment,
      },
    });
  const owner = await user("owner"),
    buyer = await user("buyer"),
    buyer2 = await user("buyer2"),
    refunded = await user("refunded"),
    foreign = await user("foreign", "staging"),
    capped = await user("capped");
  const rules = campaignRulesSchema.parse({ holdDays: 0, maxPerReferrer: 2 });
  const campaign = await prisma.growthCampaign.create({
    data: {
      name: `Fixture ${prefix}`,
      environment: "production",
      status: "active",
      startsAt: new Date(+now - 60000),
      endsAt: later,
      rules,
      terms:
        "Fixture terms: first paid purchase, no self-referrals, one calendar month per qualified referral.",
      publishedAt: now,
    },
  });
  const code = `TEST${prefix.toUpperCase()}`;
  await prisma.referralCode.create({
    data: { userId: owner.id, campaignId: campaign.id, code },
  });
  await assert.rejects(
    () => prepareReferralCheckout(owner.id, "paypal", "I-FIXTURE", code, "PH"),
    /yourself/,
  );
  await assert.rejects(
    () =>
      prepareReferralCheckout(foreign.id, "paypal", "I-FIXTURE", code, "PH"),
    /invalid/,
  );
  const payment = async (id: string, n: string) => {
    const checkout = await prepareReferralCheckout(
      id,
      "paypal",
      "I-FIXTURE",
      code,
      "PH",
    );
    const paidAt = new Date(Date.now() + 1000),
      paidThrough = addCalendarMonths(paidAt, 1);
    await prisma.billingSubscription.create({
      data: {
        userId: id,
        providerSubscriptionId: `I-${prefix}-${n}`,
        providerPlanId: "I-FIXTURE",
        status: "active",
        planTier: "pro",
        interval: "monthly",
        currentPeriodEnd: paidThrough,
      },
    });
    return {
      provider: "paypal" as const,
      paymentId: `PAY-${prefix}-${n}`,
      userId: id,
      subscriptionId: `I-${prefix}-${n}`,
      checkoutId: checkout.checkoutId,
      planId: "I-FIXTURE",
      amount: "169",
      currency: "PHP",
      paidAt,
      paidThrough,
    };
  };
  const first = await payment(buyer.id, "1");
  first.paidAt = new Date();
  await Promise.all([
    recordGrowthPayment(first),
    recordGrowthPayment(first),
    recordGrowthPayment(first),
  ]);
  assert.equal(
    await prisma.referralReward.count({ where: { campaignId: campaign.id } }),
    1,
  );
  assert.equal((await getProAccess(buyer.id)).planTier, "pro");
  await prisma.billingSubscription.update({
    where: { userId: buyer.id },
    data: { status: "cancelled", planTier: "free" },
  });
  assert.equal(
    await refreshProAccess(buyer.id),
    "pro",
    "Cancellation retains verified paid time",
  );
  const reward = await prisma.referralReward.findUniqueOrThrow({
    where: { referredId: buyer.id },
  });
  await prisma.billingSubscription.create({
    data: {
      userId: owner.id,
      providerSubscriptionId: `I-${prefix}-owner`,
      status: "active",
      planTier: "pro",
      interval: "annual",
      paidThrough: later,
    },
  });
  await assert.rejects(
    () => claimReferralReward(owner.id, reward.id),
    /banked/,
  );
  await prisma.billingSubscription.update({
    where: { userId: owner.id },
    data: { status: "cancelled", paidThrough: null },
  });
  await prisma.user.update({
    where: { id: owner.id },
    data: { planTierLocked: true },
  });
  await assert.rejects(
    () => claimReferralReward(owner.id, reward.id),
    /override/,
  );
  await prisma.user.update({
    where: { id: owner.id },
    data: { planTierLocked: false },
  });
  await prisma.referralReward.update({
    where: { id: reward.id },
    data: { availableAt: later },
  });
  await assert.rejects(
    () => claimReferralReward(owner.id, reward.id),
    /not available/,
  );
  await prisma.referralReward.update({
    where: { id: reward.id },
    data: { availableAt: now, expiresAt: now },
  });
  await assert.rejects(
    () => claimReferralReward(owner.id, reward.id),
    /not available/,
  );
  await prisma.referralReward.update({
    where: { id: reward.id },
    data: { expiresAt: null },
  });
  const grant = await claimReferralReward(owner.id, reward.id);
  await assert.rejects(
    () => claimReferralReward(owner.id, reward.id),
    /not available/,
  );
  assert.equal((await getProAccess(owner.id)).source, "complimentary");
  const second = await payment(buyer2.id, "2");
  second.paidAt = new Date();
  await prisma.growthCampaign.update({
    where: { id: campaign.id },
    data: { status: "paused" },
  });
  await recordGrowthPayment(second);
  const reward2 = await prisma.referralReward.findUniqueOrThrow({
    where: { referredId: buyer2.id },
  });
  const grant2 = await claimReferralReward(owner.id, reward2.id);
  assert.equal(+grant2.startsAt, +grant.endsAt, "Rewards stack contiguously");
  await assert.rejects(
    () =>
      prepareReferralCheckout(refunded.id, "paypal", "I-FIXTURE", code, "PH"),
    /not accepting/,
  );
  await prisma.growthCampaign.update({
    where: { id: campaign.id },
    data: { status: "active" },
  });
  const beforeRefund = await payment(refunded.id, "refund");
  beforeRefund.paidAt = new Date();
  await reverseGrowthPayment("paypal", beforeRefund.paymentId);
  await recordGrowthPayment(beforeRefund);
  assert.equal(
    await prisma.referralReward.count({ where: { referredId: refunded.id } }),
    0,
    "Out-of-order refunds suppress rewards",
  );
  const capPayment = await payment(capped.id, "cap");
  capPayment.paidAt = new Date();
  await recordGrowthPayment(capPayment);
  assert.equal(
    (
      await prisma.referralReward.findUniqueOrThrow({
        where: { referredId: capped.id },
      })
    ).status,
    "review",
  );
  await reverseGrowthPayment("paypal", first.paymentId);
  assert.equal(
    (
      await prisma.referralReward.findUniqueOrThrow({
        where: { id: reward.id },
      })
    ).status,
    "review",
    "Claimed refunds require review",
  );
  const request = (body: unknown) =>
    new Request("http://localhost:3014/api/admin/test", {
      method: "POST",
      headers: {
        origin: "http://localhost:3014",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  const context = { params: Promise.resolve({ userId: owner.id }) };
  const res = await adminGrant(
    request({
      action: "edit",
      grantId: grant.id,
      startsAt: new Date(+now - 86400000 * 2).toISOString(),
      endsAt: new Date(+now - 86400000).toISOString(),
      reason: "Fixture expiry correction",
    }),
    context,
  );
  assert.equal(res.status, 200, await res.text());
  assert.equal(
    (await getProAccess(owner.id)).planTier,
    "free",
    "A future disconnected grant cannot keep access alive",
  );
  const audit = await prisma.growthAudit.findFirst({
    where: { targetId: owner.id, action: "edit" },
  });
  assert.ok(audit?.before && audit.after);
  const immutable = await adminCampaign(
    request({
      action: "save",
      id: campaign.id,
      reason: "Try editing published campaign",
      campaign: {
        name: "Mutated",
        startsAt: now.toISOString(),
        endsAt: later.toISOString(),
        rules,
        terms: campaign.terms,
      },
    }),
  );
  assert.equal(immutable.status, 400);
  assert.equal(
    (
      await prisma.growthCampaign.findUniqueOrThrow({
        where: { id: campaign.id },
      })
    ).name,
    campaign.name,
  );
  const invalid = await adminGrant(
    request({
      action: "grant",
      startsAt: later.toISOString(),
      endsAt: now.toISOString(),
      reason: "Invalid dates test",
    }),
    context,
  );
  assert.equal(invalid.status, 400);
  console.log(
    JSON.stringify({
      pass: true,
      campaignId: campaign.id,
      ownerId: owner.id,
      buyerId: buyer.id,
      checks: [
        "duplicate payment concurrency",
        "verified paid-through cancellation",
        "calendar stacking",
        "self/cross-environment rejection",
        "pause snapshot preservation",
        "refund-before-payment",
        "claimed refund review",
        "caps",
        "dated expiry",
        "immutable campaign terms",
        "audited manual edits",
      ],
    }),
  );
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
