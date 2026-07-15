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
import { getPlannedPaymentSuggestions } from "@/lib/planned-payment-suggestions";
import { normalizeAdviserPreferences } from "@/lib/adviser-preferences";

export const dynamic = "force-dynamic";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type RequestBody = {
  messages?: ChatMessage[];
  stream?: boolean;
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
const getNextPaydayDate = (referenceDate: Date, paydayDay: number) => {
  const buildDate = (year: number, month: number) => {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(paydayDay, lastDay));
  };
  const thisMonth = buildDate(referenceDate.getFullYear(), referenceDate.getMonth());
  return thisMonth > referenceDate ? thisMonth : buildDate(referenceDate.getFullYear(), referenceDate.getMonth() + 1);
};

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
  question?: string;
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
const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) {
    return 0;
  }

  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : sorted[middle] ?? 0;
};
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
    const streamRequested = body?.stream === true;
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

    const [allTransactionsQuery, recurringPatterns, financialCommitments, goalHistoryRows, investmentSnapshots, budgets, splitBillWorkspaceData, plannedPaymentSuggestions] =
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
          take: 5000,
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
        prisma.budget.findMany({
          where: {
            workspaceId: workspace.id,
            isActive: true,
          },
          orderBy: { updatedAt: "desc" },
          take: 20,
          select: {
            id: true,
            name: true,
            kind: true,
            scope: true,
            cadence: true,
            targetAmount: true,
            currency: true,
            categoryId: true,
            category: {
              select: {
                name: true,
              },
            },
          },
        }),
        loadSplitBillWorkspaceData(user.id),
        getPlannedPaymentSuggestions(workspace.id),
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

    const recentAdviserQuestions = adviserInteractions
      .filter((interaction) => interaction.action === "adviser.chat_asked")
      .map((interaction) => {
        const metadata = interaction.metadata && typeof interaction.metadata === "object" ? (interaction.metadata as AdviserAuditMetadata) : null;
        return metadata?.question || metadata?.label || null;
      })
      .filter((question): question is string => Boolean(question))
      .slice(0, 6);

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
    const incomeHistory = allTransactions
      .filter((transaction) => transaction.type === "income" && Math.abs(Number(transaction.amount ?? 0)) > 0)
      .sort((left, right) => left.date.getTime() - right.date.getTime());
    const recentIncomeHistory = incomeHistory.slice(-12);
    const incomeIntervals = recentIncomeHistory.slice(1).map((income, index) =>
      Math.round((income.date.getTime() - (recentIncomeHistory[index]?.date.getTime() ?? income.date.getTime())) / (24 * 60 * 60 * 1000))
    );
    const medianIncomeInterval = median(incomeIntervals.filter((interval) => interval > 0));
    const medianIncomeAmount = median(recentIncomeHistory.map((income) => Math.abs(Number(income.amount ?? 0))));
    const incomeCadence = medianIncomeInterval >= 5 && medianIncomeInterval <= 9
      ? "weekly"
      : medianIncomeInterval >= 12 && medianIncomeInterval <= 18
        ? "biweekly"
        : medianIncomeInterval >= 25 && medianIncomeInterval <= 35
          ? "monthly"
          : "irregular";
    const estimatedNextIncomeDate = recentIncomeHistory.length >= 3 && incomeCadence !== "irregular"
      ? new Date((recentIncomeHistory[recentIncomeHistory.length - 1]?.date ?? now).getTime() + medianIncomeInterval * 24 * 60 * 60 * 1000)
      : null;
    const incomeTimingConfidence = recentIncomeHistory.length >= 6 && incomeCadence !== "irregular" ? "medium" : recentIncomeHistory.length >= 3 ? "low" : "insufficient";
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
    const adviserPreferences = normalizeAdviserPreferences(user.adviserPreferences);

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
    const preferenceProfile = buildPreferenceProfile(
      adviserInteractions.map((interaction) => ({
        ...interaction,
        metadata: interaction.metadata && typeof interaction.metadata === "object" ? (interaction.metadata as AdviserAuditMetadata) : null,
      })),
      adviserOutcomeByGroup,
      adviserOutcomeByItem,
      now
    );
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
    const themeScores = ([
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
    ] satisfies AdviserThemeScore[]).sort((left, right) => right.score - left.score);
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
    const calculateSafeToSpend = (options?: { horizonDays?: number | null; untilDate?: string | null; expectedIncome?: number | null; additionalBuffer?: number | null }) => {
      const parsedUntilDate = options?.untilDate ? new Date(options.untilDate) : null;
      const hasValidUntilDate = Boolean(parsedUntilDate && !Number.isNaN(parsedUntilDate.getTime()) && parsedUntilDate > now);
      const preferencePaydayDate = adviserPreferences.paydayDay ? getNextPaydayDate(now, adviserPreferences.paydayDay) : null;
      const defaultHorizonDays = preferencePaydayDate
        ? Math.max(1, Math.ceil((preferencePaydayDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
        : 14;
      const requestedHorizonDays = hasValidUntilDate
        ? Math.ceil((parsedUntilDate!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        : Number(options?.horizonDays ?? defaultHorizonDays);
      const horizonDays = Math.max(1, Math.min(90, Math.round(Number.isFinite(requestedHorizonDays) ? requestedHorizonDays : defaultHorizonDays)));
      const horizonEnd = new Date(now);
      horizonEnd.setDate(horizonEnd.getDate() + horizonDays);
      const upcomingRecurring = recurringPatterns.filter(
        (pattern) => pattern.nextExpectedDate && pattern.nextExpectedDate >= now && pattern.nextExpectedDate <= horizonEnd
      );
      const upcomingCommitments = financialCommitments.filter((commitment) => {
        const dueDate = commitment.nextDueDate ?? commitment.dueDate;
        return dueDate && dueDate >= now && dueDate <= horizonEnd;
      });
      const recurringReserve = upcomingRecurring.reduce((sum, item) => sum + Math.abs(Number(item.amount ?? 0)), 0);
      const commitmentReserve = upcomingCommitments.reduce((sum, item) => sum + Math.abs(Number(item.amount ?? 0)), 0);
      const plannedPayments = plannedPaymentSuggestions.filter((payment) => {
        if (!payment.dueDate || payment.sourceKind === "recurring_transaction") {
          return false;
        }
        const dueDate = new Date(payment.dueDate);
        if (Number.isNaN(dueDate.getTime()) || dueDate < now || dueDate > horizonEnd) {
          return false;
        }

        const paymentAmount = Math.abs(Number(payment.amount ?? 0));
        const matchesKnownCommitment = upcomingCommitments.some((commitment) => {
          const commitmentDate = commitment.nextDueDate ?? commitment.dueDate;
          return commitmentDate &&
            Math.abs(commitmentDate.getTime() - dueDate.getTime()) <= 3 * 24 * 60 * 60 * 1000 &&
            Math.abs(Math.abs(Number(commitment.amount ?? 0)) - paymentAmount) < 0.01;
        });
        return !matchesKnownCommitment;
      });
      const plannedPaymentReserve = plannedPayments.reduce((sum, item) => sum + Math.abs(Number(item.amount ?? 0)), 0);
      const everydaySpendingBuffer = Math.max(0, baselineSpend) * (horizonDays / 30);
      const goalContribution = goalProgress.targetAmount && goalProgress.targetAmount > 0
        ? goalProgress.targetAmount * (horizonDays / 30)
        : 0;
      const enteredBuffer = Number(options?.additionalBuffer ?? adviserPreferences.preferredBuffer ?? 0);
      const additionalBuffer = Number.isFinite(enteredBuffer) && enteredBuffer > 0 ? enteredBuffer : 0;
      const knownObligations = recurringReserve + commitmentReserve + plannedPaymentReserve + openSplitBillAmount;
      const recommendedBuffer = everydaySpendingBuffer + goalContribution + additionalBuffer;
      const enteredIncome = Number(options?.expectedIncome ?? 0);
      const expectedIncomeIncluded = Number.isFinite(enteredIncome) && enteredIncome > 0 ? enteredIncome : 0;
      const roomAfterProtection = spendableAccountBalance + expectedIncomeIncluded - knownObligations - recommendedBuffer;
      const safeToSpend = Math.max(0, roomAfterProtection);
      const freshnessScore = dataFreshnessLabel.toLowerCase().includes("stale") ? 45 : 85;
      const safeToSpendConfidenceScore = Math.round(
        average([
          accountCoverageScore,
          currentTransactionConfidence,
          baselineSpend > 0 ? 82 : 32,
          currencyCandidates.size > 1 ? 55 : 90,
          freshnessScore,
        ])
      );
      const safeToSpendConfidence = safeToSpendConfidenceScore >= 75 ? "high" : safeToSpendConfidenceScore >= 55 ? "medium" : "low";

      return {
        horizonDays,
        asOf: now.toISOString(),
        through: horizonEnd.toISOString(),
        untilDateUsed: hasValidUntilDate,
        paydayPreferenceUsed: !hasValidUntilDate && !options?.horizonDays && Boolean(preferencePaydayDate),
        currency: displayCurrency,
        availableCash: spendableAccountBalance,
        expectedIncome: expectedIncomeIncluded,
        expectedIncomeIncluded: expectedIncomeIncluded > 0,
        reservedForBills: recurringReserve + commitmentReserve,
        reservedForPlannedPayments: plannedPaymentReserve,
        reservedForSharedExpenses: openSplitBillAmount,
        recommendedBuffer,
        everydaySpendingBuffer,
        goalContribution,
        additionalBuffer,
        knownObligations,
        safeToSpend,
        safeToSpendPerDay: safeToSpend / horizonDays,
        safeToSpendPerWeek: safeToSpend * (7 / horizonDays),
        safeToSpendPerWeekend: safeToSpend * (2 / horizonDays),
        roomAfterProtection,
        status: roomAfterProtection >= 0 ? "room_available" : "protect_cash_first",
        confidence: {
          score: safeToSpendConfidenceScore,
          label: safeToSpendConfidence,
        },
        dataCoverage: {
          accountCount: workspace.accounts.length,
          analyzedAccountCount: accountAnalysisAccounts.length,
          transactionCount: allTransactions.length,
          historyDays: historySpanDays,
          recurringPatternCount: recurringPatterns.length,
          plannedPaymentCount: plannedPaymentSuggestions.length,
          currency: displayCurrency,
          multipleCurrenciesDetected: currencyCandidates.size > 1,
        },
        details: {
          recurring: upcomingRecurring.map((item) => ({
            label: item.merchantClean ?? item.merchantRaw,
            amount: Math.abs(Number(item.amount ?? 0)),
            due: item.nextExpectedDate?.toISOString() ?? null,
          })),
          commitments: upcomingCommitments.map((item) => ({
            label: item.title,
            amount: Math.abs(Number(item.amount ?? 0)),
            due: (item.nextDueDate ?? item.dueDate)?.toISOString() ?? null,
          })),
          plannedPayments: plannedPayments.map((item) => ({
            label: item.title,
            amount: Math.abs(Number(item.amount ?? 0)),
            due: item.dueDate,
            source: item.sourceKind,
          })),
          openSplitBillCount,
          openSplitBillAmount,
          goal: goalValue,
          goalStatus: goalProgressLabel,
        },
        caveats: [
          expectedIncomeIncluded > 0 ? "The result includes the income amount supplied in the question." : "Expected income is not included because Clover does not have a confirmed payday amount.",
          "The buffer is based on the user's historical spending baseline and active goal target when available.",
          plannedPayments.length > 0 ? "Planned statement payments and installments are included when Clover has a due date." : null,
          baselineSpend <= 0 ? "Clover does not have enough spending history to estimate an everyday spending buffer." : null,
          additionalBuffer > 0
            ? options?.additionalBuffer === undefined || options.additionalBuffer === null
              ? "The recommended buffer includes your saved preferred buffer."
              : "The recommended buffer includes the extra amount requested in the question."
            : null,
          !hasValidUntilDate && !options?.horizonDays && preferencePaydayDate ? `The planning window uses your saved payday preference (${adviserPreferences.paydayDay}th).` : null,
          currencyCandidates.size > 1 ? `Only ${displayCurrency} accounts are included; Clover detected multiple currencies.` : null,
          accountAnalysisAccounts.length === 0 ? `Clover could not find a ${displayCurrency} cash account balance to use.` : null,
          openSplitBillCount > 0 ? "Open split bills are reserved in full because their settlement timing is not confirmed." : null,
          dataFreshnessLabel.toLowerCase().includes("stale") ? `The latest transaction data is ${dataFreshnessLabel.toLowerCase()}.` : null,
        ].filter((caveat): caveat is string => Boolean(caveat)),
        freshness: dataFreshnessLabel,
      };
    };
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
      `Income timing signal: ${incomeTimingConfidence}; cadence ${incomeCadence}; median amount ${medianIncomeAmount > 0 ? formatCurrency(medianIncomeAmount, displayCurrency) : "N/A"}; estimated next date ${estimatedNextIncomeDate ? toShortDateLabel(estimatedNextIncomeDate) : "unconfirmed"}`,
      `Savings rate: ${currentSavingsRate === null ? "N/A" : formatPercent(currentSavingsRate * 100)}${baselineSavingsRate === null ? "" : `; baseline ${formatPercent(baselineSavingsRate * 100)}`}`,
      `Trend signals: spend ${monthlyExpenseTrend.direction > 0 ? "rising" : monthlyExpenseTrend.direction < 0 ? "easing" : "flat"} (${Math.round(monthlyExpenseTrend.score)}), income ${monthlyIncomeTrend.direction > 0 ? "rising" : monthlyIncomeTrend.direction < 0 ? "easing" : "flat"} (${Math.round(monthlyIncomeTrend.score)}), net ${monthlyNetTrend.direction > 0 ? "rising" : monthlyNetTrend.direction < 0 ? "easing" : "flat"} (${Math.round(monthlyNetTrend.score)})`,
      `Adviser themes: ${topThemeLine || "none"}`,
      `Adviser memory: ${adviserInteractions.length} interactions, ${adviserCompletionLogs.length} completion actions, follow-through rate ${formatPercent(adviserFollowThroughRate)}, cleanup affinity ${Math.round(userPreferenceAffinity.cleanup)}, cashflow affinity ${Math.round(userPreferenceAffinity.cashflow)}`,
      `Recent Adviser questions: ${recentAdviserQuestions.join(" | ") || "none"}`,
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
      `Planned payments: ${plannedPaymentSuggestions.slice(0, 12).map((item) => `${item.title}${item.dueDate ? ` (${item.dueDate.slice(0, 10)})` : ""}${item.amount ? ` ${formatCurrency(Number(item.amount), item.currency || displayCurrency)}` : ""}`).join("; ") || "none"}`,
      `Split bills open: ${openSplitBills.map((item) => `${item.title} (${formatCurrency(item.outstanding)})`).join("; ") || "none"}`,
      `Latest investment snapshot: ${latestInvestmentSnapshot ? `${formatCurrency(Number(latestInvestmentSnapshot.totalValue ?? 0), latestInvestmentSnapshot.currency)}${investmentDelta === null ? "" : `, change ${formatSignedCurrency(investmentDelta, latestInvestmentSnapshot.currency)}`}` : "none"}`,
      `Liquid balance: ${formatCurrency(liquidBalance, displayCurrency)}`,
      `Account concentration: ${largestAccountBalance && largestAccountBalance.name ? `${largestAccountBalance.name} ${formatPercent(largestAccountShare * 100)}` : "none"}`,
      `Goal: ${goalValue ?? "none"} (${goalProgress.bandLabel})`,
      `Active budgets: ${budgets.map((budget) => `${budget.name} ${formatCurrency(Number(budget.targetAmount), budget.currency)}${budget.category?.name ? ` for ${budget.category.name}` : ""}`).join("; ") || "none"}`,
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
      "When the user asks whether they can afford a named purchase with a price, use check_affordability. If the user mentions travel, a future month, or a date by which the purchase must be affordable, pass the stated horizon or untilDate instead of using the default. If the user provides expected income or an extra cash buffer, pass those too.",
      "When the user asks how much they can safely spend, how much room they have until payday, or what is safe to spend, use calculate_safe_to_spend. Explain available cash, protected obligations, recommended buffer, safe amount, and confidence separately. If payday income is not confirmed, do not invent it. If the user gives a payday/date, pass it as untilDate; if they give expected income, pass it as expectedIncome; if they specify an extra cash buffer, pass it as additionalBuffer. Mention when the calculation is limited to one currency or based on stale or thin data.",
      "When the user asks when income or salary may arrive, or whether Clover can see a payday pattern, use get_income_outlook. Treat the result as an unconfirmed historical pattern and never include it in Safe-to-Spend unless the user confirms the expected amount.",
      "When the user asks Clover to remember their payday day or preferred cash buffer, use prepare_write_action with set_adviser_preferences and wait for confirmation. These preferences are planning settings, not financial records.",
      "When the user asks about account balances, connected accounts, or where their money is held, use get_account_summary.",
      "When the user asks what changed, what is new, or what deserves attention since their last check, use get_adviser_changes.",
      "When the user asks about goal progress, use get_goal_progress.",
      "When the user asks to find, explain, or review transactions, use find_transactions.",
      "When the user asks about bills, cash-flow pressure, or split bills, use get_cashflow_outlook or get_split_bill_status.",
      "When the user asks about investments, use get_investment_summary before giving educational context.",
      "When the user asks about budgets or whether spending is within a limit, use get_budget_status.",
      "When the user asks how much they could invest, use estimate_investment_contribution and explain that it is a conservative planning range, not a security recommendation.",
      "When the user asks what they should invest in or asks for personalized investment advice, use get_investment_readiness first. Explain what suitability information is still needed before discussing options.",
      "When the user asks about duplicate, uncategorized, or review-needed transactions, use find_data_quality_issues.",
      "When the user asks Clover to add or edit a record, use prepare_write_action and wait for confirmation; never describe a proposed write as completed. Supported writes include goals, budgets, Adviser planning preferences, transactions, accounts, investments, and split bills.",
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
      question: latestQuestion,
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
    const grounding = {
      accountCount: workspace.accounts.length,
      transactionCount: allTransactions.length,
      historyThrough: analysisAnchorDate.toISOString(),
      recurringCount: recurringPatterns.length,
      budgetCount: budgets.length,
      investmentSnapshotAvailable: Boolean(latestInvestmentSnapshot),
    };
    const usageForResponse = () => ({
      plan: user.planTier,
      used: usageCount + 1,
      limit,
      remaining: Math.max(0, limit - usageCount - 1),
      resetsAt: resetsAt.toISOString(),
    }) satisfies AdviserUsage;
    if (!env.OPENAI_API_KEY) {
      return NextResponse.json({ reply: fallbackReply, actions: [], usage: usageForResponse(), grounding, degraded: true });
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
            horizonDays: { type: ["number", "null"], description: "Number of days to protect when the purchase is for a stated future window." },
            untilDate: { type: ["string", "null"], description: "The future date by which the purchase or trip must be affordable, in ISO format." },
            expectedIncome: { type: ["number", "null"], description: "Expected income only when the user explicitly provides a reliable amount for the period." },
            additionalBuffer: { type: ["number", "null"], description: "An extra cash buffer amount only when the user explicitly requests one." },
          },
          required: ["itemName", "price", "horizonDays", "untilDate", "expectedIncome", "additionalBuffer"],
          additionalProperties: false,
        },
      },
      {
        type: "function",
        name: "calculate_safe_to_spend",
        description: "Calculate a transparent safe-to-spend amount after protecting known bills, planned statement payments, installments, unsettled shared expenses, everyday spending, and active goal contributions. Use for questions about safe spending, room until payday, discretionary cash, weekend limits, or travel planning. Do not invent expected income.",
        parameters: {
          type: "object",
          properties: {
            horizonDays: { type: ["number", "null"], description: "Number of days to protect. Use 14 when the user asks generally, or infer a stated time window. Keep between 1 and 90." },
            untilDate: { type: ["string", "null"], description: "The user's stated future date or payday in ISO format when one is provided." },
            expectedIncome: { type: ["number", "null"], description: "Expected income only when the user explicitly provides a reliable amount for the period." },
            additionalBuffer: { type: ["number", "null"], description: "An extra cash buffer amount only when the user explicitly requests one." },
          },
          required: ["horizonDays", "untilDate", "expectedIncome", "additionalBuffer"],
          additionalProperties: false,
        },
      },
      {
        type: "function",
        name: "get_account_summary",
        description: "Read reconciled balances and basic details for the user's connected Clover accounts.",
        parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
      },
      {
        type: "function",
        name: "get_income_outlook",
        description: "Read historical income timing and estimate a possible cadence and next date without treating it as confirmed future income. Use for payday or salary timing questions.",
        parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
      },
      {
        type: "function",
        name: "get_adviser_changes",
        description: "Compare the user's latest available financial window with the previous window and summarize what changed since their last Adviser interaction.",
        parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
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
        name: "get_budget_status",
        description: "Compare active Clover budgets with current-period spending. Use for questions about budget progress, overspending, or remaining room.",
        parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
      },
      {
        type: "function",
        name: "estimate_investment_contribution",
        description: "Estimate a conservative monthly amount the user might be able to set aside for investing after known obligations and a spending reserve. Do not recommend specific securities.",
        parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
      },
      {
        type: "function",
        name: "get_investment_readiness",
        description: "Assess whether Clover has enough context for educational investment planning. Never select a security or make a personalized recommendation.",
        parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
      },
      {
        type: "function",
        name: "find_data_quality_issues",
        description: "Check Clover transaction history for likely duplicate transactions and uncategorized records that may need review.",
        parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
      },
      {
        type: "function",
        name: "prepare_write_action",
        description: "Prepare a confirmation card for a user-requested manual write or planning preference. Never execute it. Supported action types are set_goal, set_adviser_preferences, create_budget, create_transaction, edit_transaction, create_account, create_investment, edit_account, edit_investment, and create_split_bill.",
        parameters: {
          type: "object",
          properties: {
            actionType: { type: "string", enum: ["set_goal", "set_adviser_preferences", "create_budget", "create_transaction", "edit_transaction", "create_account", "create_investment", "edit_account", "edit_investment", "create_split_bill"] },
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let response: Response;
      try {
        response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, temperature: 0.2, max_output_tokens: 900, tools, input: modelInput }),
          signal: controller.signal,
        });
      } catch (error) {
        console.error("Adviser model request failed", error instanceof Error ? error.message : error);
        return NextResponse.json({ reply: fallbackReply, actions, usage: usageForResponse(), grounding, degraded: true });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        console.error("Adviser model request returned an error", response.status);
        return NextResponse.json({ reply: fallbackReply, actions, usage: usageForResponse(), grounding, degraded: true });
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
        } else if (call.name === "calculate_safe_to_spend") {
          result = calculateSafeToSpend({
            horizonDays: typeof args.horizonDays === "number" ? args.horizonDays : null,
            untilDate: typeof args.untilDate === "string" ? args.untilDate : null,
            expectedIncome: typeof args.expectedIncome === "number" ? args.expectedIncome : null,
            additionalBuffer: typeof args.additionalBuffer === "number" ? args.additionalBuffer : null,
          });
        } else if (call.name === "check_affordability") {
          const price = Number(args.price ?? 0);
          const safeToSpend = calculateSafeToSpend({
            horizonDays: typeof args.horizonDays === "number" ? args.horizonDays : 14,
            untilDate: typeof args.untilDate === "string" ? args.untilDate : null,
            expectedIncome: typeof args.expectedIncome === "number" ? args.expectedIncome : null,
            additionalBuffer: typeof args.additionalBuffer === "number" ? args.additionalBuffer : null,
          });
          const roomAfterPurchase = safeToSpend.roomAfterProtection - price;
          result = {
            itemName: args.itemName ?? "purchase",
            price,
            ...safeToSpend,
            roomAfterPurchase,
            status: roomAfterPurchase >= 0 ? "fits_after_reserve" : "would_reduce_reserve",
          };
        } else if (call.name === "get_income_outlook") {
          result = {
            cadence: incomeCadence,
            confidence: incomeTimingConfidence,
            observedIncomeEvents: recentIncomeHistory.length,
            medianAmount: medianIncomeAmount,
            lastIncomeDate: recentIncomeHistory[recentIncomeHistory.length - 1]?.date.toISOString() ?? null,
            estimatedNextIncomeDate: estimatedNextIncomeDate?.toISOString() ?? null,
            guidance: estimatedNextIncomeDate
              ? "This is an unconfirmed pattern from historical transactions. Confirm the expected amount and date before including it in Safe-to-Spend."
              : "Clover does not have a consistent enough income pattern to estimate a payday confidently.",
            includedInSafeToSpend: false,
          };
        } else if (call.name === "get_account_summary") {
          const accounts = chatAccounts.map((account) => ({
            id: account.id,
            name: account.name,
            type: account.type,
            currency: account.currency,
            balance: account.balance,
          }));
          result = {
            accounts,
            accountCount: accounts.length,
            availableCash: spendableAccountBalance,
            liquidBalance,
            balancesOwed: liabilityAccountBalance,
            freshness: dataFreshnessLabel,
            href: "/accounts",
          };
          actions.push({ id: `accounts-${actions.length + 1}`, kind: "navigate", type: "open_accounts", label: "Open Accounts", description: "Review account balances and connected accounts in Clover.", href: "/accounts" });
        } else if (call.name === "get_adviser_changes") {
          const lastInteraction = adviserInteractions.find((interaction) => interaction.action !== "adviser.chat_asked")?.createdAt ?? null;
          const transactionsSinceLastCheck = lastInteraction
            ? allTransactions.filter((transaction) => transaction.date > lastInteraction).length
            : null;
          result = {
            lastAdviserCheck: lastInteraction?.toISOString() ?? null,
            transactionsSinceLastCheck,
            latestWindow: {
              label: currentWindowLabel,
              income: currentSummary.income,
              spending: currentSpend,
              net: currentNet,
              topCategory: topCategoryName,
            },
            previousWindow: {
              label: previousWindowLabel,
              income: previousSummary.income,
              spending: previousSpend,
              net: previousNet,
            },
            changes: {
              spending: previousSpend > 0 ? ((currentSpend - previousSpend) / previousSpend) * 100 : null,
              income: previousSummary.income > 0 ? ((currentSummary.income - previousSummary.income) / previousSummary.income) * 100 : null,
              savingsRate: currentSavingsRate,
            },
            strongestSignal: explainabilityBundle[0] ?? null,
          };
          actions.push({ id: `changes-${actions.length + 1}`, kind: "navigate", type: "open_changes_report", label: "Review recent changes", description: "Open Reports to inspect the latest spending and income movement.", href: "/reports?range=30d&section=trends" });
        } else if (call.name === "get_goal_progress") {
          result = {
            goal: goalLabel,
            goalSet: Boolean(goalValue),
            status: goalProgressLabel,
            targetAmount: goalTargetAmount,
            progress: goalProgress,
            nextStep: goalValue ? "Review the goal's progress and update its target if needed." : "Set a goal in Clover before measuring progress.",
          };
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
        } else if (call.name === "get_budget_status") {
          const budgetStatuses = budgets.map((budget) => {
            const categoryName = budget.category?.name ?? null;
            const spent = categoryName
              ? currentSummary.expenseCategories.get(categoryName) ?? 0
              : currentSummary.expense;
            const target = Number(budget.targetAmount);
            return {
              name: budget.name,
              category: categoryName,
              cadence: budget.cadence,
              target,
              spent,
              remaining: target - spent,
              percentUsed: target > 0 ? (spent / target) * 100 : null,
              status: target > 0 && spent > target ? "over_limit" : "within_limit",
            };
          });
          result = { period: currentWindowLabel, budgets: budgetStatuses, href: "/budgeting" };
          actions.push({ id: `budget-${actions.length + 1}`, kind: "navigate", type: "open_budgeting", label: "Review budgets", description: "Open Budgeting to adjust limits or review spending.", href: "/budgeting" });
        } else if (call.name === "estimate_investment_contribution") {
          const monthlySurplus = Math.max(0, longTermAverageNet);
          const knownPressure = recurringDueSoon.reduce((sum, item) => sum + item.amount, 0) + commitmentsDueSoon.reduce((sum, item) => sum + item.amount, 0) + openSplitBillAmount;
          const reserveTarget = Math.max(0, baselineSpend) + knownPressure;
          const reserveGap = Math.max(0, reserveTarget - spendableAccountBalance);
          const monthlyLow = reserveGap > 0 ? 0 : monthlySurplus * 0.1;
          const monthlyHigh = reserveGap > 0 ? 0 : monthlySurplus * 0.2;
          result = {
            monthlySurplus,
            reserveTarget,
            availableCash: spendableAccountBalance,
            reserveGap,
            suggestedMonthlyRange: { low: monthlyLow, high: monthlyHigh },
            guidance: reserveGap > 0
              ? "Build the cash reserve first; there is not enough room above the current reserve target for a confident contribution estimate."
              : "This is a conservative planning range based on historical surplus, not personalized investment advice or a recommendation for a specific security.",
            href: "/investments",
          };
          actions.push({ id: `investment-plan-${actions.length + 1}`, kind: "navigate", type: "open_investment_plan", label: "Review Investments", description: "Review investment accounts and decide on a contribution that fits your plan.", href: "/investments" });
        } else if (call.name === "get_investment_readiness") {
          const reserveReady = spendableAccountBalance >= Math.max(0, baselineSpend);
          const surplusReady = longTermAverageNet > 0;
          const hasInvestmentData = Boolean(latestInvestmentSnapshot);
          result = {
            readiness: reserveReady && surplusReady ? "planning_context_available" : "build_context_first",
            signals: {
              reserveReady,
              positiveHistoricalSurplus: surplusReady,
              existingInvestmentData: hasInvestmentData,
              latestInvestmentSnapshot: latestInvestmentSnapshot?.snapshotDate?.toISOString() ?? null,
            },
            missingSuitabilityContext: [
              "time horizon",
              "comfort with losses and volatility",
              "near-term cash needs",
              "emergency-fund preference",
            ],
            guidance: "Clover can explain investment concepts and compare options at a high level, but it should not choose a security or give personalized investment advice without suitability details.",
            href: "/investments",
          };
          actions.push({ id: `investment-readiness-${actions.length + 1}`, kind: "navigate", type: "open_investment_readiness", label: "Review Investments", description: "Review your investment context before choosing an approach.", href: "/investments" });
        } else if (call.name === "find_data_quality_issues") {
          const duplicateGroups = new Map<string, typeof allTransactions>();
          for (const transaction of allTransactions) {
            const merchant = (transaction.merchantClean ?? transaction.merchantRaw ?? transaction.description ?? "").trim().toLowerCase();
            const key = [transaction.date.toISOString().slice(0, 10), transaction.account.name, transaction.type, Math.abs(Number(transaction.amount)).toFixed(2), merchant].join("|");
            const group = duplicateGroups.get(key) ?? [];
            group.push(transaction);
            duplicateGroups.set(key, group);
          }
          const likelyDuplicates = Array.from(duplicateGroups.values())
            .filter((group) => group.length > 1)
            .slice(0, 10)
            .map((group) => ({
              count: group.length,
              date: group[0].date.toISOString(),
              merchant: group[0].merchantClean ?? group[0].merchantRaw ?? group[0].description,
              amount: Math.abs(Number(group[0].amount)),
              account: group[0].account.name,
              transactionIds: group.map((transaction) => transaction.id),
            }));
          const uncategorized = allTransactions.filter((transaction) => !transaction.category?.name).length;
          result = { likelyDuplicates, duplicateGroupCount: likelyDuplicates.length, uncategorizedCount: uncategorized, href: "/transactions" };
          actions.push({ id: `quality-${actions.length + 1}`, kind: "navigate", type: "open_data_quality", label: "Review transactions", description: "Open Transactions to confirm duplicates and fill in missing categories.", href: "/transactions" });
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
    if (streamRequested) {
      const encoder = new TextEncoder();
      let upstreamResponse: Response | null = null;
      try {
        upstreamResponse = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, stream: true, temperature: 0.2, max_output_tokens: 900, tools: [], input: modelInput }),
        });
      } catch (error) {
        console.error("Adviser upstream stream failed", error instanceof Error ? error.message : error);
      }

      const responseStream = upstreamResponse?.ok && upstreamResponse.body
        ? new ReadableStream<Uint8Array>({
            async start(controller) {
              const reader = upstreamResponse.body!.getReader();
              const decoder = new TextDecoder();
              let buffer = "";
              try {
                while (true) {
                  const { value, done } = await reader.read();
                  buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
                  const events = buffer.split("\n\n");
                  buffer = events.pop() ?? "";
                  for (const event of events) {
                    const dataLine = event.split("\n").find((line) => line.startsWith("data: "));
                    if (!dataLine || dataLine.slice(6).trim() === "[DONE]") continue;
                    try {
                      const data = JSON.parse(dataLine.slice(6)) as { type?: string; delta?: string };
                      if (data.type === "response.output_text.delta" && data.delta) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "delta", text: data.delta })}\n\n`));
                      }
                    } catch {
                      // Ignore provider keep-alive events that are not JSON.
                    }
                  }
                  if (done) break;
                }
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "complete", usage: usageForResponse(), actions, grounding })}\n\n`));
                controller.close();
              } catch (error) {
                console.error("Adviser upstream stream read failed", error instanceof Error ? error.message : error);
                controller.error(error);
              }
            },
          })
        : new ReadableStream<Uint8Array>({
            start(controller) {
              const chunks = reply.match(/.{1,28}(?:\s+|$)/g) ?? [reply];
              let index = 0;
              const emit = () => {
                if (index >= chunks.length) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "complete", usage: usageForResponse(), actions, grounding })}\n\n`));
                  controller.close();
                  return;
                }
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "delta", text: chunks[index] })}\n\n`));
                index += 1;
                setTimeout(emit, 12);
              };
              emit();
            },
          });
      return new Response(responseStream, {
        headers: {
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "Content-Type": "text/event-stream; charset=utf-8",
        },
      });
    }
    return NextResponse.json({ reply, actions, usage: usageForResponse(), grounding });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate an Adviser response.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
