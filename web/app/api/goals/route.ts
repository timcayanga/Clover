import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { GOAL_OPTIONS } from "@/lib/goals";
import { capturePostHogServerEvent } from "@/lib/analytics";

export const dynamic = "force-dynamic";

const goalValues = GOAL_OPTIONS.map((goal) => goal.value) as [string, ...string[]];

const updateGoalSchema = z.object({
  goal: z.enum(goalValues).nullable().optional(),
  targetAmount: z.string().trim().min(1).max(32).nullable().optional(),
});

export async function GET() {
  try {
    const { userId } = await requireAuth();
    const user = await getOrCreateCurrentUser(userId);

    return NextResponse.json({
      goal: user.primaryGoal,
      targetAmount: user.goalTargetAmount ? user.goalTargetAmount.toString() : null,
      targetSource: user.goalTargetSource,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(request: Request) {
  try {
    const { userId } = await requireAuth();
    const user = await getOrCreateCurrentUser(userId);
    const payload = updateGoalSchema.parse(await request.json());
    const targetAmount = payload.targetAmount === undefined ? undefined : payload.targetAmount === null ? null : new Prisma.Decimal(payload.targetAmount);
    const nextGoal = payload.goal === undefined ? user.primaryGoal : payload.goal;
    const nextTargetAmount = targetAmount === undefined ? user.goalTargetAmount : targetAmount;

    const updated = await prisma.$transaction(async (tx) => {
      const userUpdate = await tx.user.update({
        where: { id: user.id },
        data: {
          primaryGoal: payload.goal === undefined ? undefined : payload.goal,
          goalTargetAmount: targetAmount === undefined ? undefined : targetAmount,
          goalTargetSource: targetAmount === undefined ? undefined : "goals",
        },
      });

      if (payload.goal !== undefined || targetAmount !== undefined) {
        await tx.goalSetting.create({
          data: {
            userId: user.id,
            primaryGoal: nextGoal,
            targetAmount: nextTargetAmount,
            source: "goals",
          },
        });
      }

      return userUpdate;
    });

    void capturePostHogServerEvent("goal_target_saved", userId, {
      primary_goal: nextGoal ?? null,
      target_amount: nextTargetAmount ? Number(nextTargetAmount.toString()) : null,
      source: "goals",
    });

    return NextResponse.json({
      user: {
        id: updated.id,
        primaryGoal: updated.primaryGoal,
        targetAmount: updated.goalTargetAmount ? updated.goalTargetAmount.toString() : null,
        targetSource: updated.goalTargetSource,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update goal" },
      { status: 400 }
    );
  }
}
