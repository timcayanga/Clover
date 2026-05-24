import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { prisma } from "@/lib/prisma";
import { loadSplitBillWorkspaceData } from "@/lib/split-bill-loaders";
import { getEnv } from "@/lib/env";
import { formatCurrencyAmount, formatCurrencyCode } from "@/lib/currency-format";
import { getGoalProgressSnapshot, normalizeGoalPlan, type GoalKey } from "@/lib/goals";

export const dynamic = "force-dynamic";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type RequestBody = {
  messages?: ChatMessage[];
};

type AdviserMemoryStats = {
  count: number;
  outcomes: number;
  lastSeenAt: Date;
};

type AdviserAuditMetadata = {
  kind?: "card" | "prompt";
  group?: string;
  itemId?: string;
  label?: string;
  href?: string;
  pathname?: string;
};

type AdviserSignalTheme = "cashflow" | "behavior" | "goals" | "investments" | "cleanup";

const monthFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  year: "numeric",
});

const formatCurrency = (value: number, currency?: string | null) => formatCurrencyAmount(value, currency ?? "MIXED");
const formatSignedCurrency = (value: number, currency?: string | null) =>
  `${value < 0 ? "-" : ""}${formatCurrencyAmount(Math.abs(value), currency ?? "MIXED")}`;
