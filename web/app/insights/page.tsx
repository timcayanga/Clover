import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace, seedWorkspaceDefaults } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";
import { getSessionContext, isStagingHost } from "@/lib/auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Insights",
};

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

const getCategoryGlyph = (categoryName: string) => {
  const normalized = categoryName.trim().toLowerCase();
  if (normalized.includes("housing")) return "🏠";
  if (normalized.includes("grocer")) return "🛒";
  if (normalized.includes("food") || normalized.includes("dining") || normalized.includes("coffee")) return "☕";
  if (normalized.includes("transport") || normalized.includes("transit") || normalized.includes("ride")) return "🚌";
  if (normalized.includes("bill") || normalized.includes("utility") || normalized.includes("internet") || normalized.includes("phone"))
    return "💡";
  if (normalized.includes("subscription") || normalized.includes("stream")) return "↻";
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

const createStagingInsightsSampleData = (anchor: Date) => {
  const sampleAccount = { name: "Imported transactions" };
  const cashAccount = { name: "Cash on hand" };

  const makeDate = (daysAgo: number) => {
    const date = new Date(anchor);
    date.setDate(date.getDate() - daysAgo);
    return date;
  };

  const currentWindowTransactions: InsightTransaction[] = [
    {
      id: "sample-current-income",
      date: makeDate(2),
      amount: 45000,
      type: "income",
      merchantRaw: "ACME Payroll",
      merchantClean: "Salary",
      account: sampleAccount,
      category: { name: "Income" },
    },
    {
      id: "sample-current-rent",
      date: makeDate(6),
      amount: -12000,
      type: "expense",
      merchantRaw: "Manila Home Rentals",
      merchantClean: "Rent",
      account: sampleAccount,
      category: { name: "Housing" },
    },
    {
      id: "sample-current-groceries",
      date: makeDate(8),
      amount: -2640,
      type: "expense",
      merchantRaw: "Green Basket Market",
      merchantClean: "Groceries",
      account: sampleAccount,
      category: { name: "Groceries" },
    },
    {
      id: "sample-current-transit",
      date: makeDate(9),
      amount: -1880,
      type: "expense",
      merchantRaw: "Ride Share",
      merchantClean: "Transport",
      account: sampleAccount,
      category: { name: "Transport" },
    },
    {
      id: "sample-current-internet",
      date: makeDate(11),
      amount: -1799,
      type: "expense",
      merchantRaw: "FiberNet Internet",
      merchantClean: "Internet bill",
      account: sampleAccount,
      category: { name: "Bills & Utilities" },
    },
    {
      id: "sample-current-coffee",
      date: makeDate(1),
      amount: -185,
      type: "expense",
      merchantRaw: "Luna Coffee Bar",
      merchantClean: "Coffee",
      account: sampleAccount,
      category: { name: "Food & Dining" },
    },
    {
      id: "sample-current-pharmacy",
      date: makeDate(12),
      amount: -640,
      type: "expense",
      merchantRaw: "Blue Ridge Pharmacy",
      merchantClean: "Pharmacy",
      account: sampleAccount,
      category: { name: "Health & Wellness" },
    },
    {
      id: "sample-current-transfer",
      date: makeDate(13),
      amount: -5000,
      type: "transfer",
      merchantRaw: "Atlas Savings Transfer",
      merchantClean: "Transfer to savings",
      account: cashAccount,
      category: { name: "Transfers" },
    },
  ];

  const previousWindowTransactions: InsightTransaction[] = [
    {
      id: "sample-previous-income",
      date: makeDate(38),
      amount: 40250,
      type: "income",
      merchantRaw: "ACME Payroll",
      merchantClean: "Salary",
      account: sampleAccount,
      category: { name: "Income" },
    },
    {
      id: "sample-previous-rent",
      date: makeDate(45),
      amount: -12000,
      type: "expense",
      merchantRaw: "Manila Home Rentals",
      merchantClean: "Rent",
      account: sampleAccount,
      category: { name: "Housing" },
    },
    {
      id: "sample-previous-groceries",
      date: makeDate(42),
      amount: -2100,
      type: "expense",
      merchantRaw: "Green Basket Market",
      merchantClean: "Groceries",
      account: sampleAccount,
      category: { name: "Groceries" },
    },
    {
      id: "sample-previous-transit",
      date: makeDate(41),
      amount: -980,
      type: "expense",
      merchantRaw: "Ride Share",
      merchantClean: "Transport",
      account: sampleAccount,
      category: { name: "Transport" },
    },
    {
      id: "sample-previous-coffee",
      date: makeDate(44),
      amount: -260,
      type: "expense",
      merchantRaw: "Luna Coffee Bar",
      merchantClean: "Coffee",
      account: sampleAccount,
      category: { name: "Food & Dining" },
    },
    {
      id: "sample-previous-phone",
      date: makeDate(47),
      amount: -740,
      type: "expense",
      merchantRaw: "Telco Mobile",
      merchantClean: "Phone bill",
      account: sampleAccount,
      category: { name: "Bills & Utilities" },
    },
    {
      id: "sample-previous-streaming",
      date: makeDate(52),
      amount: -490,
      type: "expense",
      merchantRaw: "StreamNow",
      merchantClean: "Streaming",
      account: sampleAccount,
      category: { name: "Subscriptions" },
    },
  ];

  const ninetyDayTransactions: InsightTransaction[] = [
    ...currentWindowTransactions,
    ...previousWindowTransactions,
    {
      id: "sample-90d-gym-1",
      date: makeDate(18),
      amount: -1590,
      type: "expense",
      merchantRaw: "Pulse Gym",
      merchantClean: "Gym",
      account: sampleAccount,
      category: { name: "Health & Wellness" },
    },
    {
      id: "sample-90d-gym-2",
      date: makeDate(47),
      amount: -1590,
      type: "expense",
      merchantRaw: "Pulse Gym",
      merchantClean: "Gym",
      account: sampleAccount,
      category: { name: "Health & Wellness" },
    },
    {
      id: "sample-90d-streaming-2",
      date: makeDate(68),
      amount: -490,
      type: "expense",
      merchantRaw: "StreamNow",
      merchantClean: "Streaming",
      account: sampleAccount,
      category: { name: "Subscriptions" },
    },
  ];

  const sixMonthTransactions: InsightTransaction[] = [
    {
      id: "sample-6m-1",
      date: new Date(anchor.getFullYear(), anchor.getMonth() - 5, 12),
      amount: 38000,
      type: "income",
      merchantRaw: "ACME Payroll",
      merchantClean: "Salary",
      account: sampleAccount,
      category: { name: "Income" },
    },
    {
      id: "sample-6m-2",
      date: new Date(anchor.getFullYear(), anchor.getMonth() - 4, 12),
      amount: 40250,
      type: "income",
      merchantRaw: "ACME Payroll",
      merchantClean: "Salary",
      account: sampleAccount,
      category: { name: "Income" },
    },
    {
      id: "sample-6m-3",
      date: new Date(anchor.getFullYear(), anchor.getMonth() - 3, 12),
      amount: 41750,
      type: "income",
      merchantRaw: "ACME Payroll",
      merchantClean: "Salary",
      account: sampleAccount,
      category: { name: "Income" },
    },
    {
      id: "sample-6m-4",
      date: new Date(anchor.getFullYear(), anchor.getMonth() - 2, 12),
      amount: 45000,
      type: "income",
      merchantRaw: "ACME Payroll",
      merchantClean: "Salary",
      account: sampleAccount,
      category: { name: "Income" },
    },
    {
      id: "sample-6m-5",
      date: new Date(anchor.getFullYear(), anchor.getMonth() - 1, 12),
      amount: 45000,
      type: "income",
      merchantRaw: "ACME Payroll",
      merchantClean: "Salary",
      account: sampleAccount,
      category: { name: "Income" },
    },
    {
      id: "sample-6m-6",
      date: new Date(anchor.getFullYear(), anchor.getMonth(), 12),
      amount: 45000,
      type: "income",
      merchantRaw: "ACME Payroll",
      merchantClean: "Salary",
      account: sampleAccount,
      category: { name: "Income" },
    },
    {
      id: "sample-6m-expense",
      date: new Date(anchor.getFullYear(), anchor.getMonth(), 13),
      amount: -3266,
      type: "expense",
      merchantRaw: "Living expenses",
      merchantClean: "Core spending",
      account: sampleAccount,
      category: { name: "Food & Dining" },
    },
  ];

  return {
    accounts: [
      { name: "BPI Checking", balance: 23000 },
      { name: "Union Savings", balance: 18734 },
      { name: "GCash Wallet", balance: null },
    ],
    importFiles: [{ status: "done" as const }, { status: "done" as const }, { status: "failed" as const }],
    currentWindowTransactions,
    previousWindowTransactions,
    ninetyDayTransactions,
    sixMonthTransactions,
    selectedGoal: "save_more",
  };
};

export default async function InsightsPage() {
  const session = await getSessionContext();
  const user = await getOrCreateCurrentUser(session.userId);
  if (!hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }

  const starterWorkspace = await ensureStarterWorkspace(user.clerkUserId, user.email, user.verified);
  await seedWorkspaceDefaults(starterWorkspace.id);

  const workspaces = await prisma.workspace.findMany({
    where: { userId: user.id },
    include: {
      accounts: true,
      importFiles: {
        orderBy: { uploadedAt: "desc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const selectedWorkspace =
    workspaces[0] ??
    (await prisma.workspace.findUnique({
      where: { id: starterWorkspace.id },
      include: {
        accounts: true,
        importFiles: {
          orderBy: { uploadedAt: "desc" },
        },
      },
    }));

  if (!selectedWorkspace) {
    redirect("/dashboard");
  }

  const stagingHost = await isStagingHost();
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [
    currentWindowTransactionsRaw,
    previousWindowTransactionsRaw,
    ninetyDayTransactions,
    sixMonthTransactions,
    importedTransactionStats,
    manualTransactionStats,
  ] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        workspaceId: selectedWorkspace.id,
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
        workspaceId: selectedWorkspace.id,
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
        workspaceId: selectedWorkspace.id,
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
        workspaceId: selectedWorkspace.id,
        isExcluded: false,
        date: { gte: sixMonthsAgo },
      },
      select: {
        date: true,
        amount: true,
        type: true,
      },
    }),
    prisma.transaction.aggregate({
      where: {
        workspaceId: selectedWorkspace.id,
        isExcluded: false,
        importFileId: { not: null },
      },
      _count: { id: true },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        workspaceId: selectedWorkspace.id,
        isExcluded: false,
        importFileId: null,
      },
      _count: { id: true },
      _sum: { amount: true },
    }),
  ]);

  const stagingDemoData = stagingHost && currentWindowTransactionsRaw.length === 0 ? createStagingInsightsSampleData(now) : null;
  const currentWindowTransactions = (stagingDemoData?.currentWindowTransactions ?? currentWindowTransactionsRaw) as InsightTransaction[];
  const previousWindowTransactions = (stagingDemoData?.previousWindowTransactions ?? previousWindowTransactionsRaw) as InsightTransaction[];
  const ninetyDayInsightTransactions = (stagingDemoData?.ninetyDayTransactions ?? ninetyDayTransactions) as InsightTransaction[];
  const sixMonthInsightTransactions = (stagingDemoData?.sixMonthTransactions ?? sixMonthTransactions) as InsightTransaction[];
  const workspaceAccounts = stagingDemoData?.accounts ?? selectedWorkspace.accounts;
  const importFiles = stagingDemoData?.importFiles ?? selectedWorkspace.importFiles;

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

  const importStatusCounts = importFiles.reduce(
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
  const spendDelta = previousSpend > 0 ? ((currentSpend - previousSpend) / previousSpend) * 100 : null;
  const incomeDelta =
    previousSummary.income > 0 ? ((currentSummary.income - previousSummary.income) / previousSummary.income) * 100 : null;

  const topCategories = Array.from(currentSummary.expenseCategories.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const previousTopCategories = Array.from(previousSummary.expenseCategories.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const topCategoryShare = currentSpend > 0 ? (topCategories[0]?.[1] ?? 0) / currentSpend : null;

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

  const selectedGoal = stagingDemoData?.selectedGoal ?? user.primaryGoal?.trim() ?? null;
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

  const aiHeadline =
    goalLabel !== null
      ? currentNet >= 0
        ? `You are making progress toward ${goalLabel.toLowerCase()}, and the current month is holding up.`
        : `You are still aiming at ${goalLabel.toLowerCase()}, but expenses are putting pressure on the plan.`
      : currentNet >= 0
        ? "Your money is in a healthy place right now, and the next win is turning that into a clear goal."
        : "Your money needs a tighter path right now, and the fastest gain is to slow spending.";

  const aiSummary =
    spendDelta === null || incomeDelta === null
      ? "There is enough recent activity to give guidance, but one of the comparison periods is still thin."
      : currentNet >= 0
        ? `Cash flow is ${trendDirection}, spending is ${spendDirection}, and savings are still positive.`
        : `Cash flow is ${trendDirection}, spending is ${spendDirection}, and the month is currently negative.`;

  const headlineDriver = topCategories[0]?.[0] ?? "No clear driver yet";
  const headlineDriverAmount = topCategories[0]?.[1] ?? 0;
  const headlineDriverShare = currentSpend > 0 ? (headlineDriverAmount / currentSpend) * 100 : null;
  const primarySnapshotItems = [
    {
      label: "Net",
      value: formatSignedCurrency(currentNet),
      note: currentNet >= previousNet ? "Up vs prior period" : "Down vs prior period",
      tone: currentNet >= 0 ? "positive" : "negative",
    },
    {
      label: "Savings rate",
      value: currentSavingsRate === null ? "N/A" : formatPercent(currentSavingsRate * 100),
      note: goalLabel ?? "No primary goal set yet",
      tone: currentSavingsRate !== null && currentSavingsRate >= 0.2 ? "positive" : "neutral",
    },
    {
      label: "Top driver",
      value: headlineDriver,
      note: `${formatCurrency(headlineDriverAmount)}${headlineDriverShare === null ? "" : ` · ${formatPercent(headlineDriverShare)}`}`,
      tone: "neutral",
    },
    {
      label: "Confidence",
      value: Math.round(confidenceScore).toString(),
      note: confidenceLabel,
      tone: confidenceScore >= 85 ? "positive" : confidenceScore >= 70 ? "neutral" : "negative",
      suffix: "%",
    },
  ];

  const heroActions = [
    {
      title: goalLabel ? `Keep ${goalLabel.toLowerCase()} in view` : "Set a primary goal",
      body: goalLabel
        ? "Use the goal as the benchmark for every future insight."
        : "A goal gives the page a destination, so the next insight can be measured against something real.",
      href: goalLabel ? "/settings" : "/onboarding",
      label: goalLabel ? "Review goal" : "Set goal",
    },
    {
      title: "Review the clean-up queue",
      body: "Fix uncategorized rows and duplicate matches so the advice is based on the best possible data.",
      href: "/transactions",
      label: "Open transactions",
    },
    {
      title: "Compare this month with the last",
      body: "Look at where cash flow changed first, then trim the biggest pressure point.",
      href: "/reports",
      label: "Open reports",
    },
  ];

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

  const weekendExpenses = currentWindowTransactions.filter((transaction) => {
    const day = transaction.date.getDay();
    return transaction.type === "expense" && (day === 0 || day === 6);
  });
  const weekendExpenseShare = currentSpend > 0 ? weekendExpenses.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount)), 0) / currentSpend : 0;
  const weekendInsight =
    weekendExpenseShare > 0.3
      ? `Weekend spending makes up ${formatPercent(weekendExpenseShare * 100)} of this month's expenses.`
      : `Weekend spending is relatively contained at ${formatPercent(weekendExpenseShare * 100)} of this month's expenses.`;

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
      title="Insights"
      showTopbar={false}
    >
      <section className="insights-story">
        <article className="insights-snapshot insights-snapshot--hero glass">
          <div className="insights-snapshot__copy">
            <div className="insights-snapshot__header">
              <span className="pill pill-accent">AI insights</span>
              {stagingDemoData ? <span className="pill pill-subtle">Sample staging data</span> : null}
            </div>
            <h3>{aiHeadline}</h3>
            <p>{aiSummary}</p>
            <div className="insights-snapshot__summary">
              <span className={`pill ${currentNet >= 0 ? "pill-good" : "pill-danger"}`}>
                {currentNet >= 0 ? "On track" : "Needs attention"}
              </span>
              <span>{currentWindowTransactions.length} transactions reviewed</span>
              <span>{goalLabel ?? "No primary goal set yet"}</span>
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

          <div className="insights-snapshot__actions">
            {heroActions.map((action) => (
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

        <article className="insight-panel insight-panel--feature glass">
          <div className="insight-panel__head">
            <div>
              <p className="eyebrow">What happened</p>
              <h4>Income vs expenses snapshot</h4>
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
                <div key={point.key} className="insight-chart__label">
                  <span>{point.label}</span>
                  <strong>{formatCurrency(point.net)}</strong>
                </div>
              ))}
            </div>
          </div>

        </article>

        <article className="insight-panel glass">
          <div className="insight-panel__head">
            <div>
              <p className="eyebrow">Where your money went</p>
              <h4>Category mix</h4>
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
                    <div key={categoryName} className="insight-donut__item">
                      <span className="insight-donut__icon" aria-hidden="true">
                        {getCategoryGlyph(categoryName)}
                      </span>
                      <div className="insight-donut__meta">
                        <strong>{categoryName}</strong>
                        <span>
                          {formatCurrency(amount)} · {formatPercent(share)}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="empty-state">No categorized expenses yet.</div>
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
              <h4>Key drivers of change</h4>
            </div>
            <div className="insight-panel__stat">
              <strong>{previousTopCategories[0]?.[0] ?? "No baseline"}</strong>
              <span>Last period's top category</span>
            </div>
          </div>

          <div className="insight-list">
            {categoryDriverChanges.length > 0 ? (
              categoryDriverChanges.map((driver) => (
                <div key={driver.categoryName} className="insight-list__item">
                  <strong>
                    <span className="insight-list__icon" aria-hidden="true">
                      {getCategoryGlyph(driver.categoryName)}
                    </span>
                    {driver.categoryName} {driver.delta > 0 ? "increased" : "decreased"} by {formatCurrency(Math.abs(driver.delta))}
                  </strong>
                  <span>
                    {driver.previousAmount > 0
                      ? `${formatPercent(driver.deltaPercent ?? 0)} vs last month · from ${formatCurrency(driver.previousAmount)} to ${formatCurrency(driver.currentAmount)}`
                      : `New category this month · ${formatCurrency(driver.currentAmount)} spent`}
                  </span>
                </div>
              ))
            ) : (
              <div className="empty-state">No category changes surfaced yet.</div>
            )}
          </div>
        </article>

        <article className="insight-panel glass">
          <div className="insight-panel__head">
            <div>
              <p className="eyebrow">Patterns to watch</p>
              <h4>Recurring costs and behavior</h4>
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
                {recurringMerchants.length > 0 ? (
                  recurringMerchants.map((merchant) => (
                    <div key={merchant.label} className="insight-list__item">
                      <strong>
                        <span className="insight-list__icon" aria-hidden="true">
                          {getCategoryGlyph(merchant.label)}
                        </span>
                        {merchant.label}
                      </strong>
                      <span>
                        {merchant.count} transaction{merchant.count === 1 ? "" : "s"} over 90 days · {formatCurrency(merchant.amount)} total
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">No recurring merchants surfaced yet.</div>
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
                <div className="insight-list__item">
                  <strong>
                    <span className="insight-list__icon" aria-hidden="true">
                      🗓
                    </span>
                    Weekend spending
                  </strong>
                  <span>{weekendInsight}</span>
                </div>
                <div className="insight-list__item">
                  <strong>
                    <span className="insight-list__icon" aria-hidden="true">
                      🎯
                    </span>
                    Concentration
                  </strong>
                  <span>
                    Your top category is {topCategoryShare ? formatPercent(topCategoryShare * 100) : "N/A"} of this month's spending.
                  </span>
                </div>
                <div className="insight-list__item">
                  <strong>
                    <span className="insight-list__icon" aria-hidden="true">
                      🧼
                    </span>
                    Data quality
                  </strong>
                  <span>
                    {importStatusCounts.failed > 0
                      ? `${importStatusCounts.failed} failed import${importStatusCounts.failed === 1 ? "" : "s"} still need attention`
                      : "Imports look clean enough for guidance"}
                  </span>
                </div>
                <div className="insight-list__item">
                  <strong>
                    <span className="insight-list__icon" aria-hidden="true">
                      🎯
                    </span>
                    Goal context
                  </strong>
                  <span>{goalLabel ?? "No primary goal set yet"}</span>
                </div>
              </div>
            </div>
          </div>
        </article>
      </section>
    </CloverShell>
  );
}
