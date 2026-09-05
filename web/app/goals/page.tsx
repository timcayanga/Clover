import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";
import { getPageSessionContext } from "@/lib/page-auth";
import { analyticsOnceKey } from "@/lib/analytics";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { RouteSplash } from "@/components/route-splash";
import { getEffectiveUserLimits } from "@/lib/user-limits";
import { PostHogEvent } from "@/components/posthog-analytics";
import { GoalsEditor } from "@/components/goals-editor-modal";
import { GoalInlineSetup } from "@/components/goal-inline-setup";
import { InfoTooltip } from "@/components/info-tooltip";
import { formatCurrencyAmount, formatCurrencyCode } from "@/lib/currency-format";
import {
  GOAL_OPTIONS,
  getFinancialExperienceProfile,
  getGoalDefinition,
  getGoalPlanSummary,
  getGoalProgressSnapshot,
  getGoalPlaybook,
  getSuggestedGoalAmount,
  normalizeGoalPlan,
  type GoalKey,
} from "@/lib/goals";
import { buildActiveWorkspaceTransactionWhere } from "@/lib/transaction-query";
import { ContextualAskClover } from "@/components/contextual-ask-clover";
import { loadCachedWorkspaceSummary } from "@/lib/workspace-summary-cache";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Goals",
};

const selectedWorkspaceKey = "clover.selected-workspace-id.v1";

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
  currency?: string | null;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  account: {
    name: string;
    type: string;
    currency: string | null;
  };
  category: {
    name: string;
  } | null;
};

type GoalsSection = "overview" | "progress" | "drivers" | "history";

