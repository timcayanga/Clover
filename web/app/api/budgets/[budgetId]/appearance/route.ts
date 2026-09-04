import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveBudgetingWorkspace } from "@/lib/budgeting-context";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { isBudgetEmoji } from "@/lib/budget-appearance";

const appearanceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  emoji: z.string().refine(isBudgetEmoji).nullable(),
}).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  assertTrustedRequestOrigin(request);
  const context = await resolveBudgetingWorkspace();
  if (!context.workspaceId) return NextResponse.json({ error: "Workspace unavailable" }, { status: 400 });
  const parsed = appearanceSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter a name and choose a budget icon." }, { status: 400 });
  const { budgetId } = await params;
  // Presentation-only update: cannot reset a target, scope, currency or activity state.
  const updated = await prisma.budget.updateMany({
    where: { id: budgetId, workspaceId: context.workspaceId },
    data: { name: parsed.data.name, emoji: parsed.data.emoji },
  });
  if (!updated.count) return NextResponse.json({ error: "Budget not found" }, { status: 404 });
  return NextResponse.json({ appearance: parsed.data });
}
