import { NextResponse } from "next/server";
import { z } from "zod";
import { isBudgetEmoji } from "@/lib/budget-appearance";
import { prisma } from "@/lib/prisma";
import { resolveBudgetingWorkspace } from "@/lib/budgeting-context";
import { isMissingBudgetTableError, loadBudgetWorkspaceData } from "@/lib/budgeting-data";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { isAdminOnlyDataError, isUnauthorizedDataError } from "@/lib/transient-data";

const budgetPayloadSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    emoji: z.string().refine(isBudgetEmoji).nullable().optional(),
    planId: z.string().trim().min(1).nullable().optional(),
    kind: z.enum(["spend_limit", "savings_target"]).default("spend_limit"),
    scope: z.enum(["global", "account", "category"]).default("global"),
    cadence: z.enum(["daily", "weekly", "biweekly", "monthly", "quarterly", "annual"]).default("monthly"),
    targetAmount: z.coerce.number().positive().max(1_000_000_000),
    currency: z.string().trim().min(3).max(8).default("PHP"),
    accountId: z.string().trim().min(1).nullable().optional(),
    categoryId: z.string().trim().min(1).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.kind === "savings_target" && value.scope !== "global") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scope"],
        message: "Savings targets are set at the global level.",
      });
    }

    if (value.scope === "account" && !value.accountId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["accountId"],
        message: "Choose an account for an account budget.",
      });
    }

    if (value.scope === "category" && !value.categoryId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["categoryId"],
        message: "Choose a category for a category budget.",
      });
    }
  });

export async function GET() {
  let context: Awaited<ReturnType<typeof resolveBudgetingWorkspace>>;
  try {
    context = await resolveBudgetingWorkspace();
  } catch (error) {
    if (isUnauthorizedDataError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (isAdminOnlyDataError(error)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw error;
  }
  if (!context.workspaceId) {
    return NextResponse.json({ error: "Workspace unavailable" }, { status: 400 });
  }

  const data = await loadBudgetWorkspaceData(context.workspaceId);
  return NextResponse.json({
    plans: data.plans,
    budgets: data.overview.budgets,
    overview: data.overview,
    categories: data.categories,
    accounts: data.accounts,
    workspaceId: context.workspaceId,
  });
}

export async function POST(request: Request) {
  let context: Awaited<ReturnType<typeof resolveBudgetingWorkspace>>;
  try {
    context = await resolveBudgetingWorkspace();
  } catch (error) {
    if (isUnauthorizedDataError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (isAdminOnlyDataError(error)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw error;
  }
  assertTrustedRequestOrigin(request);
  if (!context.workspaceId) {
    return NextResponse.json({ error: "Workspace unavailable" }, { status: 400 });
  }

  const parsed = budgetPayloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  if (payload.planId && !await prisma.budgetPlan.findFirst({ where: { id: payload.planId, workspaceId: context.workspaceId }, select: { id: true } })) {
    return NextResponse.json({ error: "Choose a valid budget plan." }, { status: 400 });
  }
  const accountId = payload.scope === "account" ? payload.accountId ?? null : null;
  const categoryId = payload.scope === "category" ? payload.categoryId ?? null : null;

  const [account, category] = await Promise.all([
    accountId ? prisma.account.findFirst({ where: { id: accountId, workspaceId: context.workspaceId }, select: { id: true, currency: true } }) : null,
    categoryId ? prisma.category.findFirst({ where: { id: categoryId, workspaceId: context.workspaceId, type: "expense" }, select: { id: true } }) : null,
  ]);
  if ((accountId && !account) || (categoryId && !category)) {
    return NextResponse.json({ error: "Choose a valid account or expense category." }, { status: 400 });
  }
  if (accountId && account?.currency && account.currency.toUpperCase() !== payload.currency.toUpperCase()) {
    return NextResponse.json({ error: `Use ${account.currency} for this account budget.` }, { status: 400 });
  }

  let budget;
  try {
    budget = await prisma.budget.create({
      data: {
        workspaceId: context.workspaceId,
        name: payload.name,
        emoji: payload.emoji ?? null,
        planId: payload.planId ?? null,
        kind: payload.kind,
        scope: payload.kind === "savings_target" ? "global" : payload.scope,
        cadence: payload.cadence,
        targetAmount: payload.targetAmount,
        currency: payload.currency,
        accountId,
        categoryId,
      },
    });
  } catch (error) {
    if (isMissingBudgetTableError(error)) {
      return NextResponse.json(
        {
          error: "Budgeting storage is not ready yet. Please try again after the database migration is applied.",
        },
        { status: 503 }
      );
    }

    throw error;
  }

  const data = await loadBudgetWorkspaceData(context.workspaceId);
  return NextResponse.json({
    budget,
    budgets: data.overview.budgets,
    overview: data.overview,
    accounts: data.accounts,
  });
}
