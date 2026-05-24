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

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const nextSevenDays = new Date(now);
  nextSevenDays.setDate(nextSevenDays.getDate() + 7);
  const nextFourteenDays = new Date(now);
  nextFourteenDays.setDate(nextFourteenDays.getDate() + 14);

  const [
    currentWindowTransactionsQuery,
    previousWindowTransactionsQuery,
    ninetyDayTransactionsQuery,
    recurringPatterns,
    financialCommitments,
    investmentSnapshots,
    splitBillWorkspaceData,
  ] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        workspaceId: resolvedWorkspace.id,
        isExcluded: false,
        date: { gte: thirtyDaysAgo },
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
      take: 500,
    }),
    prisma.transaction.findMany({
      where: {
        workspaceId: resolvedWorkspace.id,
        isExcluded: false,
        date: {
          gte: sixtyDaysAgo,
          lt: thirtyDaysAgo,
        },
      },
      select: {
        amount: true,
        type: true,
        category: {
          select: {
            name: true,
          },
        },
      },
    }),
    prisma.transaction.findMany({
      where: {
        workspaceId: resolvedWorkspace.id,
        isExcluded: false,
        date: { gte: ninetyDaysAgo },
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
      take: 500,
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

  const currentWindowTransactions = currentWindowTransactionsQuery as AdviserTransaction[];
  const previousWindowTransactions = previousWindowTransactionsQuery as Array<Pick<AdviserTransaction, "amount" | "type" | "category">>;
  const ninetyDayTransactions = ninetyDayTransactionsQuery as AdviserTransaction[];
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

  const currentSummary = currentWindowTransactions.reduce(
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

  const weekendExpenses = currentWindowTransactions.filter((transaction) => {
    const day = transaction.date.getDay();
    return transaction.type === "expense" && (day === 0 || day === 6);
  });
  const weekendExpenseShare = currentSpend > 0 ? weekendExpenses.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount)), 0) / currentSpend : 0;

  const uncategorizedTransactions = currentWindowTransactions.filter((transaction) => !transaction.category?.name || !transaction.merchantClean);

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

  const adviserHeadline =
    currentNet >= 0
      ? "Your money is holding together this month."
      : "Clover sees some pressure points worth attention.";
  const adviserSubheadline =
    topCategoryName !== null
      ? `${topCategoryName} is the biggest spending driver right now, and Clover can help you act on it.`
      : "Clover is looking across your accounts, activity, investments, recurring items, and split bills to surface the most useful next step.";

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

  const passiveCardsToRender =
    passiveCards.length > 0
      ? passiveCards
      : [
          {
            id: "import_more_activity",
            title: "Import more activity",
            summary: "Adviser gets sharper when Clover can see recent transactions, recurring costs, and account balances.",
            evidence: "Bring in statements or connect accounts to unlock the first set of signals.",
            ctaLabel: "Import data",
            href: "/imports",
            tone: "neutral" as const,
          },
          {
            id: "connect_investments",
            title: "Connect investments",
            summary: "Holdings and snapshots help Adviser show portfolio movement instead of spending only.",
            evidence: "A recent investment snapshot unlocks the investment movement card.",
            ctaLabel: "Open investments",
            href: "/investments",
            tone: "neutral" as const,
          },
          {
            id: "add_split_bills",
            title: "Track shared bills",
            summary: "Split bills give Adviser another useful signal for what still needs settlement.",
            evidence: "Add a shared bill to turn social spending into a clear next step.",
            ctaLabel: "Open split bills",
            href: "/split-bill",
            tone: "neutral" as const,
          },
        ];

  const recommendationCardsToRender =
    recommendationCards.length > 0
      ? recommendationCards
      : [
          {
            id: "review_data",
            title: "Review the latest data",
            summary: "Once Clover has more activity, Adviser can turn it into concrete actions.",
            evidence: "Start with imported transactions and connected accounts.",
            ctaLabel: "Open transactions",
            href: "/transactions",
            tone: "neutral" as const,
          },
          {
            id: "connect_recurring",
            title: "Check recurring items",
            summary: "Recurring bills and commitments become a stronger action lane once they are in the system.",
            evidence: "Add or import upcoming bills to create a clearer action queue.",
            ctaLabel: "Open recurring",
            href: "/recurring",
            tone: "neutral" as const,
          },
          {
            id: "start_goal",
            title: "Set a financial goal",
            summary: "Goals help Adviser decide what matters most when giving you next steps.",
            evidence: "A goal turns vague advice into a specific direction.",
            ctaLabel: "Open goals",
            href: "/goals",
            tone: "neutral" as const,
          },
        ];

  const coachingCardsToRender =
    coachingCards.length > 0
      ? coachingCards
      : [
          {
            id: "build_history",
            title: "Build more history",
            summary: "Coaching gets more useful as Clover learns your habits across a longer period.",
            evidence: "More statements mean better pattern spotting.",
            ctaLabel: "Import data",
            href: "/imports",
            tone: "neutral" as const,
          },
          {
            id: "add_goal",
            title: "Add a goal",
            summary: "Goals give Adviser a clear direction for encouragement and pacing.",
            evidence: "Even a simple target helps shape the guidance.",
            ctaLabel: "Open goals",
            href: "/goals",
            tone: "neutral" as const,
          },
          {
            id: "review_pattern",
            title: "Review a pattern",
            summary: "Once you have more transactions, Adviser can call out the habits worth adjusting.",
            evidence: "Watch for weekends, categories, and recurring costs.",
            ctaLabel: "Open reports",
            href: "/reports",
            tone: "neutral" as const,
          },
        ];

  const promptSuggestions: AdviserPrompt[] = sortByScore(
    [
      { id: "prompt-1", label: "What changed since last month?", prompt: "What changed since last month, and what should I pay attention to first?", score: 100 },
      recurringDueSoon.length > 0
        ? {
            id: "prompt-2",
            label: "Which recurring bills are coming up?",
            prompt: "Which recurring bills are coming up, and which ones should I review first?",
            score: 98,
          }
        : null,
      openSplitBillCount > 0
        ? {
            id: "prompt-3",
            label: "What do I still owe?",
            prompt: "How much do I still owe or am I owed from split bills?",
            score: 96,
          }
        : null,
      goalLabel
        ? {
            id: "prompt-4",
            label: "Am I on track for my goal?",
            prompt: `Am I on track for my goal of ${goalLabel.toLowerCase()}?`,
            score: 94,
          }
        : null,
      latestInvestmentSnapshot
        ? {
            id: "prompt-5",
            label: "What happened with investments?",
            prompt: "What happened with my investments, and what changed since the latest snapshot?",
            score: 92,
          }
        : null,
      {
        id: "prompt-6",
        label: "What should I review first?",
        prompt: "What should I review first if I want the biggest impact today?",
        score: 90,
      },
    ].filter((prompt): prompt is AdviserPrompt & { score: number } => prompt !== null)
  ).slice(0, 4);

  return (
    <CloverShell active="adviser" title="Adviser">
      <section className="adviser-page">
        <header className="adviser-hero glass">
          <div className="adviser-hero__copy">
            <p className="eyebrow">Adviser</p>
            <h1>{adviserHeadline}</h1>
            <p>{adviserSubheadline}</p>
          </div>

          <div className="adviser-hero__stats" aria-label="Adviser summary">
            <div className="adviser-stat">
              <span>Money left</span>
              <strong className={currentNet >= 0 ? "positive" : "negative"}>{formatSignedCurrency(currentNet)}</strong>
            </div>
            <div className="adviser-stat">
              <span>Savings rate</span>
              <strong>{currentSavingsRate === null ? "N/A" : formatPercent(currentSavingsRate * 100)}</strong>
            </div>
            <div className="adviser-stat">
              <span>Reviewed</span>
              <strong>{currentWindowTransactions.length} txns</strong>
            </div>
          </div>

          <div className="adviser-hero__chips">
            <span className="pill">{topCategoryName ?? "No clear driver yet"}</span>
            <span className="pill">{goalLabel ?? "No goal selected"}</span>
            <span className="pill">{workspaceAccounts.length} accounts</span>
          </div>
        </header>

        <section className="adviser-section">
          <div className="adviser-section__head">
            <div>
              <p className="eyebrow">What Clover noticed</p>
              <h2>Three signals worth your attention</h2>
            </div>
            <p className="adviser-section__lead">
              Clover ranks the strongest signals first so this page stays useful without feeling crowded.
            </p>
          </div>
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
          <div className="adviser-section__head">
            <div>
              <p className="eyebrow">What you should do</p>
              <h2>Three actions with real next steps</h2>
            </div>
            <p className="adviser-section__lead">
              Every recommendation lands on the exact area of the app where the user can finish the task.
            </p>
          </div>
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
          <div className="adviser-section__head">
            <div>
              <p className="eyebrow">How you can improve</p>
              <h2>Three coaching signals to build on</h2>
            </div>
            <p className="adviser-section__lead">
              This section is meant to feel supportive and habit-oriented, not preachy.
            </p>
          </div>
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
          <div className="adviser-section__head">
            <div>
              <p className="eyebrow">Ask Clover anything</p>
              <h2>Chat with Clover about the money story</h2>
            </div>
            <p className="adviser-section__lead">
              Pro users can ask natural-language questions and get grounded answers from the same data that powers Adviser.
            </p>
          </div>
          <AdviserChat isPro={user.planTier === "pro"} prompts={promptSuggestions} />
        </section>

        <section className="adviser-footnote">
          <div>
            <p className="eyebrow">Context</p>
            <p>
              Clover is looking at transactions, accounts, investments, recurring items, split bills, and goals together to decide what matters most.
            </p>
          </div>
          <div className="adviser-footnote__metrics">
            <div>
              <span>Top driver</span>
              <strong>{topCategoryName ?? "N/A"}</strong>
            </div>
            <div>
              <span>Recurring due soon</span>
              <strong>{recurringDueSoon.length}</strong>
            </div>
            <div>
              <span>Split bills open</span>
              <strong>{openSplitBillCount}</strong>
            </div>
            <div>
              <span>Investments</span>
              <strong>{investmentSnapshots.length > 0 ? "Tracked" : "None"}</strong>
            </div>
          </div>
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
