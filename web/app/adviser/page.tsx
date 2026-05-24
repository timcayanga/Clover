import Link from "next/link";
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
  breakdown: ScoreFactors;
  score: number;
};

type RankedAdviserPrompt = AdviserPrompt & {
  group: string;
  breakdown: ScoreFactors;
  score: number;
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

const selectTopRanked = <T extends { score: number; group: string }>(items: T[], limit: number) => {
  const sorted = [...items].sort((left, right) => right.score - left.score);
  const selected: T[] = [];
  const usedGroups = new Set<string>();

  for (const item of sorted) {
    if (selected.length >= limit) {
      break;
    }

    if (!usedGroups.has(item.group)) {
      selected.push(item);
      usedGroups.add(item.group);
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
    prisma.investmentSnapshot.findMany({
      where: {
        workspaceId: resolvedWorkspace.id,
      },
      orderBy: [{ snapshotDate: "desc" }, { updatedAt: "desc" }],
      take: 2,
      select: {
        id: true,
        snapshotDate: true,
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

  const currentSummary = activeTransactions.reduce(
    (accumulator, transaction) => {
      const amount = Number(transaction.amount);
      if (transaction.type === "income") {
        accumulator.income += amount;
      } else if (transaction.type === "expense") {
        accumulator.expense += amount;
      } else {
        accumulator.transfer += amount;
      }

      if (transaction.type === "expense") {
        const categoryName = transaction.category?.name ?? "Uncategorized";
        accumulator.expenseCategories.set(
          categoryName,
          (accumulator.expenseCategories.get(categoryName) ?? 0) + Math.abs(amount)
        );
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

  const previousSummary = previousWindowTransactions.reduce(
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

  const currentSpend = currentSummary.expense;
  const previousSpend = previousSummary.expense;
  const currentNet = currentSummary.income - currentSummary.expense;
  const previousNet = previousSummary.income - previousSummary.expense;
  const currentSavingsRate = currentSummary.income > 0 ? currentNet / currentSummary.income : null;
  const previousSavingsRate = previousSummary.income > 0 ? (previousSummary.income - previousSummary.expense) / previousSummary.income : null;
  const spendDelta = previousSpend > 0 ? ((currentSpend - previousSpend) / previousSpend) * 100 : null;
  const incomeDelta = previousSummary.income > 0 ? ((currentSummary.income - previousSummary.income) / previousSummary.income) * 100 : null;
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
  const currentTransactionConfidence = clamp(
    average([toCountScore(transactionCount, 20), toCountScore(expenseTransactionCount, 15), toCountScore(workspaceAccounts.length, 6)])
  );
  const currentPatternConfidence = clamp(
    average([toCountScore(expenseTransactionCount, 15), toCountScore(currentSummary.expenseCategories.size, 3), toCountScore(weekendExpenses.length, 8)])
  );
  const currentRecurringConfidence = clamp(
    average([toCountScore(recurringDueSoon.length, 3), toCountScore(recurringMerchantCount, 5), toCountScore(commitmentsDueSoon.length, 3)])
  );
  const currentInvestmentConfidence = latestInvestmentSnapshot
    ? clamp(average([toCountScore(investmentSnapshots.length, 2), latestInvestmentSnapshot.gainLossValue === null ? 35 : 85]))
    : 0;
  const currentSplitConfidence = openSplitBillCount > 0
    ? clamp(average([toCountScore(openSplitBillCount, 3), openSplitBillAmount > 0 ? 100 : 0]))
    : 0;
  const currentGoalConfidence = goalLabel ? clamp(average([toCountScore(transactionCount, 20), goalProgress.bandLabel === "On track" ? 85 : 70])) : 0;

  const adviserCardWeights = {
    passive: { impact: 0.3, urgency: 0.18, confidence: 0.18, personalization: 0.16, recency: 0.1, actionability: 0.08 },
    recommendation: { impact: 0.22, urgency: 0.24, confidence: 0.16, personalization: 0.16, recency: 0.1, actionability: 0.12 },
    coaching: { impact: 0.16, urgency: 0.1, confidence: 0.18, personalization: 0.3, recency: 0.1, actionability: 0.16 },
    prompt: { impact: 0.18, urgency: 0.2, confidence: 0.18, personalization: 0.28, recency: 0.08, actionability: 0.08 },
  } satisfies Record<string, ScoreWeights>;

  const summaryCards = [
    {
      id: "money_left",
      title: "Money left",
      value: formatSignedCurrency(currentNet),
      tone: currentNet >= 0 ? "positive" : "warning",
      detail:
        currentSummary.income > 0
          ? `${formatCurrency(currentSummary.income)} income minus ${formatCurrency(currentSummary.expense)} spending`
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
          : `Based on your ${activeTransactionWindowLabel} income and expense mix`,
    },
  ];

  const passiveCards: RankedAdviserCard[] = selectTopRanked(
    [
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
      score: scoreCandidate(card.breakdown, adviserCardWeights.passive),
    })),
    3
  );

  const recommendationCards: RankedAdviserCard[] = selectTopRanked(
    [
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
      score: scoreCandidate(card.breakdown, adviserCardWeights.recommendation),
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
      score: scoreCandidate(card.breakdown, adviserCardWeights.coaching),
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
      score: scorePromptCandidate(prompt.breakdown, adviserCardWeights.prompt),
    })),
    4
  );

  return (
    <CloverShell active="adviser" title="Adviser">
      <section className="adviser-page">
        <header className="adviser-summary glass">
          <div className="adviser-summary__grid" aria-label="Adviser summary">
            {summaryCards.map((card) => (
              <article key={card.id} className="accounts-overview-card glass adviser-summary-card">
                <p className="eyebrow">{card.title}</p>
                <strong className={`accounts-overview-card__amount ${card.tone === "warning" ? "is-danger" : "is-good"}`}>{card.value}</strong>
                <p>{card.detail}</p>
              </article>
            ))}
          </div>
        </header>

        <section className="adviser-section">
          <p className="eyebrow">What Clover noticed</p>
          <div className="adviser-card-grid">
            {passiveCardsToRender.map((card) => (
              <Link key={card.id} href={card.href} className="adviser-card adviser-card--link glass">
                <span className={`adviser-card__tone adviser-card__tone--${card.tone}`} aria-hidden="true" />
                <strong>{card.title}</strong>
                <p>{card.summary}</p>
                <small>{card.evidence}</small>
                <span className="pill-link pill-link--inline">{card.ctaLabel}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="adviser-section">
          <p className="eyebrow">What you should do</p>
          <div className="adviser-card-grid">
            {recommendationCardsToRender.map((card) => (
              <Link key={card.id} href={card.href} className="adviser-card adviser-card--link glass">
                <span className={`adviser-card__tone adviser-card__tone--${card.tone}`} aria-hidden="true" />
                <strong>{card.title}</strong>
                <p>{card.summary}</p>
                <small>{card.evidence}</small>
                <span className="button button-primary button-small adviser-card__button">{card.ctaLabel}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="adviser-section">
          <p className="eyebrow">How you can improve</p>
          <div className="adviser-card-grid">
            {coachingCardsToRender.map((card) => (
              <Link key={card.id} href={card.href} className="adviser-card adviser-card--link glass">
                <span className={`adviser-card__tone adviser-card__tone--${card.tone}`} aria-hidden="true" />
                <strong>{card.title}</strong>
                <p>{card.summary}</p>
                <small>{card.evidence}</small>
                <span className="pill-link pill-link--inline">{card.ctaLabel}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="adviser-section adviser-section--chat">
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
