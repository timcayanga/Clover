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
import { getEffectiveTransactionCategoryName } from "@/lib/transaction-display";
import { coerceTransactionTypeFromCategoryName } from "@/lib/transaction-directions";

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
type AdviserThemeScore = {
  key: AdviserSignalTheme;
  score: number;
};

type AdviserPreferenceProfile = Record<AdviserSignalTheme, number>;

type AdviserForecastSignal = {
  title: string;
  summary: string;
  evidence: string;
  score: number;
};

type AdviserAnomalySignal = {
  title: string;
  summary: string;
  evidence: string;
  score: number;
};

type AdviserPersona = {
  key: AdviserSignalTheme;
  label: string;
  summary: string;
  strength: number;
};

type AdviserThresholdProfile = {
  cashBuffer: number;
  spendSpikePercent: number;
  incomeDropPercent: number;
  concentrationShare: number;
  recurringPressure: number;
  splitPressure: number;
  investmentSwingPercent: number;
  goalDriftPercent: number;
};

const monthFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  year: "numeric",
});

const formatCurrency = (value: number, currency?: string | null) => formatCurrencyAmount(value, currency ?? "MIXED");
const formatSignedCurrency = (value: number, currency?: string | null) =>
  `${value < 0 ? "-" : ""}${formatCurrencyAmount(Math.abs(value), currency ?? "MIXED")}`;
