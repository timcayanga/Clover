import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";
import { InfoTip as InsightInfoTip } from "@/components/info-tip";
import { InsightsTabs, InsightsTabsTitleAddon } from "@/components/insights-tabs";
import { PostHogEvent } from "@/components/posthog-analytics";
import { analyticsOnceKey } from "@/lib/analytics";
import { getSessionContext } from "@/lib/auth";
import { listImportFilesCompat } from "@/lib/data-engine";
import { getGoalProgressSnapshot, normalizeGoalPlan, type GoalKey } from "@/lib/goals";
import { RouteSplash } from "@/components/route-splash";
import { formatCurrencyAmount, formatCurrencyCode } from "@/lib/currency-format";
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

type InsightsTab = "summary" | "spending" | "patterns";

const goalLabels: Record<string, string> = {
  save_more: "Save more",
  pay_down_debt: "Pay down debt",
  track_spending: "Track spending",
  build_emergency_fund: "Build an emergency fund",
  invest_better: "Invest better",
};

const insightsTabLabels: Record<InsightsTab, string> = {
  summary: "Summary",
  spending: "Spending",
  patterns: "Habits",
};

const formatCurrency = (value: number, currency?: string | null) => formatCurrencyAmount(value, currency ?? "MIXED");
const formatSignedCurrency = (value: number, currency?: string | null) =>
  `${value < 0 ? "-" : ""}${formatCurrencyAmount(Math.abs(value), currency ?? "MIXED")}`;
