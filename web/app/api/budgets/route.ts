import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveBudgetingWorkspace } from "@/lib/budgeting-context";
import { isMissingBudgetTableError, loadBudgetWorkspaceData } from "@/lib/budgeting-data";

const budgetPayloadSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    kind: z.enum(["spend_limit", "savings_target"]).default("spend_limit"),
    scope: z.enum(["global", "account", "category"]).default("global"),
    cadence: z.enum(["daily", "weekly", "monthly"]).default("monthly"),
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
  const context = await resolveBudgetingWorkspace();
  if (!context.workspaceId) {
    return NextResponse.json({ error: "Workspace unavailable" }, { status: 400 });
  }

  const data = await loadBudgetWorkspaceData(context.workspaceId);
  return NextResponse.json({
    budgets: data.overview.budgets,
    overview: data.overview,
    accounts: data.accounts,
    categories: data.categories,
    workspaceId: context.workspaceId,
  });
}

export async function POST(request: Request) {
  const context = await resolveBudgetingWorkspace();
  if (!context.workspaceId) {
    return NextResponse.json({ error: "Workspace unavailable" }, { status: 400 });
  }

  const parsed = budgetPayloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  const accountId = payload.scope === "account" ? payload.accountId ?? null : null;
  const categoryId = payload.scope === "category" ? payload.categoryId ?? null : null;

  let budget;
  try {
    budget = await prisma.budget.create({
      data: {
        workspaceId: context.workspaceId,
        name: payload.name,
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
  });
}
