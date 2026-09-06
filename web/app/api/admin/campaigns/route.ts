import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAuth, getAdminDataEnvironment } from "@/lib/admin";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { prisma } from "@/lib/prisma";
import { growthTransaction } from "@/lib/growth";
import {
  campaignSchema,
  campaignEligibility,
  reasonSchema,
  jsonSnapshot,
} from "@/lib/growth-rules";

export async function GET() {
  try {
    await requireAdminAuth();
    const campaigns = await prisma.growthCampaign.findMany({
      where: { environment: getAdminDataEnvironment() },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const ids = campaigns.map((c) => c.id);
    const [rewards, counts, checkouts] = await Promise.all([
      prisma.referralReward.findMany({
        where: { campaignId: { in: ids } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.referralReward.groupBy({
        by: ["campaignId", "status"],
        where: { campaignId: { in: ids } },
        _count: true,
        _sum: { months: true },
      }),
      prisma.referralCheckout.groupBy({
        by: ["campaignId"],
        where: { campaignId: { in: ids } },
        _count: true,
      }),
    ]);
    const history = await prisma.growthAudit.findMany({
      where: { targetId: { in: [...ids, ...rewards.map((r) => r.id)] } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({
      campaigns,
      rewards,
      counts,
      checkouts,
      history,
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to load campaigns." },
      { status: 403 },
    );
  }
}
export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const admin = await requireAdminAuth();
    const body = z
      .object({
        action: z.enum(["save", "status", "preview", "review"]),
        id: z.string().optional(),
        reason: reasonSchema,
        campaign: campaignSchema.optional(),
        status: z.enum(["scheduled", "active", "paused", "ended"]).optional(),
        interval: z.enum(["monthly", "annual"]).optional(),
        country: z.string().length(2).optional(),
        decision: z.enum(["release", "revoke"]).optional(),
      })
      .parse(await request.json());
    if (body.action === "preview") {
      const c = campaignSchema.parse(body.campaign);
      return NextResponse.json({
        result:
          campaignEligibility(
            {
              ...c,
              status: "active",
              startsAt: new Date(c.startsAt),
              endsAt: new Date(c.endsAt),
            },
            body.interval ?? "monthly",
            body.country ?? "PH",
          ) ??
          "Eligible plan, country, and dates. Buyer must also be verified, distinct from the referrer, and making their first paid purchase. Rewards remain subject to payment verification and caps.",
      });
    }
    const result = await growthTransaction(async (tx) => {
      if (body.action === "review") {
        const reward = await tx.referralReward.findUniqueOrThrow({
          where: { id: body.id ?? "" },
        });
        await tx.growthCampaign.findFirstOrThrow({
          where: {
            id: reward.campaignId,
            environment: getAdminDataEnvironment(),
          },
        });
        if (reward.status !== "review" || !body.decision)
          throw new Error("Select a flagged reward and a decision.");
        const payment = await tx.growthPayment.findUnique({
          where: { id: reward.paymentId },
        });
        if (body.decision === "release" && payment?.reversedAt)
          throw new Error(
            "Reversed payments cannot qualify. Use a separately audited Admin grant if appropriate.",
          );
        const updated = await tx.referralReward.update({
          where: { id: reward.id },
          data: {
            status:
              body.decision === "release"
                ? reward.claimedAt
                  ? "claimed"
                  : "pending"
                : "revoked",
            reason: body.reason,
          },
        });
        if (body.decision === "revoke")
          await tx.proAccessGrant.updateMany({
            where: { rewardId: reward.id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        await tx.growthAudit.create({
          data: {
            actorId: admin.userId,
            targetId: reward.id,
            action: "review_reward",
            reason: body.reason,
            before: jsonSnapshot(reward),
            after: jsonSnapshot(updated),
          },
        });
        return updated;
      }
      const before = body.id
        ? await tx.growthCampaign.findFirstOrThrow({
            where: { id: body.id, environment: getAdminDataEnvironment() },
          })
        : null;
      let updated;
      if (body.action === "save") {
        const c = campaignSchema.parse(body.campaign);
        if (before?.publishedAt)
          throw new Error(
            "Published rules and terms are immutable. Create a new campaign version instead.",
          );
        updated = before
          ? await tx.growthCampaign.update({
              where: { id: before.id },
              data: c,
            })
          : await tx.growthCampaign.create({
              data: { ...c, environment: getAdminDataEnvironment() },
            });
      } else {
        if (!before || !body.status)
          throw new Error("Choose a campaign and status.");
        if (before.status === "ended")
          throw new Error(
            "Ended campaigns cannot restart. Create a new version.",
          );
        if (
          ["active", "scheduled"].includes(body.status) &&
          before.endsAt <= new Date()
        )
          throw new Error("The campaign end date has passed.");
        updated = await tx.growthCampaign.update({
          where: { id: before.id },
          data: {
            status: body.status,
            publishedAt: before.publishedAt ?? new Date(),
          },
        });
      }
      await tx.growthAudit.create({
        data: {
          actorId: admin.userId,
          targetId: updated.id,
          action: body.action,
          reason: body.reason,
          before: jsonSnapshot(before),
          after: jsonSnapshot(updated),
        },
      });
      return updated;
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update campaign.",
      },
      { status: 400 },
    );
  }
}