const formatPercent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(0)}%`;
const toIsoMonth = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const toMonthLabel = (date: Date) => monthFormatter.format(date);
const normalizeMerchant = (value: string) => value.trim().toLowerCase();
const buildTransactionsHref = (params: Record<string, string>) => `/transactions?${new URLSearchParams(params).toString()}`;

const normalizeInsightsTab = (value: string | undefined): InsightsTab => {
  if (value === "spending" || value === "patterns") {
    return value;
  }
  return "summary";
};

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

async function InsightsPageStream({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const now = new Date();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
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
  const requestedTab = normalizeInsightsTab(resolvedSearchParams?.tab);
  const availableTabs: InsightsTab[] = ["summary", "spending", "patterns"];
  const selectedTab: InsightsTab = availableTabs.includes(requestedTab) ? requestedTab : "summary";
  const isEmptyWorkspace = workspaceAccounts.length <= 1 && workspaceImportFiles.length === 0 && currentWindowTransactions.length === 0;
  const currencyCandidates = new Set(workspaceAccounts.map((account) => formatCurrencyCode(account.currency)).filter((currency) => currency.length > 0));
  const displayCurrency = currencyCandidates.size === 1 ? Array.from(currencyCandidates)[0] : "MIXED";
  const formatCurrency = (value: number, currency: string | null = displayCurrency) => formatCurrencyAmount(value, currency);
  const formatSignedCurrency = (value: number, currency: string | null = displayCurrency) =>
    `${value < 0 ? "-" : ""}${formatCurrencyAmount(Math.abs(value), currency)}`;

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

  const topCategories = Array.from(currentSummary.expenseCategories.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const previousTopCategories = Array.from(previousSummary.expenseCategories.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

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
  }, displayCurrency);

  const headlineDriver = topCategories[0]?.[0] ?? "No clear driver yet";
  const headlineDriverAmount = topCategories[0]?.[1] ?? 0;
  const headlineDriverShare = currentSpend > 0 ? (headlineDriverAmount / currentSpend) * 100 : null;

  const aiHeadline =
    topCategories[0] !== undefined
      ? `${headlineDriver} is the biggest reason spending moved this month.`
      : currentNet >= 0
        ? "You still have money left this month."
        : "You spent more than you brought in this month.";

  const aiSummary =
    topCategories[0] !== undefined
      ? `Start there if you want the fastest improvement.`
      : "Import one more statement to make this clearer.";
  const primarySnapshotItems: Array<{
    label: string;
    value: string;
    note: string;
    tone: "positive" | "negative" | "neutral";
    suffix?: string;
    hint: string;
  }> = [
    {
      label: "Money left",
      value: formatSignedCurrency(currentNet),
      note: currentNet >= previousNet ? "Up vs prior period" : "Down vs prior period",
      tone: currentNet >= 0 ? "positive" : "negative",
      hint: "Money left is income minus expenses for the selected window.",
    },
    {
      label: "Savings rate",
      value: currentSavingsRate === null ? "N/A" : formatPercent(currentSavingsRate * 100),
      note:
        goalLabel !== null
          ? `${goalProgress.bandLabel} for ${goalLabel.toLowerCase()}`
          : "No primary goal yet",
      tone: currentSavingsRate !== null && currentSavingsRate >= 0.2 ? "positive" : "neutral",
      hint: "Savings rate is the share of income left after spending.",
    },
    {
      label: "Biggest cause",
      value: headlineDriver,
      note: `${formatCurrency(headlineDriverAmount)}${headlineDriverShare === null ? "" : ` · ${formatPercent(headlineDriverShare)}`}`,
      tone: "neutral",
      hint: "Biggest cause is the category contributing the most to this month's spending.",
    },
  ];

  const priorityActions = [
    {
      title: topCategories[0] ? `Review ${headlineDriver.toLowerCase()}` : "Review spending",
      body: topCategories[0]
        ? `${formatCurrency(headlineDriverAmount)} spent here this month.`
        : "Open this month's transactions.",
      href: topCategories[0] ? buildTransactionsHref({ category: headlineDriver }) : "/transactions",
      label: "Review category",
    },
    {
      title: uncategorizedTransactions.length > 0 ? `Fix ${uncategorizedTransactions.length} uncategorized rows` : "Set a spending cap",
      body: uncategorizedTransactions.length > 0
        ? "Clear missing categories or merchants first."
        : topCategories[0]
          ? `Set one limit for ${headlineDriver.toLowerCase()}.`
          : "Set one category limit for this month.",
      href: uncategorizedTransactions.length > 0 ? "/transactions" : "/goals",
      label: uncategorizedTransactions.length > 0 ? "Fix rows" : "Set limit",
    },
  ];

  const driverInsightCards = categoryDriverChanges.map((driver) => ({
    ...driver,
    title: `${driver.categoryName} ${driver.delta > 0 ? "rose" : "fell"} by ${formatCurrency(Math.abs(driver.delta))}`,
    evidence:
      driver.previousAmount > 0
        ? `${formatCurrency(driver.previousAmount)} last month to ${formatCurrency(driver.currentAmount)} now`
        : `${formatCurrency(driver.currentAmount)} spent this month`,
    nextStep: `Review ${driver.categoryName.toLowerCase()}.`,
    href: buildTransactionsHref({ category: driver.categoryName }),
  }));

  const recurringInsightCards = recurringMerchants.map((merchant) => ({
    ...merchant,
    title: `${merchant.label} repeats ${merchant.count} times`,
    evidence: `${formatCurrency(merchant.amount)} over the last 90 days`,
    nextStep: "Check subscription.",
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
      nextStep: "Look at weekends.",
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
  ];
  const habitCards = [
    driverInsightCards[0]
      ? {
          title: driverInsightCards[0].title,
          evidence: driverInsightCards[0].evidence,
          nextStep: "Review category.",
          href: driverInsightCards[0].href,
          icon: getCategoryGlyph(driverInsightCards[0].categoryName),
        }
      : null,
    recurringInsightCards[0]
      ? {
          title: recurringInsightCards[0].title,
          evidence: recurringInsightCards[0].evidence,
          nextStep: recurringInsightCards[0].nextStep,
          href: recurringInsightCards[0].href,
          icon: "↻",
        }
      : null,
    behaviorInsightCards[0]
      ? {
          title: behaviorInsightCards[0].title,
          evidence: behaviorInsightCards[0].evidence,
          nextStep: behaviorInsightCards[0].nextStep,
          href: behaviorInsightCards[0].href,
          icon: behaviorInsightCards[0].icon,
        }
      : null,
  ].filter((card): card is { title: string; evidence: string; nextStep: string; href: string; icon: string } => card !== null);

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

  const recurringCostsTotal = recurringMerchants.reduce((sum, merchant) => sum + merchant.amount, 0);
  const recurringSavingsPotential = recurringCostsTotal * 0.2;
  const trackedCategorySpend = topCategories.reduce((sum, [, amount]) => sum + amount, 0);
  const otherSpend = Math.max(currentSpend - trackedCategorySpend, 0);
  const trackedCategoryShare = currentSpend > 0 ? trackedCategorySpend / currentSpend : 0;

  return (
    <CloverShell
      active="insights"
      title="Insights"
      titleAddon={<InsightsTabsTitleAddon activeTab={selectedTab} />}
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
      <section className="insights-story">
        <InsightsTabs
          activeTab={selectedTab}
          summary={
          <article className="insights-snapshot insights-snapshot--hero glass">
          <div className="insights-snapshot__copy">
            <h3>{aiHeadline}</h3>
            <p>{aiSummary}</p>
          <div className="insights-snapshot__summary">
              <span className={`pill ${currentNet >= 0 ? "pill-good" : "pill-danger"}`}>
                {currentNet >= 0 ? "On track" : "Needs attention"}
              </span>
              <span>{currentWindowTransactions.length} transactions reviewed</span>
            </div>
          </div>

          <div className="insights-snapshot__metrics" aria-label="Insights snapshot metrics">
            {primarySnapshotItems.map((item) => (
              <div key={item.label} className="insights-snapshot__metric">
                <span className="insights-snapshot__metric-label">
                  {item.label}
                  <InsightInfoTip label={item.hint} />
                </span>
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
          }
          spending={
          <>
          <article className="insight-panel insight-panel--feature glass">
          <div className="insight-panel__head">
            <div>
              <p className="eyebrow">What happened</p>
              <h4>
                Money in vs money out <InsightInfoTip label="Tap a month to open matching transactions. This chart shows the last six months of net cash flow." />
              </h4>
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
              <span>Change</span>
              <strong>{spendDelta === null ? "N/A" : formatPercent(spendDelta)}</strong>
              <small>{spendDelta !== null && spendDelta > 0 ? "Spending up" : spendDelta !== null && spendDelta < 0 ? "Spending down" : "Need more data"}</small>
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
              <h4>
                Spending concentration <InsightInfoTip label="Tap a category to open matching transactions. The donut shows how this month's spending is distributed." />
              </h4>
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
                <div className="empty-state">Import more activity or resolve uncategorized rows to reveal the spending mix.</div>
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
          </>
          }
          patterns={
          <>
          <article className="insight-panel glass">
          <div className="insight-panel__head">
            <div>
              <p className="eyebrow">Habits</p>
              <h4>
                Three things worth noticing <InsightInfoTip label="These cards highlight the clearest change, the biggest recurring cost, and one spending habit to review." />
              </h4>
            </div>
            <div className="insight-panel__stat">
              <strong>{formatCurrency(recurringSavingsPotential)}</strong>
              <span>Possible monthly savings</span>
            </div>
          </div>

          <div className="insight-pattern-grid insight-pattern-grid--triple">
            {habitCards.length > 0 ? (
              habitCards.map((card) => (
                <Link key={card.title} href={card.href} className="insight-list__item insight-list__item--link">
                  <strong>
                    <span className="insight-list__icon" aria-hidden="true">
                      {card.icon}
                    </span>
                    {card.title}
                  </strong>
                  <span>{card.evidence}</span>
                  <span className="insight-list__callout">{card.nextStep}</span>
                </Link>
              ))
            ) : (
              <div className="empty-state">Import more activity and Clover will start surfacing the habits that matter most.</div>
            )}
          </div>
          </article>
          </>
          }
        />

        {!isPro ? (
          <p className="insights-free-note">
            Want more charts, investment context, and deeper analysis? Pro unlocks a fuller picture when you are ready for it.
          </p>
        ) : null}
      </section>
    </CloverShell>
  );
}

export default function InsightsPage({ searchParams }: { searchParams?: Promise<{ tab?: string }> }) {
  return <RouteSplash label="insights"><InsightsPageStream searchParams={searchParams} /></RouteSplash>;
}
