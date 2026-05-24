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

const sortByScore = <T extends { score: number }>(items: T[]) => items.sort((left, right) => right.score - left.score);

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

  const passiveCards: AdviserCard[] = sortByScore(
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
            score: 100,
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
            score: 95,
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
            score: weekendExpenseShare > 0.2 ? 90 : 60,
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
            score: 92,
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
            score: 88,
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
            score: 85,
          }
        : null,
    ].filter((card): card is AdviserCard & { score: number } => card !== null)
  ).slice(0, 3);

  const recommendationCards: AdviserCard[] = sortByScore(
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
            score: 100,
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
            score: 95,
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
            score: 90,
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
            score: 85,
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
            score: 80,
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
            score: 60,
          }
        : null,
    ].filter((card): card is AdviserCard & { score: number } => card !== null)
  ).slice(0, 3);

  const coachingCards: AdviserCard[] = sortByScore(
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
            score: 95,
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
            score: 92,
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
            score: 98,
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
            score: 84,
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
            score: 88,
          }
        : null,
      previousSummary.income > 0
        ? {
            id: "cashflow_consistency",
            title: "Cash flow consistency",
            summary: "Your month becomes steadier when income arrives before the biggest obligations.",
            evidence: `Income changed ${incomeDelta === null ? "without" : `by ${formatPercent(incomeDelta)}`} a lot versus the last 30 days.`,
            ctaLabel: "View reports",
            href: "/reports",
            tone: "neutral",
            score: 72,
          }
        : null,
    ].filter((card): card is AdviserCard & { score: number } => card !== null)
  ).slice(0, 3);

  const passiveCardsToRender = passiveCards;
  const recommendationCardsToRender = recommendationCards;
  const coachingCardsToRender = coachingCards;

  const promptSuggestions: AdviserPrompt[] = sortByScore(
    [
      topCategoryName
        ? {
            id: "prompt-top-category",
            label: `Why is ${topCategoryName} up?`,
            prompt: `Why is ${topCategoryName} driving my spending, and what should I look at first?`,
            score: 100,
          }
        : null,
      weekendExpenseShare > 0.2
        ? {
            id: "prompt-weekend-spend",
            label: "What’s driving weekend spending?",
            prompt: "What is driving my weekend spending, and what should I watch next?",
            score: 98,
          }
        : null,
      recurringDueSoon.length > 0
        ? {
            id: "prompt-recurring",
            label: "Which bills are due soon?",
            prompt: "Which recurring bills or commitments are due soon, and which ones matter most?",
            score: 96,
          }
        : null,
      openSplitBillCount > 0
        ? {
            id: "prompt-split-bills",
            label: "What’s still open in split bills?",
            prompt: "How much do I still owe or am I owed from split bills, and who should I settle with first?",
            score: 94,
          }
        : null,
      goalLabel
        ? {
            id: "prompt-goal",
            label: `Am I on track for ${goalLabel}?`,
            prompt: `Am I on track for my goal of ${goalLabel.toLowerCase()}?`,
            score: 92,
          }
        : null,
      latestInvestmentSnapshot
        ? {
            id: "prompt-investments",
            label: "What changed in investments?",
            prompt: "What changed in my latest investment snapshot, and what should I pay attention to?",
            score: 90,
          }
        : null,
      uncategorizedTransactions.length > 0
        ? {
            id: "prompt-cleanup",
            label: "What needs cleanup?",
            prompt: "Which transactions still need cleanup, and which ones should I fix first?",
            score: 88,
          }
        : null,
    ].filter((prompt): prompt is AdviserPrompt & { score: number } => prompt !== null)
  ).slice(0, 4);

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
