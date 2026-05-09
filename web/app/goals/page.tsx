import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";
import { getSessionContext } from "@/lib/auth";
import { analyticsOnceKey } from "@/lib/analytics";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { RouteSplash } from "@/components/route-splash";
import { getEffectiveUserLimits } from "@/lib/user-limits";
import { PostHogEvent } from "@/components/posthog-analytics";
import { GoalsSubtabs, GoalsSubtabsTitleAddon } from "@/components/goals-subtabs";
import { GoalsEditor } from "@/components/goals-editor-modal";
import { GoalGlyph } from "@/components/goals-visuals";
import { formatCurrencyAmount, formatCurrencyCode } from "@/lib/currency-format";
import {
  GOAL_OPTIONS,
  getFinancialExperienceProfile,
  getGoalDefinition,
  getGoalMoneyLabel,
  getGoalPlanSummary,
  getGoalProgressSnapshot,
  getGoalPlaybook,
  getSuggestedGoalAmount,
  normalizeGoalPlan,
  type GoalKey,
} from "@/lib/goals";

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

async function GoalsPageStream({
  searchParams,
}: {
  searchParams?: Promise<{
    section?: string;
  }>;
}) {
  const session = await getSessionContext();
  const user = await getOrCreateCurrentUser(session.userId);

  if (!session.isGuest && !hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }
  const planLimits = getEffectiveUserLimits(user);
  const isPro = user.planTier === "pro";
  const availableSections: GoalsSection[] = isPro ? ["overview", "progress", "drivers", "history"] : ["overview", "progress", "history"];
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedSection = normalizeGoalsSection(resolvedSearchParams?.section);
  const selectedSection = requestedSection && availableSections.includes(requestedSection) ? requestedSection : "overview";
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
        goalPlan: true,
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
  ]);

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
  const latestGoalPlan = goalHistoryRows.length > 0 ? normalizeGoalPlan(goalHistoryRows[0].goalPlan, goalHistoryRows[0].primaryGoal as GoalKey | null, goalHistoryRows[0].targetAmount !== null && goalHistoryRows[0].targetAmount !== undefined ? Number(goalHistoryRows[0].targetAmount) : null) : null;
  const currentGoalPlan = normalizeGoalPlan(user.goalPlan, selectedGoalKey as GoalKey | null, goalTargetAmount) ?? latestGoalPlan;

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
  const goalScore = clamp(Math.round(savingsScore + trendScore + consistencyScore + cleanlinessScore * 0.2 - dragPenalty), 12, 98);
  const onboardingDate = user.onboardingCompletedAt ? new Date(user.onboardingCompletedAt) : null;
  const goalMoneyLabel = getGoalMoneyLabel(selectedGoalKey as GoalKey | null);
  const coachScoreRadius = 44;
  const coachScoreCircumference = 2 * Math.PI * coachScoreRadius;
  const coachScoreOffset = coachScoreCircumference - (goalScore / 100) * coachScoreCircumference;

  const weeklyProgress = clamp(goalScore + (currentSavingsRate !== null && currentSavingsRate >= targetRate / 100 ? 8 : 0) - (recurringShare > 0.25 ? 6 : 0), 12, 100);
  const progressRingPercent = goalProgress.progressPercent !== null ? clamp(goalProgress.progressPercent, 0, 100) : weeklyProgress;

  const overviewCards = [
    {
      label: "Current target",
      value:
        hasGoalTarget && goalProgress.targetAmount !== null
          ? formatCurrency(goalProgress.targetAmount, goalCurrency)
          : suggestedGoalTarget !== null
            ? formatCurrency(suggestedGoalTarget, goalCurrency)
            : "Set it now",
      note:
        hasGoalTarget && currentGoalPlan !== null
          ? `${goalTargetSource ?? "Saved goal"} · ${currentGoalPlan.targetMode === "percent" ? "Percent of salary" : currentGoalPlan.cadence === "annual" ? "Annual target" : "Monthly target"}`
          : "One clear number keeps the month simple.",
    },
    {
      label: "Status",
      value: goalProgress.bandLabel,
      note: goalProgress.achieved
        ? "You already reached the target."
        : goalProgress.bandTone === "positive"
          ? "Ahead of plan"
          : goalProgress.bandTone === "negative"
            ? "Needs a reset"
            : "Staying steady",
    },
    {
      label: "Next action",
      value: goalProgress.nextAction,
      note: goalProgress.achieved ? "Set the next goal when you are ready." : "One useful move is enough for now.",
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

  const progressBands = [
    {
      label: "Ahead",
      threshold: 75,
      copy: "The goal is comfortably within reach.",
      tone: "positive" as const,
    },
    {
      label: "On pace",
      threshold: 50,
      copy: "Keep the current rhythm and protect the transfer.",
      tone: "neutral" as const,
    },
    {
      label: "Building",
      threshold: 25,
      copy: "A small adjustment can move the month in your favor.",
      tone: "warning" as const,
    },
    {
      label: "Setup",
      threshold: 0,
      copy: hasGoalTarget ? "You have a target, now let the month do the work." : "Set the first number so Clover can start measuring.",
      tone: hasGoalTarget ? "negative" as const : "neutral" as const,
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
              `${rowGoal.title}${rowTarget !== null ? ` · ${formatCurrency(rowTarget, goalCurrency)}` : " · No amount set"} · ${row.source === "onboarding" ? "Saved during onboarding" : "Updated in Goals"}`,
          };
        })
      : [
          {
            label: onboardingDate ? formatShortDate(onboardingDate) : "Onboarding",
            detail: hasGoalSelection ? `You picked ${selectedGoal.title.toLowerCase()} and can set a monthly target from here.` : "You skipped goal setup, so Clover can help you define one now.",
          },
        ];

  const recurringMerchantsPreview = recurringMerchants.slice(0, 3);
  const recentIncomeDays = currentWindowTransactions.filter((transaction) => transaction.type === "income").map((transaction) => transaction.date.getDate());
  const paydayDay = getMostCommonDayOfMonth(recentIncomeDays);
  const paydayHint =
    paydayDay !== null
      ? `Recent income tends to arrive around the ${formatOrdinalDay(paydayDay)}.`
      : null;
  const driverCards = [
    {
      label: "Spending pressure",
      value: spendDelta === null ? "N/A" : formatPercent(spendDelta),
      note: spendDelta === null ? "No prior comparison" : spendDelta > 0 ? "Spending is higher than before" : "Spending is easing",
    },
    {
      label: "Savings rate",
      value: currentSavingsRate === null ? "N/A" : formatPercent(currentSavingsRate * 100),
      note: currentSavingsRate === null ? "Need more income context" : savingsRateDelta !== null && savingsRateDelta >= 0 ? "Improving momentum" : "Needs a reset",
    },
    {
      label: "Recurring costs",
      value: recurringShare > 0 ? formatPercent(recurringShare * 100) : "Clean",
      note: recurringShare > 0.25 ? "A meaningful slice of the month" : "Recurring spending is under control",
    },
    {
      label: "Investment movement",
      value: investmentHoldingsCount > 0 ? formatCurrency(investmentHoldingsValue, goalCurrency) : "No holdings",
      note:
        investmentHoldingsCount > 0
          ? `${investmentHoldingsCount} holding${investmentHoldingsCount === 1 ? "" : "s"} · ${investmentGainLoss >= 0 ? "+" : "-"}${formatCurrency(Math.abs(investmentGainLoss), goalCurrency)}`
          : "Connect Investments to make this lane feel real",
    },
  ];

  return (
    <CloverShell
      active="goals"
      title="Goals"
      titleAddon={<GoalsSubtabsTitleAddon activeSection={selectedSection} availableSections={availableSections} />}
    >
      <GoalsSubtabs activeSection={selectedSection} availableSections={availableSections} beginnerMode={isBeginnerMode}>
        <section className="goals-section goals-section--overview">
          <article className="goals-hero glass">
            <div className="goals-hero__copy">
              <p className="goals-hero__eyebrow">{isBeginnerMode ? "Start here" : "Goal coaching"}</p>
              <h3>{heroLead}</h3>
              <p>{heroSupport}</p>
              {investmentHoldingsCount > 0 ? (
                <p className="goals-hero__setup-note">
                  Your Investments page already tracks {formatCurrency(investmentHoldingsValue, goalCurrency)} across {investmentHoldingsCount} holding
                  {investmentHoldingsCount === 1 ? "" : "s"}. If you want this goal to follow that habit, `Invest better` is the closest fit.
                </p>
              ) : null}
              {!hasGoalTarget ? (
                <>
                  <p className="goals-hero__setup-note">
                    {isBeginnerMode
                      ? "Start here: pick one number below and Clover will track the rest with you."
                      : "You did not set a monthly target yet. Pick a number below so Clover can track how much progress you make each month."}
                  </p>
                  <Link className="pill-link pill-link--inline" href="#goal-editor">
                    Set your target
                  </Link>
                </>
              ) : null}

              <div className="goals-hero__summary">
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
                  <strong>{hasGoalTarget ? goalProgress.label : "Monthly goal setup"}</strong>
                  <span>
                    {hasGoalTarget && goalProgress.targetAmount !== null
                      ? `${formatCurrency(goalProgress.currentAmount, goalCurrency)} of ${formatCurrency(goalProgress.targetAmount, goalCurrency)}`
                      : suggestedGoalTarget !== null
                        ? `Suggested ${formatCurrency(suggestedGoalTarget, goalCurrency)}`
                        : "No target saved yet"}
                  </span>
                </div>
                <div className="goals-progress__bar" aria-hidden="true">
                  <div className="goals-progress__fill" style={{ width: `${goalProgress.progressPercent ?? 0}%` }} />
                </div>
                <p>{hasGoalTarget ? goalProgress.coachCopy : "Set the number, then Clover will track the month with you."}</p>
              </div>

              {goalProgress.achieved ? (
                <PostHogEvent
                  event="goal_target_reached"
                  onceKey={analyticsOnceKey(
                    "goal_target_reached",
                    `user:${user.id}:goal:${selectedGoalKey ?? "none"}:${goalTargetAmount ?? "none"}:${goalTargetSource ?? "saved"}`
                  )}
                  properties={{
                    user_id: user.id,
                    primary_goal: selectedGoalKey ?? null,
                    target_amount: goalTargetAmount ?? null,
                    target_source: goalTargetSource ?? null,
                    progress_percent: goalProgress.progressPercent ?? null,
                    current_amount: goalProgress.currentAmount,
                  }}
                />
              ) : null}

              {hasGoalTarget ? (
                <PostHogEvent
                  event="goal_progress_updated"
                  onceKey={analyticsOnceKey(
                    "goal_progress_updated",
                    `user:${user.id}:goal:${selectedGoalKey ?? "none"}:${toIsoMonth(new Date())}:${Math.round(
                      goalProgress.progressPercent ?? 0
                    )}`
                  )}
                  properties={{
                    user_id: user.id,
                    primary_goal: selectedGoalKey ?? null,
                    target_amount: goalTargetAmount ?? null,
                    target_source: goalTargetSource ?? null,
                    progress_percent: goalProgress.progressPercent ?? null,
                    current_amount: goalProgress.currentAmount,
                    goal_plan_key: currentGoalPlan?.goalKey ?? null,
                  }}
                />
              ) : null}

              {goalProgress.achieved ? (
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

            <div className={`goals-hero__visual${isBeginnerMode ? " goals-hero__visual--simple" : ""}`}>
              {isBeginnerMode ? (
                <article className="goals-hero__focus-card glass">
                  <div className="goals-panel__head">
                    <div>
                      <p className="eyebrow">Your goal this month</p>
                      <h4>{hasGoalTarget ? goalProgress.bandLabel : "Set a target to get started"}</h4>
                    </div>
                    <div className="goals-panel__stat">
                      <strong>{hasGoalTarget && goalProgress.progressPercent !== null ? `${Math.round(goalProgress.progressPercent)}%` : "—"}</strong>
                      <span>{hasGoalTarget ? "Progress made" : "Waiting for amount"}</span>
                    </div>
                  </div>

                  <div className="goals-hero__focus-card-body">
                    <p>{hasGoalTarget ? goalProgress.coachCopy : "Set one simple peso amount and Clover will do the coaching."}</p>
                    <div className="goals-hero__focus-card-bar" aria-hidden="true">
                      <div className="goals-hero__focus-card-fill" style={{ width: `${goalProgress.progressPercent ?? 0}%` }} />
                    </div>
                    <small>
                      {hasGoalTarget
                        ? goalProgress.remainingAmount !== null
                          ? `${formatCurrency(goalProgress.remainingAmount, goalCurrency)} left to reach the goal.`
                          : "Goal progress is ready to track."
                        : "Once you set a number, the bar will start moving."}
                    </small>
                  </div>
                </article>
              ) : (
                <article className="goals-hero__score-card glass" aria-label="Coach score">
                  <div className="goals-hero__score-donut" role="img" aria-label={`Coach score ${goalScore} out of 100`}>
                    <svg viewBox="0 0 120 120" aria-hidden="true">
                      <circle className="goals-hero__score-donut-track" cx="60" cy="60" r={coachScoreRadius} />
                      <circle
                        className="goals-hero__score-donut-progress"
                        cx="60"
                        cy="60"
                        r={coachScoreRadius}
                        style={{
                          strokeDasharray: `${coachScoreCircumference} ${coachScoreCircumference}`,
                          strokeDashoffset: coachScoreOffset,
                        }}
                      />
                    </svg>
                    <div className="goals-hero__score-donut-center">
                      <strong>{goalScore}</strong>
                      <span>/100</span>
                    </div>
                  </div>
                </article>
              )}
            </div>
          </article>

          <div className="goals-overview__cards">
            {overviewCards.map((card) => (
              <article key={card.label} className="goals-overview__card glass">
                <span>{card.label}</span>
                <strong>{card.value}</strong>
                <small>{card.note}</small>
              </article>
            ))}
          </div>

          <div className="goals-editor-shell" id="goal-editor">
            <GoalsEditor
              goals={GOAL_OPTIONS}
              currentGoal={selectedGoalKey}
              currentTargetAmount={goalTargetAmount !== null ? String(goalTargetAmount) : null}
              currentGoalPlan={currentGoalPlan}
              monthlyIncome={monthlyIncome}
              suggestedTargetAmount={suggestedGoalTarget}
              investmentHoldingsCount={investmentHoldingsCount}
              investmentHoldingsValue={investmentHoldingsValue}
              paydayHint={paydayHint}
              currency={goalCurrency}
            />
          </div>
        </section>

        <section className="goals-section goals-section--progress">
          <div className="goals-progress-grid">
            <article className="goals-hero__ring-card">
              <div
                className={`goals-hero__ring ${goalProgress.achieved ? "is-complete" : ""}`}
                role="img"
                aria-label={
                  hasGoalTarget && goalProgress.progressPercent !== null
                    ? `Monthly goal progress at ${Math.round(goalProgress.progressPercent)} percent`
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
                      strokeDasharray: `${2 * Math.PI * 84 * ((goalProgress.progressPercent ?? 0) / 100)} ${2 * Math.PI * 84}`,
                    }}
                  />
                </svg>
                <div className="goals-hero__ring-copy">
                  <strong>{hasGoalTarget && goalProgress.progressPercent !== null ? `${Math.round(goalProgress.progressPercent)}%` : "Set it"}</strong>
                  <span>{hasGoalTarget ? `${formatCurrency(goalProgress.currentAmount, goalCurrency)} ${goalProgress.currentLabel.toLowerCase()}` : "No monthly target yet"}</span>
                </div>
              </div>
            </article>

            <article className="goals-pace-card glass">
              <div className="goals-panel__head">
                <div>
                  <p className="eyebrow">Progress bands</p>
                  <h4>Where the month stands right now</h4>
                </div>
                <div className="goals-panel__stat">
                  <strong>{goalProgress.bandLabel}</strong>
                  <span>{goalProgress.bandTone === "positive" ? "Ahead of plan" : goalProgress.bandTone === "negative" ? "Needs a reset" : "Staying steady"}</span>
                </div>
              </div>

              <div className="goals-pace__bars">
                {progressBands.map((band) => (
                  <div key={band.label} className={`goals-pace__bar ${band.tone}`}>
                    <div className="goals-pace__label">
                      <span>{band.label}</span>
                      <strong>{band.threshold}%</strong>
                    </div>
                    <div className="goals-pace__track" aria-hidden="true">
                      <div
                        className="goals-pace__fill"
                        style={{
                          width:
                            goalProgress.progressPercent === null
                              ? "0%"
                              : `${clamp(goalProgress.progressPercent >= band.threshold ? 100 : (goalProgress.progressPercent / Math.max(band.threshold, 1)) * 100, 8, 100)}%`,
                        }}
                      />
                    </div>
                    <small>
                      {band.copy}
                      {goalProgress.progressPercent !== null && goalProgress.progressPercent >= band.threshold ? " This band is cleared." : ""}
                    </small>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <div className="goals-progress__lower">
            <article className="goals-milestones glass">
              <div className="goals-panel__head">
                <div>
                  <p className="eyebrow">Milestones</p>
                  <h4>What progress looks like here</h4>
                </div>
                <div className="goals-panel__stat">
                  <strong>{Math.round(weeklyProgress)}</strong>
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
                      <span>{milestone.reached ? "Reached" : `Threshold ${milestone.threshold}%`}</span>
                    </div>
                    <p>{milestone.detail}</p>
                    <div className="goals-milestone__bar" aria-hidden="true">
                      <div className="goals-milestone__fill" style={{ width: `${milestone.percent}%` }} />
                    </div>
                    <small>{milestone.reached ? "Keep this behavior consistent through month-end." : `You are ${Math.max(0, milestone.threshold - goalScore)} points away from this checkpoint.`}</small>
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
                {[
                  {
                    label: "Spend",
                    value: spendDelta === null ? "N/A" : formatPercent(spendDelta),
                    note: spendDelta === null ? "No prior comparison" : spendDelta > 0 ? "Up vs prior month" : "Down vs prior month",
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
                ].map((signal) => (
                  <div key={signal.label} className={`goals-weekly__card ${signal.tone}`}>
                    <span>{signal.label}</span>
                    <strong>{signal.value}</strong>
                    <small>{signal.note}</small>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>

        {isPro ? (
          <section className="goals-section goals-section--drivers">
            <div className="goals-drivers-grid">
              {driverCards.map((card) => (
                <article key={card.label} className="goals-driver goals-driver--summary glass">
                  <div className="goals-driver__head">
                    <div className="goals-driver__icon" aria-hidden="true">
                      <GoalGlyph goalKey={selectedGoal.value} />
                    </div>
                    <div>
                      <strong>{card.label}</strong>
                      <span>{card.note}</span>
                    </div>
                  </div>
                  <strong className="goals-driver__value">{card.value}</strong>
                </article>
              ))}
            </div>

            <article className="goals-driver goals-driver--recurring glass">
              <div className="goals-panel__head">
                <div>
                  <p className="eyebrow">Recurring costs</p>
                  <h4>What is taking repeated bites out of the month</h4>
                </div>
                <div className="goals-panel__stat">
                  <strong>{formatPercent(recurringShare * 100)}</strong>
                  <span>Recurring share</span>
                </div>
              </div>

              <div className="goals-driver__list">
                {recurringMerchantsPreview.length > 0 ? (
                  recurringMerchantsPreview.map((merchant) => {
                    const share = recurringDrag > 0 ? (merchant.amount / recurringDrag) * 100 : 0;
                    return (
                      <div key={merchant.label} className="goals-driver__row">
                        <div>
                          <strong>{merchant.label}</strong>
                          <span>{merchant.count} transactions</span>
                        </div>
                        <div className="goals-driver__track" aria-hidden="true">
                          <div className="goals-driver__fill" style={{ width: `${clamp(share, 8, 100)}%` }} />
                        </div>
                        <small>{formatCurrency(merchant.amount, goalCurrency)}</small>
                      </div>
                    );
                  })
                ) : (
                  <div className="goals-driver--empty">
                    <strong>No recurring drag yet</strong>
                    <span>Clover has not seen a repeating merchant large enough to crowd this plan.</span>
                  </div>
                )}
              </div>
            </article>
          </section>
        ) : null}

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
      </GoalsSubtabs>

      {user.planTier === "free" ? (
        <p className="goals-upgrade-note">
          If you’d like to explore more later, <Link href="/pricing">Pro</Link> adds extra charts, deeper analysis, and more goal coaching to help you see the bigger picture.
        </p>
      ) : null}
    </CloverShell>
  );
}

export default function GoalsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    section?: string;
  }>;
}) {
  return <RouteSplash label="goals"><GoalsPageStream searchParams={searchParams} /></RouteSplash>;
}