type InvestmentAccountSnapshot = {
  id: string;
  name: string;
  institution: string | null;
  investmentSubtype: string | null;
  balance: unknown;
  investmentCostBasis: unknown;
  investmentPrincipal: unknown;
  updatedAt: Date;
  currency: string | null;
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

const formatCurrency = (value: number, currency?: string | null) => formatCurrencyAmount(value, currency ?? "PHP");
const formatSignedCurrency = (value: number, currency?: string | null) =>
  `${value < 0 ? "-" : ""}${formatCurrencyAmount(Math.abs(value), currency ?? "PHP")}`;
const formatPercent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(0)}%`;
const formatShortDate = (value: Date) => shortDateFormatter.format(value);
const toIsoMonth = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const toMonthLabel = (date: Date) => monthFormatter.format(date);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const normalizeMerchant = (value: string) => value.trim().toLowerCase();
const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);
const formatOrdinalDay = (day: number) => {
  const remainder = day % 100;
  if (remainder >= 11 && remainder <= 13) {
    return `${day}th`;
  }

  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
};
const getMostCommonDayOfMonth = (values: number[]) => {
  if (values.length === 0) {
    return null;
  }

  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let winner: number | null = null;
  let winnerCount = 0;
  for (const [day, count] of counts.entries()) {
    if (count > winnerCount || (count === winnerCount && (winner === null || day < winner))) {
      winner = day;
      winnerCount = count;
    }
  }

  return winner;
};
const normalizeGoalsSection = (value: string | undefined | null): GoalsSection | null => {
  if (value === "overview" || value === "progress" || value === "drivers" || value === "history") {
    return value;
  }

  return null;
};

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

async function GoalsPageStream() {
  const session = await getPageSessionContext();
  const user = await getOrCreateCurrentUser(session.userId);

  if (!session.isGuest && !hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }
  const planLimits = getEffectiveUserLimits(user);
  const isPro = user.planTier === "pro";
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
            user: {
              clerkUserId: user.clerkUserId,
            },
          },
          select: workspaceSelect,
        })
      : null) ??
    (await prisma.workspace.findFirst({
      where: {
        user: {
          clerkUserId: user.clerkUserId,
        },
      },
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
    investmentAccountRows,
  ] = await loadCachedWorkspaceSummary({
    workspaceId: resolvedWorkspace.id,
    area: "goals",
    load: () => Promise.all([
    prisma.$queryRaw<SummaryRow[]>`
      SELECT
        "type",
        COALESCE(SUM("amount"), 0)::float8 AS total
      FROM "Transaction"
      WHERE ("workspaceId" = ${resolvedWorkspace.id}
        OR "accountId" IN (SELECT "id" FROM "Account" WHERE "workspaceId" = ${resolvedWorkspace.id}))
        AND "isExcluded" = false
        AND "deletedAt" IS NULL
        AND "date" >= ${thirtyDaysAgo}
      GROUP BY "type"
    `,
    prisma.$queryRaw<SummaryRow[]>`
      SELECT
        "type",
        COALESCE(SUM("amount"), 0)::float8 AS total
      FROM "Transaction"
      WHERE ("workspaceId" = ${resolvedWorkspace.id}
        OR "accountId" IN (SELECT "id" FROM "Account" WHERE "workspaceId" = ${resolvedWorkspace.id}))
        AND "isExcluded" = false
        AND "deletedAt" IS NULL
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
      WHERE ("workspaceId" = ${resolvedWorkspace.id}
        OR "accountId" IN (SELECT "id" FROM "Account" WHERE "workspaceId" = ${resolvedWorkspace.id}))
        AND "isExcluded" = false
        AND "deletedAt" IS NULL
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
      WHERE ("workspaceId" = ${resolvedWorkspace.id}
        OR "accountId" IN (SELECT "id" FROM "Account" WHERE "workspaceId" = ${resolvedWorkspace.id}))
        AND "isExcluded" = false
        AND "deletedAt" IS NULL
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
        goalPlan: true,
        createdAt: true,
      },
    }),
    prisma.transaction.findMany({
      where: buildActiveWorkspaceTransactionWhere(resolvedWorkspace.id, {
        date: { gte: thirtyDaysAgo },
      }),
      select: {
        date: true,
        amount: true,
        currency: true,
        type: true,
        merchantRaw: true,
        merchantClean: true,
        account: {
          select: {
            name: true,
            type: true,
            currency: true,
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
    prisma.account.findMany({
      where: {
        workspaceId: resolvedWorkspace.id,
        type: "investment",
      },
      select: {
        id: true,
        name: true,
        institution: true,
        investmentSubtype: true,
        balance: true,
        investmentCostBasis: true,
        investmentPrincipal: true,
        updatedAt: true,
        currency: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    }),
    ]),
  });

  const currentWindowTransactions = currentWindowTransactionsQuery as GoalTransaction[];
  const investmentAccounts = investmentAccountRows as InvestmentAccountSnapshot[];
  const goalCurrencyCandidates = new Set<string>();
  for (const transaction of currentWindowTransactions) {
    if (typeof transaction.currency === "string" && transaction.currency.trim()) {
      goalCurrencyCandidates.add(formatCurrencyCode(transaction.currency));
    } else if (typeof transaction.account.currency === "string" && transaction.account.currency.trim()) {
      goalCurrencyCandidates.add(formatCurrencyCode(transaction.account.currency));
    }
  }
  for (const investment of investmentAccounts) {
    if (typeof investment.currency === "string" && investment.currency.trim()) {
      goalCurrencyCandidates.add(formatCurrencyCode(investment.currency));
    }
  }
  const goalCurrency = goalCurrencyCandidates.size === 1 ? Array.from(goalCurrencyCandidates)[0] : "PHP";
  const selectedGoalKey = user.primaryGoal?.trim() ?? null;
  const selectedGoal = getGoalDefinition(selectedGoalKey);
  const playbook = getGoalPlaybook(selectedGoalKey);
  const experienceProfile = getFinancialExperienceProfile(user.financialExperience);
  const goalTargetAmount = user.goalTargetAmount ? Number(user.goalTargetAmount) : null;
  const goalTargetSource = user.goalTargetSource ?? null;
  const hasGoalSelection = Boolean(selectedGoalKey);
  const hasGoalTarget = goalTargetAmount !== null && goalTargetAmount > 0;
  const isBeginnerMode = user.financialExperience === "beginner";
  const heroLead = hasGoalSelection
    ? playbook.heroLead
    : experienceProfile.goalsLead ?? "Pick a lane, set a number, and let Clover coach the month with you.";
  const heroSupport = hasGoalSelection
    ? playbook.heroSupport
    : experienceProfile.goalsSupport ?? "If onboarding skipped this step, you can define your first real monthly target right here.";

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
  const currentGoalPlan = normalizeGoalPlan(user.goalPlan, selectedGoalKey as GoalKey | null, goalTargetAmount);

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
  // Clover presents savings rate as the share of income retained, so keep the
  // product metric within 0–100%. A cash-flow deficit is 0% saved rather than a
  // negative savings percentage (matching Reports and Home).
  const currentSavingsRate = currentSummary.income > 0
    ? Math.min(1, Math.max(0, currentNet / currentSummary.income))
    : null;
  const previousSavingsRate = previousSummary.income > 0
    ? Math.min(1, Math.max(0, (previousSummary.income - previousSummary.expense) / previousSummary.income))
    : null;
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
  const investmentHoldings = investmentAccounts
    .slice()
    .sort((left, right) => Number(right.balance ?? 0) - Number(left.balance ?? 0));
  const investmentHoldingsValue = investmentAccounts.reduce((sum, account) => sum + Number(account.balance ?? 0), 0);
  const investmentCostBasis = investmentAccounts.reduce((sum, account) => {
    const basis = account.investmentCostBasis ?? account.investmentPrincipal;
    return sum + Number(basis ?? 0);
  }, 0);
  const investmentGainLoss = investmentHoldingsValue - investmentCostBasis;
  const investmentHoldingsCount = investmentAccounts.length;
  const investmentFlow = currentWindowTransactions
    .filter((transaction) => transaction.account.type === "investment" && transaction.type !== "income")
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount)), 0);
  const goalProgress = getGoalProgressSnapshot({
    goalKey: selectedGoalKey as GoalKey | null,
    targetAmount: goalTargetAmount,
    goalPlan: currentGoalPlan,
    currentNet,
    currentSpend,
    monthlyIncome,
    currentSavingsRate,
    previousSavingsRate,
    spendDelta,
    recurringShare,
    investmentValue: investmentHoldingsValue,
    investmentGainLoss,
    investmentFlow,
    investmentHoldings: investmentHoldingsCount,
  }, goalCurrency);
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
  const goalScore = hasGoalTarget ? clamp(Math.round(savingsScore + trendScore + consistencyScore + cleanlinessScore * 0.2 - dragPenalty), 12, 98) : 0;
  const onboardingDate = user.onboardingCompletedAt ? new Date(user.onboardingCompletedAt) : null;
  const goalDialProgress = hasGoalTarget && goalProgress.progressPercent !== null ? clamp(goalProgress.progressPercent, 0, 100) : 0;
  const goalDialRadius = 42;
  const goalDialCircumference = 2 * Math.PI * goalDialRadius;
  const goalDialOffset = goalDialCircumference - (goalDialProgress / 100) * goalDialCircumference;

  const progressRingPercent = goalDialProgress;

  const currentTargetValue =
    hasGoalTarget && goalProgress.targetAmount !== null
      ? formatCurrency(goalProgress.targetAmount, goalCurrency)
      : suggestedGoalTarget !== null
        ? formatCurrency(suggestedGoalTarget, goalCurrency)
        : "Set it now";
  const currentTargetNote =
    hasGoalTarget && currentGoalPlan !== null
      ? `${goalTargetSource ?? "Saved goal"} · ${currentGoalPlan.targetMode === "percent" ? "Percent of salary" : currentGoalPlan.cadence === "annual" ? "Annual target" : "Monthly target"}`
      : "";
  const goalStatusLabel = !hasGoalTarget
    ? "Not set"
    : goalProgress.achieved
      ? "Goal reached"
      : goalProgress.bandTone === "positive"
        ? "On Track"
        : goalProgress.bandTone === "warning"
          ? "At Risk"
          : "Not Met";
  const goalStatusNote = !hasGoalTarget
    ? ""
    : goalProgress.achieved
      ? "You already reached the target."
      : goalProgress.bandTone === "positive"
        ? "The pace is healthy."
        : goalProgress.bandTone === "warning"
          ? "Keep an eye on it."
          : "The month needs a reset.";
  const goalNextAction = hasGoalTarget ? goalProgress.nextAction : "Set a target so Clover can coach the month.";
  const goalNextActionNote = hasGoalTarget ? "One useful move is enough for now." : "";
  const weeklyChangeCards = [
    {
      label: "Spending pressure",
      value: spendDelta === null ? "N/A" : formatPercent(spendDelta),
      note: spendDelta === null ? "No prior comparison" : spendDelta > 0 ? "Up vs prior month" : "Down vs prior month",
      tone: spendDelta === null ? "neutral" : spendDelta > 0 ? "negative" : "positive",
      info: "Compares current spending with the prior comparable period.",
    },
    {
      label: "Savings rate · 30 days",
      value: currentSavingsRate === null ? "N/A" : formatPercent(currentSavingsRate * 100),
      note: currentSavingsRate === null ? "Need more income context" : savingsRateDelta !== null && savingsRateDelta >= 0 ? "Improving momentum" : "Needs a reset",
      tone: currentSavingsRate === null ? "neutral" : savingsRateDelta !== null && savingsRateDelta >= 0 ? "positive" : "negative",
      info: `Income left after expenses from ${shortDateFormatter.format(thirtyDaysAgo)} to ${shortDateFormatter.format(now)}, shown as a percentage of income.`,
    },
    {
      label: "Recurring costs",
      value: recurringShare > 0 ? formatPercent(recurringShare * 100) : "Clean",
      note: recurringShare > 0.25 ? "A meaningful slice of the month" : "Recurring spending is under control",
      tone: recurringShare > 0.25 ? "negative" : "positive",
      info: "The share of current spending associated with recurring costs.",
    },
    {
      label: "Investment movement",
      value: investmentHoldingsCount > 0 ? formatCurrency(investmentHoldingsValue, goalCurrency) : "No holdings",
      note:
        investmentHoldingsCount > 0
          ? `${investmentHoldingsCount} holding${investmentHoldingsCount === 1 ? "" : "s"} · ${investmentGainLoss >= 0 ? "+" : "-"}${formatCurrency(Math.abs(investmentGainLoss), goalCurrency)}`
          : "Connect Investments to make this lane feel real",
      tone: investmentHoldingsCount > 0 ? "positive" : "neutral",
      info: "Current recorded investment value and gain or loss across connected holdings.",
    },
  ];

  const goalTimelineEntries =
    goalHistoryRows.length > 0
      ? goalHistoryRows.map((row) => {
          const rowGoal = getGoalDefinition(row.primaryGoal);
          const rowTarget = row.targetAmount !== null && row.targetAmount !== undefined ? Number(row.targetAmount) : null;
          const rowPlan = normalizeGoalPlan(row.goalPlan, row.primaryGoal as GoalKey | null, rowTarget);
          const rowPlanSummary = getGoalPlanSummary(rowPlan, monthlyIncome, goalCurrency);
          return {
            label: formatShortDate(row.createdAt),
            detail:
              rowPlanSummary?.detail ??
              `${rowGoal.title}${rowTarget !== null ? ` · ${formatCurrency(rowTarget, goalCurrency)}` : " · No amount set"}`,
          };
        })
        : [
          {
            label: onboardingDate ? formatShortDate(onboardingDate) : "No history yet",
            detail: hasGoalSelection ? `You picked ${selectedGoal.title.toLowerCase()} and can set a target here.` : "Set a goal to start your history.",
          },
        ];

  const recentIncomeDays = currentWindowTransactions
    .filter((transaction) => transaction.type === "income")
    .map((transaction) => transaction.date.getDate());
  const paydayDay = getMostCommonDayOfMonth(recentIncomeDays);
  const paydayHint = paydayDay !== null ? `Recent income tends to arrive around the ${formatOrdinalDay(paydayDay)}.` : null;

  const goalEmojis: Record<string, string> = {
    save_more: "🌱",
    pay_down_debt: "🧭",
    track_spending: "🔎",
    build_emergency_fund: "🛡️",
    invest_better: "📈",
  };
  const goalEmoji = selectedGoalKey ? goalEmojis[selectedGoalKey] ?? "🎯" : "🎯";
  const supportDestination = selectedGoalKey === "invest_better"
    ? { href: "/investments", label: "Open Investments" }
    : selectedGoalKey === "pay_down_debt"
      ? { href: "/accounts", label: "Open Accounts" }
      : selectedGoalKey === "save_more" || selectedGoalKey === "build_emergency_fund"
        ? { href: "/budgeting", label: "Open Budgeting" }
        : { href: "/reports", label: "Open Reports" };
  const roadmapMilestones = playbook.milestones.map((milestone) => ({
    ...milestone,
    reached: hasGoalTarget && goalProgress.progressPercent !== null && goalProgress.progressPercent >= milestone.threshold,
    current: hasGoalTarget && goalProgress.progressPercent !== null && goalProgress.progressPercent < milestone.threshold && (milestone.threshold === playbook.milestones[0]?.threshold || goalProgress.progressPercent >= (playbook.milestones[playbook.milestones.indexOf(milestone) - 1]?.threshold ?? 0)),
  }));

  return (
    <RouteSplash label="goals">
      <CloverShell
        active="goals"
        title="Goals"
        mobileBackHref="/more"
        actions={<ContextualAskClover context="goals" planTier={isPro ? "pro" : "free"} />}
      >
        <section className="goals-page">
          {!hasGoalSelection ? (
            <section className="goals-blank-state glass">
              <span className="goals-blank-state__emoji" aria-hidden="true">🎯</span>
              <h3>What do you want your money to help you do?</h3>
              <GoalInlineSetup goals={GOAL_OPTIONS} suggestedTargetAmount={suggestedGoalTarget} monthlyIncome={monthlyIncome} currency={goalCurrency} />
            </section>
          ) : (
            <section className="goals-section goals-section--summary">
              <div className="goals-overview__cards">
                <article className="goals-overview__card goals-overview__card--current glass">
                  <span>Primary goal</span>
                  <strong><span aria-hidden="true">{goalEmoji}</span> {selectedGoal.title}</strong>
                  <small>{currentTargetValue}{currentTargetNote ? ` · ${currentTargetNote}` : ""}</small>
                </article>
                <article className="goals-overview__card glass">
                  <span>Goal progress</span>
                  <strong>{hasGoalTarget && goalProgress.progressPercent !== null ? `${Math.round(goalProgress.progressPercent)}%` : "Set target"}</strong>
                  <small>{hasGoalTarget ? `${formatCurrency(goalProgress.currentAmount, goalCurrency)} of ${formatCurrency(goalProgress.targetAmount ?? 0, goalCurrency)}` : "Add a target to unlock the roadmap"}</small>
                </article>
                <article className="goals-overview__card glass">
                  <span>Suggested action</span>
                  <strong>{hasGoalTarget ? goalNextAction : "Set a target to begin"}</strong>
                  {goalNextActionNote ? <small>{goalNextActionNote}</small> : null}
                </article>
              </div>
            </section>
          )}

          <section className="goals-section goals-section--roadmap">
            <article className="goals-roadmap glass">
              <div className="goals-panel__head">
                <div>
                  <p className="eyebrow">Roadmap</p>
                  <h4>{hasGoalTarget ? `Your path to ${formatCurrency(goalProgress.targetAmount ?? 0, goalCurrency)}` : "Set a target to build your roadmap"}</h4>
                </div>
                {hasGoalTarget ? <span className="goals-roadmap__badge">{goalProgress.bandLabel}</span> : null}
              </div>
              {hasGoalTarget ? (
                <div className="goals-roadmap__track" aria-label="Goal milestones">
                  {roadmapMilestones.map((milestone, index) => (
                    <div key={milestone.label} className={`goals-roadmap__milestone${milestone.reached ? " is-reached" : ""}${milestone.current ? " is-current" : ""}`}>
                      <div className="goals-roadmap__node"><span>{milestone.reached ? "✓" : index + 1}</span></div>
                      <strong>{milestone.label}</strong>
                      <span>{milestone.threshold}%</span>
                      <small>{milestone.detail}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="goals-roadmap__empty">Clover will create milestones from your target, pace, and real cash flow once you confirm a goal.</div>
              )}
            </article>
          </section>

          <section className="goals-section goals-section--signals">
            <article className="goals-progress-panel glass">
              <div className="goals-panel__head">
                <div>
                  <p className="eyebrow">Progress</p>
                  <h4>What changed recently</h4>
                </div>
                <div className="goals-panel__stat">
                  <strong>{hasGoalTarget ? `${Math.round(progressRingPercent)}%` : "--"}</strong>
                  <span>Goal progress</span>
                </div>
              </div>
              <div className="goals-weekly__grid">
                {weeklyChangeCards.map((signal) => (
                  <div key={signal.label} className={`accounts-overview-card summary-aligned-card goals-weekly__card ${signal.tone}`}>
                    <InfoTooltip className="summary-card-info" label={signal.info} />
                    <p className="eyebrow">{signal.label}</p>
                    <strong className="accounts-overview-card__amount">{signal.value}</strong>
                    {signal.note && signal.note !== "No prior comparison" ? <small>{signal.note}</small> : null}
                  </div>
                ))}
              </div>
            </article>

            <article className="goals-coach-panel glass">
              <div className="goals-panel__head">
                <div>
                  <p className="eyebrow">Goal Coach</p>
                  <h4>{hasGoalTarget ? "One useful move for now" : "Your coach will start here"}</h4>
                </div>
                <strong className="goals-coach-panel__emoji" aria-hidden="true">✨</strong>
              </div>
              {hasGoalTarget ? <p>{goalProgress.coachCopy}</p> : null}
              <p className="goals-coach-panel__action">{goalNextAction}</p>
              <div className="goals-coach-panel__links">
                <Link className="button button-secondary button-small" href={supportDestination.href}>{supportDestination.label}</Link>
                <Link className="button button-primary button-small" href="/adviser">Ask Adviser</Link>
              </div>
            </article>
          </section>

          <section className="goals-section goals-section--history">
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
          </section>

          {hasGoalSelection ? (
            <section className="goals-goal-actions">
              <span>Want to change direction?</span>
              <GoalsEditor
                goals={GOAL_OPTIONS.filter((goal) => goal.value !== "track_spending")}
                currentGoal={selectedGoalKey}
                currentTargetAmount={goalTargetAmount !== null ? String(goalTargetAmount) : null}
                currentGoalPlan={currentGoalPlan}
                monthlyIncome={monthlyIncome}
                suggestedTargetAmount={suggestedGoalTarget}
                investmentHoldingsCount={investmentHoldingsCount}
                investmentHoldingsValue={investmentHoldingsValue}
                paydayHint={paydayHint}
                currency={goalCurrency}
                compact
                triggerLabel="Edit goal"
                triggerClassName="pill-link pill-link--inline"
              />
            </section>
          ) : null}
        </section>
      </CloverShell>
    </RouteSplash>
  );
}

export default function GoalsPage() {
  return <GoalsPageStream />;
}
