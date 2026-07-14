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
import { recordAdviserChatQuestion } from "@/lib/adviser-actions";
import { deriveReconciledBalance } from "@/lib/account-balance";
import { assertRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type RequestBody = {
  messages?: ChatMessage[];
};

type AdviserUsage = {
  plan: "free" | "pro";
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
};

type AdviserAction = {
  id: string;
  kind: "navigate" | "confirm";
  type: string;
  label: string;
  description: string;
  href?: string;
  payload?: Record<string, unknown>;
};

const ADVISER_CHAT_LIMITS = {
  free: 5,
  pro: 100,
} as const;

const getNextMonthStart = (referenceDate: Date) => new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1);

type AdviserMemoryStats = {
  count: number;
  outcomes: number;
  lastSeenAt: Date;
};

type AdviserAuditMetadata = {
  kind?: "card" | "prompt" | "chat";
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

type AdviserChatAccountSource = {
  id: string;
  name: string;
  type: string;
  currency: string | null;
  balance: unknown;
  transactions: Array<{
    amount: unknown;
    type: "income" | "expense" | "transfer";
    isExcluded: boolean;
    merchantRaw: string;
    merchantClean: string | null;
    description: string | null;
    date: Date;
    createdAt: Date;
    rawPayload: unknown;
  }>;
  statementCheckpoints: Array<{
    endingBalance: unknown;
    status: string;
    statementEndDate: Date | null;
    createdAt: Date;
  }>;
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
const toShortDateLabel = (date: Date) =>
  new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const average = (values: number[]) => (values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
const getDataFreshnessCopy = (anchorDate: Date, now: Date) => {
  const daysOld = Math.max(0, Math.floor((now.getTime() - anchorDate.getTime()) / (1000 * 60 * 60 * 24)));

  if (daysOld > 180) {
    return `latest available data ending ${toShortDateLabel(anchorDate)}`;
  }

  if (daysOld > 45) {
    return `available data ending ${toShortDateLabel(anchorDate)}`;
  }

  return "latest 30-day window";
};
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
      ? `Known obligations add ${formatCurrency(knownPressure)} of pressure against the balance and spending pattern Clover can see.`
      : `The visible spend trend suggests ${formatCurrency(Math.abs(projectedNet))} of net pressure if the pattern continues.`;
  const evidence = `Projected net after known obligations: ${formatSignedCurrency(projectedNet)} · liquid balance ${formatCurrency(liquidBalance)} · risk score ${Math.round(projectedRisk)}/100`;

  return {
    title: projectedRisk >= 70 ? "Your cash flow may feel tight soon" : "Bills may need a quick look",
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
      summary: "Spending in the analysis window is moving faster than your own baseline.",
      evidence: `${formatCurrency(currentSpend)} in the analysis window vs ${formatCurrency(baselineSpend)} baseline`,
      score: Math.max(0, Math.min(100, average([spendSpikeScore, currentPatternConfidence, currentTransactionConfidence]))),
    };
  }

  if (incomeDropScore >= concentrationScore) {
    return {
      title: "Income dip detected",
      summary: "Income in the analysis window is running below the baseline we can see in your history.",
      evidence: `${formatCurrency(currentIncome)} in the analysis window vs ${formatCurrency(baselineIncome)} baseline`,
      score: Math.max(0, Math.min(100, average([incomeDropScore, currentTransactionConfidence, currentPatternConfidence]))),
    };
  }

  return {
    title: "Most spending is coming from a few places",
    summary: "A small number of categories are dominating the expense mix right now.",
    evidence: topCategoryName
      ? `${topCategoryName} makes up ${formatPercent(topCategoryShare * 100)} of window expenses.`
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
  accountCoverageScore: number;
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
  const coverageSensitivity = (params.accountCoverageScore - 50) / 50;
  const cashBuffer = average([
    params.baselineSpend * 0.75,
    params.currentSpend * 0.5,
    recurringBase + params.splitBillSettlementPressure * 0.75,
    params.currentIncome > 0 ? params.currentIncome * 0.3 : params.baselineIncome * 0.3,
  ]) + Math.max(0, coverageSensitivity) * params.baselineSpend * 0.04;
  const recurringPressure = Math.max(
    1,
    params.baselineSpend * 0.25,
    params.currentIncome > 0 ? params.currentIncome * 0.16 : params.baselineIncome * 0.16,
    cashBuffer * 0.35
  );
  const splitPressure = Math.max(
    1,
    params.baselineSpend * 0.14,
    params.currentIncome > 0 ? params.currentIncome * 0.1 : params.baselineIncome * 0.1,
    cashBuffer * 0.24
  );
  const spendSpikePercent = clamp(9 + (params.historyDepthScore < 50 ? 4 : 1) + (params.weekendExpenseShare > 0.3 ? 3 : 0) - coverageSensitivity * 2, 7, 24);
  const incomeDropPercent = clamp(8 + (params.historyDepthScore < 40 ? 3 : 0) - coverageSensitivity * 1.5, 6, 20);
  const concentrationShare = clamp((params.topCategoryShare > 0.4 ? 0.42 : 0.35) - coverageSensitivity * 0.04, 0.26, 0.58);
  const investmentSwingPercent = clamp(params.latestInvestmentSnapshot ? 8 + (params.investmentDelta !== null && Math.abs(params.investmentDelta) > 0 ? 2 : 0) : 18, 6, 20);
  const goalDriftPercent = clamp((params.currentSavingsRate !== null && params.currentSavingsRate < 0 ? 6 : 12) - coverageSensitivity, 6, 18);

  return {
    cashBuffer,
    spendSpikePercent,
    incomeDropPercent,
    concentrationShare,
    recurringPressure,
    splitPressure,
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
  const recurringBase = params.recurringAmountPressure + params.commitmentAmountPressure;
  const recurringRisk = recurringBase > params.thresholdProfile.recurringPressure * 0.9 || (recurringBase > 0 && params.monthlyExpenseTrend.direction > 0);
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
          title: "Bills are starting to stack up",
          summary: "Your recurring bills are taking up more of the room Clover can see.",
          evidence: `Recurring + commitment pressure ${formatCurrency(recurringBase)} vs threshold ${formatCurrency(params.thresholdProfile.recurringPressure)}`,
          score: clamp(
            average([
              55 + Math.max(0, (recurringBase / Math.max(params.thresholdProfile.recurringPressure || 1, 1)) * 30),
              params.monthlyExpenseTrend.direction > 0 ? 65 + params.monthlyExpenseTrend.score * 0.2 : 35,
            ])
          ),
        }
      : null,
    splitRisk
      ? {
          title: "Shared bills could use a quick check",
          summary: "Open split bill balances are large enough to be worth reviewing.",
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
          title: params.goalProgressBand === "Set a Goal" ? "Set a savings goal when you are ready" : "Your savings goal may need a quick update",
          summary:
            params.goalProgressBand === "Set a Goal"
              ? "A goal gives Clover a clearer target for future guidance."
              : "Your current pace suggests the goal may need a small adjustment.",
          evidence: `Goal band ${params.goalProgressBand}; drift threshold ${Math.round(params.thresholdProfile.goalDriftPercent)}%`,
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
          title: "Your investments changed since the last snapshot",
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

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const resetsAt = getNextMonthStart(now);
    const limit = ADVISER_CHAT_LIMITS[user.planTier];
    const usageCount = await prisma.auditLog.count({
      where: {
        actorUserId: user.id,
        action: "adviser.chat_asked",
        createdAt: { gte: monthStart },
      },
    });

    try {
      assertRateLimit(`adviser-chat:${user.id}`, user.planTier === "pro" ? 30 : 8, 60 * 1000);
    } catch {
      return NextResponse.json(
        {
          error: "Clover needs a short pause before the next question.",
          usage: { plan: user.planTier, used: usageCount, limit, remaining: Math.max(0, limit - usageCount), resetsAt: resetsAt.toISOString() } satisfies AdviserUsage,
        },
        { status: 429 }
      );
    }

    if (usageCount >= limit) {
      return NextResponse.json(
        {
          error: user.planTier === "free" ? "You have used this month's Adviser preview questions. Upgrade to Pro for more room." : "You have reached this month's Adviser Chat limit.",
          usage: { plan: user.planTier, used: usageCount, limit, remaining: 0, resetsAt: resetsAt.toISOString() } satisfies AdviserUsage,
        },
        { status: 429 }
      );
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
                  id: true,
                  name: true,
                  type: true,
                  currency: true,
                  balance: true,
                  transactions: {
                    where: { isExcluded: false },
                    select: {
                      amount: true,
                      type: true,
                      isExcluded: true,
                      merchantRaw: true,
                      merchantClean: true,
                      description: true,
                      date: true,
                      createdAt: true,
                      rawPayload: true,
                    },
                    orderBy: { date: "desc" },
                  },
                  statementCheckpoints: {
                    select: {
                      endingBalance: true,
                      status: true,
                      statementEndDate: true,
                      createdAt: true,
                    },
                    orderBy: [{ statementEndDate: "desc" }, { createdAt: "desc" }],
                    take: 1,
                  },
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
                id: true,
                name: true,
                type: true,
                currency: true,
                balance: true,
                transactions: {
                  where: { isExcluded: false },
                  select: {
                    amount: true,
                    type: true,
                    isExcluded: true,
                    merchantRaw: true,
                    merchantClean: true,
                    description: true,
                    date: true,
                    createdAt: true,
                    rawPayload: true,
                  },
                  orderBy: { date: "desc" },
                },
                statementCheckpoints: {
                  select: {
                    endingBalance: true,
                    status: true,
                    statementEndDate: true,
                    createdAt: true,
                  },
                  orderBy: [{ statementEndDate: "desc" }, { createdAt: "desc" }],
                  take: 1,
                },
              },
            },
        },
        orderBy: { createdAt: "asc" },
      }));

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }

    await assertWorkspaceAccess(user.clerkUserId, workspace.id);

    const reconcileChatAccountBalance = (account: AdviserChatAccountSource) => {
      const latestCheckpoint = account.statementCheckpoints[0] ?? null;
      const checkpointBalance =
        latestCheckpoint?.status !== "mismatch" && latestCheckpoint?.endingBalance ? latestCheckpoint.endingBalance : null;
      const reconciledBalance =
        checkpointBalance ??
        deriveReconciledBalance({
          balance: account.balance as Parameters<typeof deriveReconciledBalance>[0]["balance"],
          transactions: account.transactions as unknown as Parameters<typeof deriveReconciledBalance>[0]["transactions"],
          checkpoints: latestCheckpoint ? ([latestCheckpoint] as unknown as Parameters<typeof deriveReconciledBalance>[0]["checkpoints"]) : [],
        });
      const parsed = Number(reconciledBalance ?? account.balance ?? 0);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const chatAccounts = (workspace.accounts as AdviserChatAccountSource[]).map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      balance: reconcileChatAccountBalance(account),
    }));

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
            id: true,
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
          in: ["adviser.card_opened", "adviser.prompt_clicked", "adviser.chat_asked"],
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
    const directCompletionGroups = new Set<string>();
    const directCompletionItems = new Set<string>();

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

    for (const completion of adviserCompletionLogs) {
      const metadata = completion.metadata as AdviserAuditMetadata | null;
      const group = metadata?.group?.trim() || "";
      const itemId = metadata?.itemId?.trim() || completion.entityId?.trim() || "";

      if (group) {
        recordOutcomeStats(adviserOutcomeByGroup, group, completion.createdAt);
        directCompletionGroups.add(group);
      }

      if (itemId) {
        recordOutcomeStats(adviserOutcomeByItem, itemId, completion.createdAt);
        directCompletionItems.add(itemId);
      }
    }

    const allTransactions = allTransactionsQuery as Array<{
      id: string;
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
    const dataFreshnessLabel = getDataFreshnessCopy(analysisAnchorDate, now);
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
    const currencyCandidates = new Set(chatAccounts.map((account) => formatCurrencyCode(account.currency)).filter((currency) => currency.length > 0));
    const displayCurrency = (() => {
      const currencies = Array.from(currencyCandidates).sort((left, right) => left.localeCompare(right));
      if (currencies.includes("PHP")) {
        return "PHP";
      }
      return currencies[0] ?? "PHP";
    })();
    const accountAnalysisAccounts = chatAccounts.filter((account) => formatCurrencyCode(account.currency) === displayCurrency);
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
    const goalProgressLabel = goalLabel ? goalProgress.bandLabel : "Set a Goal";

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
        Math.round(average([chatAccounts.length >= 5 ? 90 : (chatAccounts.length / 5) * 100, chatAccounts.length > 0 ? 75 : 35]))
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
        amount: Number(pattern.amount ?? 0),
      }));

    const commitmentsDueSoon = financialCommitments
      .filter((commitment) => commitment.nextDueDate && commitment.nextDueDate <= nextSevenDays)
      .slice(0, 3)
      .map((commitment) => ({
        title: commitment.title,
        due: commitment.nextDueDate ? toMonthLabel(commitment.nextDueDate) : null,
        amount: Number(commitment.amount ?? 0),
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

    const liquidBalance = accountAnalysisAccounts
      .filter((account) => ["bank", "wallet", "cash"].includes(account.type))
      .reduce((sum, account) => sum + account.balance, 0);
    const totalAccountBalance = accountAnalysisAccounts.reduce((sum, account) => sum + account.balance, 0);
    const totalAccountMagnitude = accountAnalysisAccounts.reduce((sum, account) => sum + Math.abs(account.balance), 0);
    const spendableAccountBalance = accountAnalysisAccounts
      .filter((account) => ["bank", "wallet", "cash"].includes(account.type))
      .reduce((sum, account) => sum + account.balance, 0);
    const liabilityAccountBalance = accountAnalysisAccounts
      .filter((account) => ["credit_card", "loan", "mortgage", "line_of_credit", "payable", "bnpl"].includes(account.type))
      .reduce((sum, account) => sum + Math.abs(account.balance), 0);
    const largestAccountBalance = [...accountAnalysisAccounts].sort((left, right) => Math.abs(right.balance) - Math.abs(left.balance))[0] ?? null;
    const largestAccountShare = totalAccountMagnitude > 0 && largestAccountBalance ? Math.abs(largestAccountBalance.balance) / totalAccountMagnitude : 0;
    const accountPressureEstimate = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          average([
            liabilityAccountBalance > 0 ? Math.min(100, (liabilityAccountBalance / Math.max(totalAccountMagnitude || 1, 1)) * 100) : 18,
            spendableAccountBalance < totalAccountMagnitude * 0.3 ? 82 : 28,
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
      accountCoverageScore,
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
      goalProgressBand: goalProgressLabel,
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
        if (group && !directCompletionGroups.has(group)) {
          recordOutcomeStats(adviserOutcomeByGroup, group, interaction.createdAt);
        }

        if (itemId && !directCompletionItems.has(itemId)) {
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
    const adviserNarrative = [
      dominantTheme ? `${dominantTheme.key} is the primary theme` : "No dominant theme identified yet",
      secondaryTheme ? `${secondaryTheme.key} is the next strongest signal` : "No secondary theme identified",
      forecastSignal ? `${forecastSignal.title.toLowerCase()} points to ${forecastSignal.summary.toLowerCase()}` : null,
      anomalySignal ? `${anomalySignal.title.toLowerCase()} shows ${anomalySignal.summary.toLowerCase()}` : null,
      workspace.accounts.length > 0
        ? `${workspace.accounts.length} connected account${workspace.accounts.length === 1 ? "" : "s"} and account pressure ${Math.round(accountPressureEstimate)}/100 are feeding the guidance`
        : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" · ");
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
    const totalAdviserClicks = adviserInteractions.filter((interaction) => {
      const metadata = interaction.metadata as AdviserAuditMetadata | null;
      return metadata?.kind !== "chat";
    }).length;
    const totalAdviserOutcomes = Array.from(adviserOutcomeByGroup.values()).reduce((sum, stats) => sum + stats.outcomes, 0);
    const adviserFollowThroughRate = totalAdviserClicks > 0 ? (totalAdviserOutcomes / totalAdviserClicks) * 100 : 0;

    const currentWindowLabel = currentWindowTransactions.length > 0 ? dataFreshnessLabel : "Latest available window";
    const previousWindowLabel = previousWindowTransactions.length > 0 ? "Previous 30 days" : "Earlier available window";
    const longTermWindowLabel = historySpanDays > 0 ? `All available history (${Math.ceil(historySpanDays / 30)} month${Math.ceil(historySpanDays / 30) === 1 ? "" : "s"})` : "All available history";

    const summaryLines = [
      `Workspace: ${workspace.name}`,
      `Data grounding: ${groundingMode}; accounts ${workspace.accounts.length}; coverage ${Math.round(accountCoverageScore)}/100; liquid ${formatCurrency(liquidBalance, displayCurrency)}; available cash ${formatCurrency(spendableAccountBalance, displayCurrency)}; balances owed ${formatCurrency(liabilityAccountBalance, displayCurrency)}; top balance share ${formatPercent(largestAccountShare * 100)}`,
      `Accounts available for manual actions: ${chatAccounts.map((account) => `${account.id} ${account.name} (${account.type}, ${formatCurrency(account.balance, account.currency)})`).join(" | ") || "none"}`,
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
      `Narrative: ${adviserNarrative}`,
      `Thresholds: cash buffer ${formatCurrency(thresholdProfile.cashBuffer)}, recurring pressure ${formatCurrency(thresholdProfile.recurringPressure)}, split pressure ${formatCurrency(thresholdProfile.splitPressure)}, spend spike ${Math.round(thresholdProfile.spendSpikePercent)}%, income drop ${Math.round(thresholdProfile.incomeDropPercent)}%, concentration ${Math.round(thresholdProfile.concentrationShare * 100)}%`,
      `Forecast: ${forecastSignal ? `${forecastSignal.title} (${Math.round(forecastSignal.score)})` : "none"}; anomaly: ${anomalySignal ? `${anomalySignal.title} (${Math.round(anomalySignal.score)})` : "none"}`,
      `Forecast categories: ${categoryForecastSignals.map((signal) => `${signal.title} (${Math.round(signal.score)})`).join(" | ") || "none"}`,
      `Goal history: ${goalHistoryRows.length > 0 ? `${goalHistoryRows.length} recent setting change${goalHistoryRows.length === 1 ? "" : "s"}` : "none"}`,
      `Ranked evidence: ${explainabilityBundle.join(" | ")}`,
      `Top category: ${topCategoryName ?? "none"}`,
      `Recurring due soon: ${recurringDueSoon.map((item) => `${item.label}${item.due ? ` (${item.due})` : ""}${item.amount > 0 ? ` ${formatCurrency(item.amount, displayCurrency)}` : ""}`).join("; ") || "none"}`,
      `Commitments due soon: ${commitmentsDueSoon.map((item) => `${item.title}${item.due ? ` (${item.due})` : ""}${item.amount > 0 ? ` ${formatCurrency(item.amount, displayCurrency)}` : ""}`).join("; ") || "none"}`,
      `Split bills open: ${openSplitBills.map((item) => `${item.title} (${formatCurrency(item.outstanding)})`).join("; ") || "none"}`,
      `Latest investment snapshot: ${latestInvestmentSnapshot ? `${formatCurrency(Number(latestInvestmentSnapshot.totalValue ?? 0), latestInvestmentSnapshot.currency)}${investmentDelta === null ? "" : `, change ${formatSignedCurrency(investmentDelta, latestInvestmentSnapshot.currency)}`}` : "none"}`,
      `Liquid balance: ${formatCurrency(liquidBalance, displayCurrency)}`,
      `Account concentration: ${largestAccountBalance && largestAccountBalance.name ? `${largestAccountBalance.name} ${formatPercent(largestAccountShare * 100)}` : "none"}`,
      `Goal: ${goalValue ?? "none"} (${goalProgress.bandLabel})`,
      `Recent transaction references: ${allTransactions.slice(0, 20).map((transaction) => `${transaction.id} ${transaction.merchantClean ?? transaction.merchantRaw} ${formatCurrency(Math.abs(Number(transaction.amount)), displayCurrency)} ${toShortDateLabel(transaction.date)}`).join(" | ") || "none"}`,
    ].join("\n");

    const systemPrompt = [
      "You are Clover Adviser, a calm, specific, and trustworthy financial guide inside a personal finance app.",
      "Use the workspace context to answer the user's question clearly and directly.",
      "Prefer concrete data over generic advice.",
      "If transactions are sparse, lean on account balances, recurring items, commitments, split bills, and long-term history before giving a weak answer.",
      "If data is stale or historical, say so plainly and avoid implying it reflects today.",
      "If you can, mention the exact source of the signal, the relevant period, and one practical next step.",
      "Keep the answer short: one main read, one reason, and one next step unless the user asks for more detail.",
      "Do not pretend to be a financial advisor. Keep guidance educational and contextual.",
      "If the user's question asks for investment advice, stay cautious and avoid personalized investment recommendations.",
      "If the data is insufficient, say what is missing and suggest where to check in Clover.",
      "When the user asks to see a report, use open_report so the UI can open Clover's existing Reports page.",
      "When the user asks whether they can afford a named purchase with a price, use check_affordability.",
      "When the user asks about goal progress, use get_goal_progress.",
      "When the user asks to find, explain, or review transactions, use find_transactions.",
      "When the user asks about bills, cash-flow pressure, or split bills, use get_cashflow_outlook or get_split_bill_status.",
      "When the user asks about investments, use get_investment_summary before giving educational context.",
      "When the user asks Clover to add or edit a record, use prepare_write_action and wait for confirmation; never describe a proposed write as completed.",
      "",
      "Workspace context:",
      summaryLines,
    ].join("\n");

    const latestQuestion = incomingMessages[incomingMessages.length - 1]?.content?.trim() || "your question";
    const latestQuestionLower = latestQuestion.toLowerCase();
    const inferredQuestionTheme = (
      /goal|target|track|progress|save more|emergency fund|drift/.test(latestQuestionLower)
        ? "goals"
        : /invest|portfolio|dividend|gain|loss|snapshot|stock/.test(latestQuestionLower)
          ? "investments"
          : /uncategorized|cleanup|categor|merchant|transaction|spend|weekend|pattern|why/.test(latestQuestionLower)
            ? "behavior"
            : /bill|recurr|due|loan|balance|cash flow|budget|owe|payment|pressure|account/.test(latestQuestionLower)
              ? "cashflow"
              : null
    ) ?? dominantTheme?.key ?? "cashflow";
    const questionSignature = `chat:${latestQuestionLower.replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80) || "question"}`;
    await recordAdviserChatQuestion({
      workspaceId: workspace.id,
      actorUserId: user.id,
      group: inferredQuestionTheme,
      itemId: questionSignature,
      label: latestQuestion.slice(0, 120),
      sourceAction: "adviser_chat",
      href: "/adviser",
      pathname: "/adviser",
    }).catch(() => null);

    const strongestFallbackSignal = explainabilityBundle[0] ?? null;
    const fallbackNextStep =
      inferredQuestionTheme === "goals" && goalLabel
        ? `Open Goals and check whether ${goalLabel.toLowerCase()} still matches your latest cash-flow pace.`
        : inferredQuestionTheme === "investments" && latestInvestmentSnapshot
          ? "Open Investments and review the latest snapshot before making any decision."
          : inferredQuestionTheme === "behavior" && topCategoryName
            ? `Open Transactions filtered to ${topCategoryName} and review the largest items first.`
            : inferredQuestionTheme === "cashflow" && recurringDueSoon.length > 0
              ? "Open Recurring and check the bills due soon before moving money around."
              : inferredQuestionTheme === "cashflow" && workspace.accounts.length > 0
                ? "Open Accounts and compare available cash with the obligations Clover can see."
                : openSplitBills.length > 0
                  ? "Open Split Bills and settle the largest open balance first."
                  : "Open Transactions and review the clearest driver Clover surfaced.";

    const fallbackReply = [
      `Based on your ${dataFreshnessLabel}, ${topCategoryName ? `${topCategoryName} is the main spending driver` : "spending is fairly spread out"}${spendDelta !== null ? ` and spending is ${formatPercent(spendDelta)} vs baseline` : ""}.`,
      strongestFallbackSignal ? `Strongest signal: ${strongestFallbackSignal}.` : null,
      workspace.accounts.length > 0
        ? `You also have ${workspace.accounts.length} connected account${workspace.accounts.length === 1 ? "" : "s"}, with ${formatCurrency(spendableAccountBalance, displayCurrency)} available cash and ${formatCurrency(liabilityAccountBalance, displayCurrency)} in balances owed.`
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
      `For "${latestQuestion}", ${fallbackNextStep}`,
    ]
      .filter((line): line is string => Boolean(line))
      .join(" ");

    const env = getEnv();
    if (!env.OPENAI_API_KEY) {
      const currentUsage = { plan: user.planTier, used: usageCount + 1, limit, remaining: Math.max(0, limit - usageCount - 1), resetsAt: resetsAt.toISOString() } satisfies AdviserUsage;
      return NextResponse.json({ reply: fallbackReply, actions: [], usage: currentUsage });
    }

    const model = env.OPENAI_ADVISER_MODEL?.trim() || "gpt-4.1";
    const actions: AdviserAction[] = [];
    const tools = [
      {
        type: "function",
        name: "open_report",
        description: "Open Clover's existing Reports page for a requested time range and optional category, merchant, or account filter.",
        parameters: {
          type: "object",
          properties: {
            range: { type: "string", enum: ["30d", "90d", "ytd"] },
            section: { type: "string", enum: ["overview", "spending", "trends", "advanced"] },
            category: { type: ["string", "null"] },
            merchant: { type: ["string", "null"] },
            account: { type: ["string", "null"] },
          },
          required: ["range", "section", "category", "merchant", "account"],
          additionalProperties: false,
        },
      },
      {
        type: "function",
        name: "check_affordability",
        description: "Check whether a purchase fits after protecting upcoming obligations and a baseline spending reserve. Use when the user provides a price or asks whether they can afford something.",
        parameters: {
          type: "object",
          properties: {
            itemName: { type: "string" },
            price: { type: "number" },
          },
          required: ["itemName", "price"],
          additionalProperties: false,
        },
      },
      {
        type: "function",
        name: "get_goal_progress",
        description: "Read the user's current goal progress from Clover.",
        parameters: {
          type: "object",
          properties: { goal: { type: ["string", "null"] } },
          required: ["goal"],
          additionalProperties: false,
        },
      },
      {
        type: "function",
        name: "find_transactions",
        description: "Find matching transactions in Clover's existing transaction history. Use for questions about a merchant, category, unusual item, or specific transaction.",
        parameters: {
          type: "object",
          properties: { query: { type: "string" }, limit: { type: "number" } },
          required: ["query", "limit"],
          additionalProperties: false,
        },
      },
      {
        type: "function",
        name: "get_cashflow_outlook",
        description: "Summarize upcoming recurring obligations, commitments, open split bills, and available cash.",
        parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
      },
      {
        type: "function",
        name: "get_split_bill_status",
        description: "Read open split bills and outstanding amounts from Clover.",
        parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
      },
      {
        type: "function",
        name: "get_investment_summary",
        description: "Read the latest investment snapshot available in Clover. Use for portfolio status and educational context, not personalized security recommendations.",
        parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
      },
      {
        type: "function",
        name: "prepare_write_action",
        description: "Prepare a confirmation card for a user-requested manual write. Never execute it. Supported action types are set_goal, create_budget, create_transaction, edit_transaction, create_account, create_investment, and create_split_bill.",
        parameters: {
          type: "object",
          properties: {
            actionType: { type: "string", enum: ["set_goal", "create_budget", "create_transaction", "edit_transaction", "create_account", "create_investment", "create_split_bill"] },
            payload: { type: "object", additionalProperties: true },
            label: { type: "string" },
            description: { type: "string" },
          },
          required: ["actionType", "payload", "label", "description"],
          additionalProperties: false,
        },
      },
      {
        type: "function",
        name: "open_clover_area",
        description: "Open an existing Clover area for goals, budgeting, investments, transactions, accounts, recurring items, or split bills.",
        parameters: {
          type: "object",
          properties: { area: { type: "string", enum: ["goals", "budgeting", "investments", "transactions", "accounts", "recurring", "split-bills"] } },
          required: ["area"],
          additionalProperties: false,
        },
      },
    ];

    const baseInput: unknown[] = [
      { role: "system", content: [{ type: "input_text", text: `${systemPrompt}\n\nTool rules: Use read tools when a Clover page or calculation is needed. Use prepare_write_action only when the user explicitly asks Clover to create or record something. Never claim a write happened until the user confirms it.` }] },
      ...incomingMessages.map((message) => ({ role: message.role, content: [{ type: "input_text", text: message.content }] })),
    ];
    let modelInput = baseInput;
    let payload: Record<string, unknown> = {};

    for (let step = 0; step < 3; step += 1) {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, temperature: 0.2, max_output_tokens: 900, tools, input: modelInput }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        return NextResponse.json({ error: errorText || "Unable to generate an Adviser response." }, { status: 502 });
      }

      payload = (await response.json()) as Record<string, unknown>;
      const output = Array.isArray(payload.output) ? payload.output : [];
      const calls = output.filter((item): item is { type: "function_call"; name: string; call_id: string; arguments: string } => Boolean(item && typeof item === "object" && (item as { type?: unknown }).type === "function_call"));

      if (calls.length === 0) {
        break;
      }

      const toolOutputs = calls.map((call) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.arguments) as Record<string, unknown>;
        } catch {
          args = {};
        }

        let result: Record<string, unknown>;
        if (call.name === "open_report") {
          const params = new URLSearchParams();
          params.set("range", String(args.range ?? "30d"));
          params.set("section", String(args.section ?? "overview"));
          const filter = typeof args.category === "string" ? args.category : typeof args.merchant === "string" ? args.merchant : typeof args.account === "string" ? args.account : "";
          if (filter) params.set("filter", filter);
          const href = `/reports?${params.toString()}`;
          actions.push({ id: `report-${actions.length + 1}`, kind: "navigate", type: "open_report", label: "Open this report", description: "Use Clover's existing Reports view for the requested period.", href });
          result = { href, report: "existing Clover Reports view", range: args.range ?? "30d", section: args.section ?? "overview", filter: filter || null };
        } else if (call.name === "check_affordability") {
          const price = Number(args.price ?? 0);
          const protectedCash = recurringDueSoon.reduce((sum, item) => sum + item.amount, 0) + commitmentsDueSoon.reduce((sum, item) => sum + item.amount, 0) + Math.max(weightedHistoricalBaseline.spend, baselineSpend);
          const roomAfterPurchase = spendableAccountBalance - protectedCash - price;
          result = { itemName: args.itemName ?? "purchase", price, availableCash: spendableAccountBalance, protectedCash, roomAfterPurchase, status: roomAfterPurchase >= 0 ? "fits_after_reserve" : "would_reduce_reserve", freshness: dataFreshnessLabel };
        } else if (call.name === "get_goal_progress") {
          result = { goal: goalLabel, status: goalProgressLabel, targetAmount: goalTargetAmount, progress: goalProgress };
          actions.push({ id: `goal-${actions.length + 1}`, kind: "navigate", type: "open_goal", label: "Open Goals", description: "Review the goal and its progress in Clover.", href: "/goals" });
        } else if (call.name === "find_transactions") {
          const query = String(args.query ?? "").trim().toLowerCase();
          const limit = Math.max(1, Math.min(10, Number(args.limit ?? 5)));
          const matches = allTransactions
            .filter((transaction) => {
              const haystack = [transaction.merchantClean, transaction.merchantRaw, transaction.description, transaction.account.name]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
              return query ? haystack.includes(query) : true;
            })
            .slice(0, limit)
            .map((transaction) => ({
              id: transaction.id,
              merchant: transaction.merchantClean ?? transaction.merchantRaw,
              amount: Number(transaction.amount),
              type: transaction.type,
              date: transaction.date.toISOString(),
              account: transaction.account.name,
            }));
          const href = query ? `/transactions?q=${encodeURIComponent(query)}` : "/transactions";
          actions.push({ id: `transactions-${actions.length + 1}`, kind: "navigate", type: "find_transactions", label: "Review these transactions", description: "Open Clover Transactions to inspect the matching records.", href });
          result = { query: query || null, matches, href };
        } else if (call.name === "get_cashflow_outlook") {
          const upcomingRecurring = recurringDueSoon.reduce((sum, item) => sum + item.amount, 0);
          const upcomingCommitments = commitmentsDueSoon.reduce((sum, item) => sum + item.amount, 0);
          const protectedCash = upcomingRecurring + upcomingCommitments + openSplitBillAmount;
          result = {
            availableCash: spendableAccountBalance,
            upcomingRecurring,
            upcomingCommitments,
            openSplitBills: openSplitBillAmount,
            protectedCash,
            roomAfterKnownPressure: spendableAccountBalance - protectedCash,
            recurring: recurringDueSoon,
            commitments: commitmentsDueSoon,
          };
          actions.push({ id: `cashflow-${actions.length + 1}`, kind: "navigate", type: "open_cashflow", label: "Review cash-flow details", description: "Open Recurring and Accounts to review known obligations and available cash.", href: "/recurring" });
        } else if (call.name === "get_split_bill_status") {
          result = { openBills: openSplitBills, totalOutstanding: openSplitBillAmount, href: "/split-bills" };
          actions.push({ id: `split-${actions.length + 1}`, kind: "navigate", type: "open_split_bills", label: "Open Split Bills", description: "Review open shared expenses and settlement status.", href: "/split-bills" });
        } else if (call.name === "get_investment_summary") {
          result = {
            latestSnapshot: latestInvestmentSnapshot
              ? {
                  value: Number(latestInvestmentSnapshot.totalValue ?? 0),
                  currency: latestInvestmentSnapshot.currency,
                  date: latestInvestmentSnapshot.snapshotDate?.toISOString() ?? null,
                  change: investmentDelta,
                }
              : null,
            guidance: "Use this data for education and portfolio review. Do not make a personalized security recommendation without suitability information.",
          };
          actions.push({ id: `investments-${actions.length + 1}`, kind: "navigate", type: "open_investments", label: "Open Investments", description: "Review holdings and snapshots in Clover.", href: "/investments" });
        } else if (call.name === "open_clover_area") {
          const area = String(args.area ?? "transactions");
          const href = `/${area}`;
          actions.push({ id: `area-${actions.length + 1}`, kind: "navigate", type: `open_${area}`, label: `Open ${area.replace("-", " ")}`, description: "Continue in the existing Clover workflow.", href });
          result = { area, href };
        } else if (call.name === "prepare_write_action") {
          const actionType = String(args.actionType ?? "");
          const action: AdviserAction = { id: `action-${actions.length + 1}`, kind: "confirm", type: actionType, label: String(args.label ?? "Confirm this action"), description: String(args.description ?? "Review and confirm this Clover action."), payload: { ...(args.payload as Record<string, unknown>), workspaceId: workspace.id } };
          actions.push(action);
          result = { requiresConfirmation: true, actionId: action.id, actionType, payload: action.payload };
        } else {
          result = { error: `Unknown Adviser tool: ${call.name}` };
        }

        return { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) };
      });

      modelInput = [...modelInput, ...output, ...toolOutputs];
    }

    const reply = extractOutputText(payload) || "I could not generate a response right now.";
    const currentUsage = { plan: user.planTier, used: usageCount + 1, limit, remaining: Math.max(0, limit - usageCount - 1), resetsAt: resetsAt.toISOString() } satisfies AdviserUsage;
    return NextResponse.json({ reply, actions, usage: currentUsage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate an Adviser response.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
