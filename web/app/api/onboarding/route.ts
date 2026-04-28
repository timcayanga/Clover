import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { capturePostHogServerEvent } from "@/lib/analytics";

export const dynamic = "force-dynamic";

const onboardingSchema = z.object({
  experience: z.enum(["beginner", "comfortable", "advanced"]).optional().nullable(),
  goal: z.string().trim().min(1).max(80).optional().nullable(),
  goals: z.array(z.string().trim().min(1).max(80)).optional().default([]),
  startAction: z.string().trim().min(1).max(80).optional().nullable(),
  targetAmount: z.string().trim().min(1).max(32).optional().nullable(),
  skipped: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  try {
    const stagingGuestRequested =
      request.headers.get("x-staging-guest") === "1" &&
      ((request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
        .split(",")[0]
        .split(":")[0]
        .toLowerCase() === "staging.clover.ph");
    const { userId } = stagingGuestRequested ? { userId: "staging-guest" } : await requireAuth();
    const payload = onboardingSchema.parse(await request.json());
    const user = await getOrCreateCurrentUser(userId);
    const primaryGoal = payload.skipped ? null : payload.goal ?? payload.goals[0] ?? null;
    const targetAmount = payload.skipped || payload.targetAmount === null || payload.targetAmount === undefined ? null : new Prisma.Decimal(payload.targetAmount);
    const goalPlan =
      primaryGoal === null
        ? null
        : {
            goalKey: primaryGoal,
            targetMode: "amount",
            cadence: "monthly",
            targetAmount: targetAmount ? Number(targetAmount.toString()) : null,
            targetPercent: null,
            purpose: null,
          };

    const updated = await prisma.$transaction(async (tx) => {
      const userUpdate = await tx.user.update({
        where: { id: user.id },
        data: {
          planTier: "free",
          financialExperience: payload.experience ?? user.financialExperience,
          primaryGoal,
          goalTargetAmount: targetAmount,
          goalTargetSource: targetAmount ? "onboarding" : null,
          goalPlan: goalPlan === null ? Prisma.DbNull : (goalPlan as Prisma.InputJsonValue),
          onboardingCompletedAt: new Date(),
        },
      });

      if (primaryGoal !== null || targetAmount !== null) {
        await tx.goalSetting.create({
          data: {
            userId: user.id,
            primaryGoal,
            targetAmount,
            source: "onboarding",
            goalPlan: goalPlan === null ? Prisma.DbNull : (goalPlan as Prisma.InputJsonValue),
          },
        });
      }

      return userUpdate;
    });

    void capturePostHogServerEvent("onboarding_completed", userId, {
      experience: payload.experience ?? user.financialExperience ?? null,
      primary_goal: primaryGoal ?? null,
      start_action: payload.startAction ?? null,
      skipped: payload.skipped,
      goal_count: payload.goals.length,
      goal_target_amount: payload.targetAmount ? Number(payload.targetAmount) : null,
      goal_target_mode: goalPlan?.targetMode ?? null,
      goal_target_cadence: goalPlan?.cadence ?? null,
    });

    if (targetAmount !== null) {
      void capturePostHogServerEvent("goal_target_saved", userId, {
        primary_goal: primaryGoal ?? null,
        target_amount: Number(targetAmount.toString()),
        source: "onboarding",
      });
    }

    return NextResponse.json({ user: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save onboarding" },
      { status: 400 }
    );
  }
}
