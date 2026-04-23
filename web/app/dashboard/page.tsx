import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";
import { DashboardImportLauncher } from "@/components/dashboard-import-launcher";
import { DashboardVisualsIsland } from "@/components/dashboard-visuals-island";
import { getSessionContext } from "@/lib/auth";
import { analyticsOnceKey } from "@/lib/analytics";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { getGoalDefinition } from "@/lib/goals";
import { PostHogEvent } from "@/components/posthog-analytics";

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

type WorkspaceSummary = {
  id: string;
  name: string;
  accounts: Array<{
    id: string;
    name: string;
    institution: string | null;
    type: string;
    currency: string;
  }>;
  importFiles: Array<{
    id: string;
    fileName: string;
    status: "processing" | "done" | "failed" | "deleted";
    uploadedAt: Date;
  }>;
  _count: {
    accounts: number;
    importFiles: number;
    transactions: number;
  };
};

const toAmount = (value: unknown) => Number(value ?? 0);
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

const formatRate = (value: number) => `${value.toFixed(0)}%`;

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

export default async function DashboardPage({
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

  const starterWorkspacePromise = ensureStarterWorkspace(user.clerkUserId, user.email, user.verified);
  const selectedWorkspacePromise = prisma.workspace.findFirst({
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
        },
      },
      importFiles: {
        orderBy: { uploadedAt: "desc" },
        take: 5,
        select: {
          id: true,
          fileName: true,
          status: true,
          uploadedAt: true,
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
  const [starterWorkspace, selectedWorkspaceData] = await Promise.all([starterWorkspacePromise, selectedWorkspacePromise]);
  const workspaceSummary =
    selectedWorkspaceData ??
    ({
      id: starterWorkspace.id,
      name: starterWorkspace.name,
      accounts: starterWorkspace.accounts.map((account) => ({
        id: account.id,
        name: account.name,
        institution: account.institution,
        type: account.type,
        currency: account.currency,
      })),
      importFiles: [],
      _count: {
        accounts: starterWorkspace.accounts.length,
        importFiles: 0,
        transactions: 0,
      },
    } satisfies WorkspaceSummary);

  const selectedImportFiles = workspaceSummary.importFiles;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const oneHundredEightyDaysAgo = new Date();
  oneHundredEightyDaysAgo.setDate(oneHundredEightyDaysAgo.getDate() - 180);

  const recentTransactions = await prisma.transaction.findMany({
    where: {
      workspaceId: workspaceSummary.id,
      isExcluded: false,
      date: {
        gte: oneHundredEightyDaysAgo,
      },
    },
    include: {
      category: true,
      account: true,
    },
    orderBy: { date: "desc" },
    take: 240,
  });

  const currentTransactions = recentTransactions as DashboardTransaction[];
  const currentThirtyDayTransactions = currentTransactions.filter((transaction) => transaction.date >= thirtyDaysAgo);
  const previousTransactionsWindow = currentTransactions.filter(
    (transaction) => transaction.date >= sixtyDaysAgo && transaction.date < thirtyDaysAgo
  );
  const sixMonthTransactionWindow = currentTransactions;
  const currentSummary = comparePeriods(currentThirtyDayTransactions, previousTransactionsWindow);
  const selectedGoal = getGoalDefinition(user.primaryGoal?.trim() ?? null);
  const hasPrimaryGoal = Boolean(user.primaryGoal?.trim());
  const currentNet = currentSummary.net;
  const currentSavingsRate = currentSummary.current.income > 0 ? currentNet / currentSummary.current.income : null;
  const previousSavingsRate = currentSummary.previous.income > 0 ? currentSummary.previousNet / currentSummary.previous.income : null;
  const uncategorizedTransactions = currentThirtyDayTransactions.filter(
    (transaction) => !transaction.category?.name || !transaction.merchantClean
  );
  const uncategorizedShare =
    currentSummary.current.expense > 0
      ? uncategorizedTransactions.reduce((sum, transaction) => sum + Math.abs(toAmount(transaction.amount)), 0) /
        currentSummary.current.expense
      : 0;
  const duplicateGroups = new Map<string, DashboardTransaction[]>();
  currentThirtyDayTransactions.forEach((transaction) => {
    const merchant = (transaction.merchantClean ?? transaction.merchantRaw).trim().toLowerCase();
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
  const possibleDuplicateGroups = Array.from(duplicateGroups.values()).filter((group) => group.length > 1);
  const recurringMerchantSpend = new Map<
    string,
    {
      label: string;
      amount: number;
      count: number;
    }
  >();

  currentThirtyDayTransactions.forEach((transaction) => {
    if (transaction.type !== "expense") {
      return;
    }

    const label = transaction.merchantClean ?? transaction.merchantRaw;
    const key = label.trim().toLowerCase();
    const existing = recurringMerchantSpend.get(key) ?? {
      label,
      amount: 0,
      count: 0,
    };
    existing.amount += Math.abs(toAmount(transaction.amount));
    existing.count += 1;
    recurringMerchantSpend.set(key, existing);
  });

  const recurringMerchants = Array.from(recurringMerchantSpend.values())
    .filter((merchant) => merchant.count > 1)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4);

  const recurringDrag = recurringMerchants.reduce((sum, merchant) => sum + merchant.amount, 0);
  const recurringShare = currentSummary.current.expense > 0 ? recurringDrag / currentSummary.current.expense : 0;
  const cleanlinessScore = clamp(Math.round(100 - uncategorizedShare * 120 - possibleDuplicateGroups.length * 7), 20, 100);
  const trendScore = currentSummary.net >= currentSummary.previousNet ? 18 : 8;
  const consistencyScore =
    previousSavingsRate !== null && currentSavingsRate !== null && currentSavingsRate >= previousSavingsRate ? 14 : 7;
  const savingsScore =
    currentSavingsRate === null ? 16 : clamp(Math.round((currentSavingsRate * 100 / selectedGoal.targetRate) * 55), 12, 65);
  const dragPenalty = clamp(Math.round(recurringShare * 100 * 0.35 + Math.max(0, recurringMerchants.length - 1) * 4), 0, 22);
  const goalScore = clamp(Math.round(savingsScore + trendScore + consistencyScore + cleanlinessScore * 0.2 - dragPenalty), 12, 98);
  const goalProgressLabel =
    goalScore >= 85 ? "Ahead of pace" : goalScore >= 70 ? "On pace" : goalScore >= 50 ? "Building momentum" : "Early in the climb";
  const reviewAttentionTransactions = currentThirtyDayTransactions.filter(
    (transaction) => transaction.reviewStatus !== "confirmed" || transaction.categoryId === null || transaction.categoryConfidence < 70
  );
  const reviewAttentionCount = reviewAttentionTransactions.length;
  const reviewPreviewTransactions = reviewAttentionTransactions
    .slice()
    .sort((a, b) => a.categoryConfidence - b.categoryConfidence || b.date.getTime() - a.date.getTime())
    .slice(0, 3);
  const recentConfirmedShare = currentThirtyDayTransactions.length
    ? Math.round((currentSummary.current.confirmed / currentThirtyDayTransactions.length) * 100)
    : 0;
  const reviewCoverageText =
    currentThirtyDayTransactions.length > 0
      ? `${recentConfirmedShare}% of the last 30 days is confirmed or edited`
      : "No recent transactions to score yet";
  const currentNetLabel = currentNet >= 0 ? "Positive net cash flow" : "Negative net cash flow";
  const currentPositionCopy =
    currentSummary.current.income > 0
      ? `Income ${currencyFormatter.format(currentSummary.current.income)} and spending ${currencyFormatter.format(
          currentSummary.current.expense
        )} in the last 30 days. ${reviewAttentionCount > 0 ? `${reviewAttentionCount} items need review.` : "Review is clear."}`
      : "Import a statement to unlock a live view of your cash flow, review queue, and recent activity.";
  const currentTrendCopy =
    currentSummary.netDelta >= 0
      ? `${formatSignedCurrency(currentSummary.netDelta)} better than the previous 30 days`
      : `${formatSignedCurrency(Math.abs(currentSummary.netDelta))} worse than the previous 30 days`;
  const reviewQueueCopy =
    reviewAttentionCount > 0
      ? `${reviewAttentionCount} transaction${reviewAttentionCount === 1 ? "" : "s"} still need review or categorization.`
      : "Everything from the last 30 days is caught up.";
  const latestImport = selectedImportFiles[0] ?? null;
  const recentImports = selectedImportFiles.slice(0, 3);
  const recentActivityTransactions = currentTransactions.slice(0, 4);
  const importStatusCopy = latestImport
    ? `${latestImport.fileName} · ${latestImport.status} · ${formatDate(latestImport.uploadedAt)}`
    : "No statement has been imported yet";
  const importActivityCopy =
    recentImports.length > 0
      ? recentImports.map((file) => `${file.fileName} (${file.status})`).join(" · ")
      : "Import a statement to start filling this workspace.";
  const goalMiniCopy = hasPrimaryGoal
    ? `${selectedGoal.title} · ${goalProgressLabel} · ${goalScore}% readiness`
    : "Set a goal to add pace context to the dashboard.";
  const goalMiniNote = hasPrimaryGoal ? selectedGoal.signal : "Goals help Clover explain whether you are on track.";
  const goalRingValue = clamp(goalScore, 0, 100);
  const monthBuckets = getMonthBuckets(new Date());
  sixMonthTransactionWindow.forEach((transaction) => {
    const bucket = getMonthBucket(transaction.date, monthBuckets);
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

  const chartWidth = 520;
  const chartHeight = 210;
  const chartPadding = 24;
  const { points: monthPoints, linePath } = buildLinePath(monthBuckets, chartWidth, chartHeight, chartPadding);
  const topCategoryRows: VisualCategory[] = Array.from(currentSummary.current.expenseCategories.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, amount]) => ({
      name,
      amount,
      share: currentSummary.current.expense > 0 ? (amount / currentSummary.current.expense) * 100 : 0,
    }));
  return (
    <CloverShell
      active="dashboard"
      kicker="Home"
      title="Your finances at a glance"
      subtitle="See your current position, review queue, recent activity, and import status without digging."
      showTopbar={false}
      actions={
        <>
          <Link className="pill-link" href={reviewAttentionCount > 0 ? "/review" : "/dashboard?import=1"}>
            {reviewAttentionCount > 0 ? "Review queue" : "Import statement"}
          </Link>
          <Link className="pill-link" href="/transactions">
            Transactions
          </Link>
          <Link className="pill-link" href="/goals">
            Goals
          </Link>
        </>
      }
    >
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
        <article className="dashboard-home__hero glass">
          <div className="dashboard-home__copy">
            <div className="dashboard-home__kicker-row">
              <span className="pill pill-accent">Current financial position</span>
              <span className="pill pill-subtle">{workspaceSummary.name}</span>
              <span className="pill pill-subtle">{hasPrimaryGoal ? selectedGoal.title : "No goal set"}</span>
            </div>

            <h3>
              {currentNet >= 0
                ? `You are ${formatSignedCurrency(currentNet)} ahead in the last 30 days.`
                : `You are ${formatSignedCurrency(currentNet)} behind in the last 30 days.`}
            </h3>
            <p>{currentPositionCopy}</p>

            <div className="dashboard-home__kpis">
              <article className="dashboard-home__kpi">
                <span>Net position</span>
                <strong className={currentNet >= 0 ? "positive" : "negative"}>{formatSignedCurrency(currentNet)}</strong>
                <small>{currentNetLabel} · {currentTrendCopy}</small>
              </article>
              <article className="dashboard-home__kpi">
                <span>Income</span>
                <strong>{currencyFormatter.format(currentSummary.current.income)}</strong>
                <small>Last 30 days</small>
              </article>
              <article className="dashboard-home__kpi">
                <span>Spending</span>
                <strong>{currencyFormatter.format(currentSummary.current.expense)}</strong>
                <small>Last 30 days</small>
              </article>
              <article className="dashboard-home__kpi">
                <span>Review items</span>
                <strong>{reviewAttentionCount}</strong>
                <small>{reviewCoverageText}</small>
              </article>
            </div>

            <div className="hero-actions">
              <Link className="button button-primary" href={reviewAttentionCount > 0 ? "/review" : "/dashboard?import=1"}>
                {reviewAttentionCount > 0 ? "Review queue" : "Import statement"}
              </Link>
              <Link className="button button-secondary" href="/dashboard?import=1">
                Import files
              </Link>
              <Link className="button button-secondary" href="/transactions">
                Transactions
              </Link>
            </div>
          </div>

          <div className="dashboard-home__rail">
            <article className="dashboard-home__rail-card">
              <div className="dashboard-home__rail-head">
                <div>
                  <p className="eyebrow">Review queue</p>
                  <h4>{reviewAttentionCount > 0 ? `${reviewAttentionCount} items need attention` : "No items need review"}</h4>
                </div>
                <span className={`dashboard-visual-pill ${reviewAttentionCount > 0 ? "negative" : "positive"}`}>
                  {reviewAttentionCount > 0 ? "Action needed" : "Caught up"}
                </span>
              </div>
              <p>{reviewQueueCopy}</p>
              <div className="dashboard-home__list">
                {reviewPreviewTransactions.length > 0 ? (
                  reviewPreviewTransactions.map((transaction) => (
                    <div key={transaction.id} className="dashboard-home__item">
                      <strong>{transaction.merchantClean || transaction.merchantRaw}</strong>
                      <span>
                        {transaction.account.name}
                        {transaction.category?.name ? ` · ${transaction.category.name}` : ""} ·{" "}
                        {currencyFormatter.format(Math.abs(toAmount(transaction.amount)))} · {transaction.categoryConfidence}%
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="dashboard-home__item dashboard-home__item--empty">
                    <strong>Everything is reviewed</strong>
                    <span>New rows will show up here as soon as they need attention.</span>
                  </div>
                )}
              </div>
              <Link className="pill-link pill-link--inline" href="/review">
                Open review
              </Link>
            </article>

            <article className="dashboard-home__rail-card">
              <div className="dashboard-home__rail-head">
                <div>
                  <p className="eyebrow">Latest import</p>
                  <h4>{latestImport ? latestImport.fileName : "Ready for your next statement"}</h4>
                </div>
              </div>
              <p>{importStatusCopy}</p>
              <div className="dashboard-home__list">
                <div className="dashboard-home__item">
                  <strong>Recent uploads</strong>
                  <span>{importActivityCopy}</span>
                </div>
              </div>
              <Link className="pill-link pill-link--inline" href="/dashboard?import=1">
                Import now
              </Link>
            </article>

            <article className="dashboard-home__rail-card">
              <div className="dashboard-home__rail-head">
                <div>
                  <p className="eyebrow">Goal context</p>
                  <h4>{goalMiniCopy}</h4>
                </div>
              </div>
              <p>{goalMiniNote}</p>
              <div className="dashboard-home__mini-metric">
                <strong>{goalRingValue}%</strong>
                <span>{goalProgressLabel} readiness</span>
              </div>
              <Link className="pill-link pill-link--inline" href="/goals">
                View goals
              </Link>
            </article>
          </div>
        </article>

        {/* Keep the dashboard visuals as a separate client island so the shell can stream cleanly. */}
        <DashboardVisualsIsland
          currentNetDelta={currentSummary.netDelta}
          currentExpense={currentSummary.current.expense}
          monthPoints={monthPoints}
          linePath={linePath}
          chartWidth={chartWidth}
          chartHeight={chartHeight}
          chartPadding={chartPadding}
          topCategoryRows={topCategoryRows}
        />

        <DashboardImportLauncher workspaceId={workspaceSummary.id} accounts={workspaceSummary.accounts} initialOpen={resolvedSearchParams?.import === "1"} />

        <section className="dashboard-home__support-grid">
          <article className="dashboard-home__panel glass">
            <div className="dashboard-home__panel-head">
              <div>
                <p className="eyebrow">Recent activity</p>
                <h4>Imports and transactions from the latest session</h4>
              </div>
            </div>
            <div className="dashboard-home__activity">
              {recentImports.length > 0 || recentActivityTransactions.length > 0 ? (
                <>
                  {recentImports.length > 0 ? (
                    <div className="dashboard-home__activity-section">
                      <strong className="dashboard-home__section-label">Recent imports</strong>
                      {recentImports.map((file) => (
                        <div key={file.id} className="dashboard-home__item">
                          <strong>{file.fileName}</strong>
                          <span>
                            <span className={`status status--${file.status}`}>{file.status}</span> · {formatRelativeDate(file.uploadedAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="dashboard-home__item dashboard-home__item--empty">
                      <strong>No imports yet</strong>
                      <span>Start with a statement to populate your activity feed.</span>
                    </div>
                  )}

                  {recentActivityTransactions.length > 0 ? (
                    <div className="dashboard-home__activity-section">
                      <strong className="dashboard-home__section-label">Recent transactions</strong>
                      {recentActivityTransactions.map((transaction) => (
                        <div key={transaction.id} className="dashboard-home__item">
                          <strong>{transaction.merchantClean || transaction.merchantRaw}</strong>
                          <span>
                            {transaction.account.name}
                            {transaction.category?.name ? ` · ${transaction.category.name}` : ""} ·{" "}
                            {currencyFormatter.format(Math.abs(toAmount(transaction.amount)))}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="dashboard-home__item dashboard-home__item--empty">
                      <strong>No transactions yet</strong>
                      <span>Import a statement or add a manual transaction to start the feed.</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="dashboard-home__item dashboard-home__item--empty">
                  <strong>No recent activity</strong>
                  <span>Import your next statement to make the dashboard feel alive.</span>
                </div>
              )}
            </div>
          </article>

          <article className="dashboard-home__panel glass">
            <div className="dashboard-home__panel-head">
              <div>
                <p className="eyebrow">Movement and trust</p>
                <h4>What changed and how much Clover can trust</h4>
              </div>
            </div>
            <div className="dashboard-home__summary-grid">
              <div className="dashboard-home__item">
                <strong>Income</strong>
                <span>{formatSignedCurrency(currentSummary.incomeDelta)} vs the previous 30 days</span>
              </div>
              <div className="dashboard-home__item">
                <strong>Spending</strong>
                <span>{formatSignedCurrency(currentSummary.expenseDelta)} vs the previous 30 days</span>
              </div>
              <div className="dashboard-home__item">
                <strong>Net</strong>
                <span>{formatSignedCurrency(currentSummary.netDelta)} versus the previous 30 days</span>
              </div>
              <div className="dashboard-home__item">
                <strong>Trust</strong>
                <span>
                  {reviewCoverageText}
                  {uncategorizedTransactions.length > 0 ? ` · ${uncategorizedTransactions.length} need categorization` : ""}
                </span>
              </div>
            </div>
          </article>
        </section>
      </section>
    </CloverShell>
  );
}
