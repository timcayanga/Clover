import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CloverLoadingScreen } from "@/components/clover-loading-screen";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";
import { EmptyDataCta } from "@/components/empty-data-cta";
import { getSessionContext } from "@/lib/auth";
import { analyticsOnceKey } from "@/lib/analytics";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { getFinancialExperienceProfile, getGoalProgressSnapshot, type GoalKey } from "@/lib/goals";
import { PostHogEvent } from "@/components/posthog-analytics";
import { DashboardImportLauncher } from "@/components/dashboard-import-launcher";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Dashboard",
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en-PH", {
  numeric: "auto",
});

const monthFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  year: "numeric",
});

type DashboardTransaction = {
  id: string;
  date: Date;
  amount: unknown;
  isExcluded: boolean;
  reviewStatus: "pending_review" | "suggested" | "confirmed" | "edited" | "rejected" | "duplicate_skipped";
  categoryConfidence: number;
  categoryId: string | null;
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

type AggregatedTransactionTotals = {
  income: number;
  expense: number;
  transfer: number;
  confirmed: number;
  reviewAttention: number;
  expenseCategories: Map<string, number>;
  expenseMerchants: Map<string, { amount: number; count: number; lastSeen: Date }>;
};

type MonthBucket = {
  key: string;
  label: string;
  income: number;
  expense: number;
  net: number;
};

type VisualCategory = {
  name: string;
  amount: number;
  share: number;
};

type RecurringItemSummary = {
  name: string;
  amount: number;
  count: number;
  lastSeen: Date;
  category: string | null;
};

type WorkspaceSummary = {
  id: string;
  name: string;
  accounts: Array<{
    id: string;
    name: string;
    institution: string | null;
    type: string;
    currency: string;
    balance: string | null;
  }>;
  _count: {
    accounts: number;
    importFiles: number;
    transactions: number;
  };
};

type DashboardExperienceProfile = ReturnType<typeof getFinancialExperienceProfile>;

const toAmount = (value: unknown) => Number(value ?? 0);
const formatCurrency = (value: number) => currencyFormatter.format(value);
const toIsoMonth = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const toMonthLabel = (date: Date) => monthFormatter.format(date);

const formatSignedCurrency = (value: number) => `${value < 0 ? "-" : ""}${currencyFormatter.format(Math.abs(value))}`;

const formatDate = (value: Date) => dateFormatter.format(value);

const formatRelativeDate = (value: Date, now = new Date()) => {
  const diffMinutes = Math.round((value.getTime() - now.getTime()) / 60000);
  const diffHours = Math.round(diffMinutes / 60);
  const diffDays = Math.round(diffHours / 24);

  if (Math.abs(diffMinutes) < 60) {
    return relativeTimeFormatter.format(diffMinutes, "minute");
  }

  if (Math.abs(diffHours) < 24) {
    return relativeTimeFormatter.format(diffHours, "hour");
  }

  return relativeTimeFormatter.format(diffDays, "day");
};

const getMonthBuckets = (anchor: Date, count = 6) => {
  const buckets: MonthBucket[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
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

const getMonthBucket = (date: Date, buckets: MonthBucket[]) => buckets.find((bucket) => bucket.key === toIsoMonth(date));

const buildLinePath = (buckets: MonthBucket[], width: number, height: number, padding: number) => {
  const values = buckets.map((bucket) => bucket.net);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);
  const xSpan = width - padding * 2;
  const ySpan = height - padding * 2;
  const points = buckets.map((bucket, index) => {
    const x = padding + (index / Math.max(buckets.length - 1, 1)) * xSpan;
    const normalized = (bucket.net - min) / range;
    const y = padding + (1 - normalized) * ySpan;
    return { ...bucket, x, y };
  });

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");

  return {
    points,
    linePath,
    min,
    max,
  };
};

const formatCompactPercentage = (value: number) => `${Math.round(value)}%`;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const summarizeTransactions = (transactions: DashboardTransaction[]): AggregatedTransactionTotals => {
  return transactions.reduce<AggregatedTransactionTotals>(
    (accumulator, transaction) => {
      const amount = Math.abs(toAmount(transaction.amount));

      if (transaction.type === "income") {
        accumulator.income += amount;
      } else if (transaction.type === "expense") {
        accumulator.expense += amount;
      } else {
        accumulator.transfer += amount;
      }

      if (transaction.reviewStatus === "confirmed" || transaction.reviewStatus === "edited") {
        accumulator.confirmed += 1;
      }

      if (transaction.reviewStatus !== "confirmed" || transaction.categoryId === null || transaction.categoryConfidence < 70) {
        accumulator.reviewAttention += 1;
      }

      if (transaction.type === "expense") {
        const categoryName = transaction.category?.name ?? "Unassigned";
        accumulator.expenseCategories.set(categoryName, (accumulator.expenseCategories.get(categoryName) ?? 0) + amount);

        const merchantName = transaction.merchantClean?.trim() || transaction.merchantRaw.trim() || "Unknown merchant";
        const existingMerchant = accumulator.expenseMerchants.get(merchantName);
        if (existingMerchant) {
          existingMerchant.amount += amount;
          existingMerchant.count += 1;
          if (transaction.date > existingMerchant.lastSeen) {
            existingMerchant.lastSeen = transaction.date;
          }
        } else {
          accumulator.expenseMerchants.set(merchantName, {
            amount,
            count: 1,
            lastSeen: transaction.date,
          });
        }
      }

      return accumulator;
    },
    {
      income: 0,
      expense: 0,
      transfer: 0,
      confirmed: 0,
      reviewAttention: 0,
      expenseCategories: new Map<string, number>(),
      expenseMerchants: new Map<string, { amount: number; count: number; lastSeen: Date }>(),
    }
  );
};

const comparePeriods = (currentTransactions: DashboardTransaction[], previousTransactions: DashboardTransaction[]) => {
  const current = summarizeTransactions(currentTransactions);
  const previous = summarizeTransactions(previousTransactions);
  const net = current.income - current.expense;
  const previousNet = previous.income - previous.expense;
  const expenseDelta = current.expense - previous.expense;
  const incomeDelta = current.income - previous.income;
  const netDelta = net - previousNet;

  const categoryEntries = Array.from(new Set([...current.expenseCategories.keys(), ...previous.expenseCategories.keys()])).map((name) => {
    const currentAmount = current.expenseCategories.get(name) ?? 0;
    const previousAmount = previous.expenseCategories.get(name) ?? 0;
    const delta = currentAmount - previousAmount;
    const percentage = previousAmount > 0 ? (delta / previousAmount) * 100 : currentAmount > 0 ? 100 : 0;

    return { name, currentAmount, previousAmount, delta, percentage };
  });

  const topCategory = [...current.expenseCategories.entries()].sort((a, b) => b[1] - a[1])[0];
  const biggestMover = categoryEntries
    .filter((entry) => entry.delta > 0)
    .sort((a, b) => b.delta - a.delta || b.currentAmount - a.currentAmount)[0];
  const topMerchant = [...current.expenseMerchants.entries()].sort(
    (a, b) => b[1].count - a[1].count || b[1].amount - a[1].amount || b[1].lastSeen.getTime() - a[1].lastSeen.getTime()
  )[0];

  return {
    current,
    previous,
    net,
    previousNet,
    expenseDelta,
    incomeDelta,
    netDelta,
    topCategory,
    biggestMover,
    topMerchant,
  };
};

const recurringItemPattern = /(rent|internet|bill|utility|utilities|subscription|electric|water|phone|insurance|mortgage|loan|fee)/i;

const summarizeRecurringItem = (transactions: DashboardTransaction[]) => {
  const candidates = transactions.filter((transaction) => {
    if (transaction.type !== "expense") {
      return false;
    }

    return (
      recurringItemPattern.test(transaction.merchantRaw) ||
      recurringItemPattern.test(transaction.merchantClean ?? "") ||
      recurringItemPattern.test(transaction.category?.name ?? "")
    );
  });

  if (candidates.length === 0) {
    return null;
  }

  const grouped = new Map<string, RecurringItemSummary>();

  for (const transaction of candidates) {
    const name = (transaction.merchantClean ?? transaction.merchantRaw).trim();
    const key = name.toLowerCase();
    const amount = Math.abs(toAmount(transaction.amount));
    const category = transaction.category?.name ?? null;
    const existing = grouped.get(key);

    if (existing) {
      existing.amount += amount;
      existing.count += 1;
      if (transaction.date > existing.lastSeen) {
        existing.lastSeen = transaction.date;
      }
      continue;
    }

    grouped.set(key, {
      name,
      amount,
      count: 1,
      lastSeen: transaction.date,
      category,
    });
  }

  return Array.from(grouped.values()).sort(
    (a, b) => b.count - a.count || b.lastSeen.getTime() - a.lastSeen.getTime() || b.amount - a.amount
  )[0] ?? null;
};

function DashboardStreamFallback() {
  return (
    <section className="dashboard-home" aria-label="Loading dashboard content">
      <article className="dashboard-home__hero glass">
        <div className="dashboard-home__copy">
          <div className="dashboard-home__kicker-row">
            <span className="pill pill-subtle">Loading</span>
            <span className="pill pill-subtle">Goals</span>
            <span className="pill pill-subtle">Reports</span>
            <span className="pill pill-subtle">Insights</span>
          </div>
          <h3>Pulling your money briefing together</h3>
          <p>Goals, reports, and insights are loading in a lighter first pass so the page can settle faster.</p>
        </div>
        <div className="dashboard-home__hero-visual dashboard-home__hero-visual--loading">
          <div className="dashboard-home__ring dashboard-home__ring--loading">
            <div className="dashboard-home__ring-inner">
              <span className="skeleton-block skeleton-block--line skeleton-block--line-short" />
              <span className="skeleton-block skeleton-block--line skeleton-block--line-long" />
            </div>
          </div>
          <div className="dashboard-home__hero-visual-grid">
            <div className="dashboard-home__mini-card dashboard-home__mini-card--loading">
              <span className="skeleton-block skeleton-block--line skeleton-block--line-short" />
              <span className="skeleton-block skeleton-block--line skeleton-block--line-long" />
            </div>
            <div className="dashboard-home__mini-card dashboard-home__mini-card--loading">
              <span className="skeleton-block skeleton-block--line skeleton-block--line-short" />
              <span className="skeleton-block skeleton-block--line skeleton-block--line-long" />
            </div>
            <div className="dashboard-home__mini-card dashboard-home__mini-card--loading">
              <span className="skeleton-block skeleton-block--line skeleton-block--line-short" />
              <span className="skeleton-block skeleton-block--line skeleton-block--line-long" />
            </div>
          </div>
        </div>
      </article>

      <section className="dashboard-home__summary-grid dashboard-home__summary-grid--visual">
        {Array.from({ length: 3 }).map((_, index) => (
          <article key={index} className="dashboard-home__summary-card glass dashboard-home__summary-card--loading">
            <div className="dashboard-home__summary-card-head">
              <div className="dashboard-home__summary-card-title">
                <span className="skeleton-block skeleton-block--line skeleton-block--line-short" />
                <span className="skeleton-block skeleton-block--line skeleton-block--line-long" />
              </div>
              <span className="skeleton-block skeleton-block--line skeleton-block--line-short" />
            </div>
            <div className="dashboard-home__summary-card-body">
              <span className="skeleton-block dashboard-home__summary-card-chart" />
              <span className="skeleton-block skeleton-block--line skeleton-block--line-long" />
              <span className="skeleton-block skeleton-block--line skeleton-block--line-short" />
            </div>
          </article>
        ))}
      </section>

      <article className="dashboard-home__review-strip glass">
        <div className="dashboard-home__review-copy">
          <span className="eyebrow">Loading</span>
          <strong>Waiting for the review strip</strong>
          <span>The main summary is loading first so Clover can feel faster to understand.</span>
        </div>
      </article>
    </section>
  );
}

async function DashboardStream({
  user,
  resolvedSearchParams,
}: {
  user: Awaited<ReturnType<typeof getOrCreateCurrentUser>>;
  resolvedSearchParams?: { import?: string };
}) {
  const selectedWorkspaceData = await prisma.workspace.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      accounts: {
        select: {
          id: true,
          name: true,
          institution: true,
          type: true,
          currency: true,
          balance: true,
        },
      },
      _count: {
        select: {
          accounts: true,
          importFiles: true,
          transactions: true,
        },
      },
    },
  });
  let workspaceSummary = selectedWorkspaceData;

  if (!workspaceSummary) {
    const starterWorkspace = await ensureStarterWorkspace(user.clerkUserId, user.email, user.verified);
    workspaceSummary = await prisma.workspace.findUnique({
      where: { id: starterWorkspace.id },
      select: {
        id: true,
        name: true,
        accounts: {
          select: {
            id: true,
            name: true,
            institution: true,
            type: true,
            currency: true,
            balance: true,
          },
        },
        _count: {
          select: {
            accounts: true,
            importFiles: true,
            transactions: true,
          },
        },
      },
    });
  }

  if (!workspaceSummary) {
    redirect("/dashboard");
  }

  const accountsWithBalance = workspaceSummary.accounts.filter((account) => account.balance !== null);
  const linkedBalanceTotal = accountsWithBalance.reduce((sum, account) => sum + Number(account.balance ?? 0), 0);
  const accountCurrencies = new Set(workspaceSummary.accounts.map((account) => account.currency).filter(Boolean));
  const trackedBalanceCurrency = accountCurrencies.size === 1 ? workspaceSummary.accounts[0]?.currency ?? null : "mixed";
  const isEmptyWorkspace =
    workspaceSummary._count.transactions === 0 && workspaceSummary._count.importFiles === 0 && workspaceSummary._count.accounts <= 1;
  const experienceProfile = getFinancialExperienceProfile(user.financialExperience);

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const latestImportPromise = prisma.importFile.findFirst({
    where: { workspaceId: workspaceSummary.id },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      fileName: true,
      status: true,
      uploadedAt: true,
    },
  });

  const shouldLoadTransactions = !selectedWorkspaceData || workspaceSummary._count.transactions > 0;
  const transactionsPromise = shouldLoadTransactions
    ? prisma.transaction.findMany({
        where: {
          workspaceId: workspaceSummary.id,
          isExcluded: false,
          date: { gte: ninetyDaysAgo },
        },
        select: {
          id: true,
          date: true,
          amount: true,
          isExcluded: true,
          reviewStatus: true,
          categoryConfidence: true,
          categoryId: true,
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
        take: 180,
      })
    : Promise.resolve([] as DashboardTransaction[]);

  const [latestImport, recentTransactions] = await Promise.all([latestImportPromise, transactionsPromise]);

  const currentTransactions = recentTransactions as DashboardTransaction[];
  const currentThirtyDayTransactions = currentTransactions.filter((transaction) => transaction.date >= thirtyDaysAgo);
  const previousTransactionsWindow = currentTransactions.filter(
    (transaction) => transaction.date >= sixtyDaysAgo && transaction.date < thirtyDaysAgo
  );
  const currentSummary = comparePeriods(currentThirtyDayTransactions, previousTransactionsWindow);
  const currentSavingsRate = currentSummary.current.income > 0 ? currentSummary.net / currentSummary.current.income : null;
  const previousNet = currentSummary.previous.income - currentSummary.previous.expense;
  const previousSavingsRate = currentSummary.previous.income > 0 ? previousNet / currentSummary.previous.income : null;
  const spendDelta = currentSummary.current.expense - currentSummary.previous.expense;
  const recurringItem = summarizeRecurringItem(currentTransactions);
  const uncategorizedTransactions = currentThirtyDayTransactions.filter(
    (transaction) => !transaction.category?.name || !transaction.merchantClean
  );
  const reviewAttentionTransactions = currentThirtyDayTransactions.filter(
    (transaction) => transaction.reviewStatus !== "confirmed" || transaction.categoryId === null || transaction.categoryConfidence < 70
  );
  const reviewAttentionCount = reviewAttentionTransactions.length;
  const reviewCoverageText =
    currentThirtyDayTransactions.length > 0
      ? `${Math.round((currentSummary.current.confirmed / currentThirtyDayTransactions.length) * 100)}% of the last 30 days is confirmed or edited`
      : "No recent transactions to score yet";
  const goalKey = user.primaryGoal as GoalKey | null;
  const goalTargetAmount = user.goalTargetAmount !== null ? Number(user.goalTargetAmount) : null;
  const goalProgress = getGoalProgressSnapshot({
    goalKey,
    targetAmount: goalTargetAmount,
    currentNet: currentSummary.net,
    currentSpend: currentSummary.current.expense,
    monthlyIncome: currentSummary.current.income > 0 ? currentSummary.current.income : null,
    currentSavingsRate,
    previousSavingsRate,
    spendDelta,
    recurringShare: recurringItem ? recurringItem.amount / Math.max(currentSummary.current.expense, 1) : 0,
  });
  const goalProgressPercent = clamp(goalProgress.progressPercent ?? 0, 0, 100);
  const confidenceScore = clamp(
    Math.round(66 + currentTransactions.length * 0.12 - reviewAttentionCount * 2.2 - uncategorizedTransactions.length * 1.4),
    35,
    99
  );
  const confidenceLabel = confidenceScore >= 85 ? "High confidence" : confidenceScore >= 70 ? "Good confidence" : "Watch closely";
  const latestImportLabel = latestImport ? `${latestImport.fileName} · ${latestImport.status} · ${formatRelativeDate(latestImport.uploadedAt)}` : null;
  const currentPositionValue = linkedBalanceTotal !== 0 ? linkedBalanceTotal : currentSummary.net;
  const currentPositionLabel = accountsWithBalance.length > 0 ? (trackedBalanceCurrency === "mixed" ? "Mixed balances" : "Tracked balance") : "Net position";
  const topCategories = Array.from(currentSummary.current.expenseCategories.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, amount]) => ({
      name,
      amount,
      share: currentSummary.current.expense > 0 ? (amount / currentSummary.current.expense) * 100 : 0,
    }));
  const chartWidth = 420;
  const chartHeight = 160;
  const chartPadding = 20;
  const reportsBuckets = getMonthBuckets(now, 3);
  currentTransactions.forEach((transaction) => {
    const bucket = getMonthBucket(transaction.date, reportsBuckets);
    if (!bucket || transaction.isExcluded) {
      return;
    }

    const amount = Math.abs(toAmount(transaction.amount));
    if (transaction.type === "income") {
      bucket.income += amount;
    } else if (transaction.type === "expense") {
      bucket.expense += amount;
    }
    bucket.net = bucket.income - bucket.expense;
  });
  const { points: monthPoints, linePath } = buildLinePath(reportsBuckets, chartWidth, chartHeight, chartPadding);
  const goalAction = goalProgress.nextAction;
  const goalProgressLabel = goalProgress.progressPercent === null ? "Set a target" : `${Math.round(goalProgress.progressPercent)}%`;
  const topDriver = currentSummary.topCategory?.[0] ?? "No clear driver yet";
  const topDriverAmount = currentSummary.topCategory?.[1] ?? 0;
  const insightTrend = currentSummary.biggestMover?.name ?? recurringItem?.name ?? "Patterns are still forming";
  const insightTrendCopy =
    currentSummary.biggestMover && currentSummary.biggestMover.previousAmount > 0
      ? `${formatSignedCurrency(currentSummary.biggestMover.delta)} versus the prior period`
      : recurringItem
        ? `${recurringItem.count} repeats over the last 90 days`
        : "More activity will sharpen the insight";
  const reviewAttentionText =
    reviewAttentionCount > 0
      ? `${reviewAttentionCount} item${reviewAttentionCount === 1 ? "" : "s"} need review`
      : "No items need review";
  const goalSummaryLabel = goalTargetAmount !== null ? `${formatCurrency(goalProgress.currentAmount)} of ${formatCurrency(goalTargetAmount)}` : goalProgress.currentLabel;
  const reportDirectionLabel = currentSummary.net >= currentSummary.previousNet ? "Improving" : "Softening";
  const reportNetLabel = formatSignedCurrency(currentSummary.net);
  const reportIncomeLabel = formatSignedCurrency(currentSummary.current.income);
  const reportExpenseLabel = formatSignedCurrency(currentSummary.current.expense);
  const reportSparkPath =
    monthPoints.length > 1 ? linePath : `M ${chartPadding} ${chartHeight / 2} L ${chartWidth - chartPadding} ${chartHeight / 2}`;

  return (
    <>
      <PostHogEvent
        event="dashboard_viewed"
        onceKey={analyticsOnceKey("dashboard_viewed", "session")}
        properties={{
          workspace_name: workspaceSummary.name,
          account_count: workspaceSummary._count.accounts,
          transaction_count: workspaceSummary._count.transactions,
          import_count: workspaceSummary._count.importFiles,
        }}
      />
      {isEmptyWorkspace ? (
        <div style={{ marginBottom: 20 }}>
          <EmptyDataCta
            eyebrow="Get started"
            title={experienceProfile.emptyStateTitle}
            copy={experienceProfile.emptyStateCopy}
            importHref="/dashboard?import=1"
            accountHref="/accounts"
            transactionHref="/transactions?manual=1"
          />
        </div>
      ) : null}
      <section className="dashboard-home">
        <article className="dashboard-home__hero glass">
          <div className="dashboard-home__copy">
            <div className="dashboard-home__kicker-row">
              <span className="pill pill-accent">Goals</span>
              <span className="pill pill-subtle">Reports</span>
              <span className="pill pill-subtle">Insights</span>
              <span className="pill pill-subtle">{workspaceSummary.name}</span>
              {latestImport ? <span className="pill pill-subtle">{formatRelativeDate(latestImport.uploadedAt)}</span> : null}
            </div>

            <h3>{goalKey ? "How close are you to your goal?" : "Your finances at a glance, with the important patterns up front."}</h3>
            <p>{goalProgress.coachCopy}</p>

            <div className="dashboard-home__hero-metrics">
              <div className="dashboard-home__mini-card">
                <span>Goal pace</span>
                <strong>{goalProgressLabel}</strong>
                <small>{goalProgress.bandLabel}</small>
              </div>
              <div className="dashboard-home__mini-card">
                <span>{currentPositionLabel}</span>
                <strong>{formatSignedCurrency(currentPositionValue)}</strong>
                <small>{currentSummary.net >= 0 ? "Positive cash flow" : "Negative cash flow"}</small>
              </div>
              <div className="dashboard-home__mini-card">
                <span>Signal quality</span>
                <strong>{confidenceLabel}</strong>
                <small>{reviewCoverageText}</small>
              </div>
            </div>
          </div>

          <div className="dashboard-home__hero-visual">
            <div
              className="dashboard-home__ring"
              style={{
                background: `conic-gradient(var(--accent) 0 ${goalProgressPercent}%, rgba(15, 23, 42, 0.08) ${goalProgressPercent}% 100%)`,
              }}
            >
              <div className="dashboard-home__ring-inner">
                <strong>{goalProgress.progressPercent === null ? "Set" : `${Math.round(goalProgress.progressPercent)}%`}</strong>
                <span>{goalProgress.bandLabel}</span>
              </div>
            </div>
            <div className="dashboard-home__hero-visual-grid">
              <div className="dashboard-home__mini-card">
                <span>Goals</span>
                <strong>{goalSummaryLabel}</strong>
                <small>{goalAction}</small>
              </div>
              <div className="dashboard-home__mini-card">
                <span>Reports</span>
                <strong>{reportNetLabel}</strong>
                <small>
                  {reportIncomeLabel} in, {reportExpenseLabel} out
                </small>
              </div>
              <div className="dashboard-home__mini-card">
                <span>Insights</span>
                <strong>{topDriver}</strong>
                <small>
                  {insightTrend} · {insightTrendCopy} · {formatCurrency(topDriverAmount)} this period
                </small>
              </div>
            </div>
          </div>
        </article>

        <section className="dashboard-home__summary-grid dashboard-home__summary-grid--visual">
          <article className="dashboard-home__summary-card glass">
            <div className="dashboard-home__summary-card-head">
              <div>
                <p className="eyebrow">Goals</p>
                <h4>{goalKey ? `How close are you to ${goalProgress.bandLabel.toLowerCase()}?` : "Set a goal to make this dashboard more useful"}</h4>
              </div>
              <span className="dashboard-visual-pill">{goalProgressLabel}</span>
            </div>
            <div className="dashboard-home__summary-card-body">
              <div className="dashboard-home__goal-ring-row">
                <div
                  className="dashboard-home__ring dashboard-home__ring--compact"
                  style={{
                    background: `conic-gradient(var(--accent) 0 ${goalProgressPercent}%, rgba(15, 23, 42, 0.08) ${goalProgressPercent}% 100%)`,
                  }}
                >
                  <div className="dashboard-home__ring-inner">
                    <strong>{goalProgress.progressPercent === null ? "—" : `${Math.round(goalProgress.progressPercent)}%`}</strong>
                    <span>{goalProgress.bandTone === "positive" ? "On track" : goalProgress.bandLabel}</span>
                  </div>
                </div>
                <div className="dashboard-home__mini-card dashboard-home__mini-card--stacked">
                  <strong>{goalProgress.label}</strong>
                  <span>
                    {goalSummaryLabel}
                    {goalTargetAmount !== null ? ` · target ${formatCurrency(goalTargetAmount)}` : ""}
                  </span>
                  <small>{goalAction}</small>
                </div>
              </div>
            </div>
          </article>

          <article className="dashboard-home__summary-card glass">
            <div className="dashboard-home__summary-card-head">
              <div>
                <p className="eyebrow">Reports</p>
                <h4>How the last three months moved</h4>
              </div>
              <span className={`dashboard-visual-pill ${currentSummary.net >= currentSummary.previousNet ? "positive" : "negative"}`}>
                {reportDirectionLabel}
              </span>
            </div>
            <div className="dashboard-home__summary-card-body">
              <div className="dashboard-line-chart dashboard-line-chart--compact" role="img" aria-label="Net cash flow over the last three months">
                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
                  <defs>
                    <linearGradient id="dashboard-flow-gradient" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="rgba(3, 168, 192, 0.34)" />
                      <stop offset="100%" stopColor="rgba(3, 168, 192, 0.03)" />
                    </linearGradient>
                  </defs>
                  <path
                    d={`${reportSparkPath} L ${chartWidth - chartPadding} ${chartHeight - chartPadding} L ${chartPadding} ${chartHeight - chartPadding} Z`}
                    fill="url(#dashboard-flow-gradient)"
                  />
                  <path d={reportSparkPath} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                  {monthPoints.map((point) => (
                    <circle key={point.key} cx={point.x} cy={point.y} r="4.5" fill="white" stroke="var(--accent)" strokeWidth="3" />
                  ))}
                </svg>
              </div>
              <div className="dashboard-home__reports-grid">
                <div className="dashboard-home__mini-card">
                  <span>Net position</span>
                  <strong>{reportNetLabel}</strong>
                  <small>{currentSummary.net >= currentSummary.previousNet ? "Up versus the prior window" : "Down versus the prior window"}</small>
                </div>
                <div className="dashboard-home__mini-card">
                  <span>Income</span>
                  <strong>{reportIncomeLabel}</strong>
                  <small>{currentSummary.current.income > currentSummary.previous.income ? "Higher than last window" : "Lower than last window"}</small>
                </div>
                <div className="dashboard-home__mini-card">
                  <span>Spending</span>
                  <strong>{reportExpenseLabel}</strong>
                  <small>{currentSummary.current.expense > currentSummary.previous.expense ? "More than last window" : "Less than last window"}</small>
                </div>
              </div>
            </div>
          </article>

          <article className="dashboard-home__summary-card glass">
            <div className="dashboard-home__summary-card-head">
              <div>
                <p className="eyebrow">Insights</p>
                <h4>What is driving the month</h4>
              </div>
              <span className="dashboard-visual-pill">{confidenceLabel}</span>
            </div>
            <div className="dashboard-home__summary-card-body">
              <div className="dashboard-home__insight-bars">
                {topCategories.length > 0 ? (
                  topCategories.map((category, index) => (
                    <div key={category.name} className="dashboard-home__insight-bar">
                      <div className="dashboard-home__insight-bar-meta">
                        <strong>{category.name}</strong>
                        <span>
                          {formatCurrency(category.amount)} · {formatCompactPercentage(category.share)}
                        </span>
                      </div>
                      <div className="dashboard-home__insight-track" aria-hidden="true">
                        <div className={`dashboard-home__insight-fill dashboard-home__insight-fill--${index % 4}`} style={{ width: `${Math.max(category.share, 10)}%` }} />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="dashboard-home__item dashboard-home__item--empty">
                    <strong>No insight signal yet</strong>
                    <span>Import a statement or add transactions to surface the strongest pattern.</span>
                  </div>
                )}
              </div>
              <div className="dashboard-home__insight-footer">
                <div className="dashboard-home__mini-card">
                  <span>Recurring item</span>
                  <strong>{recurringItem ? recurringItem.name : "Nothing repeating yet"}</strong>
                  <small>
                    {recurringItem
                      ? `${formatCurrency(recurringItem.amount / recurringItem.count)} per transaction · last seen ${formatRelativeDate(recurringItem.lastSeen)}`
                      : "Clover will surface repeating bills here"}
                  </small>
                </div>
                <div className="dashboard-home__mini-card">
                  <span>Signal quality</span>
                  <strong>{Math.round(confidenceScore)}%</strong>
                  <small>{reviewCoverageText}</small>
                </div>
              </div>
            </div>
          </article>
        </section>

        <article className="dashboard-home__review-strip glass">
          <div className="dashboard-home__review-copy">
            <p className="eyebrow">Review, if needed</p>
            <strong>{reviewAttentionText}</strong>
            <span>{latestImportLabel ?? "Import a statement to populate the dashboard with live data."}</span>
          </div>
          <div className="dashboard-home__review-actions">
            <Link className="button button-primary button-small" href="/review">
              Open review
            </Link>
            <Link className="pill-link pill-link--inline" href="/dashboard?import=1">
              Import statement
            </Link>
          </div>
        </article>

        <DashboardImportLauncher
          workspaceId={workspaceSummary.id}
          accounts={workspaceSummary.accounts.map((account) => ({
            id: account.id,
            name: account.name,
            institution: account.institution,
            type: account.type,
            currency: account.currency,
          }))}
          initialOpen={resolvedSearchParams?.import === "1"}
        />
      </section>
    </>
  );
}

async function DashboardPageStream({
  searchParams,
}: {
  searchParams?: Promise<{ import?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const session = await getSessionContext();
  const user = await getOrCreateCurrentUser(session.userId);
  if (!session.isGuest && !hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }

  const experienceProfile = getFinancialExperienceProfile(user.financialExperience);

  return (
    <CloverShell
      active="dashboard"
      kicker="Home"
      title="Your finances at a glance"
      subtitle={experienceProfile.dashboardSubtitle}
      showTopbar={false}
      actions={
        <Link className="pill-link" href="/goals">
          Open goals
        </Link>
      }
    >
      <Suspense fallback={<DashboardStreamFallback />}>
        <DashboardStream user={user} resolvedSearchParams={resolvedSearchParams} />
      </Suspense>
    </CloverShell>
  );
}

export default function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ import?: string }>;
}) {
  return (
    <Suspense fallback={<CloverLoadingScreen label="dashboard" />}>
      <DashboardPageStream searchParams={searchParams} />
    </Suspense>
  );
}
