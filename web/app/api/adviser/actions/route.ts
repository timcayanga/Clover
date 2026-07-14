import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { prisma } from "@/lib/prisma";
import { recordAdviserActionCompletion } from "@/lib/adviser-actions";

export const dynamic = "force-dynamic";

const actionSchema = z.object({
  action: z.object({
    id: z.string().min(1).max(120),
    type: z.enum([
      "set_goal",
      "create_budget",
      "create_transaction",
      "edit_transaction",
      "create_account",
      "create_investment",
      "create_split_bill",
    ]),
    payload: z.record(z.string(), z.unknown()).default({}),
    label: z.string().trim().min(1).max(160),
  }),
});

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const stringValue = (value: unknown, fallback = "") => (typeof value === "string" ? value.trim() : fallback);

const getWorkspaceForUser = async (userId: string, requestedWorkspaceId?: string) => {
  const cookieStore = await cookies();
  const selectedWorkspaceId = requestedWorkspaceId || cookieStore.get(selectedWorkspaceKey)?.value || "";
  return (
    (selectedWorkspaceId
      ? await prisma.workspace.findFirst({
          where: { id: selectedWorkspaceId, user: { clerkUserId: userId } },
          select: { id: true },
        })
      : null) ??
    (await prisma.workspace.findFirst({
      where: { user: { clerkUserId: userId } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    }))
  );
};

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const { userId } = await getSessionContext();
    const user = await getOrCreateCurrentUser(userId);
    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "This Adviser action is incomplete." }, { status: 400 });
    }

    const { action } = parsed.data;
    const workspaceId = stringValue(action.payload.workspaceId);
    const workspace = await getWorkspaceForUser(user.clerkUserId, workspaceId);
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }
    await assertWorkspaceAccess(user.clerkUserId, workspace.id);

    const alreadyCompleted = await prisma.auditLog.findFirst({
      where: { workspaceId: workspace.id, actorUserId: user.id, action: "adviser.action_completed", entityId: action.id },
      select: { id: true },
    });
    if (alreadyCompleted) {
      return NextResponse.json({ ok: true, alreadyCompleted: true });
    }

    const payload = action.payload;
    let result: Record<string, unknown> = {};

    if (action.type === "set_goal") {
      const goal = stringValue(payload.goal, null as unknown as string) || null;
      const targetAmount = payload.targetAmount === null || payload.targetAmount === undefined || payload.targetAmount === "" ? null : numberValue(payload.targetAmount);
      const goalPlan = payload.goalPlan && typeof payload.goalPlan === "object" ? payload.goalPlan : goal ? { goalKey: goal, targetMode: "amount", cadence: "monthly", targetAmount, targetPercent: null, purpose: null } : null;
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          primaryGoal: goal,
          goalTargetAmount: targetAmount === null ? null : new Prisma.Decimal(targetAmount),
          goalTargetSource: targetAmount === null ? null : "adviser",
          goalPlan: goalPlan ? (goalPlan as Prisma.InputJsonValue) : Prisma.DbNull,
        },
        select: { primaryGoal: true, goalTargetAmount: true, goalPlan: true },
      });
      await prisma.goalSetting.create({
        data: {
          userId: user.id,
          primaryGoal: goal,
          targetAmount: targetAmount === null ? null : new Prisma.Decimal(targetAmount),
          source: "adviser",
          goalPlan: goalPlan ? (goalPlan as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      });
      result = { goal: updated.primaryGoal, targetAmount: updated.goalTargetAmount?.toString() ?? null };
    } else if (action.type === "create_budget") {
      const budget = await prisma.budget.create({
        data: {
          workspaceId: workspace.id,
          name: stringValue(payload.name, "Adviser budget"),
          kind: stringValue(payload.kind, "spend_limit") === "savings_target" ? "savings_target" : "spend_limit",
          scope: "global",
          cadence: ["daily", "weekly", "monthly", "annual"].includes(stringValue(payload.cadence)) ? (stringValue(payload.cadence) as "daily" | "weekly" | "monthly" | "annual") : "monthly",
          targetAmount: new Prisma.Decimal(numberValue(payload.targetAmount)),
          currency: stringValue(payload.currency, "PHP").toUpperCase(),
        },
        select: { id: true, name: true, targetAmount: true, currency: true },
      });
      result = { budget: { ...budget, targetAmount: budget.targetAmount.toString() } };
    } else if (action.type === "create_transaction") {
      const accountId = stringValue(payload.accountId);
      const account = await prisma.account.findFirst({ where: { id: accountId, workspaceId: workspace.id }, select: { id: true } });
      if (!account) return NextResponse.json({ error: "Choose a valid account before recording the transaction." }, { status: 400 });
      const type = ["income", "expense", "transfer"].includes(stringValue(payload.type)) ? (stringValue(payload.type) as "income" | "expense" | "transfer") : "expense";
      const merchantRaw = stringValue(payload.merchantRaw, "Manual transaction");
      const transaction = await prisma.transaction.create({
        data: {
          workspaceId: workspace.id,
          accountId,
          date: new Date(stringValue(payload.date, new Date().toISOString())),
          amount: new Prisma.Decimal(numberValue(payload.amount)),
          currency: stringValue(payload.currency, "PHP").toUpperCase(),
          type,
          merchantRaw,
          merchantClean: stringValue(payload.merchantClean) || merchantRaw,
          description: stringValue(payload.description) || null,
          isTransfer: type === "transfer",
          reviewStatus: "confirmed",
          parserConfidence: 100,
          categoryConfidence: 0,
          accountMatchConfidence: 100,
          transferConfidence: type === "transfer" ? 100 : 0,
          rawPayload: { source: "adviser_manual", confirmedByUser: true },
          normalizedPayload: { source: "adviser_manual", type },
          learnedRuleIdsApplied: [],
        },
        select: { id: true, merchantClean: true, amount: true, type: true, date: true },
      });
      result = { transaction: { ...transaction, amount: transaction.amount.toString(), date: transaction.date.toISOString() } };
    } else if (action.type === "edit_transaction") {
      const transactionId = stringValue(payload.transactionId);
      const existing = await prisma.transaction.findFirst({ where: { id: transactionId, workspaceId: workspace.id }, select: { id: true } });
      if (!existing) return NextResponse.json({ error: "The transaction could not be found in this workspace." }, { status: 404 });
      const updated = await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          merchantClean: payload.merchantClean === undefined ? undefined : stringValue(payload.merchantClean) || null,
          description: payload.description === undefined ? undefined : stringValue(payload.description) || null,
          amount: payload.amount === undefined ? undefined : new Prisma.Decimal(numberValue(payload.amount)),
          date: payload.date === undefined ? undefined : new Date(stringValue(payload.date)),
          reviewStatus: "edited",
        },
        select: { id: true, merchantClean: true, description: true, amount: true, date: true },
      });
      result = { transaction: { ...updated, amount: updated.amount.toString(), date: updated.date.toISOString() } };
    } else if (action.type === "create_account" || action.type === "create_investment") {
      const account = await prisma.account.create({
        data: {
          workspaceId: workspace.id,
          name: stringValue(payload.name, action.type === "create_investment" ? "Investment account" : "Manual account"),
          institution: stringValue(payload.institution) || null,
          type: action.type === "create_investment" ? "investment" : (["bank", "wallet", "credit_card", "cash", "loan", "other"].includes(stringValue(payload.type)) ? (stringValue(payload.type) as "bank" | "wallet" | "credit_card" | "cash" | "loan" | "other") : "bank"),
          currency: stringValue(payload.currency, "PHP").toUpperCase(),
          balance: new Prisma.Decimal(numberValue(payload.balance)),
          investmentSubtype: action.type === "create_investment" ? stringValue(payload.investmentSubtype) || null : null,
          investmentSymbol: action.type === "create_investment" ? stringValue(payload.investmentSymbol) || null : null,
          investmentQuantity: action.type === "create_investment" && payload.investmentQuantity !== undefined ? new Prisma.Decimal(numberValue(payload.investmentQuantity)) : null,
          investmentCostBasis: action.type === "create_investment" && payload.investmentCostBasis !== undefined ? new Prisma.Decimal(numberValue(payload.investmentCostBasis)) : null,
          source: "adviser_manual",
        },
        select: { id: true, name: true, type: true, currency: true, balance: true },
      });
      result = { account: { ...account, balance: account.balance?.toString() ?? null } };
    } else if (action.type === "create_split_bill") {
      const transactionId = stringValue(payload.transactionId) || null;
      if (transactionId) {
        const transaction = await prisma.transaction.findFirst({ where: { id: transactionId, workspaceId: workspace.id }, select: { id: true } });
        if (!transaction) return NextResponse.json({ error: "The transaction is not available in this workspace." }, { status: 400 });
      }
      const participantNames = Array.isArray(payload.participants) ? payload.participants.map((name) => stringValue(name)).filter(Boolean) : [];
      const bill = await prisma.splitBill.create({
        data: {
          userId: user.id,
          transactionId,
          title: stringValue(payload.title, "Shared bill"),
          billDate: new Date(stringValue(payload.billDate, new Date().toISOString())),
          currency: stringValue(payload.currency, "PHP").toUpperCase(),
          merchantName: stringValue(payload.merchantName) || null,
          total: new Prisma.Decimal(numberValue(payload.total)),
          sourceType: "manual",
          participants: { create: participantNames.map((name) => ({ name })) },
        },
        select: { id: true, title: true, total: true },
      });
      result = { splitBill: { ...bill, total: bill.total?.toString() ?? null } };
    }

    await recordAdviserActionCompletion({
      workspaceId: workspace.id,
      actorUserId: user.id,
      group: action.type.includes("goal") ? "goals" : action.type.includes("investment") ? "investments" : action.type.includes("split") ? "cashflow" : "cleanup",
      itemId: action.id,
      label: action.label,
      sourceAction: `adviser.${action.type}`,
      href: "/adviser",
      pathname: "/adviser",
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to complete the Adviser action." }, { status: 400 });
  }
}
