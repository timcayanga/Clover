import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";
import { RouteSplash } from "@/components/route-splash";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";
import { formatCurrencyAmount, formatCurrencyCode } from "@/lib/currency-format";
import { getGoalProgressSnapshot, normalizeGoalPlan, type GoalKey } from "@/lib/goals";
import { loadSplitBillWorkspaceData } from "@/lib/split-bill-loaders";
import { AdviserChat } from "@/components/adviser-chat";
import { AdviserTrackedLink } from "@/components/adviser-tracked-link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Adviser",
};

type AdviserTransaction = {
  id: string;
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

type WorkspaceAccount = {
  name: string;
  type: string;
  currency: string | null;
  balance: number | null;
  investmentSubtype: string | null;
  investmentSymbol: string | null;
  investmentCostBasis: number | null;
  investmentPrincipal: number | null;
  investmentStartDate: Date | null;
  investmentMaturityDate: Date | null;
  investmentInterestRate: number | null;
  investmentMaturityValue: number | null;
};

type AdviserCard = {
  id: string;
  title: string;
  summary: string;
  evidence: string;
  ctaLabel: string;
  href: string;
  tone: "positive" | "warning" | "neutral";
};

type AdviserPrompt = {
  id: string;
  label: string;
  prompt: string;
};

type ScoreFactors = {
  impact: number;
  urgency: number;
  confidence: number;
  personalization: number;
  recency: number;
  actionability: number;
};

type ScoreWeights = ScoreFactors;

type RankedAdviserCard = AdviserCard & {
  group: string;
  diversityKey?: string;
  breakdown: ScoreFactors;
  score: number;
};

type RankedAdviserPrompt = AdviserPrompt & {
  group: string;
  diversityKey?: string;
  breakdown: ScoreFactors;
  score: number;
};

type AdviserAuditMetadata = {
  kind?: "card" | "prompt";
  group?: string;
  itemId?: string;
  label?: string;
  href?: string;
  pathname?: string;
};

const selectedWorkspaceCookieKey = selectedWorkspaceKey;

const monthFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  year: "numeric",
});

const formatCurrency = (value: number, currency?: string | null) => formatCurrencyAmount(value, currency ?? "MIXED");
const formatSignedCurrency = (value: number, currency?: string | null) =>
  `${value < 0 ? "-" : ""}${formatCurrencyAmount(Math.abs(value), currency ?? "MIXED")}`;
