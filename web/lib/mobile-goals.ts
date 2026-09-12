import { buildActiveWorkspaceTransactionWhere } from "@/lib/transaction-query";
import { mobileHomePeriods } from "@/lib/mobile-home-periods";
import { resolveFinancialTransactionType } from "@/lib/transaction-directions";
import { prisma } from "@/lib/prisma";
import {
  getGoalDefinition,
  getGoalProgressSnapshot,
  normalizeGoalPlan,
  type GoalKey,
} from "@/lib/goals";
import { mobileGoalInput } from "@/lib/mobile-goal-input";
import { invalidateWorkspaceSummaryCache } from "@/lib/workspace-summary-cache";

// Authentication and explicit Profile ownership are checked by the gateway.
// Never infer the native Profile from browser cookies.
export async function loadGoalActivity(workspaceId: string, currency: string) {
  const { from: start, to: end } = mobileHomePeriods().rolling(30);
  const rows = await prisma.transaction.findMany({
    where: buildActiveWorkspaceTransactionWhere(workspaceId, {
      currency,
      date: { gte: start, lt: end },
    }),
    select: {
      amount: true,
      type: true,
      isTransfer: true,
      category: { select: { name: true } },
      account: { select: { type: true } },
    },
  });
  const totals = rows.reduce(
    (sum, row) => {
      const type = resolveFinancialTransactionType({
        ...row,
        categoryName: row.category?.name,
      });
      const amount = Math.abs(Number(row.amount));
      if (type === "income") sum.income += amount;
      if (type === "expense") sum.spending += amount;
      if (row.account.type === "investment" && type !== "income")
        sum.investmentFlow += amount;
      return sum;
    },
    { income: 0, spending: 0, investmentFlow: 0 },
  );
  return { ...totals, start: start.toISOString(), end: end.toISOString() };
}
export async function mobileGoals(workspaceId: string, userId: string) {
  const [saved, user, currencies] = await Promise.all([
    prisma.personalGoal.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        goalKey: true,
        targetAmount: true,
        currency: true,
        goalPlan: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { primaryGoal: true, goalPlan: true, goalTargetAmount: true },
    }),
    prisma.account.findMany({
      where: { workspaceId },
      select: { currency: true },
      distinct: ["currency"],
    }),
  ]);
  const activity = new Map(
    await Promise.all(
      [
        ...new Set([
          ...saved.map((goal) => goal.currency),
          ...currencies.map((row) => row.currency ?? "PHP"),
          "PHP",
        ]),
      ].map(
        async (currency) =>
          [currency, await loadGoalActivity(workspaceId, currency)] as const,
      ),
    ),
  );
  const goals = saved.map((goal) => {
    const plan = normalizeGoalPlan(
      goal.goalPlan,
      goal.goalKey as GoalKey,
      Number(goal.targetAmount),
    );
    const values = activity.get(goal.currency)!;
    const progress = getGoalProgressSnapshot(
      {
        goalKey: goal.goalKey as GoalKey,
        targetAmount: null,
        goalPlan: plan,
        currentNet: values.income - values.spending,
        currentSpend: values.spending,
        monthlyIncome: values.income || null,
        currentSavingsRate: values.income
          ? Math.min(
              1,
              Math.max(0, (values.income - values.spending) / values.income),
            )
          : null,
        previousSavingsRate: null,
        spendDelta: null,
        recurringShare: 0,
        investmentFlow: values.investmentFlow,
      },
      goal.currency,
    );
    return {
      progress,
      activity: values,
      id: goal.id,
      goal: goal.goalKey,
      name: plan?.purpose || getGoalDefinition(goal.goalKey).title,
      category: getGoalDefinition(goal.goalKey).title,
      targetAmount: Number(goal.targetAmount),
      currency: goal.currency,
      cadence: plan?.cadence ?? "monthly",
      purpose: plan?.purpose ?? "",
      legacy: false,
    };
  });
  if (user?.primaryGoal) {
    const plan = normalizeGoalPlan(
      user.goalPlan,
      user.primaryGoal as GoalKey,
      user.goalTargetAmount ? Number(user.goalTargetAmount) : null,
    );
    return {
      goals: [
        {
          id: "primary",
          goal: user.primaryGoal,
          name: plan?.purpose || getGoalDefinition(user.primaryGoal).title,
          category: "Existing account goal",
          targetAmount:
            plan?.targetMode === "amount"
              ? plan.targetAmount
              : user.goalTargetAmount
                ? Number(user.goalTargetAmount)
                : null,
          currency:
            currencies.length === 1 ? (currencies[0].currency ?? "PHP") : "PHP",
          cadence: plan?.cadence ?? "monthly",
          purpose: plan?.purpose ?? "",
          legacy: true,
          activity: activity.get(
            currencies.length === 1 ? (currencies[0].currency ?? "PHP") : "PHP",
          ),
          progress: (() => {
            const currency =
              currencies.length === 1
                ? (currencies[0].currency ?? "PHP")
                : "PHP";
            const v = activity.get(currency)!;
            return getGoalProgressSnapshot(
              {
                goalKey: user.primaryGoal as GoalKey,
                targetAmount: user.goalTargetAmount
                  ? Number(user.goalTargetAmount)
                  : null,
                goalPlan: plan,
                currentNet: v.income - v.spending,
                currentSpend: v.spending,
                monthlyIncome: v.income || null,
                currentSavingsRate: v.income
                  ? Math.min(1, Math.max(0, (v.income - v.spending) / v.income))
                  : null,
                previousSavingsRate: null,
                spendDelta: null,
                recurringShare: 0,
                investmentFlow: v.investmentFlow,
              },
              currency,
            );
          })(),
        },
        ...goals,
      ],
    };
  }
  return { goals };
}

export async function saveMobileGoal(workspaceId: string, input: unknown) {
  const { id, goal, targetAmount, currency, goalPlan } =
    mobileGoalInput.parse(input);
  const data = {
    goalKey: goal,
    targetAmount,
    currency,
    goalPlan: {
      ...goalPlan,
      goalKey: goal,
      targetMode: "amount",
      targetAmount,
      targetPercent: null,
    },
  };
  if (id) {
    const result = await prisma.personalGoal.updateMany({
      where: { id, workspaceId },
      data,
    });
    if (!result.count) return null;
    invalidateWorkspaceSummaryCache(workspaceId);
    return { id };
  }
  const created = await prisma.personalGoal.create({
    data: { ...data, workspaceId },
    select: { id: true },
  });
  invalidateWorkspaceSummaryCache(workspaceId);
  return created;
}
