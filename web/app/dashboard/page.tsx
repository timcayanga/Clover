import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { CloverLoadingScreen } from "@/components/clover-loading-screen";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";
import { getSessionContext } from "@/lib/auth";
import { analyticsOnceKey } from "@/lib/analytics";
import { buildRecurringTransactionSummaries } from "@/lib/recurring";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { getGoalProgressSnapshot, type GoalKey } from "@/lib/goals";
import { formatCurrencyAmount, formatCurrencyCode } from "@/lib/currency-format";
import { PostHogEvent, PostHogPersonProperties } from "@/components/posthog-analytics";
import { DashboardImportLauncher } from "@/components/dashboard-import-launcher";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Dashboard",
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en-PH", {
  numeric: "auto",
});

const weekdayFormatter = new Intl.DateTimeFormat("en-PH", {
  weekday: "short",
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
    currency: string | null;
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

type WindowSummary = {
  label: string;
  income: number;
  expense: number;
  net: number;
  transactions: number;
  activeDays: number;
};

type DailyActivityPoint = {
  key: string;
  label: string;
  count: number;
  income: number;
  expense: number;
  net: number;
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

const toAmount = (value: unknown) => Number(value ?? 0);
const formatCurrency = (value: number, currency?: string | null) => formatCurrencyAmount(value, currency ?? "MIXED");

const formatSignedCurrency = (value: number, currency?: string | null) =>
  `${value < 0 ? "-" : ""}${formatCurrencyAmount(Math.abs(value), currency ?? "MIXED")}`;

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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toIsoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const toDayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const summarizeWindow = (transactions: DashboardTransaction[], label: string): WindowSummary => {
  const totals = summarizeTransactions(transactions);
  return {
    label,
    income: totals.income,
    expense: totals.expense,
    net: totals.income - totals.expense,
    transactions: transactions.length,
    activeDays: new Set(transactions.map((transaction) => toIsoDay(transaction.date))).size,
  };
};

const buildDailyActivitySeries = (transactions: DashboardTransaction[], days: number) => {
  const today = new Date();
  const series: DailyActivityPoint[] = [];
  const pointByKey = new Map<string, DailyActivityPoint>();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    const point: DailyActivityPoint = {
      key: toIsoDay(date),
      label: weekdayFormatter.format(date),
      count: 0,
      income: 0,
      expense: 0,
      net: 0,
    };

    series.push(point);
    pointByKey.set(point.key, point);
  }

  transactions.forEach((transaction) => {
    const point = pointByKey.get(toIsoDay(transaction.date));
    if (!point) {
      return;
    }

    const amount = Math.abs(toAmount(transaction.amount));
    point.count += 1;
    if (transaction.type === "income") {
      point.income += amount;
    } else if (transaction.type === "expense") {
      point.expense += amount;
    }
    point.net = point.income - point.expense;
  });

  return series;
};

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

  const categoryEntries = Array.from(new Set([...current.expenseCategories.keys(), ...previous.expenseCategories.keys()])).map((name: string) => {
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


function DashboardStreamFallback() {
  return (
    <section className="dashboard-home" aria-label="Loading dashboard content">
      <article className="dashboard-home__hero glass dashboard-home__hero--balance">
        <div className="dashboard-home__hero-copy">
          <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 108 }} />
          <span className="skeleton-block skeleton-block--line" style={{ width: "min(100%, 340px)", height: 38, borderRadius: 999 }} />
          <span className="skeleton-block skeleton-block--line skeleton-block--line-long" style={{ width: "min(100%, 380px)" }} />
          <div className="dashboard-home__hero-badges">
            {Array.from({ length: 3 }).map((_, index) => (
              <span key={index} className="skeleton-block" style={{ width: index === 2 ? 118 : 138, height: 28, borderRadius: 999 }} />
            ))}
          </div>
        </div>
        <div className="dashboard-home__hero-side">
          <div className="dashboard-home__goal-card dashboard-home__goal-card--loading">
            <div className="dashboard-home__ring dashboard-home__ring--compact dashboard-home__ring--loading">
              <div className="dashboard-home__ring-inner">
                <span className="skeleton-block skeleton-block--line skeleton-block--line-short" />
                <span className="skeleton-block skeleton-block--line skeleton-block--line-long" />
              </div>
            </div>
            <div className="dashboard-home__goal-card-copy">
              <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 92 }} />
              <span className="skeleton-block skeleton-block--line skeleton-block--line-long" style={{ width: "min(100%, 220px)" }} />
              <span className="skeleton-block skeleton-block--line skeleton-block--line-long" style={{ width: "min(100%, 180px)" }} />
              <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 160 }} />
            </div>
          </div>
        </div>
      </article>

      <section className="dashboard-home__movement-grid">
        {Array.from({ length: 3 }).map((_, index) => (
          <article key={index} className="dashboard-home__movement-card glass">
            <div className="dashboard-home__movement-card-head">
              <div className="dashboard-home__summary-card-title">
                <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 72 }} />
                <span className="skeleton-block skeleton-block--line skeleton-block--line-long" style={{ width: 92, height: 24 }} />
              </div>
              <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 54 }} />
            </div>
            <span className="skeleton-block skeleton-block--line skeleton-block--line-long" style={{ width: "min(100%, 200px)" }} />
            <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: "min(100%, 180px)" }} />
            <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 112 }} />
          </article>
        ))}
      </section>

      <article className="dashboard-home__activity-card glass">
        <div className="dashboard-home__summary-card-head">
          <div className="dashboard-home__summary-card-title">
            <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 72 }} />
            <span className="skeleton-block skeleton-block--line skeleton-block--line-long" style={{ width: 180, height: 24 }} />
          </div>
          <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 128 }} />
        </div>
        <div className="dashboard-home__activity-chart">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="dashboard-home__activity-bar">
              <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 16 }} />
              <span className="skeleton-block dashboard-home__activity-bar-track" />
              <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 24 }} />
            </div>
          ))}
        </div>
        <div className="dashboard-home__activity-metrics">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="dashboard-home__mini-card dashboard-home__mini-card--loading">
              <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 78 }} />
              <span className="skeleton-block skeleton-block--line skeleton-block--line-long" style={{ width: 112 }} />
              <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 148 }} />
            </div>
          ))}
        </div>
      </article>

      <article className="dashboard-home__review-strip glass">
        <div className="dashboard-home__review-copy">
          <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 84 }} />
          <span className="skeleton-block skeleton-block--line skeleton-block--line-long" style={{ width: "min(100%, 240px)", height: 18 }} />
          <span className="skeleton-block skeleton-block--line skeleton-block--line-long" style={{ width: "min(100%, 320px)" }} />
        </div>
        <span className="skeleton-block" style={{ width: 118, height: 34, borderRadius: 999 }} />
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
  const cookieStore = await cookies();
  const selectedWorkspaceCookieId = cookieStore.get(selectedWorkspaceKey)?.value ?? "";
  const workspaceSelect = {
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
  } as const;

  const selectedWorkspaceData =
    (selectedWorkspaceCookieId
      ? await prisma.workspace.findFirst({
          where: {
            id: selectedWorkspaceCookieId,
            user: {
              clerkUserId: user.clerkUserId,
            },
          },
          select: workspaceSelect,
        })
      : null) ??
    (await prisma.workspace.findFirst({
      where: {
        user: {
          clerkUserId: user.clerkUserId,
        },
      },
      orderBy: { createdAt: "asc" },
      select: workspaceSelect,
    }));
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
  const cashAccountCount = workspaceSummary.accounts.filter((account) => account.type === "cash").length;
  const accountCurrencies = new Set(workspaceSummary.accounts.map((account) => account.currency).filter(Boolean));
  const trackedBalanceCurrency = accountCurrencies.size === 1 ? workspaceSummary.accounts[0]?.currency ?? null : "MIXED";
  const isEmptyWorkspace =
    workspaceSummary._count.transactions === 0 && workspaceSummary._count.importFiles === 0 && workspaceSummary._count.accounts <= 1;

  const now = new Date();
  const todayStart = toDayStart(now);
  const sevenDaysAgo = new Date(todayStart);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const thirtyDaysAgo = new Date(todayStart);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
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
              currency: true,
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
  const currencyCandidates = new Set<string>();
  workspaceSummary.accounts.forEach((account) => currencyCandidates.add(formatCurrencyCode(account.currency)));
  currentTransactions.forEach((transaction) => {
    if (transaction.account.currency) {
      currencyCandidates.add(formatCurrencyCode(transaction.account.currency));
    }
  });
  const displayCurrency = currencyCandidates.size === 1 ? Array.from(currencyCandidates)[0] : "MIXED";
  const formatCurrency = (value: number, currency: string | null = displayCurrency) => formatCurrencyAmount(value, currency);
  const formatSignedCurrency = (value: number, currency: string | null = displayCurrency) =>
    `${value < 0 ? "-" : ""}${formatCurrencyAmount(Math.abs(value), currency)}`;
  const todayTransactions = currentTransactions.filter((transaction) => transaction.date >= todayStart);
  const currentSevenDayTransactions = currentTransactions.filter((transaction) => transaction.date >= sevenDaysAgo);
  const currentThirtyDayTransactions = currentTransactions.filter((transaction) => transaction.date >= thirtyDaysAgo);
  const previousTransactionsWindow = currentTransactions.filter(
    (transaction) => transaction.date >= sixtyDaysAgo && transaction.date < thirtyDaysAgo
  );
  const currentSummary = comparePeriods(currentThirtyDayTransactions, previousTransactionsWindow);
  const todaySummary = summarizeWindow(todayTransactions, "Today");
  const weekSummary = summarizeWindow(currentSevenDayTransactions, "This week");
  const monthSummary = summarizeWindow(currentThirtyDayTransactions, "This month");
  const activitySeries = buildDailyActivitySeries(currentSevenDayTransactions, 7);
  const peakActivityDay = activitySeries.reduce<DailyActivityPoint | null>((peak, point) => {
    if (!peak || point.count > peak.count || (point.count === peak.count && point.key > peak.key)) {
      return point;
    }
    return peak;
  }, null);
  const currentSavingsRate = currentSummary.current.income > 0 ? currentSummary.net / currentSummary.current.income : null;
  const previousNet = currentSummary.previous.income - currentSummary.previous.expense;
  const previousSavingsRate = currentSummary.previous.income > 0 ? previousNet / currentSummary.previous.income : null;
  const spendDelta = currentSummary.current.expense - currentSummary.previous.expense;
  const recurringItem = buildRecurringTransactionSummaries(currentTransactions)[0] ?? null;
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
  }, displayCurrency);
  const goalProgressPercent = clamp(goalProgress.progressPercent ?? 0, 0, 100);
  const confidenceScore = clamp(
    Math.round(66 + currentTransactions.length * 0.12 - reviewAttentionCount * 2.2 - uncategorizedTransactions.length * 1.4),
    35,
    99
  );
  const confidenceLabel = confidenceScore >= 85 ? "High confidence" : confidenceScore >= 70 ? "Good confidence" : "Watch closely";
  const latestImportLabel = latestImport ? `${latestImport.fileName} · ${latestImport.status} · ${formatRelativeDate(latestImport.uploadedAt)}` : null;
  const daysSinceLastImport = latestImport
    ? Math.max(0, Math.floor((now.getTime() - latestImport.uploadedAt.getTime()) / 86400000))
    : null;
  const goalAction = goalProgress.nextAction;
  const goalProgressLabel = goalProgress.progressPercent === null ? "Set a target" : `${Math.round(goalProgress.progressPercent)}%`;
  const topDriver = currentSummary.topCategory?.[0] ?? "No clear driver yet";
  const reviewAttentionText =
    reviewAttentionCount > 0
      ? `${reviewAttentionCount} item${reviewAttentionCount === 1 ? "" : "s"} need review`
      : "No items need review";
  const goalSummaryLabel = goalTargetAmount !== null ? `${formatCurrency(goalProgress.currentAmount)} of ${formatCurrency(goalTargetAmount)}` : goalProgress.currentLabel;
  const totalBalanceLabel = formatCurrency(linkedBalanceTotal, trackedBalanceCurrency);
  const heroSupportCopy = isEmptyWorkspace
    ? "Import a statement to unlock your balance, movement, and goal snapshot."
    : "Your balance, movement, and goals in one calm view.";
  const heroBadgeLabels = [
    weekSummary.transactions > 0 ? `${formatSignedCurrency(weekSummary.net)} this week` : "No activity this week",
    monthSummary.transactions > 0 ? `${monthSummary.transactions} transactions this month` : "No transactions this month",
    latestImport ? `Updated ${formatRelativeDate(latestImport.uploadedAt)}` : "No imports yet",
  ];
  const goalHeroHeading = goalKey ? "Goal progress" : "Goals are optional";
  const goalHeroCopy = goalKey
    ? goalProgress.coachCopy
    : "Set a goal later if you want a progress view. Clover stays useful even without one.";
  const goalHeroActionLabel = goalKey ? "Open goals" : "Set a goal";
  const goalHeroActionHref = "/goals";
  const movementWindows = [
    {
      label: "Today",
      summary: todaySummary,
      valueLabel: todaySummary.transactions > 0 ? formatSignedCurrency(todaySummary.net) : "No activity yet",
      detailLabel:
        todaySummary.transactions > 0
          ? `${formatCurrency(todaySummary.income)} in · ${formatCurrency(todaySummary.expense)} out`
          : "Import a statement to see today’s movement",
      footLabel: todaySummary.transactions > 0 ? `${todaySummary.transactions} transaction${todaySummary.transactions === 1 ? "" : "s"}` : "0 transactions",
    },
    {
      label: "7 days",
      summary: weekSummary,
      valueLabel: weekSummary.transactions > 0 ? formatSignedCurrency(weekSummary.net) : "No movement yet",
      detailLabel:
        weekSummary.transactions > 0
          ? `${formatCurrency(weekSummary.income)} in · ${formatCurrency(weekSummary.expense)} out`
          : "Seven-day movement will appear here",
      footLabel:
        weekSummary.transactions > 0
          ? `${weekSummary.transactions} transaction${weekSummary.transactions === 1 ? "" : "s"} · ${weekSummary.activeDays} active day${weekSummary.activeDays === 1 ? "" : "s"}`
          : "0 transactions",
    },
    {
      label: "30 days",
      summary: monthSummary,
      valueLabel: monthSummary.transactions > 0 ? formatSignedCurrency(monthSummary.net) : "No movement yet",
      detailLabel:
        monthSummary.transactions > 0
          ? `${formatCurrency(monthSummary.income)} in · ${formatCurrency(monthSummary.expense)} out`
          : "Monthly movement will appear here",
      footLabel:
        monthSummary.transactions > 0
          ? `${monthSummary.transactions} transaction${monthSummary.transactions === 1 ? "" : "s"} · ${monthSummary.activeDays} active day${monthSummary.activeDays === 1 ? "" : "s"}`
          : "0 transactions",
    },
  ];
  const maxActivityCount = Math.max(...activitySeries.map((point) => point.count), 1);
  const activitySummaryLabel =
    peakActivityDay && peakActivityDay.count > 0
      ? `${peakActivityDay.label} was busiest with ${peakActivityDay.count} transaction${peakActivityDay.count === 1 ? "" : "s"}`
      : "No daily activity yet";
  const attentionActionHref = reviewAttentionCount > 0 ? "/review" : isEmptyWorkspace ? "/dashboard?import=1" : "/reports";
  const attentionActionLabel = reviewAttentionCount > 0 ? "Open review" : isEmptyWorkspace ? "Import files" : "View reports";

  return (
    <>
      <PostHogPersonProperties
        distinctId={user.clerkUserId}
        properties={{
          workspace_name: workspaceSummary.name,
          account_count: workspaceSummary._count.accounts,
          cash_account_count: cashAccountCount,
          tracked_balance_total: Number(linkedBalanceTotal.toFixed(2)),
          tracked_balance_currency: trackedBalanceCurrency,
          transaction_count: workspaceSummary._count.transactions,
          import_count: workspaceSummary._count.importFiles,
          review_attention_count: reviewAttentionCount,
          goal: goalKey ?? null,
          financial_experience: user.financialExperience,
          last_import_at: latestImport?.uploadedAt.toISOString() ?? null,
          days_since_last_import: daysSinceLastImport,
        }}
      />
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
      <section className="dashboard-home">
        <article className="dashboard-home__hero glass dashboard-home__hero--balance">
          <div className="dashboard-home__hero-copy">
            <p className="eyebrow">Total balance</p>
            <h3>{totalBalanceLabel}</h3>
            <p>{heroSupportCopy}</p>

            <div className="dashboard-home__hero-badges">
              {heroBadgeLabels.map((label) => (
                <span key={label} className="pill pill-subtle">
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="dashboard-home__hero-side">
            {isEmptyWorkspace ? (
              <div className="dashboard-home__starter-card">
                <p className="eyebrow">Get started</p>
                <strong>Import files to unlock your dashboard.</strong>
                <p>Bring in a statement and Clover will populate balance, movement, and optional goal progress in one place.</p>
                <div className="dashboard-home__starter-actions">
                  <Link className="button button-primary button-small" href="/dashboard?import=1">
                    Import files
                  </Link>
                  <Link className="button button-secondary button-small" href="/accounts">
                    Add an account
                  </Link>
                </div>
              </div>
            ) : goalKey ? (
              <div className="dashboard-home__goal-card">
                <div
                  className="dashboard-home__ring dashboard-home__ring--compact"
                  style={{
                    background: `conic-gradient(var(--accent) 0 ${goalProgressPercent}%, rgba(15, 23, 42, 0.08) ${goalProgressPercent}% 100%)`,
                  }}
                >
                  <div className="dashboard-home__ring-inner">
                    <strong>{goalProgress.progressPercent === null ? "Set" : `${Math.round(goalProgress.progressPercent)}%`}</strong>
                    <span>{goalProgress.bandLabel}</span>
                  </div>
                </div>
                <div className="dashboard-home__goal-card-copy">
                  <p className="eyebrow">Goal progress</p>
            <strong>{goalSummaryLabel}</strong>
            <p>{goalHeroCopy}</p>
            <small>{goalProgressLabel} complete · {goalAction}</small>
            <Link className="button button-secondary button-small" href={goalHeroActionHref}>
              {goalHeroActionLabel}
            </Link>
          </div>
              </div>
            ) : (
              <div className="dashboard-home__goal-card dashboard-home__goal-card--empty">
                <p className="eyebrow">Goals are optional</p>
                <strong>{goalHeroHeading}</strong>
                <p>{goalHeroCopy}</p>
                <Link className="button button-secondary button-small" href={goalHeroActionHref}>
                  {goalHeroActionLabel}
                </Link>
              </div>
            )}
          </div>
        </article>

        <section className="dashboard-home__movement-grid">
          {movementWindows.map((window) => (
            <article key={window.label} className="dashboard-home__movement-card glass">
              <div className="dashboard-home__movement-card-head">
                <div>
                  <p className="eyebrow">{window.label}</p>
                  <strong>{window.valueLabel}</strong>
                </div>
                <span className={`dashboard-visual-pill ${window.summary.net >= 0 ? "positive" : "negative"}`}>
                  {window.summary.net >= 0 ? "Up" : "Down"}
                </span>
              </div>
              <p className="dashboard-home__movement-copy">{window.detailLabel}</p>
              <div className="dashboard-home__movement-footer">
                <span>{window.footLabel}</span>
              </div>
            </article>
          ))}
        </section>

        <article className="dashboard-home__activity-card glass">
          <div className="dashboard-home__summary-card-head">
            <div>
              <p className="eyebrow">Activity</p>
              <h4>Transactions per day</h4>
            </div>
            <span className="dashboard-visual-pill">{activitySummaryLabel}</span>
          </div>
          <div className="dashboard-home__activity-chart" aria-label="Transactions per day over the last seven days">
            {activitySeries.map((point) => {
              const height = Math.max((point.count / maxActivityCount) * 100, point.count > 0 ? 16 : 6);
              return (
                <div key={point.key} className="dashboard-home__activity-bar">
                  <span className="dashboard-home__activity-bar-count">{point.count > 0 ? point.count : ""}</span>
                  <div className="dashboard-home__activity-bar-track" aria-hidden="true">
                    <div className="dashboard-home__activity-bar-fill" style={{ height: `${height}%` }} />
                  </div>
                  <span className="dashboard-home__activity-bar-label">{point.label}</span>
                </div>
              );
            })}
          </div>
          <div className="dashboard-home__activity-metrics">
            <div className="dashboard-home__mini-card">
              <span>Top spend</span>
              <strong>{topDriver}</strong>
              <small>{formatCurrency(currentSummary.topCategory?.[1] ?? 0)} this month</small>
            </div>
            <div className="dashboard-home__mini-card">
              <span>Recurring</span>
              <strong>{recurringItem ? recurringItem.name : "Nothing repeating yet"}</strong>
              <small>
                {recurringItem
                  ? `${formatCurrency(recurringItem.amount / recurringItem.count)} per transaction · last seen ${formatRelativeDate(recurringItem.lastSeen)}`
                  : "Clover will surface repeating bills here"}
              </small>
            </div>
            <div className="dashboard-home__mini-card">
              <span>Trust</span>
              <strong>{Math.round(confidenceScore)}%</strong>
              <small>
                {confidenceLabel} · {reviewCoverageText}
              </small>
            </div>
          </div>
        </article>

        <article className="dashboard-home__review-strip glass">
          <div className="dashboard-home__review-copy">
            <p className="eyebrow">Small follow-up</p>
            <strong>{reviewAttentionText}</strong>
            <span>{isEmptyWorkspace ? "Import a statement to unlock balance, movement, and goal progress." : latestImportLabel ?? reviewCoverageText}</span>
          </div>
          <div className="dashboard-home__review-actions">
            <Link className="button button-primary button-small" href={attentionActionHref}>
              {attentionActionLabel}
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

  return (
    <CloverShell
      active="dashboard"
      title="Dashboard"
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
