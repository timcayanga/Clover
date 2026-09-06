import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { claimReferralReward, growthTransaction } from "@/lib/growth";
import { getProAccess } from "@/lib/pro-access";

async function currentUser() {
  const { userId } = await auth();
  if (!userId) throw new Error("Sign in to view referrals.");
  return getOrCreateCurrentUser(userId);
}
export async function GET() {
  try {
    const user = await currentUser();
    const now = new Date();
    const [campaigns, rewards, access] = await Promise.all([
      prisma.growthCampaign.findMany({
        where: {
          environment: user.environment,
          status: { in: ["active", "scheduled"] },
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
        select: {
          id: true,
          name: true,
          terms: true,
          rules: true,
          endsAt: true,
          codes: { where: { userId: user.id }, select: { code: true } },
        },
        take: 20,
      }),
      prisma.referralReward.findMany({
        where: { referrerId: user.id },
        select: {
          id: true,
          months: true,
          status: true,
          availableAt: true,
          expiresAt: true,
          claimedAt: true,
          reason: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      getProAccess(user.id),
    ]);
    return NextResponse.json({
      campaigns,
      rewards,
      access: {
        planTier: access.planTier,
        source: access.source,
        renewing: access.renewing,
        paidThrough: access.paidThrough,
        accessEndsAt: access.accessEndsAt,
        user: { planTierLocked: access.user.planTierLocked },
        subscription: access.subscription,
      },
      verified: user.verified,
    });
  } catch {
    return NextResponse.json(
      { error: "Sign in to view your plan and referrals." },
      { status: 401 },
    );
  }
}
export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const user = await currentUser();
    const body = z
      .object({
        action: z.enum(["code", "claim"]),
        id: z.string().min(1),
        acceptTerms: z.boolean().optional(),
      })
      .parse(await request.json());
    if (!user.verified)
      throw new Error("Verify your email before participating.");
    if (body.action === "claim")
      return NextResponse.json({
        grant: await claimReferralReward(user.id, body.id),
      });
    if (!body.acceptTerms)
      throw new Error("Accept the campaign terms before creating your code.");
    const code = await growthTransaction(async (tx) => {
      const now = new Date();
      await tx.growthCampaign.findFirstOrThrow({
        where: {
          id: body.id,
          environment: user.environment,
          status: { in: ["active", "scheduled"] },
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
      });
      const result = await tx.referralCode.upsert({
        where: { userId_campaignId: { userId: user.id, campaignId: body.id } },
        update: {},
        create: {
          userId: user.id,
          campaignId: body.id,
          code: randomBytes(8).toString("hex").toUpperCase(),
        },
      });
      await tx.growthAudit.create({
        data: {
          actorId: user.id,
          targetId: body.id,
          action: "terms_accepted",
          reason:
            "User accepted immutable campaign terms and requested a referral code",
          after: { codeId: result.id },
        },
      });
      return result;
    });
    return NextResponse.json({ code: code.code });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update referrals.",
      },
      { status: 400 },
    );
  }
}