const formatPercent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(0)}%`;
const toIsoMonth = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const toMonthLabel = (date: Date) => monthFormatter.format(date);
const normalizeMerchant = (value: string) => value.trim().toLowerCase();
const buildTransactionsHref = (params: Record<string, string>) => `/transactions?${new URLSearchParams(params).toString()}`;
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const average = (values: number[]) => (values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
const toCountScore = (count: number, maxCount = 5) => clamp((count / maxCount) * 100);
const daysBetween = (left: Date, right: Date) => Math.max(1, Math.ceil((left.getTime() - right.getTime()) / (1000 * 60 * 60 * 24)));

const scoreCandidate = (factors: ScoreFactors, weights: ScoreWeights) =>
  Math.round(
    factors.impact * weights.impact +
      factors.urgency * weights.urgency +
      factors.confidence * weights.confidence +
      factors.personalization * weights.personalization +
      factors.recency * weights.recency +
      factors.actionability * weights.actionability
  );

const scorePromptCandidate = (factors: ScoreFactors, weights: ScoreWeights) => scoreCandidate(factors, weights);

const selectTopRanked = <T extends { score: number; group: string; diversityKey?: string }>(items: T[], limit: number) => {
  const sorted = [...items].sort((left, right) => right.score - left.score);
  const selected: T[] = [];
  const usedGroups = new Set<string>();

  for (const item of sorted) {
    if (selected.length >= limit) {
      break;
    }

    const key = item.diversityKey ?? item.group;
    if (!usedGroups.has(key)) {
      selected.push(item);
      usedGroups.add(key);
    }
  }

  if (selected.length < limit) {
    for (const item of sorted) {
      if (selected.length >= limit) {
        break;
      }

      if (!selected.includes(item)) {
        selected.push(item);
      }
    }
  }

  return selected.slice(0, limit);
};

type AdviserMemoryStats = {
  count: number;
  outcomes: number;
  lastSeenAt: Date;
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
  tone: AdviserCard["tone"];
  score: number;
};

type AdviserAnomalySignal = {
  title: string;
  summary: string;
  evidence: string;
  tone: AdviserCard["tone"];
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

const InfoIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <path d="M8 4.3a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Zm-1 3.2h1a.6.6 0 0 1 .6.6v3.2H9a.6.6 0 0 1 0 1.2H7a.6.6 0 0 1 0-1.2h.4V8.7h-.4a.6.6 0 0 1 0-1.2Z" fill="currentColor" />
  </svg>
);

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

  const daysSinceSeen = daysBetween(now, stats.lastSeenAt);
  const followThroughLift = stats.count > 0 ? (stats.outcomes / stats.count) * 10 : stats.outcomes * 3;
  return clamp(12 + stats.count * 3 + followThroughLift - Math.min(daysSinceSeen, 45) * 0.35, 0, 28);
};

const completionBoostFromStats = (stats: AdviserMemoryStats | undefined) => {
  if (!stats) {
    return 0;
  }

  if (stats.count <= 0) {
    return clamp(stats.outcomes * 3, 0, 14);
  }

  return clamp((stats.outcomes / stats.count) * 14 + stats.outcomes * 2, 0, 18);
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
    const ageDays = daysBetween(now, interaction.createdAt);
    const recencyWeight = clamp(1 - ageDays / 180, 0.25, 1);
    const groupOutcome = adviserOutcomeByGroup.get(group);
    const itemOutcome = itemId ? adviserOutcomeByItem.get(itemId) : undefined;
    const completionLift = completionBoostFromStats(groupOutcome) + completionBoostFromStats(itemOutcome);
    const memoryLift = memoryBoostFromStats(groupOutcome, now) + memoryBoostFromStats(itemOutcome, now);

    scores[theme] += recencyWeight * (1 + (completionLift + memoryLift) / 40);
  }

  const maxScore = Math.max(...Object.values(scores), 1);
  return Object.fromEntries(
    Object.entries(scores).map(([theme, score]) => [theme, clamp((score / maxScore) * 100)])
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
  const projectedRisk = clamp(
    average([
      currentSavingsRate !== null && currentSavingsRate < 0 ? 92 : 36,
      knownPressure > 0 ? clamp((knownPressure / Math.max(liquidBalance + knownPressure, 1)) * 100 + 20) : 18,
      liquidBalance < baselineSpend * 0.4 ? 88 : liquidBalance < baselineSpend * 0.8 ? 62 : 25,
      monthlyExpenseTrend.direction > 0 ? 60 + monthlyExpenseTrend.score * 0.3 : 28,
      spendDelta !== null && spendDelta > 0 ? clamp(50 + spendDelta * 1.1) : 28,
    ])
  );

  if (projectedRisk < 40 && knownPressure <= 0 && (spendDelta === null || spendDelta <= 0)) {
    return null;
  }

  const summary =
    knownPressure > 0
      ? `Known obligations add ${formatCurrency(knownPressure)} of pressure against your current balance and spending pattern.`
      : `Your current spend trend suggests ${formatCurrency(Math.abs(projectedNet))} of net pressure if the pattern continues.`;

  const evidence =
    `Projected net after known obligations: ${formatSignedCurrency(projectedNet)}`
    + ` · liquid balance ${formatCurrency(liquidBalance)}`
    + ` · risk score ${Math.round(projectedRisk)}/100`;

  return {
    title: projectedRisk >= 70 ? "Cash flow forecast" : "Upcoming pressure",
    summary,
    evidence,
    tone: projectedRisk >= 70 ? "warning" : "neutral",
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
  const spendSpikeScore = spendDelta !== null && spendDelta > thresholdProfile.spendSpikePercent ? clamp(55 + spendDelta * 1.7) : 0;
  const incomeDropScore = incomeDelta !== null && incomeDelta < -thresholdProfile.incomeDropPercent ? clamp(55 + Math.abs(incomeDelta) * 1.5) : 0;
  const concentrationScore = topCategoryShare > thresholdProfile.concentrationShare ? clamp(50 + topCategoryShare * 90) : 0;
  const anomalyScore = Math.max(spendSpikeScore, incomeDropScore, concentrationScore);

  if (anomalyScore < 45) {
    return null;
  }

  if (spendSpikeScore >= incomeDropScore && spendSpikeScore >= concentrationScore) {
    return {
      title: "Unusual spend spike",
      summary: "This month’s spending is moving faster than your own baseline.",
      evidence: `${formatCurrency(currentSpend)} this period vs ${formatCurrency(baselineSpend)} baseline`,
      tone: "warning",
      score: clamp(average([spendSpikeScore, currentPatternConfidence, currentTransactionConfidence])),
    };
  }

  if (incomeDropScore >= concentrationScore) {
    return {
      title: "Income dip detected",
      summary: "Your current income is running below the baseline we can see in your history.",
      evidence: `${formatCurrency(currentIncome)} this period vs ${formatCurrency(baselineIncome)} baseline`,
      tone: "warning",
      score: clamp(average([incomeDropScore, currentTransactionConfidence, currentPatternConfidence])),
    };
  }

  return {
    title: "Category concentration",
    summary: "A small number of categories are dominating the expense mix right now.",
    evidence: topCategoryName
      ? `${topCategoryName} makes up ${formatPercent(topCategoryShare * 100)} of current expenses.`
      : `Top category share is ${formatPercent(topCategoryShare * 100)}.`,
    tone: "neutral",
    score: clamp(average([concentrationScore, currentPatternConfidence, currentTransactionConfidence])),
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
  const spendSpikePercent = clamp(9 + (params.historyDepthScore < 50 ? 4 : 1) + (params.weekendExpenseShare > 0.3 ? 3 : 0), 8, 24);
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
  baselineIncome: number;
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
          tone: "warning",
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
          tone: "neutral",
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
          tone: "warning",
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
          tone: "neutral",
          score: clamp(
            average([
              params.investmentDelta === null ? 45 : 55 + Math.min(35, Math.abs(params.investmentDelta) / Math.max(1, params.baselineSpend) * 10),
              params.monthlyIncomeTrend.score * 0.1,
            ])
          ),
      }
      : null,
  ];

  return signals
    .filter((signal): signal is AdviserForecastSignal => signal !== null)
    .sort((left, right) => right.score - left.score);
};

const buildFinancialPersona = (
  dominantTheme: AdviserThemeScore | undefined,
  secondaryTheme: AdviserThemeScore | undefined,
  userPreferenceAffinity: AdviserPreferenceProfile,
  forecastSignal: AdviserForecastSignal | null,
  anomalySignal: AdviserAnomalySignal | null,
  goalLabel: string | null,
  uncategorizedCount: number
): AdviserPersona => {
  const personaCandidates: Array<AdviserPersona & { rank: number }> = [
    {
      key: "cashflow",
      label: "Cash Flow Guardian",
      summary: forecastSignal
        ? "Keeps an eye on upcoming pressure, recurring obligations, and balance safety."
        : "Prioritizes balance safety, recurring pressure, and liquidity.",
      strength: userPreferenceAffinity.cashflow,
      rank: average([userPreferenceAffinity.cashflow, dominantTheme?.key === "cashflow" ? 90 : 35, forecastSignal ? forecastSignal.score : 35]),
    },
    {
      key: "goals",
      label: "Goal Builder",
      summary: goalLabel
        ? "Focuses on staying on track with a clear target and steady progress."
        : "Keeps long-term targets visible and encourages steady momentum.",
      strength: userPreferenceAffinity.goals,
      rank: average([userPreferenceAffinity.goals, dominantTheme?.key === "goals" ? 90 : 35, goalLabel ? 85 : 30]),
    },
    {
      key: "cleanup",
      label: "Cleanup Organizer",
      summary: uncategorizedCount > 0
        ? "Likes to tidy transaction data so the rest of the app stays trustworthy."
        : "Keeps the books clean and the signal quality high.",
      strength: userPreferenceAffinity.cleanup,
      rank: average([userPreferenceAffinity.cleanup, dominantTheme?.key === "cleanup" ? 90 : 35, uncategorizedCount > 0 ? 78 : 28]),
    },
    {
      key: "investments",
      label: "Portfolio Watcher",
      summary: anomalySignal
        ? "Pays attention to investment movement and account-level shifts."
        : "Keeps an eye on portfolio movement and longer-term value changes.",
      strength: userPreferenceAffinity.investments,
      rank: average([userPreferenceAffinity.investments, dominantTheme?.key === "investments" ? 90 : 35, anomalySignal ? anomalySignal.score : 35]),
    },
    {
      key: "behavior",
      label: "Habit Coach",
      summary: secondaryTheme?.key === "behavior"
        ? "Tracks spending patterns and nudges behavior change."
        : "Looks for repeated spending patterns and habit loops.",
      strength: userPreferenceAffinity.behavior,
      rank: average([userPreferenceAffinity.behavior, dominantTheme?.key === "behavior" ? 90 : 35, secondaryTheme?.key === "behavior" ? 70 : 30]),
    },
  ];

  const persona = personaCandidates.sort((left, right) => right.rank - left.rank)[0] ?? personaCandidates[0];
  return {
    key: persona.key,
    label: persona.label,
    summary: persona.summary,
    strength: clamp(persona.strength),
  };
};

const buildTransactionSummary = (transactions: AdviserTransaction[]) =>
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

const scoreTheme = (values: number[]) => clamp(average(values));

const buildMonthlySeries = (transactions: AdviserTransaction[]) => {
  const monthlyBuckets = new Map<string, { income: number; expense: number; net: number }>();

  for (const transaction of transactions) {
    const monthKey = toIsoMonth(transaction.date);
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
  const yMean = average(values);
  let numerator = 0;
  let denominator = 0;

  for (let index = 0; index < count; index += 1) {
    const x = index;
    const centeredX = x - xMean;
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
    score: clamp(magnitude * 180),
  };
};

const getTrailingAverage = (series: number[], months: number) => {
  const slice = series.slice(-months);
  return slice.length > 0 ? average(slice) : 0;
};

const getWeightedHistoricalBaseline = (series: Array<{ income: number; expense: number; net: number }>) => {
  const windows = [
    { months: 3, weight: 0.5 },
    { months: 6, weight: 0.3 },
    { months: 12, weight: 0.2 },
  ];

  const spendWeighted = windows.reduce((sum, window) => sum + getTrailingAverage(series.map((item) => item.expense), window.months) * window.weight, 0);
  const incomeWeighted = windows.reduce((sum, window) => sum + getTrailingAverage(series.map((item) => item.income), window.months) * window.weight, 0);
  const netWeighted = windows.reduce((sum, window) => sum + getTrailingAverage(series.map((item) => item.net), window.months) * window.weight, 0);
  const totalWeight = windows.reduce((sum, window) => sum + window.weight, 0);

  return {
    spend: totalWeight > 0 ? spendWeighted / totalWeight : 0,
    income: totalWeight > 0 ? incomeWeighted / totalWeight : 0,
    net: totalWeight > 0 ? netWeighted / totalWeight : 0,
  };
};

async function AdviserPageContent() {
  const now = new Date();
  const session = await getSessionContext();
  const existingUser = await prisma.user.findUnique({
    where: { clerkUserId: session.userId },
  });
  const user = existingUser ?? (await getOrCreateCurrentUser(session.userId));

  if (!hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }

  const cookieStore = await cookies();
  const selectedWorkspaceCookieId = cookieStore.get(selectedWorkspaceCookieKey)?.value ?? "";
  const workspaceInclude = {
    accounts: {
      select: {
        name: true,
        type: true,
        currency: true,
        balance: true,
        investmentSubtype: true,
        investmentSymbol: true,
        investmentCostBasis: true,
        investmentPrincipal: true,
        investmentStartDate: true,
        investmentMaturityDate: true,
        investmentInterestRate: true,
        investmentMaturityValue: true,
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
          include: workspaceInclude,
        })
      : null) ??
    (await prisma.workspace.findFirst({
      where: {
        user: {
          clerkUserId: user.clerkUserId,
        },
      },
      include: workspaceInclude,
      orderBy: { createdAt: "asc" },
    }));

  const resolvedWorkspace =
    selectedWorkspace ??
    (await ensureStarterWorkspace(user).then(async (starterWorkspace) => {
      const starterWorkspaceData = await prisma.workspace.findUnique({
        where: { id: starterWorkspace.id },
        include: workspaceInclude,
      });
      if (!starterWorkspaceData) {
        redirect("/dashboard");
      }
      return starterWorkspaceData;
    }));

  if (!resolvedWorkspace) {
    redirect("/dashboard");
  }

  const nextSevenDays = new Date(now);
  nextSevenDays.setDate(nextSevenDays.getDate() + 7);
  const nextFourteenDays = new Date(now);
  nextFourteenDays.setDate(nextFourteenDays.getDate() + 14);

  const [
    allTransactionsQuery,
    recurringPatterns,
    financialCommitments,
    goalHistoryRows,
    investmentSnapshots,
    splitBillWorkspaceData,
  ] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        workspaceId: resolvedWorkspace.id,
        isExcluded: false,
      },
      select: {
        id: true,
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
      where: {
        workspaceId: resolvedWorkspace.id,
      },
      orderBy: [{ nextExpectedDate: "asc" }, { lastSeenDate: "desc" }],
      take: 12,
    }),
    prisma.financialCommitment.findMany({
      where: {
        workspaceId: resolvedWorkspace.id,
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
        workspaceId: resolvedWorkspace.id,
      },
      orderBy: [{ snapshotDate: "desc" }, { updatedAt: "desc" }],
      take: 2,
      select: {
        id: true,
        snapshotDate: true,
        updatedAt: true,
        totalValue: true,
        costBasis: true,
        gainLossValue: true,
        gainLossPercent: true,
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

  const allTransactions = allTransactionsQuery as AdviserTransaction[];
  const workspaceAccounts = resolvedWorkspace.accounts.map((account) => ({
    name: account.name,
    type: account.type,
    currency: account.currency,
    balance: account.balance === null ? null : Number(account.balance),
    investmentSubtype: account.investmentSubtype,
    investmentSymbol: account.investmentSymbol,
    investmentCostBasis: account.investmentCostBasis === null ? null : Number(account.investmentCostBasis),
    investmentPrincipal: account.investmentPrincipal === null ? null : Number(account.investmentPrincipal),
    investmentStartDate: account.investmentStartDate,
    investmentMaturityDate: account.investmentMaturityDate,
    investmentInterestRate: account.investmentInterestRate === null ? null : Number(account.investmentInterestRate),
    investmentMaturityValue: account.investmentMaturityValue === null ? null : Number(account.investmentMaturityValue),
  })) satisfies WorkspaceAccount[];

  const adviserInteractions = await prisma.auditLog.findMany({
    where: {
      workspaceId: resolvedWorkspace.id,
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
      workspaceId: resolvedWorkspace.id,
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

  const cardMemoryBoost = (group: string, itemId: string) =>
    clamp(
      memoryBoostFromStats(adviserMemoryByGroup.get(group), now) * 0.45 +
        memoryBoostFromStats(adviserMemoryByItem.get(itemId), now) +
        memoryBoostFromStats(adviserOutcomeByGroup.get(group), now) * 0.5 +
        memoryBoostFromStats(adviserOutcomeByItem.get(itemId), now) * 0.75 +
        completionBoostFromStats(adviserOutcomeByGroup.get(group)) * 0.6 +
        completionBoostFromStats(adviserOutcomeByItem.get(itemId)) * 0.9
    );

  const promptMemoryBoost = (group: string, itemId: string) =>
    clamp(
      memoryBoostFromStats(adviserMemoryByGroup.get(group), now) * 0.3 +
        memoryBoostFromStats(adviserMemoryByItem.get(itemId), now) * 0.85 +
        memoryBoostFromStats(adviserOutcomeByGroup.get(group), now) * 0.4 +
        memoryBoostFromStats(adviserOutcomeByItem.get(itemId), now) * 0.6 +
        completionBoostFromStats(adviserOutcomeByGroup.get(group)) * 0.45 +
        completionBoostFromStats(adviserOutcomeByItem.get(itemId)) * 0.7
    );

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
  const activeTransactionWindowLabel = currentWindowTransactions.length > 0 ? "latest 30-day" : "available";
  const comparisonWindowTransactions =
    previousWindowTransactions.length > 0 ? previousWindowTransactions : allTransactions.filter((transaction) => transaction.date <= currentWindowStart);

  const currentSummary = buildTransactionSummary(activeTransactions);
  const previousSummary = buildTransactionSummary(comparisonWindowTransactions);
  const allSummary = buildTransactionSummary(allTransactions);

  const currentSpend = currentSummary.expense;
  const previousSpend = previousSummary.expense;
  const currentNet = currentSummary.income - currentSummary.expense;
  const previousNet = previousSummary.income - previousSummary.expense;
  const currentSavingsRate = currentSummary.income > 0 ? currentNet / currentSummary.income : null;
  const previousSavingsRate = previousSummary.income > 0 ? (previousSummary.income - previousSummary.expense) / previousSummary.income : null;
  const historySpanDays = allTransactions.length > 0 ? daysBetween(analysisAnchorDate, allTransactions[allTransactions.length - 1].date) : 0;
  const historyWindowCount = Math.max(historySpanDays / 30, 1);
  const longTermAverageSpend = allSummary.expense / historyWindowCount;
  const longTermAverageIncome = allSummary.income / historyWindowCount;
  const longTermAverageNet = longTermAverageIncome - longTermAverageSpend;
  const longTermAverageSavingsRate = longTermAverageIncome > 0 ? longTermAverageNet / longTermAverageIncome : null;
  const monthlySeries = buildMonthlySeries(allTransactions);
  const monthlyExpenseTrend = calculateTrendSignal(monthlySeries.map((point) => point.expense));
  const monthlyIncomeTrend = calculateTrendSignal(monthlySeries.map((point) => point.income));
  const monthlyNetTrend = calculateTrendSignal(monthlySeries.map((point) => point.net));
  const weightedHistoricalBaseline = getWeightedHistoricalBaseline(monthlySeries);
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
  const currencyCandidates = new Set(
    workspaceAccounts.map((account) => formatCurrencyCode(account.currency)).filter((currency) => currency.length > 0)
  );
  const displayCurrency = currencyCandidates.size === 1 ? Array.from(currencyCandidates)[0] : "MIXED";
  const goalValue = user.primaryGoal?.trim() ?? null;
  const goalTargetAmount = user.goalTargetAmount ? Number(user.goalTargetAmount) : null;
  const currentGoalPlan = normalizeGoalPlan(user.goalPlan, goalValue as GoalKey | null, goalTargetAmount);
  const goalProgress = getGoalProgressSnapshot(
    {
      goalKey: goalValue as GoalKey | null,
      targetAmount: goalTargetAmount,
      goalPlan: currentGoalPlan,
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
  const goalLabel = goalValue ? ({ save_more: "Save more", pay_down_debt: "Pay down debt", track_spending: "Track spending", build_emergency_fund: "Build an emergency fund", invest_better: "Invest better" }[goalValue] ?? goalValue) : null;

  const topCategories = Array.from(currentSummary.expenseCategories.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const topCategoryName = topCategories[0]?.[0] ?? null;
  const topCategoryAmount = topCategories[0]?.[1] ?? 0;
  const topCategoryShare = currentSpend > 0 ? topCategoryAmount / currentSpend : 0;

  const weekendExpenses = activeTransactions.filter((transaction) => {
    const day = transaction.date.getDay();
    return transaction.type === "expense" && (day === 0 || day === 6);
  });
  const weekendExpenseShare = currentSpend > 0 ? weekendExpenses.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount)), 0) / currentSpend : 0;

  const uncategorizedTransactions = activeTransactions.filter((transaction) => !transaction.category?.name || !transaction.merchantClean);

  const recurringDueSoon = recurringPatterns
    .filter((pattern) => pattern.nextExpectedDate && pattern.nextExpectedDate <= nextFourteenDays)
    .slice(0, 3);

  const commitmentsDueSoon = financialCommitments
    .filter((commitment) => commitment.nextDueDate && commitment.nextDueDate <= nextSevenDays)
    .slice(0, 3);

  const openSplitBills = splitBillWorkspaceData.bills
    .map((bill) => {
      const transferCount = bill.settlement.transfers.length;
      const outstandingAmount = bill.settlement.transfers.reduce((sum, transfer) => sum + Number(transfer.amount), 0);
      return {
        bill,
        transferCount,
        outstandingAmount,
      };
    })
    .filter((entry) => entry.transferCount > 0)
    .sort((left, right) => right.outstandingAmount - left.outstandingAmount);

  const openSplitBillCount = openSplitBills.length;
  const openSplitBillAmount = openSplitBills.reduce((sum, entry) => sum + entry.outstandingAmount, 0);

  const latestInvestmentSnapshot = investmentSnapshots[0] ?? null;
  const previousInvestmentSnapshot = investmentSnapshots[1] ?? null;
  const investmentDelta =
    latestInvestmentSnapshot && previousInvestmentSnapshot && latestInvestmentSnapshot.currency === previousInvestmentSnapshot.currency
      ? Number(latestInvestmentSnapshot.totalValue ?? 0) - Number(previousInvestmentSnapshot.totalValue ?? 0)
      : null;

  const liquidBalance = workspaceAccounts
    .filter((account) => ["bank", "wallet", "cash"].includes(account.type))
    .reduce((sum, account) => sum + (account.balance ?? 0), 0);

  const recurringMerchantCount = new Set(
    recurringPatterns.map((pattern) => normalizeMerchant(pattern.merchantClean ?? pattern.merchantRaw))
  ).size;
  const transactionCount = activeTransactions.length;
  const expenseTransactionCount = activeTransactions.filter((transaction) => transaction.type === "expense").length;
  const incomeTransactionCount = activeTransactions.filter((transaction) => transaction.type === "income").length;
  const historyDepthScore = clamp(Math.min(historySpanDays, 365) / 3.65);
  const currentTransactionConfidence = clamp(
    average([
      toCountScore(transactionCount, 20),
      toCountScore(expenseTransactionCount, 15),
      toCountScore(workspaceAccounts.length, 6),
      historyDepthScore,
    ])
  );
  const currentPatternConfidence = clamp(
    average([
      toCountScore(expenseTransactionCount, 15),
      toCountScore(currentSummary.expenseCategories.size, 3),
      toCountScore(weekendExpenses.length, 8),
      historyDepthScore,
    ])
  );
  const currentRecurringConfidence = clamp(
    average([
      toCountScore(recurringDueSoon.length, 3),
      toCountScore(recurringMerchantCount, 5),
      toCountScore(commitmentsDueSoon.length, 3),
      historyDepthScore,
    ])
  );
  const currentInvestmentConfidence = latestInvestmentSnapshot
    ? clamp(average([toCountScore(investmentSnapshots.length, 2), latestInvestmentSnapshot.gainLossValue === null ? 35 : 85, historyDepthScore]))
    : 0;
  const currentSplitConfidence = openSplitBillCount > 0
    ? clamp(average([toCountScore(openSplitBillCount, 3), openSplitBillAmount > 0 ? 100 : 0, historyDepthScore]))
    : 0;
  const currentGoalConfidence = goalLabel ? clamp(average([toCountScore(transactionCount, 20), goalProgress.bandLabel === "On track" ? 85 : 70, historyDepthScore])) : 0;
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

  const trendMomentumScore = clamp(average([monthlyExpenseTrend.score, monthlyIncomeTrend.score, monthlyNetTrend.score]));
  const trendDirectionScore = clamp(
    average([
      monthlyExpenseTrend.direction > 0 ? 85 : monthlyExpenseTrend.direction < 0 ? 35 : 55,
      monthlyIncomeTrend.direction > 0 ? 80 : monthlyIncomeTrend.direction < 0 ? 40 : 55,
      monthlyNetTrend.direction > 0 ? 78 : monthlyNetTrend.direction < 0 ? 42 : 55,
    ])
  );
  const cashflowPressureScore = clamp(
    average([
      liquidBalance < currentSpend * 0.3 ? 92 : 28,
      recurringDueSoon.length > 0 ? 72 + recurringDueSoon.length * 4 : 20,
      commitmentsDueSoon.length > 0 ? 72 + commitmentsDueSoon.length * 4 : 18,
      openSplitBillCount > 0 ? 68 + openSplitBillCount * 5 : 18,
      currentSavingsRate !== null && currentSavingsRate < 0 ? 90 : 35,
      monthlyExpenseTrend.direction > 0 ? 70 + monthlyExpenseTrend.score * 0.3 : 35,
    ])
  );
  const behaviorPatternScore = clamp(
    average([
      topCategoryShare * 100,
      weekendExpenseShare * 100,
      uncategorizedTransactions.length > 0 ? 65 + uncategorizedTransactions.length * 4 : 20,
      trendMomentumScore * 0.35,
    ])
  );
  const goalPressureScore = clamp(
    average([
      goalLabel ? 100 : 0,
      goalProgress.bandLabel === "On track" ? 35 : 85,
      spendDelta !== null && spendDelta > 0 ? Math.min(spendDelta * 1.2 + 40, 100) : 35,
      trendDirectionScore,
    ])
  );
  const investmentSignalScore = latestInvestmentSnapshot
    ? clamp(
        average([
          investmentDelta === null ? 55 : Math.abs(investmentDelta) / Math.max(Number(latestInvestmentSnapshot.totalValue ?? 1), 1) * 100,
          latestInvestmentSnapshot.gainLossPercent === null ? 40 : Math.abs(Number(latestInvestmentSnapshot.gainLossPercent)),
          historyDepthScore,
        ])
      )
    : 0;
  const cleanupPressureScore = clamp(
    average([
      uncategorizedTransactions.length > 0 ? 72 + uncategorizedTransactions.length * 5 : 18,
      currentTransactionConfidence,
      activeTransactions.length > 0 ? 55 : 20,
      historyDepthScore,
    ])
  );

  const signalThemes: AdviserThemeScore[] = [
    { key: "cashflow", score: cashflowPressureScore },
    { key: "behavior", score: behaviorPatternScore },
    { key: "goals", score: goalPressureScore },
    { key: "investments", score: investmentSignalScore },
    { key: "cleanup", score: cleanupPressureScore },
  ].sort((left, right) => right.score - left.score);
  const dominantTheme = signalThemes[0];
  const secondaryTheme = signalThemes[1];
  const crossSignalSynergy = scoreTheme([dominantTheme?.score ?? 0, secondaryTheme?.score ?? 0]);
  const themeMemoryScore = (groups: string[]) => {
    const stats = groups.map((group) => adviserMemoryByGroup.get(group)).filter((value): value is AdviserMemoryStats => Boolean(value));
    const outcomeStats = groups.map((group) => adviserOutcomeByGroup.get(group)).filter((value): value is AdviserMemoryStats => Boolean(value));
    return clamp(
      average([
        ...stats.map((stat) => memoryBoostFromStats(stat, now)),
        ...outcomeStats.map((stat) => memoryBoostFromStats(stat, now) * 0.85),
        groups.some((group) => {
          const memory = adviserMemoryByGroup.get(group);
          return Boolean(memory && memory.outcomes > 0 && memory.count > 0);
        })
          ? 70
          : 35,
      ])
    );
  };
  const themeAffinity: Record<AdviserSignalTheme, number> = {
    cashflow: clamp(
      average([
        themeMemoryScore(["cashflow", "recurring", "split-bills"]),
        goalValue && ["save_more", "pay_down_debt", "build_emergency_fund"].includes(goalValue) ? 85 : 45,
        currentSavingsRate !== null && currentSavingsRate < 0 ? 90 : 45,
      ])
    ),
    behavior: clamp(
      average([
        themeMemoryScore(["transactions", "behavior-pattern", "category-mix"]),
        goalValue === "track_spending" ? 80 : 45,
        trendMomentumScore,
      ])
    ),
    goals: clamp(average([themeMemoryScore(["goals"]), goalLabel ? 95 : 30, goalPressureScore])),
    investments: clamp(average([themeMemoryScore(["investments"]), goalValue === "invest_better" ? 90 : 45, investmentSignalScore])),
    cleanup: clamp(
      average([
        themeMemoryScore(["cleanup"]),
        uncategorizedTransactions.length > 0 ? 92 : 35,
        currentTransactionConfidence,
      ])
    ),
  };
  const userPreferenceAffinity: Record<AdviserSignalTheme, number> = {
    cashflow: clamp(average([preferenceProfile.cashflow, themeAffinity.cashflow])),
    behavior: clamp(average([preferenceProfile.behavior, themeAffinity.behavior])),
    goals: clamp(average([preferenceProfile.goals, themeAffinity.goals])),
    investments: clamp(average([preferenceProfile.investments, themeAffinity.investments])),
    cleanup: clamp(average([preferenceProfile.cleanup, themeAffinity.cleanup])),
  };
  const financialPersona = buildFinancialPersona(
    dominantTheme,
    secondaryTheme,
    userPreferenceAffinity,
    forecastSignal,
    anomalySignal,
    goalLabel,
    uncategorizedTransactions.length
  );
  const adviserExplainability = {
    baseline: {
      spend: baselineSpend,
      income: baselineIncome,
      savingsRate: baselineSavingsRate,
      historySpanDays,
    },
    thresholds: thresholdProfile,
    themes: signalThemes.map((theme) => ({
      key: theme.key,
      score: theme.score,
      affinity: themeAffinity[theme.key],
      preference: userPreferenceAffinity[theme.key],
    })),
    persona: financialPersona,
    forecast: forecastSignal
      ? {
          title: forecastSignal.title,
          score: forecastSignal.score,
        }
      : null,
    forecastCategories: categoryForecastSignals.map((signal) => ({
      title: signal.title,
      score: signal.score,
    })),
    anomaly: anomalySignal
      ? {
          title: anomalySignal.title,
          score: anomalySignal.score,
        }
      : null,
    memory: {
      interactions: adviserInteractions.length,
      completionCandidates: adviserCompletionLogs.length,
      cardMemoryGroups: adviserMemoryByGroup.size,
      cardOutcomeGroups: adviserOutcomeByGroup.size,
    },
  };

  const adviserCardWeights = {
    passive: { impact: 0.3, urgency: 0.18, confidence: 0.18, personalization: 0.16, recency: 0.1, actionability: 0.08 },
    recommendation: { impact: 0.22, urgency: 0.24, confidence: 0.16, personalization: 0.16, recency: 0.1, actionability: 0.12 },
    coaching: { impact: 0.16, urgency: 0.1, confidence: 0.18, personalization: 0.3, recency: 0.1, actionability: 0.16 },
    prompt: { impact: 0.18, urgency: 0.2, confidence: 0.18, personalization: 0.28, recency: 0.08, actionability: 0.08 },
  } satisfies Record<string, ScoreWeights>;

  const scoreCardRelevance = (card: Pick<RankedAdviserCard, "group" | "id" | "breakdown">, baseScore: number) => {
    const memoryBoost = cardMemoryBoost(card.group, card.id);
    let contextBoost = 0;
    let themeBoost = 0;
    let themeKey: AdviserSignalTheme | null = null;

    if (card.group === "cashflow" || card.group === "recurring" || card.group === "split-bills") {
      contextBoost = cashflowPressureScore * 0.2;
      themeBoost = [dominantTheme?.key, secondaryTheme?.key].includes("cashflow") ? crossSignalSynergy * 0.06 : 0;
      themeKey = "cashflow";
    } else if (card.group === "goals") {
      contextBoost = goalPressureScore * 0.18;
      themeBoost = [dominantTheme?.key, secondaryTheme?.key].includes("goals") ? crossSignalSynergy * 0.06 : 0;
      themeKey = "goals";
    } else if (card.group === "investments") {
      contextBoost = investmentSignalScore * 0.16;
      themeBoost = [dominantTheme?.key, secondaryTheme?.key].includes("investments") ? crossSignalSynergy * 0.06 : 0;
      themeKey = "investments";
    } else if (card.group === "transactions" || card.group === "behavior-pattern" || card.group === "category-mix") {
      contextBoost = behaviorPatternScore * 0.16;
      themeBoost = [dominantTheme?.key, secondaryTheme?.key].includes("behavior") ? crossSignalSynergy * 0.06 : 0;
      themeKey = "behavior";
    } else if (card.group === "cleanup") {
      contextBoost = cleanupPressureScore * 0.18;
      themeBoost = [dominantTheme?.key, secondaryTheme?.key].includes("cleanup") ? crossSignalSynergy * 0.06 : 0;
      themeKey = "cleanup";
    }

    const confidenceMultiplier = clamp(0.72 + average([card.breakdown.confidence, historyDepthScore, currentTransactionConfidence]) / 160, 0.72, 1.16);
    const priorityBoost = themeKey ? userPreferenceAffinity[themeKey] * 0.08 : 0;
    const personaBoost = themeKey && financialPersona.key === themeKey ? financialPersona.strength * 0.05 : 0;

    return clamp(Math.round(baseScore * confidenceMultiplier + memoryBoost + contextBoost + themeBoost + priorityBoost + personaBoost));
  };

  const scorePromptRelevance = (prompt: Pick<RankedAdviserPrompt, "group" | "id">, baseScore: number) => {
    const memoryBoost = promptMemoryBoost(prompt.group, prompt.id);
    let contextBoost = 0;
    let themeBoost = 0;
    let themeKey: AdviserSignalTheme | null = null;

    if (prompt.group === "cashflow" || prompt.group === "recurring" || prompt.group === "split-bills") {
      contextBoost = cashflowPressureScore * 0.15;
      themeBoost = [dominantTheme?.key, secondaryTheme?.key].includes("cashflow") ? crossSignalSynergy * 0.05 : 0;
      themeKey = "cashflow";
    } else if (prompt.group === "goals") {
      contextBoost = goalPressureScore * 0.15;
      themeBoost = [dominantTheme?.key, secondaryTheme?.key].includes("goals") ? crossSignalSynergy * 0.05 : 0;
      themeKey = "goals";
    } else if (prompt.group === "investments") {
      contextBoost = investmentSignalScore * 0.15;
      themeBoost = [dominantTheme?.key, secondaryTheme?.key].includes("investments") ? crossSignalSynergy * 0.05 : 0;
      themeKey = "investments";
    } else if (prompt.group === "transactions" || prompt.group === "patterns" || prompt.group === "cleanup") {
      contextBoost = behaviorPatternScore * 0.15;
      themeBoost = [dominantTheme?.key, secondaryTheme?.key].includes("behavior") ? crossSignalSynergy * 0.05 : 0;
      themeKey = "behavior";
    }

    const confidenceMultiplier = clamp(0.72 + average([prompt.breakdown.confidence, historyDepthScore, currentTransactionConfidence]) / 160, 0.72, 1.16);
    const priorityBoost = themeKey ? userPreferenceAffinity[themeKey] * 0.06 : 0;
    const personaBoost = themeKey && financialPersona.key === themeKey ? financialPersona.strength * 0.04 : 0;

    return clamp(Math.round(baseScore * confidenceMultiplier + memoryBoost + contextBoost + themeBoost + priorityBoost + personaBoost));
  };

  const summaryCards = [
    {
      id: "money_left",
      title: "Money left",
      value: formatSignedCurrency(currentNet),
      tone: currentNet >= 0 ? "positive" : "warning",
      detail:
        currentSummary.income > 0
          ? `${formatCurrency(currentSummary.income)} income minus ${formatCurrency(currentSummary.expense)} spending; baseline spend ${formatCurrency(baselineSpend)}`
          : "Based on your current transaction history",
    },
    {
      id: "savings_rate",
      title: "Savings Rate",
      value: currentSavingsRate === null ? "N/A" : formatPercent(currentSavingsRate * 100),
      tone: currentSavingsRate === null || currentSavingsRate >= 0 ? "positive" : "warning",
      detail:
        currentSavingsRate === null
          ? "Add more income and spending data to calculate this"
          : `Based on your ${activeTransactionWindowLabel} income and expense mix against your historical baseline`,
    },
  ];

  const passiveCards: RankedAdviserCard[] = selectTopRanked(
    [
      anomalySignal
        ? {
            id: "anomaly_signal",
            title: anomalySignal.title,
            summary: anomalySignal.summary,
            evidence: anomalySignal.evidence,
            ctaLabel: "Review details",
            href: "/reports",
            tone: anomalySignal.tone,
            group: "cashflow",
            breakdown: {
              impact: clamp(anomalySignal.score + 18),
              urgency: clamp(anomalySignal.score + 22),
              confidence: currentPatternConfidence,
              personalization: clamp(70 + topCategoryShare * 20),
              recency: 100,
              actionability: 72,
            },
            score: 0,
          }
        : null,
      spendDelta !== null
        ? {
            id: "spending_moved",
            title: spendDelta > 0 ? "Spending moved up" : "Spending eased",
            summary: spendDelta > 0 ? `Expenses are up ${formatPercent(Math.abs(spendDelta))} versus the previous 30 days.` : `Expenses are down ${formatPercent(Math.abs(spendDelta))} versus the previous 30 days.`,
            evidence: `${formatSignedCurrency(currentSpend - previousSpend)} change in spending`,
            ctaLabel: "Open transactions",
            href: buildTransactionsHref({ month: toIsoMonth(now) }),
            tone: spendDelta > 0 ? "warning" : "positive",
            group: "spend-change",
            breakdown: {
              impact: clamp(Math.abs(spendDelta) * 1.2 + 20),
              urgency: clamp(spendDelta > 0 ? 60 + Math.abs(spendDelta) * 0.4 : 35 + Math.abs(spendDelta) * 0.2),
              confidence: currentTransactionConfidence,
              personalization: clamp(55 + topCategoryShare * 40),
              recency: 100,
              actionability: 82,
            },
            score: 0,
          }
        : null,
      topCategoryName
        ? {
            id: "top_driver",
            title: "Top spending driver",
            summary: `${topCategoryName} is the biggest category in this period.`,
            evidence: `${formatCurrency(topCategoryAmount)} spent, or ${formatPercent(topCategoryShare * 100)} of total expenses.`,
            ctaLabel: "Review category",
            href: buildTransactionsHref({ category: topCategoryName }),
            tone: "neutral",
            group: "category-mix",
            breakdown: {
              impact: clamp(topCategoryShare * 100),
              urgency: clamp(topCategoryShare * 80),
              confidence: currentTransactionConfidence,
              personalization: clamp(70 + topCategoryShare * 20),
              recency: 100,
              actionability: 88,
            },
            score: 0,
          }
        : null,
      weekendExpenseShare > 0
        ? {
            id: "weekend_spike",
            title: "Weekend spending spike",
            summary: `Weekend purchases account for ${formatPercent(weekendExpenseShare * 100)} of your expenses this month.`,
            evidence: `${weekendExpenses.length} weekend expense${weekendExpenses.length === 1 ? "" : "s"} reviewed`,
            ctaLabel: "See weekends",
            href: buildTransactionsHref({ month: toIsoMonth(now) }),
            tone: weekendExpenseShare > 0.3 ? "warning" : "neutral",
            group: "behavior-pattern",
            breakdown: {
              impact: clamp(weekendExpenseShare * 100),
              urgency: clamp(weekendExpenseShare * 95),
              confidence: currentPatternConfidence,
              personalization: clamp(60 + weekendExpenseShare * 35),
              recency: 100,
              actionability: 72,
            },
            score: 0,
          }
        : null,
      recurringDueSoon.length > 0
        ? {
            id: "recurring_soon",
            title: "Recurring costs coming soon",
            summary: `${recurringDueSoon.length} recurring item${recurringDueSoon.length === 1 ? "" : "s"} are due in the next two weeks.`,
            evidence: recurringDueSoon
              .slice(0, 2)
              .map((pattern) => `${pattern.merchantClean ?? pattern.merchantRaw}${pattern.nextExpectedDate ? ` · ${toMonthLabel(pattern.nextExpectedDate)}` : ""}`)
              .join(" • "),
            ctaLabel: "Open recurring",
            href: "/recurring",
            tone: "warning",
            group: "recurring",
            breakdown: {
              impact: clamp(recurringDueSoon.length * 28 + commitmentsDueSoon.length * 18),
              urgency: clamp(
                average(
                  recurringDueSoon
                    .map((pattern) => {
                      if (!pattern.nextExpectedDate) {
                        return 60;
                      }
                      const daysUntil = Math.ceil((pattern.nextExpectedDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                      return clamp(100 - Math.max(daysUntil, 0) * 12);
                    })
                    .concat(
                      commitmentsDueSoon.map((commitment) => {
                        if (!commitment.nextDueDate) {
                          return 60;
                        }
                        const daysUntil = Math.ceil((commitment.nextDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                        return clamp(100 - Math.max(daysUntil, 0) * 12);
                      })
                    )
                )
              ),
              confidence: currentRecurringConfidence,
              personalization: clamp(70 + recurringMerchantCount * 5),
              recency: 100,
              actionability: 95,
            },
            score: 0,
          }
        : null,
      openSplitBillCount > 0
        ? {
            id: "split_balance",
            title: "Split bill balance",
            summary: `${openSplitBillCount} split bill${openSplitBillCount === 1 ? "" : "s"} still need settlement.`,
            evidence: `Outstanding balance: ${formatCurrency(openSplitBillAmount)}`,
            ctaLabel: "Open split bills",
            href: "/split-bill",
            tone: "warning",
            group: "split-bills",
            breakdown: {
              impact: clamp(openSplitBillCount * 22 + (currentSpend > 0 ? (openSplitBillAmount / currentSpend) * 100 : 40)),
              urgency: clamp(70 + openSplitBillCount * 8),
              confidence: currentSplitConfidence,
              personalization: 80,
              recency: 100,
              actionability: 92,
            },
            score: 0,
          }
        : null,
      latestInvestmentSnapshot
        ? {
            id: "investment_move",
            title: "Investment movement",
            summary: "Your latest investment snapshot changed since the last update.",
            evidence:
              investmentDelta === null
                ? `Latest snapshot: ${formatCurrency(Number(latestInvestmentSnapshot.totalValue ?? 0), latestInvestmentSnapshot.currency)}`
                : `${formatSignedCurrency(investmentDelta, latestInvestmentSnapshot.currency)} since the prior snapshot`,
            ctaLabel: "Open investments",
            href: "/investments",
            tone: investmentDelta !== null && investmentDelta >= 0 ? "positive" : "neutral",
            group: "investments",
            breakdown: {
              impact: clamp(investmentDelta === null ? 55 : Math.abs(investmentDelta) / Math.max(Number(latestInvestmentSnapshot.totalValue ?? 1), 1) * 100),
              urgency: clamp(latestInvestmentSnapshot.gainLossPercent === null ? 35 : Math.abs(Number(latestInvestmentSnapshot.gainLossPercent))),
              confidence: currentInvestmentConfidence,
              personalization: clamp(65 + (latestInvestmentSnapshot.account?.name ? 10 : 0)),
              recency: 100,
              actionability: 78,
            },
            score: 0,
          }
        : null,
    ].filter((card): card is RankedAdviserCard => card !== null).map((card) => ({
      ...card,
      score: scoreCardRelevance(card, scoreCandidate(card.breakdown, adviserCardWeights.passive)),
    })),
    3
  );

  const recommendationCards: RankedAdviserCard[] = selectTopRanked(
    [
      forecastSignal
        ? {
            id: "forecast_pressure",
            title: forecastSignal.title,
            summary: forecastSignal.summary,
            evidence: forecastSignal.evidence,
            ctaLabel: "Review cash flow",
            href: "/accounts",
            tone: forecastSignal.tone,
            group: "cashflow",
            breakdown: {
              impact: clamp(forecastSignal.score),
              urgency: clamp(forecastSignal.score + 8),
              confidence: clamp(average([currentTransactionConfidence, currentRecurringConfidence, currentSplitConfidence])),
              personalization: clamp(70 + recurringDueSoon.length * 4 + commitmentsDueSoon.length * 4),
              recency: 100,
              actionability: 92,
            },
            score: 0,
          }
        : null,
      uncategorizedTransactions.length > 0
        ? {
            id: "review_uncategorized",
            title: "Review uncategorized transactions",
            summary: `${uncategorizedTransactions.length} row${uncategorizedTransactions.length === 1 ? "" : "s"} still need a category or cleaner merchant title.`,
            evidence: "Cleaning these up improves Adviser and Reports at the same time.",
            ctaLabel: "Fix transactions",
            href: "/transactions",
            tone: "warning",
            group: "cleanup",
            breakdown: {
              impact: clamp(uncategorizedTransactions.length * 18 + 20),
              urgency: clamp(70 + uncategorizedTransactions.length * 6),
              confidence: currentTransactionConfidence,
              personalization: 70,
              recency: 100,
              actionability: 95,
            },
            score: 0,
          }
        : null,
      recurringDueSoon.length > 0
        ? {
            id: "check_recurring",
            title: "Check recurring charges",
            summary: "Review upcoming subscriptions and bills before they hit your balance.",
            evidence: recurringDueSoon.slice(0, 3).map((pattern) => pattern.merchantClean ?? pattern.merchantRaw).join(" • "),
            ctaLabel: "Open recurring",
            href: "/recurring",
            tone: "warning",
            group: "recurring",
            breakdown: {
              impact: clamp(recurringDueSoon.length * 28 + commitmentsDueSoon.length * 18),
              urgency: clamp(
                average(
                  recurringDueSoon
                    .map((pattern) => {
                      if (!pattern.nextExpectedDate) {
                        return 60;
                      }
                      const daysUntil = Math.ceil((pattern.nextExpectedDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                      return clamp(100 - Math.max(daysUntil, 0) * 12);
                    })
                    .concat(
                      commitmentsDueSoon.map((commitment) => {
                        if (!commitment.nextDueDate) {
                          return 60;
                        }
                        const daysUntil = Math.ceil((commitment.nextDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                        return clamp(100 - Math.max(daysUntil, 0) * 12);
                      })
                    )
                )
              ),
              confidence: currentRecurringConfidence,
              personalization: clamp(65 + recurringMerchantCount * 5),
              recency: 100,
              actionability: 95,
            },
            score: 0,
          }
        : null,
      openSplitBillCount > 0
        ? {
            id: "settle_split_bills",
            title: "Settle split bills",
            summary: "Close out the balances that are still open with your group or people list.",
            evidence: `${formatCurrency(openSplitBillAmount)} still outstanding across split bills`,
            ctaLabel: "Open split bills",
            href: "/split-bill",
            tone: "warning",
            group: "split-bills",
            breakdown: {
              impact: clamp(openSplitBillCount * 22 + (currentSpend > 0 ? (openSplitBillAmount / currentSpend) * 100 : 40)),
              urgency: clamp(70 + openSplitBillCount * 8),
              confidence: currentSplitConfidence,
              personalization: 80,
              recency: 100,
              actionability: 92,
            },
            score: 0,
          }
        : null,
      topCategoryName
        ? {
            id: "cap_top_category",
            title: "Set a cap for your biggest category",
            summary: `Consider a monthly limit for ${topCategoryName.toLowerCase()} if you want more control.`,
            evidence: `${formatCurrency(topCategoryAmount)} spent in the last 30 days`,
            ctaLabel: "Open transactions",
            href: buildTransactionsHref({ category: topCategoryName }),
            tone: "neutral",
            group: "spend-control",
            breakdown: {
              impact: clamp(topCategoryShare * 100),
              urgency: clamp(topCategoryShare * 75),
              confidence: currentTransactionConfidence,
              personalization: clamp(75 + topCategoryShare * 15),
              recency: 100,
              actionability: 82,
            },
            score: 0,
          }
        : null,
      liquidBalance < currentSpend * 0.3
        ? {
            id: "protect_cashflow",
            title: "Protect next week’s cash flow",
            summary: "Move aside enough money for the obligations that are about to land.",
            evidence: `Liquid balance looks tight compared with current spending: ${formatCurrency(liquidBalance)}`,
            ctaLabel: "Review accounts",
            href: "/accounts",
            tone: "warning",
            group: "cashflow",
            breakdown: {
              impact: clamp(currentSpend > 0 ? ((currentSpend - liquidBalance) / currentSpend) * 100 : 70),
              urgency: clamp(85 - Math.min((liquidBalance / Math.max(currentSpend, 1)) * 100, 80)),
              confidence: currentTransactionConfidence,
              personalization: 75,
              recency: 100,
              actionability: 88,
            },
            score: 0,
          }
        : null,
      latestInvestmentSnapshot
        ? {
            id: "review_investments",
            title: "Review investment position",
            summary: "Open your portfolio and check the latest snapshot before making a move.",
            evidence: latestInvestmentSnapshot.account?.name ? `Latest snapshot from ${latestInvestmentSnapshot.account.name}` : "Latest investment snapshot available",
            ctaLabel: "Open investments",
            href: "/investments",
            tone: "neutral",
            group: "investments",
            breakdown: {
              impact: clamp(investmentDelta === null ? 55 : Math.abs(investmentDelta) / Math.max(Number(latestInvestmentSnapshot.totalValue ?? 1), 1) * 100),
              urgency: clamp(latestInvestmentSnapshot.gainLossPercent === null ? 35 : Math.abs(Number(latestInvestmentSnapshot.gainLossPercent))),
              confidence: currentInvestmentConfidence,
              personalization: clamp(65 + (latestInvestmentSnapshot.account?.name ? 10 : 0)),
              recency: 100,
              actionability: 78,
            },
            score: 0,
          }
        : null,
    ].filter((card): card is RankedAdviserCard => card !== null).map((card) => ({
      ...card,
      score: scoreCardRelevance(card, scoreCandidate(card.breakdown, adviserCardWeights.recommendation)),
    })),
    3
  );

  const coachingCards: RankedAdviserCard[] = selectTopRanked(
    [
      weekendExpenseShare > 0.2
        ? {
            id: "weekend_pattern",
            title: "Weekend pattern",
            summary: "Weekends are taking a noticeable share of your expense flow.",
            evidence: `Weekend spending is at ${formatPercent(weekendExpenseShare * 100)} of total expenses.`,
            ctaLabel: "View pattern",
            href: buildTransactionsHref({ month: toIsoMonth(now) }),
            tone: weekendExpenseShare > 0.3 ? "warning" : "neutral",
            group: "behavior-pattern",
            breakdown: {
              impact: clamp(weekendExpenseShare * 100),
              urgency: clamp(weekendExpenseShare * 70),
              confidence: currentPatternConfidence,
              personalization: clamp(85 + weekendExpenseShare * 10),
              recency: 100,
              actionability: 65,
            },
            score: 0,
          }
        : null,
      topCategoryShare > 0.35
        ? {
            id: "category_concentration",
            title: "Category concentration",
            summary: "A small number of categories are carrying most of the spending load.",
            evidence: `${topCategoryName ?? "Your top category"} makes up ${formatPercent(topCategoryShare * 100)} of total expenses.`,
            ctaLabel: "Review mix",
            href: "/reports",
            tone: "neutral",
            group: "category-pattern",
            breakdown: {
              impact: clamp(topCategoryShare * 100),
              urgency: clamp(topCategoryShare * 55),
              confidence: currentPatternConfidence,
              personalization: clamp(80 + topCategoryShare * 15),
              recency: 100,
              actionability: 55,
            },
            score: 0,
          }
        : null,
      goalLabel
        ? {
            id: "goal_alignment",
            title: "Goal alignment",
            summary:
              goalProgress.bandLabel === "On track"
                ? `Your current pace is supporting ${goalLabel.toLowerCase()}.`
                : `Your current pace is making ${goalLabel.toLowerCase()} harder right now.`,
            evidence: goalProgress.bandLabel,
            ctaLabel: "Open goals",
            href: "/goals",
            tone: goalProgress.bandLabel === "On track" ? "positive" : "warning",
            group: "goals",
            breakdown: {
              impact: clamp(goalProgress.bandLabel === "On track" ? 80 : 100),
              urgency: clamp(goalProgress.bandLabel === "On track" ? 30 : 85),
              confidence: currentGoalConfidence,
              personalization: 100,
              recency: 100,
              actionability: 82,
            },
            score: 0,
          }
        : null,
      recurringMerchantCount > 0
        ? {
            id: "recurring_discipline",
            title: "Recurring discipline",
            summary: "You tend to stay clearer when repeating costs are reviewed early.",
            evidence: `${recurringMerchantCount} recurring merchant${recurringMerchantCount === 1 ? "" : "s"} detected`,
            ctaLabel: "Open recurring",
            href: "/recurring",
            tone: "neutral",
            group: "recurring",
            breakdown: {
              impact: clamp(recurringMerchantCount * 18 + recurringDueSoon.length * 12),
              urgency: clamp(recurringDueSoon.length > 0 ? 75 : 45),
              confidence: currentRecurringConfidence,
              personalization: clamp(80 + recurringMerchantCount * 3),
              recency: 100,
              actionability: 70,
            },
            score: 0,
          }
        : null,
      uncategorizedTransactions.length > 0
        ? {
            id: "cleanup_effect",
            title: "Cleanup effect",
            summary: "Keeping uncategorized rows low makes the rest of Adviser much more useful.",
            evidence: `${uncategorizedTransactions.length} row${uncategorizedTransactions.length === 1 ? "" : "s"} still need attention`,
            ctaLabel: "Fix rows",
            href: "/transactions",
            tone: "warning",
            group: "cleanup",
            breakdown: {
              impact: clamp(uncategorizedTransactions.length * 18 + 15),
              urgency: clamp(70 + uncategorizedTransactions.length * 5),
              confidence: currentTransactionConfidence,
              personalization: 75,
              recency: 100,
              actionability: 92,
            },
            score: 0,
          }
        : null,
      incomeTransactionCount > 0
        ? {
            id: "cashflow_consistency",
            title: "Cash flow consistency",
            summary: "Your month becomes steadier when income arrives before the biggest obligations.",
            evidence: `Income changed ${incomeDelta === null ? "without" : `by ${formatPercent(incomeDelta)}`} a lot versus the last 30 days.`,
            ctaLabel: "View reports",
            href: "/reports",
            tone: "neutral",
            group: "cashflow",
            breakdown: {
              impact: clamp(Math.abs(incomeDelta ?? 0) * 1.2 + 20),
              urgency: clamp(incomeDelta !== null && Math.abs(incomeDelta) > 15 ? 75 : 40),
              confidence: currentTransactionConfidence,
              personalization: 60,
              recency: 100,
              actionability: 55,
            },
            score: 0,
          }
        : null,
    ].filter((card): card is RankedAdviserCard => card !== null).map((card) => ({
      ...card,
      score: scoreCardRelevance(card, scoreCandidate(card.breakdown, adviserCardWeights.coaching)),
    })),
    3
  );

  const passiveCardsToRender = passiveCards;
  const recommendationCardsToRender = recommendationCards;
  const coachingCardsToRender = coachingCards;

  const promptSuggestions: RankedAdviserPrompt[] = selectTopRanked(
    [
      topCategoryName
        ? {
            id: "prompt-top-category",
            label: `Why is ${topCategoryName} up?`,
            prompt: `Why is ${topCategoryName} driving my spending, and what should I look at first?`,
            group: "transactions",
            diversityKey: "transactions-top-category",
            breakdown: {
              impact: clamp(topCategoryShare * 100),
              urgency: clamp(spendDelta === null ? 45 : Math.max(spendDelta, 0) * 1.2 + 35),
              confidence: currentTransactionConfidence,
              personalization: 95,
              recency: 100,
              actionability: 82,
            },
            score: 0,
          }
        : null,
      weekendExpenseShare > 0.2
        ? {
            id: "prompt-weekend-spend",
            label: "What’s driving weekend spending?",
            prompt: "What is driving my weekend spending, and what should I watch next?",
            group: "transactions",
            diversityKey: "transactions-weekend-spend",
            breakdown: {
              impact: clamp(weekendExpenseShare * 100),
              urgency: clamp(weekendExpenseShare * 70),
              confidence: currentPatternConfidence,
              personalization: 90,
              recency: 100,
              actionability: 75,
            },
            score: 0,
          }
        : null,
      recurringDueSoon.length > 0 || commitmentsDueSoon.length > 0
        ? {
            id: "prompt-upcoming",
            label: "What’s due soon?",
            prompt: "Which recurring bills or commitments are due soon, and which ones matter most?",
            group: "recurring",
            diversityKey: "recurring-upcoming",
            breakdown: {
              impact: clamp(recurringDueSoon.length * 28 + commitmentsDueSoon.length * 18),
              urgency: clamp(90),
              confidence: currentRecurringConfidence,
              personalization: 90,
              recency: 100,
              actionability: 95,
            },
            score: 0,
          }
        : null,
      openSplitBillCount > 0
        ? {
            id: "prompt-split-bills",
            label: "What’s still open in split bills?",
            prompt: "How much do I still owe or am I owed from split bills, and who should I settle with first?",
            group: "split-bills",
            diversityKey: "split-bills-open",
            breakdown: {
              impact: clamp(openSplitBillCount * 24 + (currentSpend > 0 ? (openSplitBillAmount / currentSpend) * 100 : 40)),
              urgency: 90,
              confidence: currentSplitConfidence,
              personalization: 88,
              recency: 100,
              actionability: 95,
            },
            score: 0,
          }
        : null,
      goalLabel
        ? {
            id: "prompt-goal",
            label: `Am I on track for ${goalLabel}?`,
            prompt: `Am I on track for my goal of ${goalLabel.toLowerCase()}?`,
            group: "goals",
            diversityKey: "goals-track",
            breakdown: {
              impact: clamp(goalProgress.bandLabel === "On track" ? 80 : 100),
              urgency: clamp(goalProgress.bandLabel === "On track" ? 35 : 80),
              confidence: currentGoalConfidence,
              personalization: 100,
              recency: 100,
              actionability: 80,
            },
            score: 0,
          }
        : null,
      latestInvestmentSnapshot
        ? {
            id: "prompt-investments",
            label: "What changed in investments?",
            prompt: "What changed in my latest investment snapshot, and what should I pay attention to?",
            group: "investments",
            diversityKey: "investments-change",
            breakdown: {
              impact: clamp(investmentDelta === null ? 55 : Math.abs(investmentDelta) / Math.max(Number(latestInvestmentSnapshot.totalValue ?? 1), 1) * 100),
              urgency: clamp(latestInvestmentSnapshot.gainLossPercent === null ? 35 : Math.abs(Number(latestInvestmentSnapshot.gainLossPercent))),
              confidence: currentInvestmentConfidence,
              personalization: 82,
              recency: 100,
              actionability: 78,
            },
            score: 0,
          }
        : null,
      currentSummary.income > 0 || currentSummary.expense > 0
        ? {
            id: "prompt-cashflow",
            label: "How is my cash flow?",
            prompt: "How is my current cash flow looking, and what stands out most right now?",
            group: "cashflow",
            diversityKey: "cashflow-summary",
            breakdown: {
              impact: clamp(currentNet === 0 ? 55 : Math.abs(currentNet) / Math.max(currentSummary.income || currentSpend || 1, 1) * 100),
              urgency: clamp(currentSavingsRate === null ? 45 : currentSavingsRate < 0 ? 90 : 55),
              confidence: currentTransactionConfidence,
              personalization: 88,
              recency: 100,
              actionability: 80,
            },
            score: 0,
          }
        : null,
      workspaceAccounts.length > 0
        ? {
            id: "prompt-accounts",
            label: "Where is my balance?",
            prompt: "Which account or account type is holding the most balance right now?",
            group: "accounts",
            diversityKey: "accounts-balance",
            breakdown: {
              impact: clamp(liquidBalance > 0 ? 70 : 40),
              urgency: clamp(liquidBalance < currentSpend * 0.3 ? 80 : 40),
              confidence: clamp(average([toCountScore(workspaceAccounts.length, 5), liquidBalance > 0 ? 80 : 50])),
              personalization: 82,
              recency: 100,
              actionability: 70,
            },
            score: 0,
          }
        : null,
      currentTransactionConfidence > 0
        ? {
            id: "prompt-patterns",
            label: "What pattern stands out?",
            prompt: "What spending pattern stands out most from my current transactions?",
            group: "patterns",
            diversityKey: "patterns-overview",
            breakdown: {
              impact: clamp(topCategoryShare * 100),
              urgency: clamp(weekendExpenseShare * 60),
              confidence: currentPatternConfidence,
              personalization: 84,
              recency: 100,
              actionability: 68,
            },
            score: 0,
          }
        : null,
      uncategorizedTransactions.length > 0
        ? {
            id: "prompt-cleanup",
            label: "What needs cleanup?",
            prompt: "Which transactions still need cleanup, and which ones should I fix first?",
            group: "cleanup",
            diversityKey: "cleanup-transactions",
            breakdown: {
              impact: clamp(uncategorizedTransactions.length * 18 + 15),
              urgency: clamp(70 + uncategorizedTransactions.length * 5),
              confidence: currentTransactionConfidence,
              personalization: 88,
              recency: 100,
              actionability: 95,
            },
            score: 0,
          }
        : null,
    ].filter((prompt): prompt is RankedAdviserPrompt => prompt !== null).map((prompt) => ({
      ...prompt,
      score: scorePromptRelevance(prompt, scorePromptCandidate(prompt.breakdown, adviserCardWeights.prompt)),
    })),
    4
  );

  return (
    <CloverShell active="adviser" title="Adviser">
      <section className="adviser-page">
        <header className="adviser-summary">
          <div className="adviser-summary__grid" aria-label="Adviser summary">
            {summaryCards.map((card) => (
              <article key={card.id} className="accounts-overview-card glass adviser-summary-card">
                <p className="eyebrow">{card.title}</p>
                <button
                  type="button"
                  className="accounts-overview-card__info adviser-summary-card__info"
                  aria-label={`More information about ${card.title}`}
                >
                  <InfoIcon />
                  <span className="accounts-overview-card__info-tooltip" role="tooltip">
                    {card.detail}
                  </span>
                </button>
                <strong className={`accounts-overview-card__amount ${card.tone === "warning" ? "is-danger" : "is-good"}`}>{card.value}</strong>
              </article>
            ))}
          </div>
        </header>

        <section className="adviser-section glass">
          <p className="eyebrow">What Clover noticed</p>
          <div className="adviser-card-grid">
            {passiveCardsToRender.map((card) => (
              <AdviserTrackedLink
                key={card.id}
                href={card.href}
                kind="card"
                group={card.group}
                itemId={card.id}
                label={card.title}
                className="adviser-card adviser-card--link glass"
              >
                <span className={`adviser-card__tone adviser-card__tone--${card.tone}`} aria-hidden="true" />
                <strong>{card.title}</strong>
                <p>{card.summary}</p>
                <small>{card.evidence}</small>
                <span className="button button-primary button-small adviser-card__cta">{card.ctaLabel}</span>
              </AdviserTrackedLink>
            ))}
          </div>
        </section>

        <section className="adviser-section glass">
          <p className="eyebrow">What you should do</p>
          <div className="adviser-card-grid">
            {recommendationCardsToRender.map((card) => (
              <AdviserTrackedLink
                key={card.id}
                href={card.href}
                kind="card"
                group={card.group}
                itemId={card.id}
                label={card.title}
                className="adviser-card adviser-card--link glass"
              >
                <span className={`adviser-card__tone adviser-card__tone--${card.tone}`} aria-hidden="true" />
                <strong>{card.title}</strong>
                <p>{card.summary}</p>
                <small>{card.evidence}</small>
                <span className="button button-primary button-small adviser-card__cta">{card.ctaLabel}</span>
              </AdviserTrackedLink>
            ))}
          </div>
        </section>

        <section className="adviser-section glass">
          <p className="eyebrow">How you can improve</p>
          <div className="adviser-card-grid">
            {coachingCardsToRender.map((card) => (
              <AdviserTrackedLink
                key={card.id}
                href={card.href}
                kind="card"
                group={card.group}
                itemId={card.id}
                label={card.title}
                className="adviser-card adviser-card--link glass"
              >
                <span className={`adviser-card__tone adviser-card__tone--${card.tone}`} aria-hidden="true" />
                <strong>{card.title}</strong>
                <p>{card.summary}</p>
                <small>{card.evidence}</small>
                <span className="button button-primary button-small adviser-card__cta">{card.ctaLabel}</span>
              </AdviserTrackedLink>
            ))}
          </div>
        </section>

        <section className="adviser-section adviser-section--chat glass">
          <p className="eyebrow">Ask Clover anything</p>
          <AdviserChat isPro={user.planTier === "pro"} prompts={promptSuggestions} />
        </section>
      </section>
    </CloverShell>
  );
}

export default function AdviserPage() {
  return (
    <RouteSplash label="adviser">
      <AdviserPageContent />
    </RouteSplash>
  );
}
