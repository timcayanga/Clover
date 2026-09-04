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
import { normalizeAdviserPreferences } from "@/lib/adviser-preferences";
import { GOAL_OPTIONS } from "@/lib/goals";
import { isBudgetEmoji } from "@/lib/budget-appearance";

export const dynamic = "force-dynamic";

const actionSchema = z.object({
  action: z.object({
    id: z.string().min(1).max(120),
    type: z.enum([
      "set_goal",
      "set_adviser_preferences",
      "create_budget",
      "create_transaction",
      "edit_transaction",
      "create_account",
      "create_investment",
      "edit_account",
      "edit_investment",
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
const validDate = (value: unknown, fallback = new Date()) => {
  const parsed = value instanceof Date ? value : new Date(stringValue(value, fallback.toISOString()));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};
const hasOwn = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key);

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

    if (action.type === "set_adviser_preferences") {
      const currentPreferences = normalizeAdviserPreferences(user.adviserPreferences);
      const paydayDay = hasOwn(payload, "paydayDay")
        ? payload.paydayDay === null || payload.paydayDay === "" ? null : numberValue(payload.paydayDay, 0)
        : currentPreferences.paydayDay;
      const preferredBuffer = hasOwn(payload, "preferredBuffer")
        ? payload.preferredBuffer === null || payload.preferredBuffer === "" ? null : numberValue(payload.preferredBuffer, 0)
        : currentPreferences.preferredBuffer;
      if (paydayDay !== null && (!Number.isInteger(paydayDay) || paydayDay < 1 || paydayDay > 31)) {
        return NextResponse.json({ error: "Choose a payday from the 1st through the 31st." }, { status: 400 });
      }
      if (preferredBuffer !== null && preferredBuffer < 0) {
        return NextResponse.json({ error: "Your preferred buffer cannot be negative." }, { status: 400 });
      }
      const preferences = { paydayDay, preferredBuffer };
      await prisma.user.update({
        where: { id: user.id },
        data: { adviserPreferences: preferences as Prisma.InputJsonValue },
      });
      result = { adviserPreferences: preferences };
    } else if (action.type === "set_goal") {
      const goal = stringValue(payload.goal, null as unknown as string) || null;
      if (goal && !GOAL_OPTIONS.some((option) => option.value === goal)) return NextResponse.json({ error: "Choose a supported Clover goal before confirming." }, { status: 400 });
      const targetAmount = payload.targetAmount === null || payload.targetAmount === undefined || payload.targetAmount === "" ? null : numberValue(payload.targetAmount);
      if (!goal && targetAmount === null) return NextResponse.json({ error: "Add a goal or target amount before confirming." }, { status: 400 });
      if (targetAmount !== null && targetAmount <= 0) return NextResponse.json({ error: "A goal target must be greater than zero." }, { status: 400 });
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
      const targetAmount = numberValue(payload.targetAmount);
      if (targetAmount <= 0) return NextResponse.json({ error: "A budget limit must be greater than zero." }, { status: 400 });
      const requestedScope = stringValue(payload.scope, "global");
      const scope = requestedScope === "account" || requestedScope === "category" ? requestedScope : "global";
      const accountId = scope === "account" ? stringValue(payload.accountId) : "";
      const categoryId = scope === "category" ? stringValue(payload.categoryId) : "";
      const [account, category] = await Promise.all([
        accountId ? prisma.account.findFirst({ where: { id: accountId, workspaceId: workspace.id, type: { not: "investment" } }, select: { id: true, currency: true } }) : null,
        categoryId ? prisma.category.findFirst({ where: { id: categoryId, workspaceId: workspace.id, type: "expense" }, select: { id: true } }) : null,
      ]);
      if (scope === "account" && !account) return NextResponse.json({ error: "Choose a valid non-investment account for this budget." }, { status: 400 });
      if (scope === "category" && !category) return NextResponse.json({ error: "Choose a valid expense category for this budget." }, { status: 400 });
      const currency = stringValue(payload.currency, account?.currency ?? "PHP").toUpperCase();
      if (account?.currency && account.currency.toUpperCase() !== currency) return NextResponse.json({ error: `Use ${account.currency} for this account budget.` }, { status: 400 });
      const cadence = ["daily", "weekly", "biweekly", "monthly", "quarterly", "annual"].includes(stringValue(payload.cadence))
        ? stringValue(payload.cadence) as "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "annual"
        : "monthly";
      const kind = stringValue(payload.kind, "spend_limit") === "savings_target" ? "savings_target" : "spend_limit";
      const budget = await prisma.budget.create({
        data: {
          workspaceId: workspace.id,
          name: stringValue(payload.name, "Adviser budget"),
          emoji: typeof payload.emoji === "string" && isBudgetEmoji(payload.emoji) ? payload.emoji : null,
          kind,
          scope: kind === "savings_target" ? "global" : scope,
          cadence,
          targetAmount: new Prisma.Decimal(targetAmount),
          currency,
          accountId: kind === "savings_target" ? null : account?.id ?? null,
          categoryId: kind === "savings_target" ? null : category?.id ?? null,
        },
        select: { id: true, name: true, targetAmount: true, currency: true },
      });
      result = { budget: { ...budget, targetAmount: budget.targetAmount.toString() } };
    } else if (action.type === "create_transaction") {
      const accountId = stringValue(payload.accountId);
      const account = await prisma.account.findFirst({ where: { id: accountId, workspaceId: workspace.id }, select: { id: true } });
      if (!account) return NextResponse.json({ error: "Choose a valid account before recording the transaction." }, { status: 400 });
      if (!Number.isFinite(Number(payload.amount))) return NextResponse.json({ error: "Add a valid transaction amount before confirming." }, { status: 400 });
      const transactionDate = validDate(payload.date);
      if (payload.date !== undefined && Number.isNaN(new Date(stringValue(payload.date)).getTime())) return NextResponse.json({ error: "Add a valid transaction date before confirming." }, { status: 400 });
      const type = ["income", "expense", "transfer"].includes(stringValue(payload.type)) ? (stringValue(payload.type) as "income" | "expense" | "transfer") : "expense";
      const merchantRaw = stringValue(payload.merchantRaw, "Manual transaction");
      const transaction = await prisma.transaction.create({
        data: {
          workspaceId: workspace.id,
          accountId,
          date: transactionDate,
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
      if (!hasOwn(payload, "merchantClean") && !hasOwn(payload, "description") && !hasOwn(payload, "amount") && !hasOwn(payload, "date")) {
        return NextResponse.json({ error: "Choose a transaction field to edit before confirming." }, { status: 400 });
      }
      if (hasOwn(payload, "amount") && !Number.isFinite(Number(payload.amount))) return NextResponse.json({ error: "Add a valid transaction amount before confirming." }, { status: 400 });
      if (hasOwn(payload, "date") && Number.isNaN(new Date(stringValue(payload.date)).getTime())) return NextResponse.json({ error: "Add a valid transaction date before confirming." }, { status: 400 });
      const updated = await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          merchantClean: payload.merchantClean === undefined ? undefined : stringValue(payload.merchantClean) || null,
          description: payload.description === undefined ? undefined : stringValue(payload.description) || null,
          amount: payload.amount === undefined ? undefined : new Prisma.Decimal(numberValue(payload.amount)),
          date: payload.date === undefined ? undefined : validDate(payload.date),
          reviewStatus: "edited",
        },
        select: { id: true, merchantClean: true, description: true, amount: true, date: true },
      });
      result = { transaction: { ...updated, amount: updated.amount.toString(), date: updated.date.toISOString() } };
    } else if (action.type === "create_account" || action.type === "create_investment") {
      if (!stringValue(payload.name)) return NextResponse.json({ error: "Add an account name before confirming." }, { status: 400 });
      if (!Number.isFinite(Number(payload.balance))) return NextResponse.json({ error: "Add a valid account balance before confirming." }, { status: 400 });
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
    } else if (action.type === "edit_account" || action.type === "edit_investment") {
      const accountId = stringValue(payload.accountId);
      const existing = await prisma.account.findFirst({ where: { id: accountId, workspaceId: workspace.id, ...(action.type === "edit_investment" ? { type: "investment" } : {}) }, select: { id: true, type: true } });
      if (!existing) return NextResponse.json({ error: "The account could not be found in this workspace." }, { status: 404 });
      const data: Record<string, unknown> = {};
      if (hasOwn(payload, "name")) data.name = stringValue(payload.name);
      if (hasOwn(payload, "institution")) data.institution = stringValue(payload.institution) || null;
      if (action.type === "edit_investment") {
        if (hasOwn(payload, "investmentSubtype")) data.investmentSubtype = stringValue(payload.investmentSubtype) || null;
        if (hasOwn(payload, "investmentSymbol")) data.investmentSymbol = stringValue(payload.investmentSymbol) || null;
        if (hasOwn(payload, "investmentQuantity")) data.investmentQuantity = payload.investmentQuantity === null || payload.investmentQuantity === "" ? null : new Prisma.Decimal(numberValue(payload.investmentQuantity));
        if (hasOwn(payload, "investmentCostBasis")) data.investmentCostBasis = payload.investmentCostBasis === null || payload.investmentCostBasis === "" ? null : new Prisma.Decimal(numberValue(payload.investmentCostBasis));
      }
      if (Object.keys(data).length === 0) return NextResponse.json({ error: "Choose an account detail to edit before confirming." }, { status: 400 });
      const updated = await prisma.account.update({ where: { id: accountId }, data, select: { id: true, name: true, institution: true, type: true, currency: true } });
      result = { account: updated };
    } else if (action.type === "create_split_bill") {
      const transactionId = stringValue(payload.transactionId) || null;
      if (transactionId) {
        const transaction = await prisma.transaction.findFirst({ where: { id: transactionId, workspaceId: workspace.id }, select: { id: true } });
        if (!transaction) return NextResponse.json({ error: "The transaction is not available in this workspace." }, { status: 400 });
      }
      const participantNames = Array.isArray(payload.participants) ? payload.participants.map((name) => stringValue(name)).filter(Boolean) : [];
      const total = numberValue(payload.total);
      if (total <= 0) return NextResponse.json({ error: "A split bill total must be greater than zero." }, { status: 400 });
      if (participantNames.length === 0) return NextResponse.json({ error: "Add at least one person to the split bill before confirming." }, { status: 400 });
      const bill = await prisma.splitBill.create({
        data: {
          userId: user.id,
          transactionId,
          title: stringValue(payload.title, "Shared bill"),
          billDate: new Date(stringValue(payload.billDate, new Date().toISOString())),
          currency: stringValue(payload.currency, "PHP").toUpperCase(),
          merchantName: stringValue(payload.merchantName) || null,
          total: new Prisma.Decimal(total),
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
