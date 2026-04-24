import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";
import { EmptyDataCta } from "@/components/empty-data-cta";
import { GoalsEditor } from "@/components/goals-editor";
import { GoalsChecklist } from "@/components/goals-checklist";
import { GoalGlyph, GoalIllustration } from "@/components/goals-visuals";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import {
  GOAL_OPTIONS,
  getFinancialExperienceProfile,
  getGoalDefinition,
  getGoalMoneyLabel,
  getGoalProgressLabel,
  getGoalPlaybook,
  getSuggestedGoalAmount,
  type GoalKey,
} from "@/lib/goals";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Goals",
};

const selectedWorkspaceKey = "clover.selected-workspace-id.v1";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const monthFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

type GoalTransaction = {
  date: Date;
  amount: unknown;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  account: {
    name: string;
  };
  category: {
    name: string;
  } | null;
};

type MonthBucket = {
  key: string;
  label: string;
  income: number;
  expense: number;
  net: number;
};

type GoalSummary = {
  income: number;
  expense: number;
  transfer: number;
  expenseCategories: Map<string, number>;
};

type SummaryRow = {
  type: string;
  total: number | string | null;
};

type MonthlySummaryRow = {
  month: Date;
  type: string;
  total: number | string | null;
};

type MerchantSummaryRow = {
  label: string | null;
  amount: number | string | null;
  count: number | bigint | null;
};

