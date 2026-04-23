import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { capturePostHogServerEvent } from "@/lib/analytics";

export const dynamic = "force-dynamic";

const onboardingSchema = z.object({
  goal: z.string().trim().min(1).max(80).optional().nullable(),
  goals: z.array(z.string().trim().min(1).max(80)).optional().default([]),
  startAction: z.string().trim().min(1).max(80).optional().nullable(),
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

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        planTier: "free",
        primaryGoal,
        onboardingCompletedAt: new Date(),
      },
    });

    void capturePostHogServerEvent("onboarding_completed", userId, {
      primary_goal: primaryGoal ?? null,
      start_action: payload.startAction ?? null,
      skipped: payload.skipped,
      goal_count: payload.goals.length,
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save onboarding" },
      { status: 400 }
    );
  }
}
