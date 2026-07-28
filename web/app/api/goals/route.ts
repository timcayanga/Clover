import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { GOAL_OPTIONS } from "@/lib/goals";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { recordAdviserActionCompletion } from "@/lib/adviser-actions";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { summarizeErrorForLog } from "@/lib/security-logging";

export const dynamic = "force-dynamic";

const goalValues = GOAL_OPTIONS.map((goal) => goal.value) as [string, ...string[]];

const goalPlanSchema = z.object({
  goalKey: z.enum(goalValues).optional().nullable(),
  targetMode: z.enum(["amount", "percent"]).optional().default("amount"),
  cadence: z.enum(["monthly", "annual"]).optional().default("monthly"),
  targetAmount: z.union([z.string(), z.number()]).nullable().optional(),
  targetPercent: z.union([z.string(), z.number()]).nullable().optional(),
  purpose: z.string().trim().max(120).nullable().optional(),
});

const updateGoalSchema = z.object({
  goal: z.enum(goalValues).nullable().optional(),
  targetAmount: z.string().trim().min(1).max(32).nullable().optional(),
  goalPlan: goalPlanSchema.nullable().optional(),
});

export async function GET() {
  try {
    const { userId } = await requireAuth();
    const user = await getOrCreateCurrentUser(userId);

    return NextResponse.json({
      goal: user.primaryGoal,
      targetAmount: user.goalTargetAmount ? user.goalTargetAmount.toString() : null,
      targetSource: user.goalTargetSource,
      goalPlan: user.goalPlan,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

const saveGoal = async (request: Request) => {
  try {
    assertTrustedRequestOrigin(request);
    const { userId } = await requireAuth();
    const user = await getOrCreateCurrentUser(userId);
    const workspace = await prisma.workspace.findFirst({
      where: {
        userId: user.id,
      },
      select: {
        id: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });
    const payload = updateGoalSchema.parse(await request.json());
    const targetAmount = payload.targetAmount === undefined ? undefined : payload.targetAmount === null ? null : new Prisma.Decimal(payload.targetAmount);
    const nextGoal = payload.goal === undefined ? user.primaryGoal : payload.goal;
    const nextTargetAmount = targetAmount === undefined ? user.goalTargetAmount : targetAmount;
    const nextGoalPlan =
      payload.goalPlan === undefined
        ? nextGoal === null
          ? null
          : {
              goalKey: nextGoal,
              targetMode: "amount",
              cadence: "monthly",
              targetAmount: nextTargetAmount ? Number(nextTargetAmount.toString()) : null,
              targetPercent: null,
              purpose: null,
            }
        : payload.goalPlan === null
          ? null
          : {
              goalKey: payload.goalPlan.goalKey ?? nextGoal ?? nextGoal ?? GOAL_OPTIONS[0].value,
              targetMode: payload.goalPlan.targetMode ?? "amount",
              cadence: payload.goalPlan.cadence ?? "monthly",
              targetAmount:
                payload.goalPlan.targetAmount === undefined || payload.goalPlan.targetAmount === null
                  ? null
                  : Number(payload.goalPlan.targetAmount),
              targetPercent:
                payload.goalPlan.targetPercent === undefined || payload.goalPlan.targetPercent === null
                  ? null
                  : Number(payload.goalPlan.targetPercent),
              purpose: payload.goalPlan.purpose ?? null,
            };

    const updated = await prisma.$transaction(async (tx) => {
      const nextUser = await tx.user.update({
        where: { id: user.id },
        data: {
          primaryGoal: payload.goal === undefined ? undefined : payload.goal,
          goalTargetAmount: targetAmount === undefined ? undefined : targetAmount,
          goalTargetSource: targetAmount === undefined ? undefined : targetAmount === null ? null : "goals",
          goalPlan: nextGoalPlan === null ? Prisma.DbNull : (nextGoalPlan as Prisma.InputJsonValue),
        },
      });

      if (payload.goal !== undefined || targetAmount !== undefined || payload.goalPlan !== undefined) {
        await tx.goalSetting.create({
          data: {
            userId: user.id,
            primaryGoal: nextGoal,
            targetAmount: nextTargetAmount,
            source: "goals",
            goalPlan: nextGoalPlan === null ? Prisma.DbNull : (nextGoalPlan as Prisma.InputJsonValue),
          },
        });
      }

      return nextUser;
    });

    if (workspace) {
      void Promise.allSettled([
        prisma.auditLog.create({
          data: {
            workspaceId: workspace.id,
            actorUserId: userId,
            action: "goal_updated",
            entity: "Goal",
            entityId: user.id,
            metadata: {
              primaryGoal: nextGoal,
              targetAmount: nextTargetAmount ? Number(nextTargetAmount.toString()) : null,
              goalPlan: nextGoalPlan,
            },
          },
        }),
        recordAdviserActionCompletion({
          workspaceId: workspace.id,
          actorUserId: userId,
          group: "goals",
          itemId: `goal:${user.id}`,
          label: nextGoal ? `Updated goal: ${nextGoal}` : "Cleared goal settings",
          sourceAction: nextGoal ? "goal_updated" : "goal_reset",
          href: "/goals",
          pathname: "/goals",
        }),
      ]).then((auditResults) => {
        const failedAudit = auditResults.find((result) => result.status === "rejected");
        if (failedAudit?.status === "rejected") {
          console.warn("[goals] saved goal but could not record optional audit activity", summarizeErrorForLog(failedAudit.reason));
        }
      });
    }

    void capturePostHogServerEvent("goal_target_saved", userId, {
      primary_goal: nextGoal ?? null,
      target_amount: nextTargetAmount ? Number(nextTargetAmount.toString()) : null,
      goal_target_mode: nextGoalPlan?.targetMode ?? null,
      goal_target_cadence: nextGoalPlan?.cadence ?? null,
      goal_target_purpose: nextGoalPlan?.purpose ?? null,
      source: "goals",
    });

    void capturePostHogServerEvent("goal_updated", userId, {
      primary_goal: nextGoal ?? null,
      target_amount: nextTargetAmount ? Number(nextTargetAmount.toString()) : null,
      goal_target_mode: nextGoalPlan?.targetMode ?? null,
      goal_target_cadence: nextGoalPlan?.cadence ?? null,
      goal_target_purpose: nextGoalPlan?.purpose ?? null,
      source: "goals",
    });

    if (nextGoal === null && nextTargetAmount === null && nextGoalPlan === null) {
      void capturePostHogServerEvent("goal_reset", userId, {
        source: "goals",
      });
    }

    return NextResponse.json({
      user: {
        id: updated.id,
        primaryGoal: updated.primaryGoal,
        targetAmount: updated.goalTargetAmount ? updated.goalTargetAmount.toString() : null,
        targetSource: updated.goalTargetSource,
        goalPlan: updated.goalPlan,
      },
    });
  } catch (error) {
    console.error("[goals] unable to update goal", summarizeErrorForLog(error));
    const safeMessage =
      error instanceof z.ZodError
        ? "Check the goal details and try again."
        : error instanceof Error && error.message === "Untrusted request origin."
          ? error.message
          : "Unable to update goal";
    return NextResponse.json(
      { error: safeMessage },
      { status: 400 }
    );
  }
};

export async function POST(request: Request) {
  return saveGoal(request);
}

export async function PUT(request: Request) {
  return saveGoal(request);
}
