import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveBudgetingWorkspace } from "@/lib/budgeting-context";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { isAdminOnlyDataError, isUnauthorizedDataError } from "@/lib/transient-data";

const planSchema = z.object({ name: z.string().trim().min(2).max(80) });

export async function POST(request: Request) {
  assertTrustedRequestOrigin(request);
  let context: Awaited<ReturnType<typeof resolveBudgetingWorkspace>>;
  try {
    context = await resolveBudgetingWorkspace();
  } catch (error) {
    if (isUnauthorizedDataError(error)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (isAdminOnlyDataError(error)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
  if (!context.workspaceId) return NextResponse.json({ error: "Workspace unavailable" }, { status: 400 });
  const parsed = planSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Use a plan name between 2 and 80 characters." }, { status: 400 });
  const plan = await prisma.budgetPlan.create({
    data: { workspaceId: context.workspaceId, name: parsed.data.name },
    select: { id: true, name: true },
  });
  return NextResponse.json({ plan }, { status: 201 });
}
