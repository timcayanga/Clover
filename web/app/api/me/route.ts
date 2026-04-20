import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getOrCreateCurrentUser } from "@/lib/user-context";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await requireAuth();
    const user = await getOrCreateCurrentUser(userId);

    return NextResponse.json({
      user: {
        id: user.id,
        planTier: user.planTier,
        primaryGoal: user.primaryGoal,
        onboardingCompletedAt: user.onboardingCompletedAt,
        dataWipedAt: user.dataWipedAt,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