const formatCurrency = (value: number) => currencyFormatter.format(value);
const formatSignedCurrency = (value: number) => `${value < 0 ? "-" : ""}${currencyFormatter.format(Math.abs(value))}`;
const formatPercent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(0)}%`;
const formatShortDate = (value: Date) => shortDateFormatter.format(value);
const toIsoMonth = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const toMonthLabel = (date: Date) => monthFormatter.format(date);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const normalizeMerchant = (value: string) => value.trim().toLowerCase();
const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const getMonthBuckets = (anchor: Date) => {
  const buckets: MonthBucket[] = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(anchor.getFullYear(), anchor.getMonth() - offset, 1);
    buckets.push({
      key: toIsoMonth(date),
      label: toMonthLabel(date),
      income: 0,
      expense: 0,
      net: 0,
    });
  }
  return buckets;
};

const getChecklistIcon = (focus: string) => {
  if (focus === "Move money early" || focus === "Move savings early") {
    return "target" as const;
  }
  if (focus === "Protect one no-spend window" || focus === "Keep an emergency buffer untouched") {
    return "shield" as const;
  }
  if (focus === "Review the biggest leak" || focus === "Review the top category" || focus === "Keep a clean surplus") {
    return "chart" as const;
  }
  if (focus === "Attack the smallest leak" || focus === "Avoid impulse spending" || focus === "Avoid short-term detours") {
    return "spark" as const;
  }
  return "path" as const;
};

const getCoachMessage = (goalScore: number) => {
  if (goalScore >= 85) {
    return {
      badge: "Strong momentum",
      title: "You are operating like someone who knows exactly where they are going.",
      body: "The biggest win now is staying consistent. You already have the structure, so the game is about protecting the streak.",
    };
  }

  if (goalScore >= 70) {
    return {
      badge: "Good pace",
      title: "You have a solid rhythm, and the slope is working for you.",
      body: "Keep tightening one small habit at a time. That is how a good month turns into a reliable pattern.",
    };
  }

  if (goalScore >= 50) {
    return {
      badge: "Building phase",
      title: "You are laying the foundation in the right order.",
      body: "This is the point where a little more clarity and one sharper habit can make the progress feel much lighter.",
    };
  }

  return {
    badge: "Early momentum",
    title: "You are in the build-up stage, and that is completely fine.",
    body: "The opportunity is clear: remove one drag, repeat one win, and the trend will start to move in your favor quickly.",
  };
};

const createGoalChart = (buckets: MonthBucket[]) => {
  const chartWidth = 520;
  const chartHeight = 170;
  const chartPadding = 18;
  const chartXSpan = chartWidth - chartPadding * 2;
  const chartYSpan = chartHeight - chartPadding * 2;
  const netValues = buckets.map((bucket) => bucket.net);
  const chartMax = Math.max(...netValues, 1);
  const chartMin = Math.min(...netValues, 0);
  const chartRange = Math.max(chartMax - chartMin, 1);
  const points = buckets.map((bucket, index) => {
    const x = chartPadding + (index / Math.max(buckets.length - 1, 1)) * chartXSpan;
    const normalized = (bucket.net - chartMin) / chartRange;
    const y = chartPadding + (1 - normalized) * chartYSpan;
    return { ...bucket, x, y };
  });

  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");

  return { chartWidth, chartHeight, chartPadding, points, path };
};

export default async function GoalsPage() {
  const session = await getSessionContext();
  const user = await getOrCreateCurrentUser(session.userId);

  if (!session.isGuest && !hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }

  const cookieStore = await cookies();
  const selectedWorkspaceCookieId = cookieStore.get(selectedWorkspaceKey)?.value ?? "";
  const workspaceSelect = {
    id: true,
    name: true,
    _count: {
      select: {
        accounts: true,
        importFiles: true,
      },
    },
  } as const;

  const selectedWorkspace =
    (selectedWorkspaceCookieId
      ? await prisma.workspace.findFirst({
          where: {
            id: selectedWorkspaceCookieId,
            userId: user.id,
          },
          select: workspaceSelect,
        })
      : null) ??
    (await prisma.workspace.findFirst({
      where: { userId: user.id },
      select: workspaceSelect,
      orderBy: { createdAt: "asc" },
    }));

  const resolvedWorkspace =
    selectedWorkspace ??
      (await ensureStarterWorkspace(user).then(async (starterWorkspace) => {
      const starterWorkspaceData = await prisma.workspace.findUnique({
        where: { id: starterWorkspace.id },
        select: workspaceSelect,
      });
      if (!starterWorkspaceData) {
        redirect("/dashboard");
      }
      return starterWorkspaceData;
    }));

  if (!resolvedWorkspace) {
    redirect("/dashboard");
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [
    currentSummaryRows,
    previousSummaryRows,
    ninetyDayMerchantRows,
    sixMonthSummaryRows,
    goalHistoryRows,
    currentWindowTransactionsQuery,
  ] = await Promise.all([
    prisma.$queryRaw<SummaryRow[]>`
      SELECT
        "type",
        COALESCE(SUM("amount"), 0)::float8 AS total
      FROM "Transaction"
      WHERE "workspaceId" = ${resolvedWorkspace.id}
        AND "isExcluded" = false
        AND "date" >= ${thirtyDaysAgo}
      GROUP BY "type"
    `,
    prisma.$queryRaw<SummaryRow[]>`
      SELECT
        "type",
        COALESCE(SUM("amount"), 0)::float8 AS total
      FROM "Transaction"
      WHERE "workspaceId" = ${resolvedWorkspace.id}
        AND "isExcluded" = false
        AND "date" >= ${sixtyDaysAgo}
        AND "date" < ${thirtyDaysAgo}
      GROUP BY "type"
    `,
    prisma.$queryRaw<MerchantSummaryRow[]>`
      SELECT
        COALESCE(NULLIF("merchantClean", ''), "merchantRaw") AS label,
        COALESCE(SUM(ABS("amount")), 0)::float8 AS amount,
        COUNT(*)::int AS count
      FROM "Transaction"
      WHERE "workspaceId" = ${resolvedWorkspace.id}
        AND "isExcluded" = false
        AND "type" = 'expense'
        AND "date" >= ${ninetyDaysAgo}
      GROUP BY 1
      HAVING COUNT(*) > 1
      ORDER BY amount DESC
      LIMIT 4
    `,
    prisma.$queryRaw<MonthlySummaryRow[]>`
      SELECT
        date_trunc('month', "date") AS month,
        "type",
        COALESCE(SUM("amount"), 0)::float8 AS total
      FROM "Transaction"
      WHERE "workspaceId" = ${resolvedWorkspace.id}
        AND "isExcluded" = false
        AND "date" >= ${sixMonthsAgo}
      GROUP BY 1, 2
      ORDER BY 1 ASC, 2 ASC
    `,
    prisma.goalSetting.findMany({
      where: {
        userId: user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 5,
      select: {
        primaryGoal: true,
        targetAmount: true,
        source: true,
        createdAt: true,
      },
    }),
    prisma.transaction.findMany({
      where: {
        workspaceId: resolvedWorkspace.id,
        isExcluded: false,
        date: { gte: thirtyDaysAgo },
      },
      select: {
        date: true,
        amount: true,
        type: true,
        merchantRaw: true,
        merchantClean: true,
        account: {
          select: {
            name: true,
          },
        },
        category: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { date: "desc" },
      take: 180,
    }),
  ]);

  const currentWindowTransactions = currentWindowTransactionsQuery as GoalTransaction[];
  const selectedGoalKey = user.primaryGoal?.trim() ?? null;
  const selectedGoal = getGoalDefinition(selectedGoalKey);
  const playbook = getGoalPlaybook(selectedGoalKey);
  const experienceProfile = getFinancialExperienceProfile(user.financialExperience);
  const goalTargetAmount = user.goalTargetAmount ? Number(user.goalTargetAmount) : null;
  const goalTargetSource = user.goalTargetSource ?? null;
  const hasGoalSelection = Boolean(selectedGoalKey);
  const hasGoalTarget = goalTargetAmount !== null && goalTargetAmount > 0;
  const heroLead = hasGoalSelection
    ? playbook.heroLead
    : experienceProfile.goalsLead ?? "Pick a lane, set a number, and let Clover coach the month with you.";
  const heroSupport = hasGoalSelection
    ? playbook.heroSupport
    : experienceProfile.goalsSupport ?? "If onboarding skipped this step, you can define your first real monthly target right here.";
  const shellSubtitle = hasGoalTarget
    ? experienceProfile.goalsShellSubtitle
    : hasGoalSelection
      ? experienceProfile.goalsShellSubtitle
      : "A visual, encouraging space to set a monthly goal and watch the numbers move.";
  const isEmptyWorkspace =
    resolvedWorkspace._count.accounts <= 1 && resolvedWorkspace._count.importFiles === 0 && currentWindowTransactions.length === 0;

  const currentSummary = currentSummaryRows.reduce<GoalSummary>(
    (accumulator, row) => {
      const amount = Number(row.total ?? 0);
      if (row.type === "income") {
        accumulator.income += amount;
      } else if (row.type === "expense") {
        accumulator.expense += amount;
      } else {
        accumulator.transfer += amount;
      }
      return accumulator;
    },
    {
      income: 0,
      expense: 0,
      transfer: 0,
      expenseCategories: new Map<string, number>(),
    }
  );

  const previousSummary = previousSummaryRows.reduce<GoalSummary>(
    (accumulator, row) => {
      const amount = Number(row.total ?? 0);
      if (row.type === "income") {
        accumulator.income += amount;
      } else if (row.type === "expense") {
        accumulator.expense += amount;
      } else {
        accumulator.transfer += amount;
      }
      return accumulator;
    },
    {
      income: 0,
      expense: 0,
      transfer: 0,
      expenseCategories: new Map<string, number>(),
    }
  );
  const monthlyIncome = currentSummary.income > 0 ? currentSummary.income : null;
  const suggestedGoalTarget = getSuggestedGoalAmount(selectedGoalKey as GoalKey | null, monthlyIncome);

  const monthBuckets = getMonthBuckets(now);
  sixMonthSummaryRows.forEach((row) => {
    const bucket = monthBuckets.find((entry) => entry.key === toIsoMonth(row.month));
    if (!bucket) {
      return;
    }

    const amount = Number(row.total ?? 0);
    if (row.type === "income") {
      bucket.income += amount;
    } else if (row.type === "expense") {
      bucket.expense += Math.abs(amount);
    } else if (row.type === "transfer") {
      bucket.net += 0;
    }
    bucket.net = bucket.income - bucket.expense;
  });

  const currentNet = currentSummary.income - currentSummary.expense;
  const previousNet = previousSummary.income - previousSummary.expense;
  const currentSpend = currentSummary.expense;
  const currentSavingsRate = currentSummary.income > 0 ? currentNet / currentSummary.income : null;
  const previousSavingsRate = previousSummary.income > 0 ? (previousSummary.income - previousSummary.expense) / previousSummary.income : null;
  const spendDelta = previousSummary.expense > 0 ? ((currentSummary.expense - previousSummary.expense) / previousSummary.expense) * 100 : null;
  const savingsRateDelta =
    currentSavingsRate !== null && previousSavingsRate !== null ? (currentSavingsRate - previousSavingsRate) * 100 : null;
  const netDelta = currentNet - previousNet;
  const uncategorizedTransactions = currentWindowTransactions.filter(
    (transaction) => !transaction.category?.name || !transaction.merchantClean
  );

  const duplicateGroups = new Map<string, GoalTransaction[]>();
  currentWindowTransactions.forEach((transaction) => {
    const merchant = normalizeMerchant(transaction.merchantClean ?? transaction.merchantRaw);
    const key = [
      transaction.date.toISOString().slice(0, 10),
      transaction.account.name.toLowerCase(),
      transaction.type,
      Number(transaction.amount).toFixed(2),
      merchant,
    ].join("|");

    const existing = duplicateGroups.get(key) ?? [];
    existing.push(transaction);
    duplicateGroups.set(key, existing);
  });

  const possibleDuplicateGroups = Array.from(duplicateGroups.values()).filter((group) => group.length > 1);

  const recurringMerchantSpend = new Map<
    string,
    {
      label: string;
      amount: number;
      count: number;
    }
  >();

  ninetyDayMerchantRows.forEach((row) => {
    const label = row.label ?? "Uncategorized";
    recurringMerchantSpend.set(normalizeMerchant(label), {
      label,
      amount: Number(row.amount ?? 0),
      count: Number(row.count ?? 0),
    });
  });

  const recurringMerchants = Array.from(recurringMerchantSpend.values()).slice(0, 4);

  const recurringDrag = recurringMerchants.reduce((sum, merchant) => sum + merchant.amount, 0);
  const recurringShare = currentSpend > 0 ? recurringDrag / currentSpend : 0;
  const uncategorizedShare = currentSpend > 0
    ? uncategorizedTransactions.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount)), 0) / currentSpend
    : 0;
  const cleanlinessScore = clamp(Math.round(100 - uncategorizedShare * 120 - possibleDuplicateGroups.length * 7), 20, 100);
  const trendScore = currentNet >= previousNet ? 18 : 8;
  const consistencyScore = previousSavingsRate !== null && currentSavingsRate !== null && currentSavingsRate >= previousSavingsRate ? 14 : 7;
  const targetRate = selectedGoal.targetRate;
  const savingsScore =
    currentSavingsRate === null ? 16 : clamp(Math.round((currentSavingsRate * 100 / targetRate) * 55), 12, 65);
  const dragPenalty = clamp(Math.round(recurringShare * 100 * 0.35 + Math.max(0, recurringMerchants.length - 1) * 4), 0, 22);
  const goalScore = clamp(Math.round(savingsScore + trendScore + consistencyScore + cleanlinessScore * 0.2 - dragPenalty), 12, 98);
  const coach = getCoachMessage(goalScore);
  const onboardingDate = user.onboardingCompletedAt ? new Date(user.onboardingCompletedAt) : null;
  const activeGoalProgressAmount =
    hasGoalTarget && selectedGoalKey === "track_spending"
      ? Math.max(0, goalTargetAmount - currentSpend)
      : Math.max(0, currentNet);
  const activeGoalProgressPercent =
    hasGoalTarget && goalTargetAmount > 0 ? clamp((activeGoalProgressAmount / goalTargetAmount) * 100, 0, 100) : null;
  const activeGoalRemainingAmount =
    hasGoalTarget && activeGoalProgressPercent !== null ? Math.max(0, goalTargetAmount - activeGoalProgressAmount) : null;
  const goalReached = activeGoalProgressPercent !== null && activeGoalProgressPercent >= 100;
  const goalMoneyLabel = getGoalMoneyLabel(selectedGoalKey as GoalKey | null);
  const goalProgressLabel = getGoalProgressLabel(selectedGoalKey as GoalKey | null);

  const progressLabel =
    goalScore >= 85 ? "Coach mode: you are ahead of the curve" : goalScore >= 70 ? "On pace and looking sharp" : goalScore >= 50 ? "Building good momentum" : "Early, but absolutely moving";

  const weeklyProgress = clamp(goalScore + (currentSavingsRate !== null && currentSavingsRate >= targetRate / 100 ? 8 : 0) - (recurringShare > 0.25 ? 6 : 0), 12, 100);

  const chart = createGoalChart(monthBuckets);
  const paceBars = [
    {
      label: "Current pace",
      value: currentSavingsRate === null ? 0 : currentSavingsRate * 100,
      note: currentSavingsRate === null ? "Need more income context" : `Running at ${formatPercent(currentSavingsRate * 100)}`,
      tone: currentSavingsRate !== null && currentSavingsRate * 100 >= targetRate ? "positive" : "neutral",
    },
    {
      label: "Goal line",
      value: targetRate,
      note: `The lane you set for ${selectedGoal.title.toLowerCase()}`,
      tone: "neutral",
    },
    {
      label: "Last window",
      value: previousSavingsRate === null ? 0 : previousSavingsRate * 100,
      note: previousSavingsRate === null ? "No prior baseline" : `Previous pace was ${formatPercent(previousSavingsRate * 100)}`,
      tone: previousSavingsRate !== null && previousSavingsRate * 100 >= targetRate ? "positive" : "negative",
    },
  ];

  const dayBuckets = Array.from({ length: 28 }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (27 - index));
    return {
      key: toIsoDate(date),
      day: date.getDate(),
      count: 0,
      net: 0,
      expense: 0,
      income: 0,
    };
  });

  const dayBucketMap = new Map(dayBuckets.map((bucket) => [bucket.key, bucket]));
  currentWindowTransactions.forEach((transaction) => {
    const bucket = dayBucketMap.get(toIsoDate(transaction.date));
    if (!bucket) {
      return;
    }

    const amount = Number(transaction.amount);
    bucket.count += 1;
    if (transaction.type === "income") {
      bucket.income += amount;
    } else if (transaction.type === "expense") {
      bucket.expense += Math.abs(amount);
    }
    bucket.net = bucket.income - bucket.expense;
  });

  const dailyHeatmap = dayBuckets.map((bucket) => {
    const activityScore = bucket.count === 0 ? 0 : Math.min(4, Math.round(bucket.count / 2 + (bucket.net > 0 ? 1 : 0)));
    return {
      ...bucket,
      intensity: activityScore,
    };
  });

  const goalSnapshot = [
    {
      label: "Current net",
      value: formatSignedCurrency(currentNet),
      note: currentNet >= previousNet ? "Up vs prior period" : "Down vs prior period",
    },
    {
      label: hasGoalTarget ? goalMoneyLabel : "Suggested target",
      value:
        hasGoalTarget && activeGoalProgressPercent !== null
          ? `${formatCurrency(activeGoalProgressAmount)} / ${formatCurrency(goalTargetAmount)}`
          : suggestedGoalTarget !== null
            ? formatCurrency(suggestedGoalTarget)
            : "Set it now",
      note: hasGoalTarget
        ? goalReached
          ? "You crossed the line"
          : activeGoalRemainingAmount !== null
            ? `${formatCurrency(activeGoalRemainingAmount)} remaining`
            : "Keep moving"
        : "Clover can suggest a starting point",
    },
    {
      label: goalProgressLabel,
      value:
        hasGoalTarget && activeGoalProgressPercent !== null
          ? `${Math.round(activeGoalProgressPercent)}%`
          : "No target yet",
      note: hasGoalTarget ? `Tracked from ${goalTargetSource ?? "your saved goal"}` : `${uncategorizedTransactions.length} items still need attention`,
    },
    {
      label: "Momentum",
      value: goalScore.toString(),
      note: progressLabel,
    },
  ];

  const milestoneCards = playbook.milestones.map((milestone) => {
    const percent = clamp((goalScore / milestone.threshold) * 100, 8, 100);
    const reached = goalScore >= milestone.threshold;
    return {
      ...milestone,
      percent,
      reached,
    };
  });

  const weeklySignals = [
    {
      label: "Spend",
      value: spendDelta === null ? "N/A" : formatPercent(spendDelta),
      note: spendDelta === null ? "No prior comparison" : (spendDelta > 0 ? "Up vs prior month" : "Down vs prior month"),
      tone: spendDelta === null ? "neutral" : spendDelta > 0 ? "negative" : "positive",
    },
    {
      label: "Savings",
      value: savingsRateDelta === null ? "N/A" : formatPercent(savingsRateDelta),
      note: savingsRateDelta === null ? "No prior comparison" : savingsRateDelta >= 0 ? "Improving momentum" : "Needs a reset",
      tone: savingsRateDelta === null ? "neutral" : savingsRateDelta >= 0 ? "positive" : "negative",
    },
    {
      label: "Net",
      value: formatSignedCurrency(netDelta),
      note: currentNet >= previousNet ? "Up vs last period" : "Down vs last period",
      tone: netDelta >= 0 ? "positive" : "negative",
    },
    {
      label: "Cleanliness",
      value: `${Math.round(cleanlinessScore)}%`,
      note: uncategorizedTransactions.length === 0 ? "Nice and tidy" : `${uncategorizedTransactions.length} items to clear`,
      tone: cleanlinessScore >= 80 ? "positive" : cleanlinessScore >= 60 ? "neutral" : "negative",
    },
  ];

  const goalTimelineEntries =
    goalHistoryRows.length > 0
      ? goalHistoryRows.map((row) => {
          const rowGoal = getGoalDefinition(row.primaryGoal);
          const rowTarget = row.targetAmount !== null && row.targetAmount !== undefined ? Number(row.targetAmount) : null;
          return {
            label: formatShortDate(row.createdAt),
            detail: `${rowGoal.title}${rowTarget !== null ? ` · ${formatCurrency(rowTarget)}` : " · No amount set"} · ${row.source === "onboarding" ? "Saved during onboarding" : "Updated in Goals"}`,
          };
        })
      : [
          {
            label: onboardingDate ? formatShortDate(onboardingDate) : "Onboarding",
            detail: hasGoalSelection ? `You picked ${selectedGoal.title.toLowerCase()} and can set a monthly target from here.` : "You skipped goal setup, so Clover can help you define one now.",
          },
        ];

  const goalAlerts = [
    {
      text: hasGoalTarget
        ? goalReached
          ? `You reached your ${formatCurrency(goalTargetAmount)} monthly target. That is a real win.`
          : activeGoalRemainingAmount !== null
            ? `${formatCurrency(activeGoalRemainingAmount)} left to go this month. Keep the rhythm steady.`
            : playbook.alertTemplates[0]
        : "Set a monthly target to unlock live progress tracking.",
      icon: goalReached ? "spark" : hasGoalTarget ? "chart" : "target",
    },
    uncategorizedTransactions.length > 0
      ? {
          text: `${uncategorizedTransactions.length} uncategorized transaction${uncategorizedTransactions.length === 1 ? "" : "s"} are softening the signal.`,
          icon: "target" as const,
        }
      : {
          text: "The review queue is looking clean right now.",
          icon: "shield" as const,
        },
    recurringShare > 0.25
      ? {
          text: "Recurring spending is taking up a meaningful slice of the month.",
          icon: "chart" as const,
        }
      : {
          text: "Recurring spending is under control and not blocking progress.",
          icon: "spark" as const,
        },
  ];

  const checklistItems = playbook.weeklyFocus.map((focus) => ({
    title: focus,
    body:
      focus === "Move money early"
        ? "Set the transfer before the month gets noisy."
        : focus === "Protect one no-spend window"
          ? "Make one part of the week friction-free."
          : focus === "Review the biggest leak"
            ? "Use the biggest category as your first improvement target."
            : focus === "Attack the smallest leak"
              ? "Pick the easiest category to shrink first."
              : focus === "Keep one extra payment ready"
                ? "Leave a little surplus ready for principal."
                : focus === "Protect the payoff window"
                  ? "Keep the payoff amount out of reach until it clears."
                  : focus === "Clear uncategorized rows"
                    ? "Make the month easier to read in one pass."
                    : focus === "Confirm duplicates"
                      ? "Remove double-counted noise before it distorts the trend."
                      : focus === "Review the top category"
                        ? "Check the biggest bucket for a quick win."
                        : focus === "Move savings early"
                          ? "Lock the habit in before other spending gets a vote."
                          : focus === "Keep an emergency buffer untouched"
                            ? "Protect the reserve from short-term decisions."
                            : focus === "Avoid short-term detours"
                              ? "Stay steady and keep the runway intact."
                            : focus === "Keep a clean surplus"
                                ? "Preserve room for investing by trimming leakage."
                                : focus === "Avoid impulse spending"
                                  ? "The best investable dollars are the ones that survive the week."
                                  : "Protect the investing window",
    href: "/transactions",
    label: "Review now",
    icon: getChecklistIcon(focus),
    }));

  return (
    <CloverShell
      active="goals"
      title="Goals"
      kicker="Goal coaching"
      subtitle={shellSubtitle}
      showTopbar={false}
    >
      {isEmptyWorkspace ? (
        <div style={{ marginBottom: 20 }}>
          <EmptyDataCta
            eyebrow={user.dataWipedAt ? "Fresh start" : "No data yet"}
            title={experienceProfile.emptyStateTitle}
            copy={experienceProfile.emptyStateCopy}
            importHref="/dashboard?import=1"
            accountHref="/accounts"
            transactionHref="/transactions?manual=1"
          />
        </div>
      ) : null}
      <section className="goals-story">
        <article className="goals-hero glass">
          <div className="goals-hero__copy">
            <div className="goals-hero__header">
              <span className="pill pill-accent">Onboarding goals</span>
              <span className="pill pill-subtle">{hasGoalSelection ? selectedGoal.title : "No goal set yet"}</span>
            </div>
            <h3>{heroLead}</h3>
            <p>{heroSupport}</p>
            {!hasGoalTarget ? (
              <>
                <p className="goals-hero__setup-note">
                  You did not set a monthly target yet. Pick a number below so Clover can track how much progress you
                  make each month.
                </p>
                <Link className="pill-link pill-link--inline" href="#goal-editor">
                  Set your target
                </Link>
              </>
            ) : null}

            <div className="goals-hero__summary">
              <span className={`pill ${goalScore >= 70 ? "pill-good" : goalScore >= 50 ? "pill-accent" : "pill-warning"}`}>
                {coach.badge}
              </span>
              <span>{hasGoalSelection ? selectedGoal.signal : "Choose a lane to shape the plan."}</span>
              <span>
                {hasGoalSelection
                  ? hasGoalTarget
                    ? goalMoneyLabel
                    : "Set a target to unlock live tracking"
                  : "Pick a goal to unlock tracking"}
              </span>
            </div>

            <div className="goals-progress">
              <div className="goals-progress__head">
                <strong>{hasGoalTarget ? goalProgressLabel : "Monthly goal setup"}</strong>
                <span>
                  {hasGoalTarget && goalTargetAmount > 0
                    ? `${formatCurrency(activeGoalProgressAmount)} of ${formatCurrency(goalTargetAmount)}`
                    : suggestedGoalTarget !== null
                      ? `Suggested ${formatCurrency(suggestedGoalTarget)}`
                      : "No target saved yet"}
                </span>
              </div>
              <div className="goals-progress__bar" aria-hidden="true">
                <div
                  className="goals-progress__fill"
                  style={{ width: `${hasGoalTarget && activeGoalProgressPercent !== null ? activeGoalProgressPercent : 0}%` }}
                />
              </div>
              <p>{hasGoalTarget ? (goalReached ? "You have already cleared the line. Keep the habit going." : coach.body) : "Set the number, then Clover will track the month with you."}</p>
            </div>

            {goalReached ? (
              <div className="goals-celebration" role="status" aria-live="polite">
                <span className="goals-celebration__icon" aria-hidden="true">
                  ✦
                </span>
                <div>
                  <strong>Goal reached</strong>
                  <span>You hit your monthly target. That is a solid finish to the month.</span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="goals-hero__visual">
            <GoalIllustration
              goalKey={(selectedGoalKey ?? "save_more") as GoalKey}
              title={`${selectedGoal.title} in motion`}
              subtitle={heroSupport}
              progress={hasGoalTarget && activeGoalProgressPercent !== null ? activeGoalProgressPercent : goalScore}
            />

            <div className="goals-hero__ring-card">
              <div
                className={`goals-hero__ring ${goalReached ? "is-complete" : ""}`}
                role="img"
                aria-label={
                  hasGoalTarget && activeGoalProgressPercent !== null
                    ? `Monthly goal progress at ${Math.round(activeGoalProgressPercent)} percent`
                    : "Monthly goal is waiting for a target amount"
                }
              >
                <svg viewBox="0 0 240 240">
                  <defs>
                    <linearGradient id="goals-ring-gradient" x1="0" x2="1" y1="0" y2="1">
                      <stop offset="0%" stopColor="rgba(34,197,94,0.25)" />
                      <stop offset="100%" stopColor="rgba(3,168,192,0.92)" />
                    </linearGradient>
                  </defs>
                  <circle cx="120" cy="120" r="84" className="goals-ring__track" />
                  <circle
                    cx="120"
                    cy="120"
                    r="84"
                    className="goals-ring__progress"
                    stroke="url(#goals-ring-gradient)"
                    style={{
                      strokeDasharray: `${2 * Math.PI * 84 * ((hasGoalTarget && activeGoalProgressPercent !== null ? activeGoalProgressPercent : 0) / 100)} ${2 * Math.PI * 84}`,
                    }}
                  />
                </svg>
                <div className="goals-hero__ring-copy">
                  <strong>{hasGoalTarget && activeGoalProgressPercent !== null ? `${Math.round(activeGoalProgressPercent)}%` : "Set it"}</strong>
                  <span>{hasGoalTarget ? `${formatCurrency(activeGoalProgressAmount)} saved` : "No monthly target yet"}</span>
                </div>
              </div>

              <div className="goals-hero__stats">
                {goalSnapshot.map((item) => (
                  <div key={item.label} className="goals-stat">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.note}</small>
                  </div>
                ))}
              </div>
            </div>

            <article className="goals-pace-card glass">
              <div className="goals-panel__head">
                <div>
                  <p className="eyebrow">Pace check</p>
                  <h4>Target vs current rhythm</h4>
                </div>
                <div className="goals-panel__stat">
                  <strong>{formatPercent(targetRate)}</strong>
                  <span>Goal line</span>
                </div>
              </div>

              <div className="goals-pace__bars">
                {paceBars.map((bar) => (
                  <div key={bar.label} className={`goals-pace__bar ${bar.tone}`}>
                    <div className="goals-pace__label">
                      <span>{bar.label}</span>
                      <strong>{formatPercent(bar.value)}</strong>
                    </div>
                    <div className="goals-pace__track" aria-hidden="true">
                      <div className="goals-pace__fill" style={{ width: `${clamp(bar.value, 8, 100)}%` }} />
                    </div>
                    <small>{bar.note}</small>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </article>

        <article className="goals-chart-panel glass">
          <div className="goals-panel__head">
            <div>
              <p className="eyebrow">Momentum line</p>
              <h4>Your last six months at a glance</h4>
            </div>
            <div className="goals-panel__stat">
              <strong className={currentNet >= 0 ? "positive" : "negative"}>{formatSignedCurrency(currentNet)}</strong>
              <span>{currentNet >= previousNet ? "A stronger lane than last month" : "A softer lane than last month"}</span>
            </div>
          </div>

          <div className="goals-chart">
            <svg viewBox={`0 0 ${chart.chartWidth} ${chart.chartHeight}`} role="img" aria-label="Net cash flow trend over the last six months">
              <defs>
                <linearGradient id="goals-chart-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(3,168,192,0.26)" />
                  <stop offset="100%" stopColor="rgba(3,168,192,0.04)" />
                </linearGradient>
              </defs>
              <path
                d={`${chart.path} L ${chart.points[chart.points.length - 1].x.toFixed(1)} ${chart.chartHeight - chart.chartPadding} L ${
                  chart.points[0].x.toFixed(1)
                } ${chart.chartHeight - chart.chartPadding} Z`}
                fill="url(#goals-chart-fill)"
              />
              <path d={chart.path} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              {chart.points.map((point) => (
                <circle key={point.key} cx={point.x} cy={point.y} r="5.5" fill="white" stroke="var(--accent)" strokeWidth="3" />
              ))}
            </svg>

            <div className="goals-chart__labels">
              {chart.points.map((point) => (
                <div key={point.key} className="goals-chart__label">
                  <span>{point.label}</span>
                  <strong>{formatSignedCurrency(point.net)}</strong>
                </div>
              ))}
            </div>
          </div>
        </article>

        <section className="goals-visual-grid">
          <article className="goals-heatmap glass">
            <div className="goals-panel__head">
              <div>
                <p className="eyebrow">Consistency grid</p>
                <h4>The last 28 days in color</h4>
              </div>
              <div className="goals-panel__stat">
                <strong>{dailyHeatmap.filter((day) => day.count > 0).length}</strong>
                <span>Active days</span>
              </div>
            </div>

            <div className="goals-heatmap__legend">
              <span>Quiet</span>
              <span>Steady</span>
              <span>Strong</span>
              <span>Locked in</span>
            </div>

            <div className="goals-heatmap__grid" role="img" aria-label="Daily activity heatmap for the last 28 days">
              {dailyHeatmap.map((day) => (
                <div
                  key={day.key}
                  className={`goals-heatmap__cell is-${day.intensity}`}
                  title={`${day.key}: ${day.count} transaction${day.count === 1 ? "" : "s"}${day.net !== 0 ? `, net ${formatSignedCurrency(day.net)}` : ""}`}
                >
                  <span>{day.day}</span>
                  <small>{day.count > 0 ? day.count : "·"}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="goals-drivers glass">
            <div className="goals-panel__head">
              <div>
                <p className="eyebrow">Momentum drivers</p>
                <h4>What is helping or hurting the lane</h4>
              </div>
              <div className="goals-panel__stat">
                <strong>{formatPercent(recurringShare * 100)}</strong>
                <span>Recurring share</span>
              </div>
            </div>

            <div className="goals-drivers__bars">
              {recurringMerchants.length > 0 ? (
                recurringMerchants.map((merchant) => {
                  const share = recurringDrag > 0 ? (merchant.amount / recurringDrag) * 100 : 0;
                  return (
                    <div key={merchant.label} className="goals-driver">
                      <div className="goals-driver__head">
                        <div className="goals-driver__icon" aria-hidden="true">
                          <GoalGlyph goalKey={selectedGoal.value} />
                        </div>
                        <div>
                          <strong>{merchant.label}</strong>
                          <span>{merchant.count} transactions</span>
                        </div>
                      </div>
                      <div className="goals-driver__track" aria-hidden="true">
                        <div className="goals-driver__fill" style={{ width: `${clamp(share, 8, 100)}%` }} />
                      </div>
                      <small>{formatCurrency(merchant.amount)}</small>
                    </div>
                  );
                })
              ) : (
                <div className="goals-driver goals-driver--empty">
                  <div className="goals-driver__head">
                    <div className="goals-driver__icon" aria-hidden="true">
                      <GoalGlyph goalKey={selectedGoal.value} />
                    </div>
                    <div>
                      <strong>No recurring drag yet</strong>
                      <span>Nothing is repeating enough to crowd the plan.</span>
                    </div>
                  </div>
                  <small>That makes the lane easier to steer.</small>
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="goals-lanes">
          <div className="goals-lanes__head">
            <div>
              <p className="eyebrow">Onboarding goals</p>
              <h4>All the lanes Clover can coach you through</h4>
            </div>
            <p className="goals-lanes__summary">
              These are the same focus areas Clover asked about during onboarding. Your active lane is highlighted so
              you can see how the current month supports it.
            </p>
          </div>

          <div className="goals-lane-grid">
            {GOAL_OPTIONS.map((goal) => {
              const isActive = goal.value === selectedGoalKey;
              return (
                <article key={goal.value} className={`goals-lane glass ${isActive ? "is-active" : ""}`}>
                  <div className="goals-lane__top">
                    <div className="goals-lane__icon" aria-hidden="true">
                      <GoalGlyph goalKey={goal.value} />
                    </div>
                    <div className="goals-lane__badge-row">
                      <span className={`pill ${isActive ? "pill-good" : "pill-subtle"}`}>{isActive ? "Current focus" : "Available focus"}</span>
                      <span className="goals-lane__score">{goal.targetRate}% pace target</span>
                    </div>
                  </div>
                  <h5>{goal.title}</h5>
                  <p>{goal.description}</p>
                  <div className="goals-lane__footer">
                    <span>{goal.signal}</span>
                    {isActive ? <strong>{selectedGoal.coachNote}</strong> : <strong>{goal.coachNote}</strong>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="goals-intel-grid">
          <article className="goals-history glass">
            <div className="goals-panel__head">
              <div>
                <p className="eyebrow">Goal history</p>
                <h4>Your path so far</h4>
              </div>
              <div className="goals-panel__stat">
                <strong>{goalTimelineEntries.length}</strong>
                <span>Saved goal updates</span>
              </div>
            </div>

            <div className="goals-history__timeline">
              {goalTimelineEntries.map((entry, index) => (
                <div key={`${entry.label}-${index}`} className="goals-history__item">
                  <span className="goals-history__label">{entry.label}</span>
                  <strong>{entry.detail}</strong>
                </div>
              ))}
            </div>
            <p className="goals-history__hint">{playbook.historyMarkers[0]}</p>
          </article>

          <article className="goals-milestones glass">
            <div className="goals-panel__head">
              <div>
                <p className="eyebrow">Milestones</p>
                <h4>What progress looks like here</h4>
              </div>
              <div className="goals-panel__stat">
                <strong>{Math.round(weeklyProgress)}%</strong>
                <span>Weekly pace</span>
              </div>
            </div>

            <div className="goals-milestones__list">
              {milestoneCards.map((milestone) => (
                <div key={milestone.label} className={`goals-milestone ${milestone.reached ? "is-reached" : ""}`}>
                  <div className="goals-milestone__head">
                    <strong>
                      <span className="goals-milestone__icon" aria-hidden="true">
                        <GoalGlyph goalKey={selectedGoal.value} />
                      </span>
                      {milestone.label}
                    </strong>
                    <span>{milestone.reached ? "Reached" : `${Math.round(milestone.percent)}%`}</span>
                  </div>
                  <p>{milestone.detail}</p>
                  <div className="goals-milestone__bar" aria-hidden="true">
                    <div className="goals-milestone__fill" style={{ width: `${milestone.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="goals-weekly glass">
            <div className="goals-panel__head">
              <div>
                <p className="eyebrow">Weekly change</p>
                <h4>What shifted since the last check</h4>
              </div>
              <div className="goals-panel__stat">
                <strong className={goalScore >= 70 ? "positive" : "negative"}>{goalScore}</strong>
                <span>Coach score</span>
              </div>
            </div>

            <div className="goals-weekly__grid">
              {weeklySignals.map((signal) => (
                <div key={signal.label} className={`goals-weekly__card ${signal.tone}`}>
                  <span>{signal.label}</span>
                  <strong>{signal.value}</strong>
                  <small>{signal.note}</small>
                </div>
              ))}
            </div>
          </article>
        </section>

        <GoalsChecklist items={checklistItems} />

        <article className="goals-alerts glass">
          <div className="goals-panel__head">
            <div>
              <p className="eyebrow">Goal alerts</p>
              <h4>Coach notes for this moment</h4>
            </div>
            <div className="goals-panel__stat">
              <strong>{goalAlerts.length}</strong>
              <span>Active messages</span>
            </div>
          </div>

          <div className="goals-alerts__list">
            {goalAlerts.map((alert, index) => (
              <div key={`${alert.text}-${index}`} className="goals-alerts__item">
                <span className="goals-alerts__dot" aria-hidden="true">
                  <GoalGlyph goalKey={selectedGoal.value} />
                </span>
                <p>{alert.text}</p>
              </div>
            ))}
          </div>
        </article>

        <div className="goals-editor-shell" id="goal-editor">
          <GoalsEditor
            goals={GOAL_OPTIONS}
            currentGoal={selectedGoalKey}
            currentTargetAmount={goalTargetAmount !== null ? String(goalTargetAmount) : null}
            suggestedTargetAmount={suggestedGoalTarget}
          />
        </div>

        <article className="goals-actions glass">
          <div className="goals-panel__head">
            <div>
              <p className="eyebrow">Next move</p>
              <h4>Keep the momentum moving</h4>
            </div>
            <div className="goals-panel__stat">
              <strong>{formatPercent(Math.max(0, goalScore - 50))}</strong>
              <span>Above the build line</span>
            </div>
          </div>

          <div className="goals-action-grid">
            <article className="goals-action">
              <div>
                <strong>Review transactions</strong>
                <span>Clear out the rough edges so the goal score keeps telling the truth.</span>
              </div>
              <Link className="pill-link pill-link--inline" href="/transactions">
                Open transactions
              </Link>
            </article>
            <article className="goals-action">
              <div>
                <strong>Open insights</strong>
                <span>Compare the coach view with the broader trend line whenever you need context.</span>
              </div>
              <Link className="pill-link pill-link--inline" href="/insights">
                Open insights
              </Link>
            </article>
            <article className="goals-action">
              <div>
                <strong>Inspect spending</strong>
                <span>Use the biggest category as the easiest lever for a quick win.</span>
              </div>
              <Link className="pill-link pill-link--inline" href="/reports">
                Open reports
              </Link>
            </article>
          </div>
        </article>
      </section>
    </CloverShell>
  );
}