const formatPercent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(0)}%`;
const toMonthLabel = (date: Date) => monthFormatter.format(date);
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const average = (values: number[]) => (values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
const buildTransactionSummary = (
  transactions: Array<{
    amount: unknown;
    type: "income" | "expense" | "transfer";
    merchantRaw: string;
    merchantClean: string | null;
    description?: string | null;
    rawPayload?: unknown;
    importFileId?: string | null;
    account?: {
      institution?: string | null;
    } | null;
    category: {
      name: string;
    } | null;
  }>
) =>
  transactions.reduce(
    (accumulator, transaction) => {
      const amount = Number(transaction.amount);
      const categoryName =
        getEffectiveTransactionCategoryName({
          categoryName: transaction.category?.name ?? null,
          rawPayload: transaction.rawPayload as never,
          merchantRaw: transaction.merchantRaw,
          merchantClean: transaction.merchantClean,
          description: transaction.description ?? null,
          institution: transaction.account?.institution ?? null,
          source: transaction.importFileId ? "upload" : "manual",
          type: transaction.type,
        }) ?? "Uncategorized";
      const transactionType = coerceTransactionTypeFromCategoryName(categoryName, transaction.type, transaction.amount);
      if (transactionType === "income") {
        accumulator.income += amount;
      } else if (transactionType === "expense") {
        accumulator.expense += amount;
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
const themeFromGroup = (group: string): AdviserSignalTheme | null => {
  if (group === "cashflow" || group === "recurring" || group === "split-bills" || group === "spend-change" || group === "anomaly") {
    return "cashflow";
  }

  if (group === "transactions" || group === "behavior-pattern" || group === "category-mix" || group === "patterns") {
    return "behavior";
  }

  if (group === "goals") {
    return "goals";
  }

  if (group === "investments") {
    return "investments";
  }

  if (group === "cleanup" || group === "spend-control" || group === "category-pattern") {
    return "cleanup";
  }

  return null;
};

const buildPreferenceProfile = (
  interactions: Array<{
    createdAt: Date;
    metadata: AdviserAuditMetadata | null;
  }>,
  adviserOutcomeByGroup: Map<string, AdviserMemoryStats>,
  adviserOutcomeByItem: Map<string, AdviserMemoryStats>,
  now: Date
): AdviserPreferenceProfile => {
  const scores: AdviserPreferenceProfile = {
    cashflow: 22,
    behavior: 22,
    goals: 22,
    investments: 22,
    cleanup: 22,
  };

  for (const interaction of interactions) {
    const group = interaction.metadata?.group?.trim() || "";
    const theme = themeFromGroup(group);
    if (!theme) {
      continue;
    }

    const itemId = interaction.metadata?.itemId?.trim() || "";
    const daysSince = Math.max(1, Math.ceil((now.getTime() - interaction.createdAt.getTime()) / (1000 * 60 * 60 * 24)));
    const recencyWeight = Math.max(0.25, Math.min(1, 1 - daysSince / 180));
    const groupOutcome = adviserOutcomeByGroup.get(group);
    const itemOutcome = itemId ? adviserOutcomeByItem.get(itemId) : undefined;
    const completionLift = completionBoostFromStats(groupOutcome) + completionBoostFromStats(itemOutcome);
    const memoryLift = memoryBoostFromStats(groupOutcome, now) + memoryBoostFromStats(itemOutcome, now);

    scores[theme] += recencyWeight * (1 + (completionLift + memoryLift) / 40);
  }

  const maxScore = Math.max(...Object.values(scores), 1);
  return Object.fromEntries(
    Object.entries(scores).map(([theme, score]) => [theme, Math.max(0, Math.min(100, (score / maxScore) * 100))])
  ) as AdviserPreferenceProfile;
};

const buildForecastSignal = (
  currentNet: number,
  currentSavingsRate: number | null,
  liquidBalance: number,
  recurringAmountPressure: number,
  commitmentAmountPressure: number,
  splitBillAmount: number,
  baselineSpend: number,
  monthlyExpenseTrend: { direction: number; score: number },
  spendDelta: number | null
): AdviserForecastSignal | null => {
  const knownPressure = recurringAmountPressure + commitmentAmountPressure + splitBillAmount;
  const projectedNet = currentNet - knownPressure;
  const projectedRisk = Math.max(
    0,
    Math.min(
      100,
      average([
        currentSavingsRate !== null && currentSavingsRate < 0 ? 92 : 36,
        knownPressure > 0 ? Math.max(18, Math.min(100, (knownPressure / Math.max(liquidBalance + knownPressure, 1)) * 100 + 20)) : 18,
        liquidBalance < baselineSpend * 0.4 ? 88 : liquidBalance < baselineSpend * 0.8 ? 62 : 25,
        monthlyExpenseTrend.direction > 0 ? 60 + monthlyExpenseTrend.score * 0.3 : 28,
        spendDelta !== null && spendDelta > 0 ? Math.max(28, Math.min(100, 50 + spendDelta * 1.1)) : 28,
      ])
    )
  );

  if (projectedRisk < 40 && knownPressure <= 0 && (spendDelta === null || spendDelta <= 0)) {
    return null;
  }

  const summary =
    knownPressure > 0
      ? `Known obligations add ${formatCurrency(knownPressure)} of pressure against your current balance and spending pattern.`
      : `Your current spend trend suggests ${formatCurrency(Math.abs(projectedNet))} of net pressure if the pattern continues.`;
  const evidence = `Projected net after known obligations: ${formatSignedCurrency(projectedNet)} · liquid balance ${formatCurrency(liquidBalance)} · risk score ${Math.round(projectedRisk)}/100`;

  return {
    title: projectedRisk >= 70 ? "Cash flow forecast" : "Upcoming pressure",
    summary,
    evidence,
    score: projectedRisk,
  };
};

const buildAnomalySignal = (
  currentSpend: number,
  currentIncome: number,
  baselineSpend: number,
  baselineIncome: number,
  spendDelta: number | null,
  incomeDelta: number | null,
  topCategoryName: string | null,
  topCategoryShare: number,
  currentPatternConfidence: number,
  currentTransactionConfidence: number,
  thresholdProfile: AdviserThresholdProfile
): AdviserAnomalySignal | null => {
  const spendSpikeScore = spendDelta !== null && spendDelta > thresholdProfile.spendSpikePercent ? Math.max(0, Math.min(100, 55 + spendDelta * 1.7)) : 0;
  const incomeDropScore = incomeDelta !== null && incomeDelta < -thresholdProfile.incomeDropPercent ? Math.max(0, Math.min(100, 55 + Math.abs(incomeDelta) * 1.5)) : 0;
  const concentrationScore = topCategoryShare > thresholdProfile.concentrationShare ? Math.max(0, Math.min(100, 50 + topCategoryShare * 90)) : 0;
  const anomalyScore = Math.max(spendSpikeScore, incomeDropScore, concentrationScore);

  if (anomalyScore < 45) {
    return null;
  }

  if (spendSpikeScore >= incomeDropScore && spendSpikeScore >= concentrationScore) {
    return {
      title: "Unusual spend spike",
      summary: "This month’s spending is moving faster than your own baseline.",
      evidence: `${formatCurrency(currentSpend)} this period vs ${formatCurrency(baselineSpend)} baseline`,
      score: Math.max(0, Math.min(100, average([spendSpikeScore, currentPatternConfidence, currentTransactionConfidence]))),
    };
  }

  if (incomeDropScore >= concentrationScore) {
    return {
      title: "Income dip detected",
      summary: "Your current income is running below the baseline we can see in your history.",
      evidence: `${formatCurrency(currentIncome)} this period vs ${formatCurrency(baselineIncome)} baseline`,
      score: Math.max(0, Math.min(100, average([incomeDropScore, currentTransactionConfidence, currentPatternConfidence]))),
    };
  }

  return {
    title: "Category concentration",
    summary: "A small number of categories are dominating the expense mix right now.",
    evidence: topCategoryName
      ? `${topCategoryName} makes up ${formatPercent(topCategoryShare * 100)} of current expenses.`
      : `Top category share is ${formatPercent(topCategoryShare * 100)}.`,
    score: Math.max(0, Math.min(100, average([concentrationScore, currentPatternConfidence, currentTransactionConfidence]))),
  };
};

const buildThresholdProfile = (params: {
  baselineSpend: number;
  baselineIncome: number;
  currentSpend: number;
  currentIncome: number;
  currentSavingsRate: number | null;
  recurringAmountPressure: number;
  commitmentAmountPressure: number;
  splitBillSettlementPressure: number;
  topCategoryShare: number;
  weekendExpenseShare: number;
  historyDepthScore: number;
  latestInvestmentSnapshot: { totalValue?: unknown } | null;
  investmentDelta: number | null;
}) => {
  const recurringBase = params.recurringAmountPressure + params.commitmentAmountPressure;
  const cashBuffer = average([
    params.baselineSpend * 0.75,
    params.currentSpend * 0.5,
    recurringBase + params.splitBillSettlementPressure * 0.75,
    params.currentIncome > 0 ? params.currentIncome * 0.3 : params.baselineIncome * 0.3,
  ]);
  const spendSpikePercent = clamp(9 + (params.historyDepthScore < 50 ? 4 : 1) + (params.weekendExpenseShare > 0.3 ? 3 : 0));
  const incomeDropPercent = clamp(8 + (params.historyDepthScore < 40 ? 3 : 0), 6, 20);
  const concentrationShare = clamp(params.topCategoryShare > 0.4 ? 0.42 : 0.35, 0.28, 0.55);
  const investmentSwingPercent = clamp(params.latestInvestmentSnapshot ? 8 + (params.investmentDelta !== null && Math.abs(params.investmentDelta) > 0 ? 2 : 0) : 18, 6, 20);
  const goalDriftPercent = clamp(params.currentSavingsRate !== null && params.currentSavingsRate < 0 ? 6 : 12, 6, 18);

  return {
    cashBuffer,
    spendSpikePercent,
    incomeDropPercent,
    concentrationShare,
    recurringPressure: recurringBase,
    splitPressure: params.splitBillSettlementPressure,
    investmentSwingPercent,
    goalDriftPercent,
  } satisfies AdviserThresholdProfile;
};

const buildCategoryForecastSignals = (params: {
  currentNet: number;
  currentSavingsRate: number | null;
  liquidBalance: number;
  recurringAmountPressure: number;
  commitmentAmountPressure: number;
  splitBillSettlementPressure: number;
  baselineSpend: number;
  monthlyExpenseTrend: { direction: number; score: number };
  monthlyIncomeTrend: { direction: number; score: number };
  monthlyNetTrend: { direction: number; score: number };
  spendDelta: number | null;
  incomeDelta: number | null;
  latestInvestmentSnapshot: { currency?: string | null; totalValue?: unknown; gainLossPercent?: unknown } | null;
  investmentDelta: number | null;
  goalProgressBand: string;
  thresholdProfile: AdviserThresholdProfile;
}) => {
  const knownPressure = params.recurringAmountPressure + params.commitmentAmountPressure + params.splitBillSettlementPressure;
  const cashflowForecast = buildForecastSignal(
    params.currentNet,
    params.currentSavingsRate,
    params.liquidBalance,
    params.recurringAmountPressure,
    params.commitmentAmountPressure,
    params.splitBillSettlementPressure,
    params.baselineSpend,
    params.monthlyExpenseTrend,
    params.spendDelta
  );
  const recurringRisk = knownPressure > params.thresholdProfile.recurringPressure * 0.9 || params.monthlyExpenseTrend.direction > 0;
  const splitRisk = params.splitBillSettlementPressure > params.thresholdProfile.splitPressure * 0.8;
  const goalRisk = params.goalProgressBand !== "On track" || (params.currentSavingsRate !== null && params.currentSavingsRate < 0);
  const investmentRisk =
    params.latestInvestmentSnapshot !== null &&
    (params.investmentDelta !== null ? Math.abs(params.investmentDelta) : 0) > 0 &&
    params.thresholdProfile.investmentSwingPercent <= 20;

  const signals: Array<AdviserForecastSignal | null> = [
    cashflowForecast
      ? {
          ...cashflowForecast,
          evidence: `${cashflowForecast.evidence} · buffer threshold ${formatCurrency(params.thresholdProfile.cashBuffer)}`,
        }
      : null,
    recurringRisk
      ? {
          title: "Recurring pressure",
          summary: "Known recurring obligations are starting to crowd the available room in the month.",
          evidence: `Recurring + commitment pressure ${formatCurrency(knownPressure)} vs threshold ${formatCurrency(params.thresholdProfile.recurringPressure)}`,
          score: clamp(
            average([
              55 + Math.max(0, (knownPressure / Math.max(params.thresholdProfile.recurringPressure || 1, 1)) * 30),
              params.monthlyExpenseTrend.direction > 0 ? 65 + params.monthlyExpenseTrend.score * 0.2 : 35,
            ])
          ),
        }
      : null,
    splitRisk
      ? {
          title: "Split bill runway",
          summary: "Open split bill balances are high enough to deserve a closer look.",
          evidence: `Open split bill pressure ${formatCurrency(params.splitBillSettlementPressure)} vs threshold ${formatCurrency(params.thresholdProfile.splitPressure)}`,
          score: clamp(
            average([
              50 + Math.max(0, (params.splitBillSettlementPressure / Math.max(params.thresholdProfile.splitPressure || 1, 1)) * 40),
              params.monthlyNetTrend.score * 0.2,
            ])
          ),
        }
      : null,
    goalRisk
      ? {
          title: "Goal drift",
          summary: "Current momentum suggests the target may need a check-in soon.",
          evidence: `Goal band ${params.goalProgressBand}; drift threshold ${params.thresholdProfile.goalDriftPercent}%`,
          score: clamp(
            average([
              params.goalProgressBand === "On track" ? 45 : 82,
              params.currentSavingsRate !== null && params.currentSavingsRate < 0 ? 90 : 50,
              params.spendDelta !== null && params.spendDelta > params.thresholdProfile.goalDriftPercent ? 75 : 40,
            ])
          ),
        }
      : null,
    investmentRisk
      ? {
          title: "Investment movement",
          summary: "The latest snapshot suggests a change worth watching.",
          evidence:
            params.latestInvestmentSnapshot && params.latestInvestmentSnapshot.totalValue !== undefined
              ? `Latest snapshot available with threshold ${params.thresholdProfile.investmentSwingPercent}%`
              : "Investment data exists, but the threshold is still conservative.",
          score: clamp(
            average([
              params.investmentDelta === null ? 45 : 55 + Math.min(35, Math.abs(params.investmentDelta) / Math.max(1, params.baselineSpend) * 10),
              params.monthlyIncomeTrend.score * 0.1,
            ])
          ),
        }
      : null,
  ];

  return signals.filter((signal): signal is AdviserForecastSignal => signal !== null).sort((left, right) => right.score - left.score);
};

const buildFinancialPersona = (
  dominantTheme: { key: AdviserSignalTheme; score: number } | undefined,
  secondaryTheme: { key: AdviserSignalTheme; score: number } | undefined,
  preferenceProfile: AdviserPreferenceProfile,
  forecastSignal: AdviserForecastSignal | null,
  anomalySignal: AdviserAnomalySignal | null,
  goalLabel: string | null,
  uncategorizedCount: number
): AdviserPersona => {
  const candidates: Array<AdviserPersona & { rank: number }> = [
    {
      key: "cashflow",
      label: "Cash Flow Guardian",
      summary: forecastSignal
        ? "Keeps an eye on upcoming pressure, recurring obligations, and balance safety."
        : "Prioritizes balance safety, recurring pressure, and liquidity.",
      strength: preferenceProfile.cashflow,
      rank: average([preferenceProfile.cashflow, dominantTheme?.key === "cashflow" ? 90 : 35, forecastSignal ? forecastSignal.score : 35]),
    },
    {
      key: "goals",
      label: "Goal Builder",
      summary: goalLabel
        ? "Focuses on staying on track with a clear target and steady progress."
        : "Keeps long-term targets visible and encourages steady momentum.",
      strength: preferenceProfile.goals,
      rank: average([preferenceProfile.goals, dominantTheme?.key === "goals" ? 90 : 35, goalLabel ? 85 : 30]),
    },
    {
      key: "cleanup",
      label: "Cleanup Organizer",
      summary: uncategorizedCount > 0
        ? "Likes to tidy transaction data so the rest of the app stays trustworthy."
        : "Keeps the books clean and the signal quality high.",
      strength: preferenceProfile.cleanup,
      rank: average([preferenceProfile.cleanup, dominantTheme?.key === "cleanup" ? 90 : 35, uncategorizedCount > 0 ? 78 : 28]),
    },
    {
      key: "investments",
      label: "Portfolio Watcher",
      summary: anomalySignal
        ? "Pays attention to investment movement and account-level shifts."
        : "Keeps an eye on portfolio movement and longer-term value changes.",
      strength: preferenceProfile.investments,
      rank: average([preferenceProfile.investments, dominantTheme?.key === "investments" ? 90 : 35, anomalySignal ? anomalySignal.score : 35]),
    },
    {
      key: "behavior",
      label: "Habit Coach",
      summary: secondaryTheme?.key === "behavior"
        ? "Tracks spending patterns and nudges behavior change."
        : "Looks for repeated spending patterns and habit loops.",
      strength: preferenceProfile.behavior,
      rank: average([preferenceProfile.behavior, dominantTheme?.key === "behavior" ? 90 : 35, secondaryTheme?.key === "behavior" ? 70 : 30]),
    },
  ];

  const persona = candidates.sort((left, right) => right.rank - left.rank)[0] ?? candidates[0];
  return {
    key: persona.key,
    label: persona.label,
    summary: persona.summary,
    strength: clamp(persona.strength),
  };
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

    const [allTransactionsQuery, recurringPatterns, financialCommitments, goalHistoryRows, investmentSnapshots, splitBillWorkspaceData] =
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
            description: true,
            rawPayload: true,
            importFileId: true,
            account: {
              select: {
                name: true,
                institution: true,
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
        prisma.goalSetting.findMany({
          where: {
            userId: user.id,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 8,
          select: {
            primaryGoal: true,
            targetAmount: true,
            source: true,
            goalPlan: true,
            createdAt: true,
          },
        }),
        prisma.investmentSnapshot.findMany({
          where: {
            workspaceId: workspace.id,
          },
          orderBy: [{ snapshotDate: "desc" }, { updatedAt: "desc" }],
          take: 2,
          select: {
            snapshotDate: true,
            updatedAt: true,
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
          in: ["adviser.card_opened", "adviser.prompt_clicked"],
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

    const adviserCompletionLogs = await prisma.auditLog.findMany({
      where: {
        workspaceId: workspace.id,
        action: {
          in: ["adviser.action_completed"],
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
    }

    const allTransactions = allTransactionsQuery as Array<{
      date: Date;
      amount: unknown;
      type: "income" | "expense" | "transfer";
      merchantRaw: string;
      merchantClean: string | null;
      description: string | null;
      rawPayload: unknown;
      importFileId: string | null;
      account: {
        name: string;
        institution: string | null;
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
    const goalLabel = goalValue ? goalValue.replace(/_/g, " ") : null;

    const topCategories = Array.from(currentSummary.expenseCategories.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3);
    const topCategoryName = topCategories[0]?.[0] ?? null;
    const topCategoryAmount = topCategories[0]?.[1] ?? 0;
    const topCategoryShare = currentSpend > 0 ? topCategoryAmount / currentSpend : 0;
    const uncategorizedTransactions = activeTransactions.filter(
      (transaction) => transaction.type !== "transfer" && !transaction.category?.name
    );
    const weekendExpenseTotal = activeTransactions.reduce((sum, transaction) => {
      if (transaction.type !== "expense") {
        return sum;
      }

      const day = transaction.date.getDay();
      return day === 0 || day === 6 ? sum + Math.abs(Number(transaction.amount)) : sum;
    }, 0);
    const weekendExpenseShare = currentSpend > 0 ? weekendExpenseTotal / currentSpend : 0;
    const accountCoverageScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(average([workspace.accounts.length >= 5 ? 90 : (workspace.accounts.length / 5) * 100, workspace.accounts.length > 0 ? 75 : 35]))
      )
    );
    const historyDepthScore = Math.max(
      20,
      Math.min(
        100,
        Math.round(
          average([
            allTransactions.length >= 120 ? 100 : (allTransactions.length / 120) * 100,
            historySpanDays >= 365 ? 100 : (historySpanDays / 365) * 100,
          ])
        )
      )
    );
    const currentTransactionConfidence = Math.max(
      25,
      Math.min(100, Math.round(average([currentWindowTransactions.length >= 12 ? 85 : 45, historyDepthScore, activeTransactions.length >= 8 ? 80 : 40, accountCoverageScore])))
    );
    const currentPatternConfidence = Math.max(
      25,
      Math.min(100, Math.round(average([monthlySeries.length >= 3 ? 88 : 42, trendMomentumScore, historyDepthScore, accountCoverageScore * 0.7])))
    );

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
    const openSplitBillAmount = openSplitBills.reduce((sum, bill) => sum + Number(bill.outstanding), 0);

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
    const totalAccountBalance = workspace.accounts.reduce((sum, account) => sum + Number(account.balance ?? 0), 0);
    const spendableAccountBalance = workspace.accounts
      .filter((account) => ["bank", "wallet", "cash"].includes(account.type))
      .reduce((sum, account) => sum + Number(account.balance ?? 0), 0);
    const liabilityAccountBalance = workspace.accounts
      .filter((account) => ["credit_card", "loan", "mortgage", "line_of_credit", "payable", "bnpl"].includes(account.type))
      .reduce((sum, account) => sum + Math.abs(Number(account.balance ?? 0)), 0);
    const largestAccountBalance = [...workspace.accounts].sort((left, right) => Number(right.balance ?? 0) - Number(left.balance ?? 0))[0] ?? null;
    const largestAccountShare = totalAccountBalance > 0 && largestAccountBalance ? Math.abs(Number(largestAccountBalance.balance ?? 0)) / totalAccountBalance : 0;
    const accountPressureEstimate = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          average([
            liabilityAccountBalance > 0 ? Math.min(100, (liabilityAccountBalance / Math.max(totalAccountBalance || 1, 1)) * 100) : 18,
            spendableAccountBalance < totalAccountBalance * 0.3 ? 82 : 28,
            largestAccountShare > 0.55 ? Math.min(100, 45 + largestAccountShare * 55) : 30,
          ])
        )
      )
    );
    const hasTransactionFlow = currentSummary.income > 0 || currentSummary.expense > 0;
    const groundingMode = hasTransactionFlow ? "transaction-backed" : workspace.accounts.length > 0 ? "account-backed" : "history-backed";

    const recurringAmountPressure = recurringDueSoon.reduce((sum, pattern) => sum + Number(pattern.amount ?? 0), 0);
    const commitmentAmountPressure = commitmentsDueSoon.reduce((sum, commitment) => sum + Number(commitment.amount ?? 0), 0);
    const splitBillSettlementPressure = openSplitBillAmount;
    const thresholdProfile = buildThresholdProfile({
      baselineSpend,
      baselineIncome,
      currentSpend,
      currentIncome: currentSummary.income,
      currentSavingsRate,
      recurringAmountPressure,
      commitmentAmountPressure,
      splitBillSettlementPressure,
      topCategoryShare,
      weekendExpenseShare,
      historyDepthScore,
      latestInvestmentSnapshot,
      investmentDelta,
    });
    const categoryForecastSignals = buildCategoryForecastSignals({
      currentNet,
      currentSavingsRate,
      liquidBalance,
      recurringAmountPressure,
      commitmentAmountPressure,
      splitBillSettlementPressure,
      baselineSpend,
      baselineIncome,
      monthlyExpenseTrend,
      monthlyIncomeTrend,
      monthlyNetTrend,
      spendDelta,
      incomeDelta,
      latestInvestmentSnapshot,
      investmentDelta,
      goalProgressBand: goalProgress.bandLabel,
      thresholdProfile,
    });
    const forecastSignal = categoryForecastSignals[0] ?? buildForecastSignal(
      currentNet,
      currentSavingsRate,
      liquidBalance,
      recurringAmountPressure,
      commitmentAmountPressure,
      splitBillSettlementPressure,
      baselineSpend,
      monthlyExpenseTrend,
      spendDelta
    );
    const anomalySignal = buildAnomalySignal(
      currentSpend,
      currentSummary.income,
      baselineSpend,
      baselineIncome,
      spendDelta,
      incomeDelta,
      topCategoryName,
      topCategoryShare,
      currentPatternConfidence,
      currentTransactionConfidence,
      thresholdProfile
    );
    const preferenceProfile = buildPreferenceProfile(adviserInteractions, adviserOutcomeByGroup, adviserOutcomeByItem, now);
    const completionDatesByTheme = adviserCompletionLogs.reduce<Record<AdviserSignalTheme, Date[]>>(
      (accumulator, log) => {
        const metadata = log.metadata as AdviserAuditMetadata | null;
        const theme = themeFromGroup(metadata?.group?.trim() || "");
        if (!theme) {
          return accumulator;
        }

        accumulator[theme].push(log.createdAt);
        return accumulator;
      },
      {
        cashflow: [],
        behavior: [],
        goals: [],
        investments: [],
        cleanup: [],
      }
    );
    const interactionCompletionChecks = {
      cashflow: [completionDatesByTheme.cashflow],
      behavior: [completionDatesByTheme.behavior],
      goals: [completionDatesByTheme.goals, goalHistoryRows.map((row) => row.createdAt)],
      investments: [completionDatesByTheme.investments],
      cleanup: [completionDatesByTheme.cleanup],
    } satisfies Record<AdviserSignalTheme, Date[][]>;

    for (const interaction of adviserInteractions) {
      const metadata = interaction.metadata as AdviserAuditMetadata | null;
      const group = metadata?.group?.trim() || "";
      const itemId = metadata?.itemId?.trim() || interaction.entityId?.trim() || "";
      const theme = themeFromGroup(group);
      if (!theme) {
        continue;
      }

      const followThroughWindowEnd = new Date(interaction.createdAt);
      followThroughWindowEnd.setDate(followThroughWindowEnd.getDate() + 7);
      const matchedBuckets = interactionCompletionChecks[theme];
      const followedThrough = matchedBuckets.some((bucket) =>
        bucket.some((date) => date > interaction.createdAt && date <= followThroughWindowEnd)
      );

      if (followedThrough) {
        if (group) {
          recordOutcomeStats(adviserOutcomeByGroup, group, interaction.createdAt);
        }

        if (itemId) {
          recordOutcomeStats(adviserOutcomeByItem, itemId, interaction.createdAt);
        }
      }
    }

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
    const themeScores: AdviserThemeScore[] = [
      {
        key: "cashflow",
        score: average([
          themeMemoryScore(["cashflow", "recurring", "split-bills"]),
          accountPressureEstimate,
          recurringAmountPressure > 0 || commitmentAmountPressure > 0 || splitBillSettlementPressure > 0 ? 88 : 34,
          currentSavingsRate !== null && currentSavingsRate < 0 ? 92 : 45,
        ]),
      },
      {
        key: "behavior",
        score: average([
          themeMemoryScore(["transactions", "behavior-pattern", "category-mix"]),
          trendMomentumScore,
          weekendExpenseShare > 0.25 ? 72 : 38,
        ]),
      },
      {
        key: "goals",
        score: average([
          themeMemoryScore(["goals"]),
          goalValue ? 90 : 30,
          currentSavingsRate === null ? 35 : currentSavingsRate < 0 ? 85 : 55,
        ]),
      },
      {
        key: "investments",
        score: average([
          themeMemoryScore(["investments"]),
          latestInvestmentSnapshot ? 72 : 35,
          anomalySignal ? anomalySignal.score : 40,
        ]),
      },
      {
        key: "cleanup",
        score: average([
          themeMemoryScore(["cleanup"]),
          uncategorizedTransactions.length > 0 ? 92 : 35,
          currentTransactionConfidence,
        ]),
      },
    ].sort((left, right) => right.score - left.score);
    const dominantTheme = themeScores[0] ?? null;
    const secondaryTheme = themeScores[1] ?? null;

    const themeAffinity: Record<AdviserSignalTheme, number> = {
      cashflow: Math.max(
        0,
        Math.min(
          100,
          average([
            themeMemoryScore(["cashflow", "recurring", "split-bills"]),
            accountPressureEstimate,
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
    const userPreferenceAffinity: Record<AdviserSignalTheme, number> = {
      cashflow: Math.max(0, Math.min(100, average([preferenceProfile.cashflow, themeAffinity.cashflow]))),
      behavior: Math.max(0, Math.min(100, average([preferenceProfile.behavior, themeAffinity.behavior]))),
      goals: Math.max(0, Math.min(100, average([preferenceProfile.goals, themeAffinity.goals]))),
      investments: Math.max(0, Math.min(100, average([preferenceProfile.investments, themeAffinity.investments]))),
      cleanup: Math.max(0, Math.min(100, average([preferenceProfile.cleanup, themeAffinity.cleanup]))),
    };
    const financialPersona = buildFinancialPersona(
      dominantTheme,
      secondaryTheme,
      preferenceProfile,
      forecastSignal,
      anomalySignal,
      goalLabel,
      uncategorizedTransactions.length
    );
    const signalThemes = themeScores;
    const openSplitBillCount = openSplitBills.length;
    const cashflowPressureScore = forecastSignal?.score ?? average([
      currentSavingsRate !== null && currentSavingsRate < 0 ? 90 : 45,
      accountPressureEstimate,
      recurringAmountPressure > 0 ? 72 : 35,
      splitBillSettlementPressure > 0 ? 72 : 35,
      liquidBalance < baselineSpend ? 70 : 35,
    ]);
    const behaviorPatternScore = average([
      dominantTheme?.key === "behavior" ? 85 : 45,
      monthlyExpenseTrend.score,
      weekendExpenseShare * 100,
    ]);
    const goalPressureScore = average([
      goalProgress.bandLabel === "On track" ? 45 : 80,
      currentSavingsRate !== null && currentSavingsRate < 0 ? 90 : 50,
      spendDelta !== null && spendDelta > 0 ? 65 : 40,
    ]);
    const investmentSignalScore = anomalySignal?.score ?? (latestInvestmentSnapshot ? 60 : 25);
    const cleanupPressureScore = average([uncategorizedTransactions.length > 0 ? 92 : 35, currentTransactionConfidence]);

    const explainabilityBundle = [
      forecastSignal
        ? {
            label: forecastSignal.title,
            score: forecastSignal.score,
            reason: forecastSignal.evidence,
          }
        : null,
      anomalySignal
        ? {
            label: anomalySignal.title,
            score: anomalySignal.score,
            reason: anomalySignal.evidence,
          }
        : null,
      {
        label: "Cash flow pressure",
        score: cashflowPressureScore,
        reason: `Liquid balance ${formatCurrency(liquidBalance, displayCurrency)} vs spend ${formatCurrency(currentSpend, displayCurrency)}; recurring due soon ${recurringDueSoon.length}; split bills open ${openSplitBillCount}; account pressure ${Math.round(accountPressureEstimate)}/100.`,
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
      ...categoryForecastSignals.slice(1, 4).map((signal) => ({
        label: `Forecast: ${signal.title}`,
        score: signal.score,
        reason: signal.evidence,
      })),
      {
        label: `Persona: ${financialPersona.label}`,
        score: financialPersona.strength,
        reason: financialPersona.summary,
      },
    ]
      .filter((item): item is { label: string; score: number; reason: string } => item !== null)
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
      `Data grounding: ${groundingMode}; accounts ${workspace.accounts.length}; coverage ${Math.round(accountCoverageScore)}/100; liquid ${formatCurrency(liquidBalance, displayCurrency)}; spendable ${formatCurrency(spendableAccountBalance, displayCurrency)}; liabilities ${formatCurrency(liabilityAccountBalance, displayCurrency)}; top balance share ${formatPercent(largestAccountShare * 100)}`,
      `${currentWindowLabel}: income ${formatCurrency(currentSummary.income)}, spend ${formatCurrency(currentSpend)}, net ${formatSignedCurrency(currentNet)}`,
      `${previousWindowLabel}: income ${formatCurrency(previousSummary.income)}, spend ${formatCurrency(previousSpend)}, net ${formatSignedCurrency(previousNet)}`,
      `${longTermWindowLabel}: avg income ${formatCurrency(longTermAverageIncome)}, avg spend ${formatCurrency(longTermAverageSpend)}, avg net ${formatSignedCurrency(longTermAverageNet)}`,
      `Baseline model: spend ${formatCurrency(weightedHistoricalBaseline.spend)}, income ${formatCurrency(weightedHistoricalBaseline.income)}, net ${formatSignedCurrency(weightedHistoricalBaseline.net)}`,
      `Savings rate: ${currentSavingsRate === null ? "N/A" : formatPercent(currentSavingsRate * 100)}${baselineSavingsRate === null ? "" : `; baseline ${formatPercent(baselineSavingsRate * 100)}`}`,
      `Trend signals: spend ${monthlyExpenseTrend.direction > 0 ? "rising" : monthlyExpenseTrend.direction < 0 ? "easing" : "flat"} (${Math.round(monthlyExpenseTrend.score)}), income ${monthlyIncomeTrend.direction > 0 ? "rising" : monthlyIncomeTrend.direction < 0 ? "easing" : "flat"} (${Math.round(monthlyIncomeTrend.score)}), net ${monthlyNetTrend.direction > 0 ? "rising" : monthlyNetTrend.direction < 0 ? "easing" : "flat"} (${Math.round(monthlyNetTrend.score)})`,
      `Adviser themes: ${topThemeLine || "none"}`,
      `Adviser memory: ${adviserInteractions.length} interactions, ${adviserCompletionLogs.length} completion actions, follow-through rate ${formatPercent(adviserFollowThroughRate)}, cleanup affinity ${Math.round(userPreferenceAffinity.cleanup)}, cashflow affinity ${Math.round(userPreferenceAffinity.cashflow)}`,
      `Preference profile: cashflow ${Math.round(userPreferenceAffinity.cashflow)}, behavior ${Math.round(userPreferenceAffinity.behavior)}, goals ${Math.round(userPreferenceAffinity.goals)}, investments ${Math.round(userPreferenceAffinity.investments)}, cleanup ${Math.round(userPreferenceAffinity.cleanup)}`,
      `Financial persona: ${financialPersona.label} - ${financialPersona.summary}`,
      `Thresholds: cash buffer ${formatCurrency(thresholdProfile.cashBuffer)}, spend spike ${Math.round(thresholdProfile.spendSpikePercent)}%, income drop ${Math.round(thresholdProfile.incomeDropPercent)}%, concentration ${Math.round(thresholdProfile.concentrationShare * 100)}%`,
      `Forecast: ${forecastSignal ? `${forecastSignal.title} (${Math.round(forecastSignal.score)})` : "none"}; anomaly: ${anomalySignal ? `${anomalySignal.title} (${Math.round(anomalySignal.score)})` : "none"}`,
      `Forecast categories: ${categoryForecastSignals.map((signal) => `${signal.title} (${Math.round(signal.score)})`).join(" | ") || "none"}`,
      `Goal history: ${goalHistoryRows.length > 0 ? `${goalHistoryRows.length} recent setting change${goalHistoryRows.length === 1 ? "" : "s"}` : "none"}`,
      `Ranked evidence: ${explainabilityBundle.join(" | ")}`,
      `Top category: ${topCategoryName ?? "none"}`,
      `Recurring due soon: ${recurringDueSoon.map((item) => `${item.label}${item.due ? ` (${item.due})` : ""}`).join("; ") || "none"}`,
      `Commitments due soon: ${commitmentsDueSoon.map((item) => `${item.title}${item.due ? ` (${item.due})` : ""}`).join("; ") || "none"}`,
      `Split bills open: ${openSplitBills.map((item) => `${item.title} (${formatCurrency(item.outstanding)})`).join("; ") || "none"}`,
      `Latest investment snapshot: ${latestInvestmentSnapshot ? `${formatCurrency(Number(latestInvestmentSnapshot.totalValue ?? 0), latestInvestmentSnapshot.currency)}${investmentDelta === null ? "" : `, change ${formatSignedCurrency(investmentDelta, latestInvestmentSnapshot.currency)}`}` : "none"}`,
      `Liquid balance: ${formatCurrency(liquidBalance, displayCurrency)}`,
      `Account concentration: ${largestAccountBalance && largestAccountBalance.name ? `${largestAccountBalance.name} ${formatPercent(largestAccountShare * 100)}` : "none"}`,
      `Goal: ${goalValue ?? "none"} (${goalProgress.bandLabel})`,
    ].join("\n");

    const systemPrompt = [
      "You are Clover Adviser, a calm, specific, and trustworthy financial guide inside a personal finance app.",
      "Use the workspace context to answer the user's question clearly and directly.",
      "Prefer concrete data over generic advice.",
      "If transactions are sparse, lean on account balances, recurring items, commitments, split bills, and long-term history before giving a weak answer.",
      "If you can, mention the exact source of the signal, the relevant period, and one practical next step.",
      "Do not pretend to be a financial advisor. Keep guidance educational and contextual.",
      "If the user's question asks for investment advice, stay cautious and avoid personalized investment recommendations.",
      "If the data is insufficient, say what is missing and suggest where to check in Clover.",
      "",
      "Workspace context:",
      summaryLines,
    ].join("\n");

    const latestQuestion = incomingMessages[incomingMessages.length - 1]?.content?.trim() || "your question";
    const fallbackReply = [
      `Based on your current data, ${topCategoryName ? `${topCategoryName} is the main spending driver` : "spending is fairly spread out"}${spendDelta !== null ? ` and spending is ${formatPercent(spendDelta)} vs baseline` : ""}.`,
      workspace.accounts.length > 0
        ? `You also have ${workspace.accounts.length} connected account${workspace.accounts.length === 1 ? "" : "s"}, with ${formatCurrency(spendableAccountBalance, displayCurrency)} spendable balance and ${formatCurrency(liabilityAccountBalance, displayCurrency)} in liability exposure.`
        : null,
      recurringDueSoon.length > 0
        ? `You also have ${recurringDueSoon.length} recurring item${recurringDueSoon.length === 1 ? "" : "s"} coming up, so check those first if you want more room in cash flow.`
        : null,
      openSplitBills.length > 0
        ? `There are ${openSplitBills.length} open split bill${openSplitBills.length === 1 ? "" : "s"} still waiting on settlement.`
        : null,
      latestInvestmentSnapshot
        ? `Your latest investment snapshot is available, so if your question is about investments, start there next.`
        : null,
      `For "${latestQuestion}", the clearest first step is to open the relevant transactions, accounts, or obligations and review the biggest driver shown above.`,
    ]
      .filter((line): line is string => Boolean(line))
      .join(" ");

    const env = getEnv();
    if (!env.OPENAI_API_KEY) {
      return NextResponse.json({ reply: fallbackReply });
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
