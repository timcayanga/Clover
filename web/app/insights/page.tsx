import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace, seedWorkspaceDefaults } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";

export const dynamic = "force-dynamic";

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

  const currentWindowTransactions = currentWindowTransactionsRaw as InsightTransaction[];
  const previousWindowTransactions = previousWindowTransactionsRaw as InsightTransaction[];

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
  sixMonthTransactions.forEach((transaction) => {
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

  const totalAccountBalance = selectedWorkspace.accounts
    .filter((account) => account.balance !== null)
    .reduce((sum, account) => sum + Number(account.balance ?? 0), 0);
  const activeAccountCount = selectedWorkspace.accounts.filter((account) => account.balance !== null).length;

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

  const importFiles = selectedWorkspace.importFiles;
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

  ninetyDayTransactions.forEach((transaction) => {
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

  const selectedGoal = user.primaryGoal?.trim() ?? null;
  const goalLabel = selectedGoal ? goalLabels[selectedGoal] ?? selectedGoal : null;

  const confidenceScore = Math.max(
    55,
    Math.min(
      99,
      52 +
        currentWindowTransactions.length * 0.2 +
        ninetyDayTransactions.length * 0.1 +
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
        : "Your money needs a tighter path right now, and the fastest gain is to slow spending."

  const aiSummary =
    spendDelta === null || incomeDelta === null
      ? "There is enough recent activity to give guidance, but one of the comparison periods is still thin."
      : currentNet >= 0
        ? `Cash flow is ${trendDirection}, spending is ${spendDirection}, and savings are still positive.`
        : `Cash flow is ${trendDirection}, spending is ${spendDirection}, and the month is currently negative.`;

  const priorityFlag =
    importStatusCounts.failed > 0 || uncategorizedTransactions.length + possibleDuplicateGroups.length > 0
      ? {
          label: "Urgent",
          body: "Review the data quality items first so the next insight pass has cleaner inputs.",
          tone: "danger" as const,
        }
      : spendDelta !== null && spendDelta > 8
        ? {
            label: "Watchlist",
            body: "Spending is rising faster than the previous period, so keep an eye on the biggest category.",
            tone: "subtle" as const,
          }
        : {
            label: "Opportunity",
            body: "The current pattern leaves room to build savings or accelerate a goal.",
            tone: "good" as const,
          };

  const chartWidth = 520;
  const chartHeight = 210;
  const chartPadding = 22;
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

  const quickActions = [
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
      kicker="AI insights"
      title="Your money, translated into next steps."
      subtitle="Built from your statements and spending patterns, this page explains what changed, why it changed, and what to do next."
    >
      <section className="insights-story">
        <article className="insights-hero__summary glass">
          <div className="insights-hero__header">
            <span className="pill pill-accent">AI brief</span>
            <span className={`pill ${priorityFlag.tone === "danger" ? "pill-danger" : priorityFlag.tone === "good" ? "pill-good" : "pill-subtle"}`}>
              {priorityFlag.label}
            </span>
          </div>
          <h3>{aiHeadline}</h3>
          <p>{aiSummary}</p>
          <div className="insights-hero__stats">
            <div className="insight-tile">
              <span>Headline</span>
              <strong>{headlineNetLabel}</strong>
              <small>{goalLabel ?? "No primary goal set yet"}</small>
            </div>
            <div className="insight-tile">
              <span>Savings rate</span>
              <strong>{currentSavingsRate === null ? "N/A" : formatPercent(currentSavingsRate * 100)}</strong>
              <small>{confidenceLabel}</small>
            </div>
            <div className="insight-tile">
              <span>Confidence</span>
              <strong>{Math.round(confidenceScore)}%</strong>
              <small>{currentWindowTransactions.length} transactions reviewed</small>
            </div>
          </div>
          <div className="hero-actions">
            <Link className="button button-primary" href={quickActions[0].href}>
              {quickActions[0].label}
            </Link>
            <Link className="button button-secondary" href={quickActions[1].href}>
              {quickActions[1].label}
            </Link>
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
              <h4>Top categories and the rest</h4>
            </div>
            <div className="insight-panel__stat">
              <strong>{formatCurrency(currentSpend)}</strong>
              <span>{formatPercent(trackedCategoryShare * 100)} in tracked categories</span>
            </div>
          </div>

          <div className="report-list">
            {topCategories.length > 0 ? (
              topCategories.map(([categoryName, amount]) => {
                const share = currentSpend > 0 ? (amount / currentSpend) * 100 : 0;
                return (
                  <div key={categoryName} className="report-list__item">
                    <div className="report-list__meta">
                      <strong>{categoryName}</strong>
                      <span>{formatCurrency(amount)}</span>
                    </div>
                    <div className="report-list__track" aria-hidden="true">
                      <span className="report-list__fill" style={{ width: `${Math.max(share, 8)}%` }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-state">No categorized expenses yet.</div>
            )}
            <div className="report-list__item">
              <div className="report-list__meta">
                <strong>Others</strong>
                <span>{formatCurrency(otherSpend)}</span>
              </div>
              <div className="report-list__track" aria-hidden="true">
                <span className="report-list__fill" style={{ width: `${Math.max(currentSpend > 0 ? (otherSpend / currentSpend) * 100 : 0, 8)}%` }} />
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
              <p className="eyebrow">Recurring costs</p>
              <h4>Subscriptions and repeated payments</h4>
            </div>
            <div className="insight-panel__stat">
              <strong>{formatCurrency(recurringCostsTotal)}</strong>
              <span>{formatCurrency(recurringSavingsPotential)} monthly savings if trimmed by 20%</span>
            </div>
          </div>

          <div className="insight-list">
            {recurringMerchants.length > 0 ? (
              recurringMerchants.map((merchant) => (
                <div key={merchant.label} className="insight-list__item">
                  <strong>{merchant.label}</strong>
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
        </article>

        <article className="insight-panel glass">
          <div className="insight-panel__head">
            <div>
              <p className="eyebrow">Behavioral insights</p>
              <h4>Lightweight patterns worth watching</h4>
            </div>
            <div className="insight-panel__stat">
              <strong>{confidenceLabel}</strong>
              <span>{Math.round(confidenceScore)}% model confidence</span>
            </div>
          </div>

          <div className="insight-list">
            <div className="insight-list__item">
              <strong>Weekend spending</strong>
              <span>{weekendInsight}</span>
            </div>
            <div className="insight-list__item">
              <strong>Concentration</strong>
              <span>
                Your top category is {topCategoryShare ? formatPercent(topCategoryShare * 100) : "N/A"} of this month's spending.
              </span>
            </div>
            <div className="insight-list__item">
              <strong>Data quality</strong>
              <span>
                {importStatusCounts.failed > 0
                  ? `${importStatusCounts.failed} failed import${importStatusCounts.failed === 1 ? "" : "s"} still need attention`
                  : "Imports look clean enough for guidance"}
              </span>
            </div>
            <div className="insight-list__item">
              <strong>Goal context</strong>
              <span>{goalLabel ?? "No primary goal set yet"}</span>
            </div>
          </div>
        </article>

        <article className="insight-panel glass">
          <div className="insight-panel__head">
            <div>
              <p className="eyebrow">Suggested actions</p>
              <h4>What to do next</h4>
            </div>
          </div>

          <div className="insight-action-list">
            <div className="insight-action">
              <div>
                <strong>
                  Reduce {topCategories[0]?.[0] ?? "your top category"} by 20%
                </strong>
                <span>
                  You could save {formatCurrency(topCategoryOpportunity)} a month by trimming the biggest category a little.
                </span>
              </div>
              <Link className="pill-link pill-link--inline" href="/transactions">
                Review spending
              </Link>
            </div>
            <div className="insight-action">
              <div>
                <strong>Cut recurring costs</strong>
                <span>
                  A 20% trim on recurring merchants could free up {formatCurrency(recurringSavingsPotential)} a month.
                </span>
              </div>
              <Link className="pill-link pill-link--inline" href="/transactions">
                Check subscriptions
              </Link>
            </div>
            <div className="insight-action">
              <div>
                <strong>Set the goal as the benchmark</strong>
                <span>
                  {goalLabel ?? "Add a primary goal"} so the page can judge progress instead of only showing trends.
                </span>
              </div>
              <Link className="pill-link pill-link--inline" href={goalLabel ? "/settings" : "/onboarding"}>
                {goalLabel ? "Review goal" : "Set goal"}
              </Link>
            </div>
          </div>
        </article>
      </section>
    </CloverShell>
  );
}