const formatPercent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(0)}%`;
const toMonthLabel = (date: Date) => monthFormatter.format(date);
const buildTransactionSummary = (
  transactions: Array<{
    amount: unknown;
    type: "income" | "expense" | "transfer";
    category: {
      name: string;
    } | null;
  }>
) =>
  transactions.reduce(
    (accumulator, transaction) => {
      const amount = Number(transaction.amount);
      if (transaction.type === "income") {
        accumulator.income += amount;
      } else if (transaction.type === "expense") {
        accumulator.expense += amount;
        const categoryName = transaction.category?.name ?? "Uncategorized";
        accumulator.expenseCategories.set(
          categoryName,
          (accumulator.expenseCategories.get(categoryName) ?? 0) + Math.abs(amount)
        );
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
const buildMonthlySeries = (
  transactions: Array<{
    amount: unknown;
    type: "income" | "expense" | "transfer";
    date: Date;
  }>
) => {
  const monthlyBuckets = new Map<string, { income: number; expense: number; net: number }>();

  for (const transaction of transactions) {
    const monthKey = `${transaction.date.getFullYear()}-${String(transaction.date.getMonth() + 1).padStart(2, "0")}`;
    const bucket = monthlyBuckets.get(monthKey) ?? { income: 0, expense: 0, net: 0 };
    const amount = Number(transaction.amount);

    if (transaction.type === "income") {
      bucket.income += amount;
      bucket.net += amount;
    } else if (transaction.type === "expense") {
      bucket.expense += amount;
      bucket.net -= amount;
    }

    monthlyBuckets.set(monthKey, bucket);
  }

  return Array.from(monthlyBuckets.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, bucket]) => ({ month, ...bucket }));
};

const calculateTrendSignal = (values: number[]) => {
  if (values.length < 2) {
    return { direction: 0, magnitude: 0, score: 0 };
  }

  const count = values.length;
  const xMean = (count - 1) / 2;
  const yMean = values.reduce((sum, value) => sum + value, 0) / count;
  let numerator = 0;
  let denominator = 0;

  for (let index = 0; index < count; index += 1) {
    const centeredX = index - xMean;
    numerator += centeredX * (values[index] - yMean);
    denominator += centeredX * centeredX;
  }

  const slope = denominator > 0 ? numerator / denominator : 0;
  const normalizedSlope = yMean > 0 ? slope / yMean : slope;
  const direction = slope === 0 ? 0 : slope > 0 ? 1 : -1;
  const magnitude = Math.abs(normalizedSlope);

  return {
    direction,
    magnitude,
    score: Math.max(0, Math.min(100, magnitude * 180)),
  };
};

const getTrailingAverage = (series: number[], months: number) => {
  const slice = series.slice(-months);
  return slice.length > 0 ? slice.reduce((sum, value) => sum + value, 0) / slice.length : 0;
};

const getWeightedHistoricalBaseline = (series: Array<{ income: number; expense: number; net: number }>) => {
  const expenseSeries = series.map((item) => item.expense);
  const incomeSeries = series.map((item) => item.income);
  const netSeries = series.map((item) => item.net);
  const windows = [
    { months: 3, weight: 0.5 },
    { months: 6, weight: 0.3 },
    { months: 12, weight: 0.2 },
  ];

  const weightedAverage = (values: number[]) => {
    const weighted = windows.reduce((sum, window) => sum + getTrailingAverage(values, window.months) * window.weight, 0);
    const totalWeight = windows.reduce((sum, window) => sum + window.weight, 0);
    return totalWeight > 0 ? weighted / totalWeight : 0;
  };

  return {
    spend: weightedAverage(expenseSeries),
    income: weightedAverage(incomeSeries),
    net: weightedAverage(netSeries),
  };
};

const updateMemoryStats = (map: Map<string, AdviserMemoryStats>, key: string, createdAt: Date) => {
  const current = map.get(key);
  if (!current) {
    map.set(key, { count: 1, outcomes: 0, lastSeenAt: createdAt });
    return;
  }

  map.set(key, {
    count: current.count + 1,
    outcomes: current.outcomes,
    lastSeenAt: createdAt > current.lastSeenAt ? createdAt : current.lastSeenAt,
  });
};

const recordOutcomeStats = (map: Map<string, AdviserMemoryStats>, key: string, createdAt: Date) => {
  const current = map.get(key);
  if (!current) {
    map.set(key, { count: 0, outcomes: 1, lastSeenAt: createdAt });
    return;
  }

  map.set(key, {
    count: current.count,
    outcomes: current.outcomes + 1,
    lastSeenAt: createdAt > current.lastSeenAt ? createdAt : current.lastSeenAt,
  });
};

const memoryBoostFromStats = (stats: AdviserMemoryStats | undefined, now: Date) => {
  if (!stats) {
    return 0;
  }

  const daysSinceSeen = Math.max(1, Math.ceil((now.getTime() - stats.lastSeenAt.getTime()) / (1000 * 60 * 60 * 24)));
  const followThroughLift = stats.count > 0 ? (stats.outcomes / stats.count) * 10 : stats.outcomes * 3;
  return Math.max(0, Math.min(28, 12 + stats.count * 3 + followThroughLift - Math.min(daysSinceSeen, 45) * 0.35));
};

const completionBoostFromStats = (stats: AdviserMemoryStats | undefined) => {
  if (!stats) {
    return 0;
  }

  if (stats.count <= 0) {
    return Math.max(0, Math.min(14, stats.outcomes * 3));
  }

  return Math.max(0, Math.min(18, (stats.outcomes / stats.count) * 14 + stats.outcomes * 2));
};
const extractOutputText = (payload: Record<string, unknown>) => {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = payload.output;
  if (!Array.isArray(output)) {
    return null;
  }

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== "object") {
        continue;
      }

      const typedContent = contentItem as { type?: unknown; text?: unknown };
      if (typedContent.type === "output_text" && typeof typedContent.text === "string" && typedContent.text.trim()) {
        return typedContent.text.trim();
      }
    }
  }

  return null;
};

export async function POST(request: Request) {
  try {
    const { userId } = await getSessionContext();
    const user = await getOrCreateCurrentUser(userId);

    if (user.planTier !== "pro") {
      return NextResponse.json({ error: "Adviser chat is available on Pro only." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as RequestBody | null;
    const incomingMessages = Array.isArray(body?.messages)
      ? body?.messages
          .filter(
            (message): message is ChatMessage =>
              Boolean(message && (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
          )
          .slice(-10)
      : [];

    if (incomingMessages.length === 0) {
      return NextResponse.json({ error: "A message is required." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const selectedWorkspaceId = cookieStore.get(selectedWorkspaceKey)?.value ?? "";

    const workspace =
      (selectedWorkspaceId
        ? await prisma.workspace.findFirst({
            where: {
              id: selectedWorkspaceId,
              user: {
                clerkUserId: user.clerkUserId,
              },
            },
            select: {
              id: true,
              name: true,
              accounts: {
                select: {
                  name: true,
                  type: true,
                  currency: true,
                  balance: true,
                },
              },
            },
          })
        : null) ??
      (await prisma.workspace.findFirst({
        where: {
          user: {
            clerkUserId: user.clerkUserId,
          },
        },
        select: {
          id: true,
          name: true,
          accounts: {
            select: {
              name: true,
              type: true,
              currency: true,
              balance: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }));

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }

    await assertWorkspaceAccess(user.clerkUserId, workspace.id);

    const now = new Date();
    const nextSevenDays = new Date(now);
    nextSevenDays.setDate(nextSevenDays.getDate() + 7);
    const nextFourteenDays = new Date(now);
    nextFourteenDays.setDate(nextFourteenDays.getDate() + 14);

    const [allTransactionsQuery, recurringPatterns, financialCommitments, investmentSnapshots, splitBillWorkspaceData] =
      await Promise.all([
        prisma.transaction.findMany({
          where: {
            workspaceId: workspace.id,
            isExcluded: false,
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
          take: 1000,
        }),
        prisma.recurringPattern.findMany({
        where: { workspaceId: workspace.id },
        orderBy: [{ nextExpectedDate: "asc" }, { lastSeenDate: "desc" }],
        take: 12,
      }),
        prisma.financialCommitment.findMany({
          where: {
            workspaceId: workspace.id,
            status: "active",
          },
          orderBy: [{ nextDueDate: "asc" }, { dueDate: "asc" }, { updatedAt: "desc" }],
          take: 20,
        }),
        prisma.investmentSnapshot.findMany({
          where: {
            workspaceId: workspace.id,
          },
          orderBy: [{ snapshotDate: "desc" }, { updatedAt: "desc" }],
          take: 2,
          select: {
            snapshotDate: true,
            totalValue: true,
            currency: true,
            account: {
              select: {
                name: true,
              },
            },
          },
        }),
        loadSplitBillWorkspaceData(user.id),
      ]);

    const adviserInteractions = await prisma.auditLog.findMany({
      where: {
        workspaceId: workspace.id,
        action: {
          startsWith: "adviser.",
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        action: true,
        entityId: true,
        metadata: true,
        createdAt: true,
      },
    });

    const followThroughAuditLogs = await prisma.auditLog.findMany({
      where: {
        workspaceId: workspace.id,
        action: {
          in: ["transaction_updated", "transaction_deleted"],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        action: true,
        entityId: true,
        createdAt: true,
      },
    });

    const adviserMemoryByGroup = new Map<string, AdviserMemoryStats>();
    const adviserMemoryByItem = new Map<string, AdviserMemoryStats>();
    const adviserOutcomeByGroup = new Map<string, AdviserMemoryStats>();
    const adviserOutcomeByItem = new Map<string, AdviserMemoryStats>();

    for (const interaction of adviserInteractions) {
      const metadata = interaction.metadata as AdviserAuditMetadata | null;
      const group = metadata?.group?.trim() || "";
      const itemId = metadata?.itemId?.trim() || interaction.entityId?.trim() || "";

      if (group) {
        updateMemoryStats(adviserMemoryByGroup, group, interaction.createdAt);
      }

      if (itemId) {
        updateMemoryStats(adviserMemoryByItem, itemId, interaction.createdAt);
      }

      const followThroughWindowEnd = new Date(interaction.createdAt);
      followThroughWindowEnd.setDate(followThroughWindowEnd.getDate() + 7);
      const followedThrough = followThroughAuditLogs.some((log) => log.createdAt > interaction.createdAt && log.createdAt <= followThroughWindowEnd);

      if (followedThrough) {
        if (group) {
          recordOutcomeStats(adviserOutcomeByGroup, group, interaction.createdAt);
        }

        if (itemId) {
          recordOutcomeStats(adviserOutcomeByItem, itemId, interaction.createdAt);
        }
      }
    }

    const allTransactions = allTransactionsQuery as Array<{
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
    }>;

    const analysisAnchorDate = allTransactions[0]?.date ?? now;
    const currentWindowStart = new Date(analysisAnchorDate);
    currentWindowStart.setDate(currentWindowStart.getDate() - 30);
    const previousWindowStart = new Date(analysisAnchorDate);
    previousWindowStart.setDate(previousWindowStart.getDate() - 60);

    const currentWindowTransactions = allTransactions.filter(
      (transaction) => transaction.date > currentWindowStart && transaction.date <= analysisAnchorDate
    );
    const previousWindowTransactions = allTransactions.filter(
      (transaction) => transaction.date > previousWindowStart && transaction.date <= currentWindowStart
    );
    const activeTransactions = currentWindowTransactions.length > 0 ? currentWindowTransactions : allTransactions;
    const comparisonWindowTransactions =
      previousWindowTransactions.length > 0
        ? previousWindowTransactions
        : allTransactions.filter((transaction) => transaction.date <= currentWindowStart);

    const currentSummary = buildTransactionSummary(activeTransactions);
    const previousSummary = buildTransactionSummary(comparisonWindowTransactions);
    const allSummary = buildTransactionSummary(allTransactions);
    const monthlySeries = buildMonthlySeries(allTransactions);
    const monthlyExpenseTrend = calculateTrendSignal(monthlySeries.map((point) => point.expense));
    const monthlyIncomeTrend = calculateTrendSignal(monthlySeries.map((point) => point.income));
    const monthlyNetTrend = calculateTrendSignal(monthlySeries.map((point) => point.net));
    const trendMomentumScore = Math.max(0, Math.min(100, ((monthlyExpenseTrend.score + monthlyIncomeTrend.score + monthlyNetTrend.score) / 3) * 1));
    const weightedHistoricalBaseline = getWeightedHistoricalBaseline(monthlySeries);

    const currentSpend = currentSummary.expense;
    const previousSpend = previousSummary.expense;
    const currentNet = currentSummary.income - currentSummary.expense;
    const previousNet = previousSummary.income - previousSummary.expense;
    const currentSavingsRate = currentSummary.income > 0 ? currentNet / currentSummary.income : null;
    const previousSavingsRate = previousSummary.income > 0 ? (previousSummary.income - previousSummary.expense) / previousSummary.income : null;
    const historySpanDays = allTransactions.length > 0 ? Math.max(1, Math.ceil((analysisAnchorDate.getTime() - allTransactions[allTransactions.length - 1].date.getTime()) / (1000 * 60 * 60 * 24))) : 0;
    const historyWindowCount = Math.max(historySpanDays / 30, 1);
    const longTermAverageSpend = allSummary.expense / historyWindowCount;
    const longTermAverageIncome = allSummary.income / historyWindowCount;
    const longTermAverageNet = longTermAverageIncome - longTermAverageSpend;
    const longTermAverageSavingsRate = longTermAverageIncome > 0 ? longTermAverageNet / longTermAverageIncome : null;
    const baselineSpend = previousSpend > 0 ? average([previousSpend, weightedHistoricalBaseline.spend || previousSpend]) : weightedHistoricalBaseline.spend || longTermAverageSpend;
    const baselineIncome = previousSummary.income > 0 ? average([previousSummary.income, weightedHistoricalBaseline.income || previousSummary.income]) : weightedHistoricalBaseline.income || longTermAverageIncome;
    const baselineSavingsRate =
      previousSummary.income > 0
        ? (previousSummary.income - previousSummary.expense) / previousSummary.income
        : weightedHistoricalBaseline.income > 0
          ? weightedHistoricalBaseline.net / weightedHistoricalBaseline.income
          : longTermAverageSavingsRate;
    const spendDelta = baselineSpend > 0 ? ((currentSpend - baselineSpend) / baselineSpend) * 100 : null;
    const incomeDelta = baselineIncome > 0 ? ((currentSummary.income - baselineIncome) / baselineIncome) * 100 : null;
    const currencyCandidates = new Set(workspace.accounts.map((account) => formatCurrencyCode(account.currency)).filter((currency) => currency.length > 0));
    const displayCurrency = currencyCandidates.size === 1 ? Array.from(currencyCandidates)[0] : "MIXED";
    const goalValue = user.primaryGoal?.trim() ?? null;
    const goalTargetAmount = user.goalTargetAmount ? Number(user.goalTargetAmount) : null;
    const goalPlan = normalizeGoalPlan(user.goalPlan, goalValue as GoalKey | null, goalTargetAmount);
    const goalProgress = getGoalProgressSnapshot(
      {
        goalKey: goalValue as GoalKey | null,
        targetAmount: goalTargetAmount,
        goalPlan,
        currentNet,
        currentSpend,
        monthlyIncome: currentSummary.income > 0 ? currentSummary.income : null,
        currentSavingsRate,
        previousSavingsRate,
        spendDelta,
        recurringShare: 0,
      },
      displayCurrency
    );

    const topCategories = Array.from(currentSummary.expenseCategories.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3);
    const topCategoryName = topCategories[0]?.[0] ?? null;
    const topCategoryAmount = topCategories[0]?.[1] ?? 0;
    const topCategoryShare = currentSpend > 0 ? topCategoryAmount / currentSpend : 0;

    const recurringDueSoon = recurringPatterns
      .filter((pattern) => pattern.nextExpectedDate && pattern.nextExpectedDate <= nextFourteenDays)
      .slice(0, 3)
      .map((pattern) => ({
        label: pattern.merchantClean ?? pattern.merchantRaw,
        due: pattern.nextExpectedDate ? toMonthLabel(pattern.nextExpectedDate) : null,
      }));

    const commitmentsDueSoon = financialCommitments
      .filter((commitment) => commitment.nextDueDate && commitment.nextDueDate <= nextSevenDays)
      .slice(0, 3)
      .map((commitment) => ({
        title: commitment.title,
        due: commitment.nextDueDate ? toMonthLabel(commitment.nextDueDate) : null,
      }));

    const openSplitBills = splitBillWorkspaceData.bills
      .map((bill) => ({
        title: bill.title,
        outstanding: bill.settlement.transfers.reduce((sum, transfer) => sum + Number(transfer.amount), 0),
      }))
      .filter((bill) => bill.outstanding > 0)
      .sort((left, right) => right.outstanding - left.outstanding)
      .slice(0, 3);

    const latestInvestmentSnapshot = investmentSnapshots[0] ?? null;
    const previousInvestmentSnapshot = investmentSnapshots[1] ?? null;
    const investmentDelta =
      latestInvestmentSnapshot &&
      previousInvestmentSnapshot &&
      latestInvestmentSnapshot.currency === previousInvestmentSnapshot.currency
        ? Number(latestInvestmentSnapshot.totalValue ?? 0) - Number(previousInvestmentSnapshot.totalValue ?? 0)
        : null;

    const liquidBalance = workspace.accounts
      .filter((account) => ["bank", "wallet", "cash"].includes(account.type))
      .reduce((sum, account) => sum + Number(account.balance ?? 0), 0);

    const themeMemoryScore = (groups: string[]) => {
      const memoryScores = groups
        .map((group) => adviserMemoryByGroup.get(group))
        .filter((value): value is AdviserMemoryStats => Boolean(value))
        .map((stats) => memoryBoostFromStats(stats, now));
      const outcomeScores = groups
        .map((group) => adviserOutcomeByGroup.get(group))
        .filter((value): value is AdviserMemoryStats => Boolean(value))
        .map((stats) => memoryBoostFromStats(stats, now) * 0.85 + completionBoostFromStats(stats));

      return Math.max(0, Math.min(100, average([...memoryScores, ...outcomeScores, groups.length > 0 ? 55 : 30])));
    };

    const themeAffinity: Record<AdviserSignalTheme, number> = {
      cashflow: Math.max(
        0,
        Math.min(
          100,
          average([
            themeMemoryScore(["cashflow", "recurring", "split-bills"]),
            goalValue && ["save_more", "pay_down_debt", "build_emergency_fund"].includes(goalValue) ? 85 : 45,
            currentSavingsRate !== null && currentSavingsRate < 0 ? 90 : 45,
          ])
        )
      ),
      behavior: Math.max(
        0,
        Math.min(
          100,
          average([
            themeMemoryScore(["transactions", "behavior-pattern", "category-mix"]),
            goalValue === "track_spending" ? 80 : 45,
            trendMomentumScore,
          ])
        )
      ),
      goals: Math.max(0, Math.min(100, average([themeMemoryScore(["goals"]), goalValue ? 95 : 30, currentSavingsRate === null ? 35 : currentSavingsRate < 0 ? 85 : 55]))),
      investments: Math.max(
        0,
        Math.min(
          100,
          average([themeMemoryScore(["investments"]), goalValue === "invest_better" ? 90 : 45, latestInvestmentSnapshot ? 70 : 35])
        )
      ),
      cleanup: Math.max(
        0,
        Math.min(100, average([themeMemoryScore(["cleanup"]), uncategorizedTransactions.length > 0 ? 92 : 35, currentTransactionConfidence]))
      ),
    };

    const explainabilityBundle = [
      {
        label: "Cash flow pressure",
        score: cashflowPressureScore,
        reason: `Liquid balance ${formatCurrency(liquidBalance, displayCurrency)} vs spend ${formatCurrency(currentSpend, displayCurrency)}; recurring due soon ${recurringDueSoon.length}; split bills open ${openSplitBillCount}.`,
      },
      {
        label: "Behavior pattern",
        score: behaviorPatternScore,
        reason: `Top category ${topCategoryName ?? "none"}; weekend share ${formatPercent(weekendExpenseShare * 100)}; uncategorized rows ${uncategorizedTransactions.length}.`,
      },
      {
        label: "Goal pressure",
        score: goalPressureScore,
        reason: goalLabel
          ? `${goalLabel} status ${goalProgress.bandLabel}; current savings rate ${currentSavingsRate === null ? "N/A" : formatPercent(currentSavingsRate * 100)}.`
          : "No active goal or goal signal is weak.",
      },
      {
        label: "Investment signal",
        score: investmentSignalScore,
        reason: latestInvestmentSnapshot
          ? `Latest snapshot ${formatCurrency(Number(latestInvestmentSnapshot.totalValue ?? 0), latestInvestmentSnapshot.currency)}${investmentDelta === null ? "" : `, change ${formatSignedCurrency(investmentDelta, latestInvestmentSnapshot.currency)}`}.`
          : "No investment snapshot available.",
      },
      {
        label: "Cleanup pressure",
        score: cleanupPressureScore,
        reason: `${uncategorizedTransactions.length} uncategorized transactions; history depth ${historySpanDays} days.`,
      },
    ]
      .sort((left, right) => right.score - left.score)
      .slice(0, 5)
      .map((item, index) => `${index + 1}. ${item.label} (${Math.round(item.score)}): ${item.reason}`);

    const topThemeLine = signalThemes
      .slice(0, 2)
      .map((theme) => `${theme.key}:${Math.round(theme.score)}${theme.key === dominantTheme?.key ? " (primary)" : ""}`)
      .join(" • ");
    const totalAdviserClicks = Array.from(adviserMemoryByGroup.values()).reduce((sum, stats) => sum + stats.count, 0);
    const totalAdviserOutcomes = Array.from(adviserOutcomeByGroup.values()).reduce((sum, stats) => sum + stats.outcomes, 0);
    const adviserFollowThroughRate = totalAdviserClicks > 0 ? (totalAdviserOutcomes / totalAdviserClicks) * 100 : 0;

    const currentWindowLabel = currentWindowTransactions.length > 0 ? "Current 30 days" : "Latest available window";
    const previousWindowLabel = previousWindowTransactions.length > 0 ? "Previous 30 days" : "Earlier available window";
    const longTermWindowLabel = historySpanDays > 0 ? `All available history (${Math.ceil(historySpanDays / 30)} month${Math.ceil(historySpanDays / 30) === 1 ? "" : "s"})` : "All available history";

    const summaryLines = [
      `Workspace: ${workspace.name}`,
      `${currentWindowLabel}: income ${formatCurrency(currentSummary.income)}, spend ${formatCurrency(currentSpend)}, net ${formatSignedCurrency(currentNet)}`,
      `${previousWindowLabel}: income ${formatCurrency(previousSummary.income)}, spend ${formatCurrency(previousSpend)}, net ${formatSignedCurrency(previousNet)}`,
      `${longTermWindowLabel}: avg income ${formatCurrency(longTermAverageIncome)}, avg spend ${formatCurrency(longTermAverageSpend)}, avg net ${formatSignedCurrency(longTermAverageNet)}`,
      `Baseline model: spend ${formatCurrency(weightedHistoricalBaseline.spend)}, income ${formatCurrency(weightedHistoricalBaseline.income)}, net ${formatSignedCurrency(weightedHistoricalBaseline.net)}`,
      `Savings rate: ${currentSavingsRate === null ? "N/A" : formatPercent(currentSavingsRate * 100)}${baselineSavingsRate === null ? "" : `; baseline ${formatPercent(baselineSavingsRate * 100)}`}`,
      `Trend signals: spend ${monthlyExpenseTrend.direction > 0 ? "rising" : monthlyExpenseTrend.direction < 0 ? "easing" : "flat"} (${Math.round(monthlyExpenseTrend.score)}), income ${monthlyIncomeTrend.direction > 0 ? "rising" : monthlyIncomeTrend.direction < 0 ? "easing" : "flat"} (${Math.round(monthlyIncomeTrend.score)}), net ${monthlyNetTrend.direction > 0 ? "rising" : monthlyNetTrend.direction < 0 ? "easing" : "flat"} (${Math.round(monthlyNetTrend.score)})`,
      `Adviser themes: ${topThemeLine || "none"}`,
      `Adviser memory: ${adviserInteractions.length} interactions, ${followThroughAuditLogs.length} possible follow-through actions, follow-through rate ${formatPercent(adviserFollowThroughRate)}, cleanup affinity ${Math.round(themeAffinity.cleanup)}, cashflow affinity ${Math.round(themeAffinity.cashflow)}`,
      `Ranked evidence: ${explainabilityBundle.join(" | ")}`,
      `Top category: ${topCategoryName ?? "none"}`,
      `Recurring due soon: ${recurringDueSoon.map((item) => `${item.label}${item.due ? ` (${item.due})` : ""}`).join("; ") || "none"}`,
      `Commitments due soon: ${commitmentsDueSoon.map((item) => `${item.title}${item.due ? ` (${item.due})` : ""}`).join("; ") || "none"}`,
      `Split bills open: ${openSplitBills.map((item) => `${item.title} (${formatCurrency(item.outstanding)})`).join("; ") || "none"}`,
      `Latest investment snapshot: ${latestInvestmentSnapshot ? `${formatCurrency(Number(latestInvestmentSnapshot.totalValue ?? 0), latestInvestmentSnapshot.currency)}${investmentDelta === null ? "" : `, change ${formatSignedCurrency(investmentDelta, latestInvestmentSnapshot.currency)}`}` : "none"}`,
      `Liquid balance: ${formatCurrency(liquidBalance, displayCurrency)}`,
      `Goal: ${goalValue ?? "none"} (${goalProgress.bandLabel})`,
    ].join("\n");

    const systemPrompt = [
      "You are Clover Adviser, a calm, specific, and trustworthy financial guide inside a personal finance app.",
      "Use the workspace context to answer the user's question clearly and directly.",
      "Prefer concrete data over generic advice.",
      "If you can, mention the exact source of the signal, the relevant period, and one practical next step.",
      "Do not pretend to be a financial advisor. Keep guidance educational and contextual.",
      "If the user's question asks for investment advice, stay cautious and avoid personalized investment recommendations.",
      "If the data is insufficient, say what is missing and suggest where to check in Clover.",
      "",
      "Workspace context:",
      summaryLines,
    ].join("\n");

    const env = getEnv();
    if (!env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OpenAI is not configured for Adviser chat." }, { status: 503 });
    }

    const model = env.OPENAI_ADVISER_MODEL?.trim() || "gpt-4.1";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_output_tokens: 900,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemPrompt }],
          },
          ...incomingMessages.map((message) => ({
            role: message.role,
            content: [{ type: "input_text", text: message.content }],
          })),
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return NextResponse.json(
        {
          error: errorText || "Unable to generate an Adviser response.",
        },
        { status: 502 }
      );
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const reply = extractOutputText(payload) || "I could not generate a response right now.";

    return NextResponse.json({
      reply,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate an Adviser response.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
