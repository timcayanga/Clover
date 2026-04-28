import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { CloverLoadingScreen } from "@/components/clover-loading-screen";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";
import { EmptyDataCta } from "@/components/empty-data-cta";
import { PostHogEvent } from "@/components/posthog-analytics";
import { analyticsOnceKey } from "@/lib/analytics";
import { getSessionContext } from "@/lib/auth";
import { listImportFilesCompat } from "@/lib/data-engine";
import {
  getInvestmentSubtypeLabel,
  isFixedIncomeInvestmentSubtype,
  isMarketInvestmentSubtype,
} from "@/lib/investments";
import { getGoalPlanSummary, getGoalProgressSnapshot, normalizeGoalPlan, type GoalKey } from "@/lib/goals";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Insights",
};

const selectedWorkspaceKey = "clover.selected-workspace-id.v1";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const monthFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "2-digit",
});

type InsightTransaction = {
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

type MonthBucket = {
  key: string;
  label: string;
  income: number;
  expense: number;
  net: number;
};

type WorkspaceAccount = {
  name: string;
  type: string;
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

const goalLabels: Record<string, string> = {
  save_more: "Save more",
  pay_down_debt: "Pay down debt",
  track_spending: "Track spending",
  build_emergency_fund: "Build an emergency fund",
  invest_better: "Invest better",
};

const formatCurrency = (value: number) => currencyFormatter.format(value);
const formatSignedCurrency = (value: number) => `${value < 0 ? "-" : ""}${currencyFormatter.format(Math.abs(value))}`;
const formatPercent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(0)}%`;
const formatShortDate = (value: Date) => shortDateFormatter.format(value);
const toIsoMonth = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const toMonthLabel = (date: Date) => monthFormatter.format(date);
const normalizeMerchant = (value: string) => value.trim().toLowerCase();
const buildTransactionsHref = (params: Record<string, string>) => `/transactions?${new URLSearchParams(params).toString()}`;

const getCategoryGlyph = (categoryName: string) => {
  const normalized = categoryName.trim().toLowerCase();
  if (normalized.includes("housing")) return "🏠";
  if (normalized.includes("grocer")) return "🛒";
  if (normalized.includes("food") || normalized.includes("dining") || normalized.includes("coffee")) return "☕";
  if (normalized.includes("transport") || normalized.includes("transit") || normalized.includes("ride")) return "🚌";
  if (normalized.includes("bill") || normalized.includes("utility") || normalized.includes("internet") || normalized.includes("phone"))
    return "💡";
  if (normalized.includes("subscription") || normalized.includes("stream")) return "↻";
  if (normalized.includes("entertainment") || normalized.includes("movie") || normalized.includes("cinema") || normalized.includes("concert")) return "🎬";
  if (normalized.includes("health") || normalized.includes("pharmacy") || normalized.includes("medicine")) return "✚";
  if (normalized.includes("income") || normalized.includes("salary") || normalized.includes("payroll")) return "↗";
  if (normalized.includes("transfer")) return "⇄";
  return "•";
};

const getInvestmentGlyph = (subtype: string | null | undefined) => {
  const normalized = subtype?.trim().toLowerCase() ?? "";
  if (normalized === "crypto") return "₿";
  if (normalized === "bond" || normalized === "time_deposit") return "🏦";
  if (normalized === "reit") return "🏢";
  if (
    normalized === "stock" ||
    normalized === "etf" ||
    normalized === "mutual_fund" ||
    normalized === "money_market_fund" ||
    normalized === "uitf"
  ) {
    return "↗";
  }
  return "•";
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

async function InsightsPageStream() {
  const now = new Date();
  let currentWindowTransactionsRaw: InsightTransaction[] = [];
  let previousWindowTransactionsRaw: InsightTransaction[] = [];
  let ninetyDayTransactions: InsightTransaction[] = [];
  let sixMonthTransactions: Array<Pick<InsightTransaction, "date" | "amount" | "type">> = [];
  let workspaceAccounts: WorkspaceAccount[] = [];
  let selectedGoalValue: string | null = null;
  let goalTargetAmount: number | null = null;
  let isFreshResetWorkspace = false;
  const session = await getSessionContext();
  const existingUser = await prisma.user.findUnique({
    where: { clerkUserId: session.userId },
  });
  const user = existingUser ?? (await getOrCreateCurrentUser(session.userId));
  if (!hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }
  const cookieStore = await cookies();
  const selectedWorkspaceCookieId = cookieStore.get(selectedWorkspaceKey)?.value ?? "";
  const workspaceInclude = {
    accounts: true,
  } as const;

  const selectedWorkspace =
    (selectedWorkspaceCookieId
      ? await prisma.workspace.findFirst({
          where: {
            id: selectedWorkspaceCookieId,
            userId: user.id,
          },
          include: workspaceInclude,
        })
      : null) ??
    (await prisma.workspace.findFirst({
      where: { userId: user.id },
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

  const workspaceImportFiles = await listImportFilesCompat(resolvedWorkspace.id);

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [currentWindowTransactionsQuery, previousWindowTransactionsQuery, ninetyDayTransactionsQuery, sixMonthTransactionsQuery] = await Promise.all([
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
    prisma.transaction.findMany({
      where: {
        workspaceId: resolvedWorkspace.id,
        isExcluded: false,
        date: { gte: sixMonthsAgo },
      },
      select: {
        date: true,
        amount: true,
        type: true,
      },
    }),
  ]);

  currentWindowTransactionsRaw = currentWindowTransactionsQuery as InsightTransaction[];
  previousWindowTransactionsRaw = previousWindowTransactionsQuery as InsightTransaction[];
  ninetyDayTransactions = ninetyDayTransactionsQuery as InsightTransaction[];
  sixMonthTransactions = sixMonthTransactionsQuery as Array<Pick<InsightTransaction, "date" | "amount" | "type">>;
  workspaceAccounts = resolvedWorkspace.accounts.map((account) => ({
    name: account.name,
    type: account.type,
    balance: account.balance === null ? null : Number(account.balance),
    investmentSubtype: account.investmentSubtype,
    investmentSymbol: account.investmentSymbol,
    investmentCostBasis: account.investmentCostBasis === null ? null : Number(account.investmentCostBasis),
    investmentPrincipal: account.investmentPrincipal === null ? null : Number(account.investmentPrincipal),
    investmentStartDate: account.investmentStartDate,
    investmentMaturityDate: account.investmentMaturityDate,
    investmentInterestRate: account.investmentInterestRate === null ? null : Number(account.investmentInterestRate),
    investmentMaturityValue: account.investmentMaturityValue === null ? null : Number(account.investmentMaturityValue),
  }));
  selectedGoalValue = user.primaryGoal?.trim() ?? null;
  goalTargetAmount = user.goalTargetAmount ? Number(user.goalTargetAmount) : null;
  isFreshResetWorkspace = user.dataWipedAt !== null && resolvedWorkspace.accounts.length <= 1 && workspaceImportFiles.length === 0;

  const reportType = "insights";
  const workspaceId = resolvedWorkspace.id;
  const currentWindowTransactions = currentWindowTransactionsRaw;
  const previousWindowTransactions = previousWindowTransactionsRaw;
  const ninetyDayInsightTransactions = ninetyDayTransactions;
  const sixMonthInsightTransactions = sixMonthTransactions as InsightTransaction[];
  const selectedGoal = selectedGoalValue;
  const isPro = user.planTier === "pro";
  const isEmptyWorkspace = workspaceAccounts.length <= 1 && workspaceImportFiles.length === 0 && currentWindowTransactions.length === 0;

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

  const monthBuckets = getMonthBuckets(now);
  sixMonthInsightTransactions.forEach((transaction) => {
    const bucket = monthBuckets.find((entry) => entry.key === toIsoMonth(transaction.date));
    if (!bucket) {
      return;
    }

    const amount = Number(transaction.amount);
    if (transaction.type === "income") {
      bucket.income += amount;
    } else if (transaction.type === "expense") {
      bucket.expense += Math.abs(amount);
    }
    bucket.net = bucket.income - bucket.expense;
  });

  const totalAccountBalance = workspaceAccounts
    .filter((account) => account.balance !== null)
    .reduce((sum, account) => sum + Number(account.balance ?? 0), 0);
  const activeAccountCount = workspaceAccounts.filter((account) => account.balance !== null).length;
  const investmentAccounts = workspaceAccounts.filter((account) => account.type === "investment");
  const investmentCurrentValue = investmentAccounts.reduce((sum, account) => sum + Math.max(0, account.balance ?? 0), 0);
  const investmentPurchaseValue = investmentAccounts.reduce((sum, account) => {
    const baseValue = account.investmentCostBasis ?? account.investmentPrincipal;
    return sum + Math.max(0, baseValue ?? 0);
  }, 0);
  const investmentGainLoss = investmentCurrentValue - investmentPurchaseValue;
  const investmentReturnPercent = investmentPurchaseValue > 0 ? investmentGainLoss / investmentPurchaseValue : null;
  const investmentPortfolioShare = totalAccountBalance > 0 ? investmentCurrentValue / totalAccountBalance : null;
  const investmentMarketValue = investmentAccounts
    .filter((account) => isMarketInvestmentSubtype(account.investmentSubtype))
    .reduce((sum, account) => sum + Math.max(0, account.balance ?? 0), 0);
  const investmentFixedIncomeValue = investmentAccounts
    .filter((account) => isFixedIncomeInvestmentSubtype(account.investmentSubtype))
    .reduce((sum, account) => sum + Math.max(0, account.balance ?? 0), 0);
  const ninetyDaysFromNow = new Date(now);
  ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);
  const investmentUpcomingMaturities = investmentAccounts.filter(
    (account) =>
      account.investmentMaturityDate !== null &&
      account.investmentMaturityDate >= now &&
      account.investmentMaturityDate <= ninetyDaysFromNow
  );
  const investmentCoverageIssues = investmentAccounts.filter((account) => {
    const isMarket = isMarketInvestmentSubtype(account.investmentSubtype);
    const isFixedIncome = isFixedIncomeInvestmentSubtype(account.investmentSubtype);
    const hasCurrentValue = account.balance !== null;
    const hasBaseValue = (account.investmentCostBasis ?? account.investmentPrincipal) !== null;
    const hasSymbol = !isMarket || Boolean(account.investmentSymbol?.trim());
    const hasMaturity = !isFixedIncome || account.investmentMaturityDate !== null;
    return !hasCurrentValue || !hasBaseValue || !hasSymbol || !hasMaturity;
  });
  const investmentValuedAccountCount = investmentAccounts.filter((account) => account.balance !== null).length;
  const investmentMix = new Map<
    string,
    {
      key: string;
      label: string;
      amount: number;
      count: number;
      icon: string;
    }
  >();
  investmentAccounts.forEach((account) => {
    const key = account.investmentSubtype ?? "other";
    const amount = Math.max(0, account.balance ?? account.investmentCostBasis ?? account.investmentPrincipal ?? 0);
    const existing = investmentMix.get(key) ?? {
      key,
      label: account.investmentSubtype ? getInvestmentSubtypeLabel(account.investmentSubtype) : "Unclassified",
      amount: 0,
      count: 0,
      icon: getInvestmentGlyph(account.investmentSubtype),
    };
    existing.amount += amount;
    existing.count += 1;
    investmentMix.set(key, existing);
  });
  const investmentMixRows = Array.from(investmentMix.values())
    .map((row) => ({
      ...row,
      share: investmentCurrentValue > 0 ? row.amount / investmentCurrentValue : 0,
    }))
    .sort((left, right) => right.amount - left.amount);
  const investmentTopHolding = investmentAccounts.slice().sort((left, right) => (right.balance ?? 0) - (left.balance ?? 0))[0] ?? null;
  const investmentTopHoldingShare =
    investmentTopHolding !== null && investmentCurrentValue > 0 && investmentTopHolding.balance !== null
      ? Number(investmentTopHolding.balance) / investmentCurrentValue
      : null;
  const investmentSummaryLine =
    isPro && investmentAccounts.length > 0
      ? `Investments total ${formatCurrency(investmentCurrentValue)} across ${investmentAccounts.length} holdings${
          investmentMarketValue > 0 || investmentFixedIncomeValue > 0
            ? `, with ${formatCurrency(investmentMarketValue)} in market holdings and ${formatCurrency(investmentFixedIncomeValue)} in fixed income.`
            : "."
        }`
      : null;

  const uncategorizedTransactions = currentWindowTransactions.filter(
    (transaction) => !transaction.category?.name || !transaction.merchantClean
  );

  const duplicateGroups = new Map<string, InsightTransaction[]>();
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

  const possibleDuplicateGroups = Array.from(duplicateGroups.values())
    .filter((group) => group.length > 1)
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);

  const importStatusCounts = workspaceImportFiles.reduce(
    (counts, file) => {
      counts[file.status] += 1;
      return counts;
    },
    {
      processing: 0,
      done: 0,
      failed: 0,
      deleted: 0,
    }
  );

  const currentNet = currentSummary.income - currentSummary.expense;
  const previousNet = previousSummary.income - previousSummary.expense;
  const currentSpend = currentSummary.expense;
  const previousSpend = previousSummary.expense;
  const currentSavingsRate = currentSummary.income > 0 ? currentNet / currentSummary.income : null;
  const previousSavingsRate = previousSummary.income > 0 ? (previousSummary.income - previousSummary.expense) / previousSummary.income : null;
  const spendDelta = previousSpend > 0 ? ((currentSpend - previousSpend) / previousSpend) * 100 : null;
  const incomeDelta =
    previousSummary.income > 0 ? ((currentSummary.income - previousSummary.income) / previousSummary.income) * 100 : null;
  const currentGoalPlan = normalizeGoalPlan(user.goalPlan, selectedGoalValue as GoalKey | null, goalTargetAmount);
  const goalPlanSummary = getGoalPlanSummary(currentGoalPlan, currentSummary.income > 0 ? currentSummary.income : null);

  const topCategories = Array.from(currentSummary.expenseCategories.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const previousTopCategories = Array.from(previousSummary.expenseCategories.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const topCategoryShare = currentSpend > 0 ? (topCategories[0]?.[1] ?? 0) / currentSpend : null;
  const currentMonthKey = monthBuckets[monthBuckets.length - 1]?.key ?? toIsoMonth(now);

  const merchantSpend = new Map<
    string,
    {
      label: string;
      amount: number;
      count: number;
      firstSeen: Date;
      lastSeen: Date;
    }
  >();

  ninetyDayInsightTransactions.forEach((transaction) => {
    if (transaction.type !== "expense") {
      return;
    }

    const label = transaction.merchantClean ?? transaction.merchantRaw;
    const key = normalizeMerchant(label);
    const existing = merchantSpend.get(key) ?? {
      label,
      amount: 0,
      count: 0,
      firstSeen: transaction.date,
      lastSeen: transaction.date,
    };
    existing.amount += Math.abs(Number(transaction.amount));
    existing.count += 1;
    existing.firstSeen = existing.firstSeen < transaction.date ? existing.firstSeen : transaction.date;
    existing.lastSeen = existing.lastSeen > transaction.date ? existing.lastSeen : transaction.date;
    merchantSpend.set(key, existing);
  });

  const recurringMerchants = Array.from(merchantSpend.values())
    .filter((merchant) => merchant.count > 1)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  const categoryDriverChanges = Array.from(
    new Set([...currentSummary.expenseCategories.keys(), ...previousSummary.expenseCategories.keys()])
  )
    .map((categoryName) => {
      const currentAmount = currentSummary.expenseCategories.get(categoryName) ?? 0;
      const previousAmount = previousSummary.expenseCategories.get(categoryName) ?? 0;
      const delta = currentAmount - previousAmount;
      const deltaPercent = previousAmount > 0 ? (delta / previousAmount) * 100 : null;
      return {
        categoryName,
        currentAmount,
        previousAmount,
        delta,
        deltaPercent,
      };
    })
    .filter((entry) => Math.abs(entry.delta) > 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 4);

  const goalLabel = selectedGoal ? goalLabels[selectedGoal] ?? selectedGoal : null;

  const confidenceScore = Math.max(
    55,
    Math.min(
      99,
      52 +
        currentWindowTransactions.length * 0.2 +
        ninetyDayInsightTransactions.length * 0.1 +
        (importStatusCounts.done > 0 ? 8 : 0) -
        importStatusCounts.failed * 6 -
        (uncategorizedTransactions.length + possibleDuplicateGroups.length) * 1.5
    )
  );
  const confidenceLabel = confidenceScore >= 85 ? "High confidence" : confidenceScore >= 70 ? "Good confidence" : "Watch closely";

  const trendDirection = currentNet >= previousNet ? "improving" : "softening";
  const spendDirection =
    spendDelta === null ? "stable" : spendDelta > 4 ? "up" : spendDelta < -4 ? "down" : "stable";
  const goalProgress = getGoalProgressSnapshot({
    goalKey: selectedGoalValue as GoalKey | null,
    targetAmount: goalTargetAmount,
    goalPlan: currentGoalPlan,
    currentNet,
    currentSpend,
    monthlyIncome: currentSummary.income > 0 ? currentSummary.income : null,
    currentSavingsRate,
    previousSavingsRate,
    spendDelta,
    recurringShare: recurringMerchants.reduce((sum, merchant) => sum + merchant.amount, 0) / Math.max(currentSpend, 1),
  });

  const headlineDriver = topCategories[0]?.[0] ?? "No clear driver yet";
  const headlineDriverAmount = topCategories[0]?.[1] ?? 0;
  const headlineDriverShare = currentSpend > 0 ? (headlineDriverAmount / currentSpend) * 100 : null;

  const aiHeadline =
    topCategories[0] !== undefined
      ? goalLabel !== null
        ? goalTargetAmount !== null
          ? `${goalLabel} is ${goalProgress.progressPercent === null ? "set" : `${Math.round(goalProgress.progressPercent)}% complete`}, while ${headlineDriver} is the main pressure point.`
          : `${headlineDriver} is the main pressure point, even while you are on track for ${goalLabel.toLowerCase()}.`
        : `${headlineDriver} is the biggest spend area this month.`
      : currentNet >= 0
        ? "Cash flow looks positive, but the driver is still unclear."
        : "Cash flow looks negative, but the driver is still unclear.";

  const aiSummary =
    spendDelta === null || incomeDelta === null
      ? "More activity will sharpen the next insight."
      : [
          currentNet >= 0
            ? `Net cash flow is positive at ${formatSignedCurrency(currentNet)}.`
            : `Net cash flow is negative at ${formatSignedCurrency(currentNet)}.`,
          topCategories[0] !== undefined ? `${headlineDriver} makes up ${formatPercent(headlineDriverShare ?? 0)} of tracked spend.` : null,
          recurringMerchants[0] !== undefined
            ? `${recurringMerchants[0].label} repeats ${recurringMerchants[0].count} times over 90 days.`
            : null,
        ]
          .filter((line): line is string => line !== null)
          .join(" ");
  const aiSummaryWithInvestments = investmentSummaryLine ? `${aiSummary} ${investmentSummaryLine}` : aiSummary;
  const primarySnapshotItems = [
    {
      label: "Net position",
      value: formatSignedCurrency(currentNet),
      note: currentNet >= previousNet ? "Up vs prior period" : "Down vs prior period",
      tone: currentNet >= 0 ? "positive" : "negative",
    },
    {
      label: "Savings rate",
      value: currentSavingsRate === null ? "N/A" : formatPercent(currentSavingsRate * 100),
      note:
        goalLabel !== null && goalTargetAmount !== null
          ? `${goalProgress.bandLabel} · ${formatCurrency(goalProgress.currentAmount)} of ${formatCurrency(goalTargetAmount)}${goalPlanSummary?.subtitle ? ` · ${goalPlanSummary.subtitle}` : ""}`
          : goalLabel ?? "No primary goal set yet",
      tone: currentSavingsRate !== null && currentSavingsRate >= 0.2 ? "positive" : "neutral",
    },
    {
      label: "Top driver",
      value: headlineDriver,
      note: `${formatCurrency(headlineDriverAmount)}${headlineDriverShare === null ? "" : ` · ${formatPercent(headlineDriverShare)}`}`,
      tone: "neutral",
    },
  ];

  const priorityActions = [
    {
      title: topCategories[0] ? `Review ${headlineDriver.toLowerCase()}` : "Review spending",
      body: topCategories[0]
        ? `${formatCurrency(headlineDriverAmount)} sits in this category this month.`
        : "Open the transactions behind this month's summary.",
      href: topCategories[0] ? buildTransactionsHref({ category: headlineDriver }) : "/transactions",
      label: "Open category",
    },
    {
      title: uncategorizedTransactions.length > 0 ? `Fix ${uncategorizedTransactions.length} uncategorized rows` : "Clean up rows",
      body: uncategorizedTransactions.length > 0
        ? "Clear rows with missing categories or merchants to sharpen the next insight pass."
        : "Keep imported rows clean so the insights stay trustworthy.",
      href: "/transactions",
      label: "Review rows",
    },
    {
      title: goalLabel ? `Check ${goalLabel.toLowerCase()}` : "Set a goal",
      body:
        goalLabel && goalTargetAmount !== null
          ? `Use ${goalProgress.nextAction} The current band is ${goalProgress.bandLabel.toLowerCase()}.`
          : goalLabel === "Invest better" && investmentAccounts.length > 0
            ? "Open the portfolio and decide which holdings should grow or rebalance."
          : goalLabel
            ? `Use ${goalLabel.toLowerCase()} as the benchmark for this month.`
            : "A goal turns trends into a direction.",
      href: goalLabel === "Invest better" && investmentAccounts.length > 0 ? "/investments" : "/goals",
      label: goalLabel === "Invest better" && investmentAccounts.length > 0 ? "Open investments" : goalLabel ? "Open goal" : "Set goal",
    },
  ];

  const driverInsightCards = categoryDriverChanges.map((driver) => ({
    ...driver,
    title: `${driver.categoryName} ${driver.delta > 0 ? "rose" : "fell"} by ${formatCurrency(Math.abs(driver.delta))}`,
    evidence:
      driver.previousAmount > 0
        ? `${formatCurrency(driver.previousAmount)} last month to ${formatCurrency(driver.currentAmount)} now`
        : `${formatCurrency(driver.currentAmount)} spent this month`,
    nextStep: `Review the ${driver.categoryName.toLowerCase()} transactions and decide whether to cap or keep this level.`,
    href: buildTransactionsHref({ category: driver.categoryName }),
  }));

  const recurringInsightCards = recurringMerchants.map((merchant) => ({
    ...merchant,
    title: `${merchant.label} appears ${merchant.count} times`,
    evidence: `${formatCurrency(merchant.amount)} over the last 90 days`,
    nextStep: `Open the merchant transactions and decide whether this is a fixed cost or a habit to trim.`,
    href: buildTransactionsHref({ merchant: merchant.label }),
  }));

  const weekendExpenses = currentWindowTransactions.filter((transaction) => {
    const day = transaction.date.getDay();
    return transaction.type === "expense" && (day === 0 || day === 6);
  });
  const weekendExpenseShare = currentSpend > 0 ? weekendExpenses.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount)), 0) / currentSpend : 0;

  const behaviorInsightCards = [
    {
      title: "Weekend spending",
      evidence: `Weekend spending makes up ${formatPercent(weekendExpenseShare * 100)} of this month's expenses.`,
      soWhat:
        weekendExpenseShare > 0.3
          ? "Weekends are a real pressure point this month."
          : "Weekend behavior looks fairly contained compared with the rest of the month.",
      nextStep: `Review weekend transactions from ${monthBuckets[monthBuckets.length - 1]?.label ?? "this month"} and check for repeat patterns.`,
      href: buildTransactionsHref({ month: currentMonthKey }),
      icon: "🗓",
    },
    {
      title: "Concentration",
      evidence: `Your top category is ${topCategoryShare ? formatPercent(topCategoryShare * 100) : "N/A"} of this month's spending.`,
      soWhat:
        topCategoryShare && topCategoryShare > 0.35
          ? "A single category is carrying a lot of the spend load."
          : "Spending is spread a little more evenly across categories.",
      nextStep: topCategories[0]
        ? `Open ${headlineDriver.toLowerCase()} transactions and decide on a monthly limit.`
        : "Open transactions and see which categories are taking the most room.",
      href: topCategories[0] ? buildTransactionsHref({ category: headlineDriver }) : "/transactions",
      icon: "🎯",
    },
    {
      title: "Data quality",
      evidence:
        importStatusCounts.failed > 0
          ? `${importStatusCounts.failed} failed import${importStatusCounts.failed === 1 ? "" : "s"} still need attention`
          : "Imports look clean enough for guidance",
      soWhat:
        importStatusCounts.failed > 0
          ? "Some of the advice may be less reliable until the failed files are resolved."
          : "The data is clean enough to trust the current insight pass.",
      nextStep: importStatusCounts.failed > 0 ? "Open imports and clear the failed files first." : "Keep the imports flowing so the page stays current.",
      href: "/imports",
      icon: "🧼",
    },
    {
      title: "Goal context",
      evidence: goalLabel ?? "No primary goal set yet",
      soWhat: goalLabel ? "The page can measure progress against a specific target." : "Without a goal, the page can explain behavior but not judge progress.",
      nextStep: goalLabel ? "Use this goal to decide which spending changes matter most." : "Set one goal so the next insight has a destination.",
      href: "/goals",
      icon: "🎯",
    },
  ];
  const visibleDriverInsightCards = isPro ? driverInsightCards : driverInsightCards.slice(0, 2);
  const visibleRecurringInsightCards = isPro ? recurringInsightCards : recurringInsightCards.slice(0, 2);
  const visibleBehaviorInsightCards = isPro ? behaviorInsightCards : behaviorInsightCards.slice(0, 2);

  const showInvestmentSection = isPro && investmentAccounts.length > 0;

  const chartWidth = 520;
  const chartHeight = 150;
  const chartPadding = 18;
  const chartXSpan = chartWidth - chartPadding * 2;
  const chartYSpan = chartHeight - chartPadding * 2;
  const monthValues = monthBuckets.map((bucket) => bucket.net);
  const chartMax = Math.max(...monthValues);
  const chartMin = Math.min(...monthValues);
  const chartRange = Math.max(chartMax - chartMin, 1);
  const chartPoints = monthBuckets.map((bucket, index) => {
    const x = chartPadding + (index / Math.max(monthBuckets.length - 1, 1)) * chartXSpan;
    const normalized = (bucket.net - chartMin) / chartRange;
    const y = chartPadding + (1 - normalized) * chartYSpan;
    return { ...bucket, x, y };
  });
  const chartPath = chartPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");

  const headlineNetLabel =
    currentNet >= previousNet
      ? `${formatSignedCurrency(currentNet)} this month, up from ${formatSignedCurrency(previousNet)} last month`
      : `${formatSignedCurrency(currentNet)} this month, down from ${formatSignedCurrency(previousNet)} last month`;

  const recurringCostsTotal = recurringMerchants.reduce((sum, merchant) => sum + merchant.amount, 0);
  const recurringSavingsPotential = recurringCostsTotal * 0.2;
  const topCategoryOpportunity = topCategories[0] ? topCategories[0][1] * 0.2 : 0;
  const annualRecurringOpportunity = recurringSavingsPotential * 12;
  const trackedCategorySpend = topCategories.reduce((sum, [, amount]) => sum + amount, 0);
  const otherSpend = Math.max(currentSpend - trackedCategorySpend, 0);
  const trackedCategoryShare = currentSpend > 0 ? trackedCategorySpend / currentSpend : 0;

  return (
    <CloverShell
      active="insights"
      title="A clearer view of what your money is doing."
      subtitle="A simple summary of cash flow, patterns, and next steps."
      showTopbar={false}
    >
      <PostHogEvent
        event="insight_generated"
        onceKey={analyticsOnceKey("insight_generated", `workspace:${workspaceId}:${reportType}`)}
        properties={{
          workspace_id: workspaceId,
          report_type: reportType,
          goal: goalLabel ?? null,
          confidence_score: confidenceScore,
        }}
      />
      <PostHogEvent
        event="insight_opened"
        onceKey={analyticsOnceKey("insight_opened", `workspace:${workspaceId}:${reportType}`)}
        properties={{
          workspace_id: workspaceId,
          report_type: reportType,
          insight_type: "insights_overview",
        }}
      />
      <PostHogEvent
        event="cashflow_viewed"
        onceKey={analyticsOnceKey("cashflow_viewed", `workspace:${workspaceId}:${reportType}`)}
        properties={{
          workspace_id: workspaceId,
          report_type: reportType,
          chart_type: "line",
        }}
      />
      <PostHogEvent
        event="category_mix_viewed"
        onceKey={analyticsOnceKey("category_mix_viewed", `workspace:${workspaceId}:${reportType}`)}
        properties={{
          workspace_id: workspaceId,
          report_type: reportType,
          chart_type: "donut",
        }}
      />
      <PostHogEvent
        event="top_sources_viewed"
        onceKey={analyticsOnceKey("top_sources_viewed", `workspace:${workspaceId}:${reportType}`)}
        properties={{
          workspace_id: workspaceId,
          report_type: reportType,
          chart_type: "list",
        }}
      />
      <PostHogEvent
        event="trend_line_viewed"
        onceKey={analyticsOnceKey("trend_line_viewed", `workspace:${workspaceId}:${reportType}`)}
        properties={{
          workspace_id: workspaceId,
          report_type: reportType,
          chart_type: "timeline",
        }}
      />
      {isEmptyWorkspace ? (
        <div style={{ marginBottom: 20 }}>
          <EmptyDataCta
            eyebrow={isFreshResetWorkspace ? "Fresh start" : "No data yet"}
            title="Import files to wake up your insights."
            copy="Clover needs a statement or account activity before it can spot patterns, trends, and habits. Import files first for the fastest way to bring this page to life."
            importHref="/dashboard?import=1"
            accountHref="/accounts"
            transactionHref="/transactions?manual=1"
          />
        </div>
      ) : null}
      <section className="insights-story">
        <article className="insights-snapshot insights-snapshot--hero glass">
          <div className="insights-snapshot__copy">
            <h3>{aiHeadline}</h3>
            <p>{aiSummaryWithInvestments}</p>
            <div className="insights-snapshot__summary">
              <span className={`pill ${currentNet >= 0 ? "pill-good" : "pill-danger"}`}>
                {currentNet >= 0 ? "On track" : "Needs attention"}
              </span>
              <span>{currentWindowTransactions.length} transactions reviewed</span>
              <span>{goalLabel ?? "No primary goal set yet"}</span>
              {showInvestmentSection ? <span>{investmentAccounts.length} investment holdings</span> : null}
            </div>
          </div>

          <div className="insights-snapshot__metrics" aria-label="Insights snapshot metrics">
            {primarySnapshotItems.map((item) => (
              <div key={item.label} className="insights-snapshot__metric">
                <span>{item.label}</span>
                <strong className={item.tone === "positive" ? "positive" : item.tone === "negative" ? "negative" : undefined}>
                  {item.value}
                  {item.suffix ?? ""}
                </strong>
                <small>{item.note}</small>
              </div>
            ))}
          </div>

          <div className="insights-snapshot__priority">
            <p className="eyebrow">Priority</p>
          </div>

          <div className="insights-snapshot__actions">
            {priorityActions.map((action) => (
              <article key={action.title} className="insights-snapshot__action">
                <div>
                  <strong>{action.title}</strong>
                  <span>{action.body}</span>
                </div>
                <Link className="pill-link pill-link--inline" href={action.href}>
                  {action.label}
                </Link>
              </article>
            ))}
          </div>
        </article>

        {showInvestmentSection ? (
          <article className="insight-panel glass">
            <div className="insight-panel__head">
              <div>
                <p className="eyebrow">Investments</p>
                <h4>Portfolio at a glance</h4>
                <span className="insight-panel__hint">Pulled from investment accounts in this workspace.</span>
              </div>
              <div className="insight-panel__stat">
                <strong className={investmentGainLoss >= 0 ? "positive" : "negative"}>{formatSignedCurrency(investmentGainLoss)}</strong>
                <span>{investmentGainLoss >= 0 ? "Unrealized gain" : "Unrealized loss"}</span>
              </div>
            </div>

            <div className="insight-signal-grid">
              <div className="insight-signal">
                <span>Current value</span>
                <strong>{formatCurrency(investmentCurrentValue)}</strong>
                <small>{investmentPortfolioShare === null ? "Of tracked assets" : `${formatPercent(investmentPortfolioShare * 100)} of tracked assets`}</small>
              </div>
              <div className="insight-signal">
                <span>Cost basis</span>
                <strong>{formatCurrency(investmentPurchaseValue)}</strong>
                <small>{investmentAccounts.length} holdings tracked</small>
              </div>
              <div className="insight-signal">
                <span>Gain / loss</span>
                <strong className={investmentGainLoss >= 0 ? "positive" : "negative"}>{formatSignedCurrency(investmentGainLoss)}</strong>
                <small>{investmentReturnPercent === null ? "No return baseline" : `${formatPercent(investmentReturnPercent * 100)} since purchase`}</small>
              </div>
              <div className="insight-signal">
                <span>Due within 90 days</span>
                <strong>{investmentUpcomingMaturities.length}</strong>
                <small>
                  {investmentFixedIncomeValue === 0
                    ? "No fixed-income balance yet"
                    : `${formatCurrency(investmentFixedIncomeValue)} in fixed-income holdings`}
                </small>
              </div>
            </div>

            <div className="insight-donut">
              <div className="insight-donut__chart" role="img" aria-label="Investment allocation donut chart">
                <svg viewBox="0 0 240 240">
                  <defs>
                    <linearGradient id="investment-donut-gradient" x1="0" x2="1" y1="0" y2="1">
                      <stop offset="0%" stopColor="rgba(3,168,192,0.28)" />
                      <stop offset="100%" stopColor="rgba(3,168,192,0.82)" />
                    </linearGradient>
                  </defs>
                  <circle cx="120" cy="120" r="82" className="insight-donut__track" />
                  {investmentMixRows.length > 0
                    ? (() => {
                        let offset = 0;
                        return investmentMixRows.map((row, index) => {
                          const share = investmentCurrentValue > 0 ? row.amount / investmentCurrentValue : 0;
                          const circumference = 2 * Math.PI * 82;
                          const dashLength = share * circumference;
                          const colors = [
                            "url(#investment-donut-gradient)",
                            "var(--accent-light)",
                            "rgba(37, 99, 235, 0.76)",
                            "rgba(16, 185, 129, 0.76)",
                            "rgba(245, 158, 11, 0.78)",
                          ];
                          const segment = (
                            <circle
                              key={row.key}
                              cx="120"
                              cy="120"
                              r="82"
                              className="insight-donut__segment"
                              style={{
                                stroke: colors[index % colors.length],
                                strokeDasharray: `${dashLength} ${circumference}`,
                                strokeDashoffset: -offset,
                              }}
                            />
                          );
                          offset += dashLength;
                          return segment;
                        });
                      })()
                    : null}
                </svg>
                <div className="insight-donut__center">
                  <strong>{formatCurrency(investmentCurrentValue)}</strong>
                  <span>Portfolio value</span>
                </div>
              </div>

              <div className="insight-donut__legend">
                {investmentMixRows.length > 0 ? (
                  investmentMixRows.map((row) => (
                    <Link key={row.key} href="/investments" className="insight-donut__item insight-donut__item--link">
                      <span className="insight-donut__icon" aria-hidden="true">
                        {row.icon}
                      </span>
                      <div className="insight-donut__meta">
                        <strong>{row.label}</strong>
                        <span>
                          {formatCurrency(row.amount)} · {formatPercent(row.share * 100)}
                        </span>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="empty-state">Add current values to see how the portfolio is distributed.</div>
                )}
                <div className="insight-donut__item">
                  <span className="insight-donut__icon" aria-hidden="true">
                    •
                  </span>
                  <div className="insight-donut__meta">
                    <strong>Valued holdings</strong>
                    <span>
                      {investmentValuedAccountCount} of {investmentAccounts.length}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="insight-pattern-grid">
              <div className="insight-pattern-card">
                <p className="eyebrow">Portfolio mix</p>
                <div className="insight-list">
                  {investmentMixRows.length > 0 ? (
                    investmentMixRows.slice(0, 3).map((row) => (
                      <Link key={row.key} href="/investments" className="insight-list__item insight-list__item--link">
                        <strong>
                          <span className="insight-list__icon" aria-hidden="true">
                            {row.icon}
                          </span>
                          {row.label}
                        </strong>
                        <span>
                          {formatCurrency(row.amount)} · {formatPercent(row.share * 100)} of portfolio
                        </span>
                        <span className="insight-list__callout">
                          So what: this slice shows where the portfolio is most concentrated.
                        </span>
                        <span className="insight-list__callout">
                          Next step: open Investments and decide if this weight should stay or be rebalanced.
                        </span>
                      </Link>
                    ))
                  ) : (
                    <div className="empty-state">Add current values to see how the portfolio is distributed.</div>
                  )}
                </div>
              </div>

              <div className="insight-pattern-card">
                <p className="eyebrow">What to watch</p>
                <div className="insight-list">
                  <div className="insight-list__item">
                    <strong>
                      <span className="insight-list__icon" aria-hidden="true">
                        🎯
                      </span>
                      Concentration
                    </strong>
                    <span>
                      {investmentTopHolding !== null && investmentTopHolding.balance !== null
                        ? `${investmentTopHolding.name} is ${formatPercent((investmentTopHoldingShare ?? 0) * 100)} of the portfolio.`
                        : "No holding is valued yet, so concentration is still unclear."}
                    </span>
                    <span className="insight-list__callout">
                      So what: one holding may be carrying too much of the portfolio's weight.
                    </span>
                    <span className="insight-list__callout">
                      Next step: review the biggest holding and decide whether it deserves its current share.
                    </span>
                  </div>

                  <div className="insight-list__item">
                    <strong>
                      <span className="insight-list__icon" aria-hidden="true">
                        🗓
                      </span>
                      Maturities
                    </strong>
                    <span>
                      {investmentUpcomingMaturities.length > 0
                        ? `${investmentUpcomingMaturities.length} fixed-income holding${investmentUpcomingMaturities.length === 1 ? "" : "s"} mature in the next 90 days.`
                        : "No fixed-income maturities are coming due in the next 90 days."}
                    </span>
                    <span className="insight-list__callout">
                      So what: the portfolio may need a rollover or redeployment plan soon.
                    </span>
                    <span className="insight-list__callout">
                      Next step: review maturity dates and decide whether to reinvest or hold cash.
                    </span>
                  </div>

                  <div className="insight-list__item">
                    <strong>
                      <span className="insight-list__icon" aria-hidden="true">
                        🧼
                      </span>
                      Coverage
                    </strong>
                    <span>
                      {investmentCoverageIssues.length > 0
                        ? `${investmentCoverageIssues.length} holding${investmentCoverageIssues.length === 1 ? "" : "s"} still need value, symbol, or date details.`
                        : "Every investment has enough detail for a cleaner portfolio snapshot."}
                    </span>
                    <span className="insight-list__callout">
                      So what: incomplete investment data can blur the portfolio readout.
                    </span>
                    <span className="insight-list__callout">
                      Next step: open Investments and fill in the missing fields.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </article>
        ) : null}

        <article className="insight-panel insight-panel--feature glass">
          <div className="insight-panel__head">
            <div>
              <p className="eyebrow">What happened</p>
              <h4>Cash flow momentum</h4>
              <span className="insight-panel__hint">Tap a month to open matching transactions.</span>
            </div>
            <div className="insight-panel__stat">
              <strong className={currentNet >= 0 ? "positive" : "negative"}>{formatSignedCurrency(currentNet)}</strong>
              <span>{currentNet >= previousNet ? "Up vs prior period" : "Down vs prior period"}</span>
            </div>
          </div>

          <div className="insight-signal-grid">
            <div className="insight-signal">
              <span>Income</span>
              <strong>{formatCurrency(currentSummary.income)}</strong>
              <small>{incomeDelta === null ? "No comparison period" : `${formatPercent(incomeDelta)} vs last 30 days`}</small>
            </div>
            <div className="insight-signal">
              <span>Expenses</span>
              <strong>{formatCurrency(currentSpend)}</strong>
              <small>{spendDelta === null ? "No comparison period" : `${formatPercent(spendDelta)} vs last 30 days`}</small>
            </div>
            <div className="insight-signal">
              <span>Net</span>
              <strong className={currentNet >= 0 ? "positive" : "negative"}>{formatSignedCurrency(currentNet)}</strong>
              <small>{previousNet === 0 ? "No prior baseline" : `${formatSignedCurrency(previousNet)} previously`}</small>
            </div>
            <div className="insight-signal">
              <span>Saving</span>
              <strong>{currentSavingsRate === null ? "N/A" : formatPercent(currentSavingsRate * 100)}</strong>
              <small>{goalLabel ?? "Add a goal to focus the guidance"}</small>
            </div>
          </div>

          <div className="insight-chart">
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="Net cash flow over the last six months">
              <defs>
                <linearGradient id="insight-flow-gradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(3,168,192,0.3)" />
                  <stop offset="100%" stopColor="rgba(3,168,192,0.04)" />
                </linearGradient>
              </defs>
              <path
                d={`${chartPath} L ${chartPoints[chartPoints.length - 1].x.toFixed(1)} ${chartHeight - chartPadding} L ${chartPoints[0].x.toFixed(1)} ${chartHeight - chartPadding} Z`}
                fill="url(#insight-flow-gradient)"
              />
              <path d={chartPath} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              {chartPoints.map((point) => (
                <circle key={point.key} cx={point.x} cy={point.y} r="5.5" fill="white" stroke="var(--accent)" strokeWidth="3" />
              ))}
            </svg>
            <div className="insight-chart__labels">
              {chartPoints.map((point) => (
                <Link key={point.key} href={buildTransactionsHref({ month: point.key })} className="insight-chart__label insight-chart__label--link">
                  <span>{point.label}</span>
                  <strong>{formatCurrency(point.net)}</strong>
                </Link>
              ))}
            </div>
          </div>

        </article>

        <article className="insight-panel glass">
          <div className="insight-panel__head">
            <div>
              <p className="eyebrow">Where your money went</p>
              <h4>Spending concentration</h4>
              <span className="insight-panel__hint">Tap a category to open matching transactions.</span>
            </div>
            <div className="insight-panel__stat">
              <strong>{formatPercent(trackedCategoryShare * 100)}</strong>
              <span>In tracked categories</span>
            </div>
          </div>

          <div className="insight-donut">
            <div className="insight-donut__chart" role="img" aria-label="Spending breakdown donut chart">
              <svg viewBox="0 0 240 240">
                <defs>
                  <linearGradient id="insight-donut-gradient" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%" stopColor="rgba(3,168,192,0.26)" />
                    <stop offset="100%" stopColor="rgba(3,168,192,0.8)" />
                  </linearGradient>
                </defs>
                <circle cx="120" cy="120" r="82" className="insight-donut__track" />
                {topCategories.length > 0
                  ? (() => {
                      let offset = 0;
                      return topCategories.map(([categoryName, amount], index) => {
                        const share = currentSpend > 0 ? amount / currentSpend : 0;
                        const circumference = 2 * Math.PI * 82;
                        const dashLength = share * circumference;
                        const segment = (
                          <circle
                            key={categoryName}
                            cx="120"
                            cy="120"
                            r="82"
                            className="insight-donut__segment"
                            style={{
                              stroke: `var(${index % 2 === 0 ? "--accent" : "--accent-light"})`,
                              strokeDasharray: `${dashLength} ${circumference}`,
                              strokeDashoffset: -offset,
                            }}
                          />
                        );
                        offset += dashLength;
                        return segment;
                      });
                    })()
                  : null}
              </svg>
              <div className="insight-donut__center">
                <strong>{formatCurrency(currentSpend)}</strong>
                <span>Total spend</span>
              </div>
            </div>

            <div className="insight-donut__legend">
              {topCategories.length > 0 ? (
                topCategories.map(([categoryName, amount]) => {
                  const share = currentSpend > 0 ? (amount / currentSpend) * 100 : 0;
                  return (
                    <Link key={categoryName} href={buildTransactionsHref({ category: categoryName })} className="insight-donut__item insight-donut__item--link">
                      <span className="insight-donut__icon" aria-hidden="true">
                        {getCategoryGlyph(categoryName)}
                      </span>
                      <div className="insight-donut__meta">
                        <strong>{categoryName}</strong>
                        <span>
                          {formatCurrency(amount)} · {formatPercent(share)}
                        </span>
                      </div>
                    </Link>
                  );
                })
              ) : (
                <div className="empty-state">No categorized expenses yet. Import more activity or resolve uncategorized rows to reveal the spending mix.</div>
              )}
              <div className="insight-donut__item">
                <span className="insight-donut__icon" aria-hidden="true">
                  •
                </span>
                <div className="insight-donut__meta">
                  <strong>Others</strong>
                  <span>{formatCurrency(otherSpend)}</span>
                </div>
              </div>
            </div>
          </div>
        </article>

        <article className="insight-panel glass">
          <div className="insight-panel__head">
            <div>
              <p className="eyebrow">Why it happened</p>
              <h4>What changed and why</h4>
              <span className="insight-panel__hint">Hard data first, guidance second.</span>
            </div>
            <div className="insight-panel__stat">
              <strong>{previousTopCategories[0]?.[0] ?? "No baseline"}</strong>
              <span>Last period's top category</span>
            </div>
          </div>

          <div className="insight-list">
            {visibleDriverInsightCards.length > 0 ? (
              visibleDriverInsightCards.map((driver) => (
                <Link key={driver.categoryName} href={driver.href} className="insight-list__item insight-list__item--link">
                  <strong>
                    <span className="insight-list__icon" aria-hidden="true">
                      {getCategoryGlyph(driver.categoryName)}
                    </span>
                    {driver.title}
                  </strong>
                  <span>{driver.evidence}</span>
                  <span className="insight-list__callout">So what: this is the clearest reason the month moved.</span>
                  <span className="insight-list__callout">Next step: review the linked category transactions and decide if it should be capped.</span>
                </Link>
              ))
            ) : (
              <div className="empty-state">No category changes surfaced yet. Clover will highlight shifts once it has enough recent activity to compare.</div>
            )}
          </div>
        </article>

        <article className="insight-panel glass">
          <div className="insight-panel__head">
            <div>
              <p className="eyebrow">Patterns to watch</p>
              <h4>{isPro ? "Recurring costs and habits" : "A few patterns to watch"}</h4>
              <span className="insight-panel__hint">
                {isPro
                  ? "Fixed costs, behavior signals, and data quality linked back to transactions."
                  : "Begin with the simplest patterns that are easiest to act on."}
              </span>
            </div>
            <div className="insight-panel__stat">
              <strong>{formatCurrency(recurringSavingsPotential)}</strong>
              <span>Monthly savings potential</span>
            </div>
          </div>

          <div className="insight-pattern-grid">
            <div className="insight-pattern-card">
              <p className="eyebrow">Recurring costs</p>
              <div className="insight-list">
                {visibleRecurringInsightCards.length > 0 ? (
                  visibleRecurringInsightCards.map((merchant) => (
                    <Link key={merchant.label} href={merchant.href} className="insight-list__item insight-list__item--link">
                      <strong>
                        <span className="insight-list__icon" aria-hidden="true">
                          {getCategoryGlyph(merchant.label)}
                        </span>
                        {merchant.title}
                      </strong>
                      <span>{merchant.evidence}</span>
                      <span className="insight-list__callout">So what: this repeats often enough to behave like a fixed cost.</span>
                      <span className="insight-list__callout">Next step: open the merchant transactions and keep or cut it.</span>
                    </Link>
                  ))
                ) : (
                  <div className="empty-state">No recurring merchants surfaced yet. Add more transactions and Clover will call out the fixed costs.</div>
                )}
                <div className="insight-list__item">
                  <strong>Potential savings</strong>
                  <span>
                    Cutting recurring costs by 20% could save {formatCurrency(recurringSavingsPotential)} a month, or {formatCurrency(annualRecurringOpportunity)} a year.
                  </span>
                </div>
              </div>
            </div>

            <div className="insight-pattern-card">
              <p className="eyebrow">Behavioral patterns</p>
              <div className="insight-list">
                {visibleBehaviorInsightCards.map((item) => (
                  <Link key={item.title} href={item.href} className="insight-list__item insight-list__item--link">
                    <strong>
                      <span className="insight-list__icon" aria-hidden="true">
                        {item.icon}
                      </span>
                      {item.title}
                    </strong>
                    <span>{item.evidence}</span>
                    <span className="insight-list__callout">So what: {item.soWhat}</span>
                    <span className="insight-list__callout">Next step: {item.nextStep}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </article>

        {!isPro ? (
          <p className="insights-free-note">
            Want more charts, investment context, and deeper analysis? Pro unlocks a fuller picture when you are ready for it.
          </p>
        ) : null}
      </section>
    </CloverShell>
  );
}

export default function InsightsPage() {
  return (
    <Suspense fallback={<CloverLoadingScreen label="insights" />}>
      <InsightsPageStream />
    </Suspense>
  );
}
