import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { resolveBudgetingWorkspace } from "@/lib/budgeting-context";
import { prisma } from "@/lib/prisma";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { personalGoalInput } from "@/lib/personal-goal-input";
import { invalidateWorkspaceSummaryCache } from "@/lib/workspace-summary-cache";

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    await requireAuth();
    const { workspaceId } = await resolveBudgetingWorkspace();
    if (!workspaceId) return NextResponse.json({ error: "Profile unavailable." }, { status: 403 });
    const parsed = personalGoalInput.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Check the goal details and target amount." }, { status: 400 });
    const { id, goal, targetAmount, currency, goalPlan } = parsed.data;
    const data = {
      goalKey: goal, targetAmount, currency,
      goalPlan: { ...goalPlan, goalKey: goal, targetMode: "amount", targetAmount, targetPercent: null },
    };
    if (id) {
      const result = await prisma.personalGoal.updateMany({ where: { id, workspaceId }, data });
      if (!result.count) return NextResponse.json({ error: "Goal not found." }, { status: 404 });
      invalidateWorkspaceSummaryCache(workspaceId);
      return NextResponse.json({ id });
    }
    const created = await prisma.personalGoal.create({ data: { ...data, workspaceId } });
    invalidateWorkspaceSummaryCache(workspaceId);
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to save goal. Please sign in and try again." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    await requireAuth();
    const { workspaceId } = await resolveBudgetingWorkspace();
    if (!workspaceId) return NextResponse.json({ error: "Profile unavailable." }, { status: 403 });
    const body = await request.json();
    if (typeof body.id !== "string" || !body.id || body.id.length > 240) return NextResponse.json({ error: "Choose a goal." }, { status: 400 });
    const result = await prisma.personalGoal.deleteMany({ where: { id: body.id, workspaceId } });
    if (!result.count) return NextResponse.json({ error: "Goal not found." }, { status: 404 });
    invalidateWorkspaceSummaryCache(workspaceId);
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Unable to delete goal." }, { status: 400 });
  }
}
