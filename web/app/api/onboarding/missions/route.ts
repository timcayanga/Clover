import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { getOnboardingMissionSnapshot } from "@/lib/onboarding-missions";
import { capturePostHogServerEvent } from "@/lib/analytics";

export const dynamic = "force-dynamic";

const actionSchema = z.object({
  action: z.enum(["check_data", "open_insights", "dismiss"]),
});

const resolveMissionContext = async () => {
  const { userId } = await requireAuth();
  const user = await getOrCreateCurrentUser(userId);
  const selectedWorkspaceId = (await cookies()).get(selectedWorkspaceKey)?.value ?? "";
  const workspace =
    (selectedWorkspaceId
      ? await prisma.workspace.findFirst({
          where: { userId: user.id, id: selectedWorkspaceId },
          select: { id: true },
        })
      : null) ??
    (await prisma.workspace.findFirst({
      where: { userId: user.id },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    }));
  return { userId, user, workspace };
};

export async function GET() {
  try {
    const { user, workspace } = await resolveMissionContext();
    if (!workspace) return NextResponse.json({ missions: null });
    return NextResponse.json({ missions: await getOnboardingMissionSnapshot([user.id, user.clerkUserId], workspace.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load missions" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const payload = actionSchema.parse(await request.json());
    const { userId, user, workspace } = await resolveMissionContext();
    if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

    const action = payload.action === "dismiss" ? "onboarding_mission.dismissed" : `onboarding_mission.${payload.action}`;
    const existing = await prisma.auditLog.findFirst({
      where: { workspaceId: workspace.id, actorUserId: user.id, action },
      select: { id: true },
    });
    if (!existing) {
      await prisma.auditLog.create({
        data: {
          workspaceId: workspace.id,
          actorUserId: user.id,
          action,
          entity: "OnboardingMission",
          entityId: payload.action,
          metadata: { source: "guided_missions" },
        },
      });
      void capturePostHogServerEvent(
        payload.action === "dismiss" ? "onboarding_missions_dismissed" : "onboarding_mission_completed",
        userId,
        { mission_id: payload.action, workspace_id: workspace.id },
      );
    }

    return NextResponse.json({ missions: await getOnboardingMissionSnapshot([user.id, user.clerkUserId], workspace.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update missions" }, { status: 400 });
  }
}
