import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { GOAL_OPTIONS } from "@/lib/goals";

export const dynamic = "force-dynamic";

const goalValues = GOAL_OPTIONS.map((goal) => goal.value) as [string, ...string[]];

const updateGoalSchema = z.object({
  goal: z.enum(goalValues).nullable().optional(),
});

export async function GET() {
  try {
    const { userId } = await requireAuth();
    const user = await getOrCreateCurrentUser(userId);

    return NextResponse.json({
      goal: user.primaryGoal,
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

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        primaryGoal: payload.goal ?? null,
      },
    });

    return NextResponse.json({
      user: {
        id: updated.id,
        primaryGoal: updated.primaryGoal,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update goal" },
      { status: 400 }
    );
  }
}
