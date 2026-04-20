import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";
import { DashboardVisualsIsland } from "@/components/dashboard-visuals-island";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Dashboard",
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("en-PH", {
  maximumFractionDigits: 0,
  signDisplay: "always",
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

const formatPercent = (value: number) => percentFormatter.format(value);

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

export default async function DashboardPage() {
  const session = await getSessionContext();
  const user = await getOrCreateCurrentUser(session.userId);
  if (!session.isGuest && !hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }

  const starterWorkspace = await ensureStarterWorkspace(user.clerkUserId, user.email, user.verified);
  const selectedWorkspace =
    (await prisma.workspace.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
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
    })) ?? ({
      id: starterWorkspace.id,
      name: starterWorkspace.name,
      importFiles: [],
      _count: {
        accounts: starterWorkspace.accounts.length,
        importFiles: 0,
        transactions: 0,
      },
    } satisfies WorkspaceSummary);

  const selectedImportFiles = selectedWorkspace.importFiles;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const oneHundredEightyDaysAgo = new Date();
  oneHundredEightyDaysAgo.setDate(oneHundredEightyDaysAgo.getDate() - 180);

  const recentTransactions = await prisma.transaction.findMany({
    where: {
      workspaceId: selectedWorkspace.id,
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
  const reviewAttentionTransactions = currentThirtyDayTransactions.filter(
    (transaction) => transaction.reviewStatus !== "confirmed" || transaction.categoryId === null || transaction.categoryConfidence < 70
  );
  const reviewPreviewTransactions = reviewAttentionTransactions
    .slice()
    .sort((a, b) => a.categoryConfidence - b.categoryConfidence || b.date.getTime() - a.date.getTime())
    .slice(0, 3);
  const reviewAttentionCount = reviewAttentionTransactions.length;

  const recentConfirmedShare = currentThirtyDayTransactions.length
    ? Math.round((currentSummary.current.confirmed / currentThirtyDayTransactions.length) * 100)
    : 0;
  const reviewCoverageText =
    currentThirtyDayTransactions.length > 0
      ? `${recentConfirmedShare}% of the last 30 days is confirmed or edited`
      : "No recent transactions to score yet";
  const expensePerDay = currentSummary.current.expense / 30;
  const weeklyExpense = currentThirtyDayTransactions.reduce((sum, transaction) => {
    const daysOld = (Date.now() - transaction.date.getTime()) / 86400000;
    if (daysOld <= 7 && transaction.type === "expense") {
      return sum + Math.abs(toAmount(transaction.amount));
    }
    return sum;
  }, 0);

  const latestImport = selectedImportFiles[0] ?? null;
  const recentImports = selectedImportFiles.slice(0, 3);
  const pendingImports = selectedImportFiles.filter((file) => file.status === "processing").length;

  const reviewPreviewCopy =
    reviewAttentionCount > 0
      ? `${reviewAttentionCount} transaction${reviewAttentionCount === 1 ? "" : "s"} still need a quick check.`
      : "No transactions need review right now.";

  const heroTitle =
    reviewAttentionCount > 0
      ? `You have ${reviewAttentionCount} item${reviewAttentionCount === 1 ? "" : "s"} waiting for a quick check.`
      : pendingImports > 0
        ? "Your latest import is still processing."
        : "You’re caught up. Here’s the latest money story.";

  const heroSubtitle =
    currentThirtyDayTransactions.length > 0
      ? `In the last 30 days Clover saw ${currencyFormatter.format(currentSummary.current.income)} in income, ${currencyFormatter.format(
          currentSummary.current.expense
        )} in spending, and ${selectedWorkspace._count.transactions} total transactions across ${selectedWorkspace._count.accounts} connected account${
          selectedWorkspace._count.accounts === 1 ? "" : "s"
        }.`
      : "Import a statement or add a transaction to start building the dashboard.";

  const primaryActionHref = reviewAttentionCount > 0 ? "/review" : "/transactions?import=1";
  const primaryActionLabel = reviewAttentionCount > 0 ? "Review queue" : "Import files";

  const topCategory = currentSummary.topCategory
    ? {
        name: currentSummary.topCategory[0],
        amount: currentSummary.topCategory[1],
      }
    : null;

  const topCategoryShare =
    currentSummary.current.expense > 0 && topCategory ? Math.round((topCategory.amount / currentSummary.current.expense) * 100) : 0;

  const biggestMover = currentSummary.biggestMover
    ? {
        name: currentSummary.biggestMover.name,
        amount: currentSummary.biggestMover.currentAmount,
        delta: currentSummary.biggestMover.delta,
        percentage: currentSummary.biggestMover.percentage,
      }
    : null;

  const topMerchant = currentSummary.topMerchant
    ? {
        name: currentSummary.topMerchant[0],
        amount: currentSummary.topMerchant[1].amount,
        count: currentSummary.topMerchant[1].count,
        lastSeen: currentSummary.topMerchant[1].lastSeen,
      }
    : null;

  const recentActivityTransactions = currentTransactions.slice(0, 4);
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
      kicker="At a glance"
      title={heroTitle}
      subtitle={heroSubtitle}
      showTopbar={false}
      actions={
        <>
          <Link className="pill-link" href={primaryActionHref}>
            {primaryActionLabel}
          </Link>
          <Link className="pill-link" href="/transactions">
            Transactions
          </Link>
          <Link className="pill-link" href="/review">
            Review queue
          </Link>
        </>
      }
    >
      <section className="hero">
        <div className="hero-copy">
          <span className="pill pill-accent">Live workspace overview</span>
          <h3>{heroTitle}</h3>
          <p>
            Transactions, analytics, and source-aware imports stay in one place so you can review the exact rows that
            need you, spot spending patterns, and keep Clover learning from your edits.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href={primaryActionHref}>
              {primaryActionLabel}
            </Link>
            <Link className="button button-secondary" href="/reports">
              Weekly summary
            </Link>
            <Link className="button button-secondary" href="/transactions">
              Transactions
            </Link>
          </div>
        </div>

        <div className="hero-metrics">
          <article className="metric">
            <span>Needs attention</span>
            <strong>{reviewAttentionCount}</strong>
            <small>
              {pendingImports > 0
                ? `${pendingImports} import${pendingImports === 1 ? "" : "s"} processing`
                : "No imports currently processing"}
            </small>
          </article>
          <article className="metric">
            <span>30-day net</span>
            <strong>{formatSignedCurrency(currentSummary.net)}</strong>
            <small>{currencyFormatter.format(currentSummary.current.expense)} spent in the last 30 days</small>
          </article>
          <article className="metric">
            <span>Daily spend</span>
            <strong>{currencyFormatter.format(expensePerDay)}</strong>
            <small>{currencyFormatter.format(weeklyExpense)} spent in the last 7 days</small>
          </article>
          <article className="metric">
            <span>Trusted rows</span>
            <strong>{formatRate(recentConfirmedShare)}</strong>
            <small>{reviewCoverageText}</small>
          </article>
        </div>
      </section>

      <DashboardVisualsIsland
        currentNetDelta={currentSummary.netDelta}
        currentExpense={currentSummary.current.expense}
        monthPoints={monthPoints}
        linePath={linePath}
        chartWidth={chartWidth}
        chartHeight={chartHeight}
        chartPadding={chartPadding}
        topCategoryRows={topCategoryRows}
        formatSignedCurrency={formatSignedCurrency}
        formatCompactPercentage={formatCompactPercentage}
      />

      <section className="feature-grid" id="analytics">
        <article className="feature-card glass">
          <p className="eyebrow">Do this next</p>
          <h3>Open the exact rows Clover wants you to check.</h3>
          <p>{reviewPreviewCopy}</p>
          <div className="overview-panel__list">
            {reviewPreviewTransactions.length > 0 ? (
              reviewPreviewTransactions.map((transaction) => (
                <div key={transaction.id} className="overview-panel__item">
                  <strong>{transaction.merchantClean || transaction.merchantRaw}</strong>
                  <span>
                    {transaction.account.name}
                    {transaction.category?.name ? ` · ${transaction.category.name}` : ""} ·{" "}
                    {currencyFormatter.format(Math.abs(toAmount(transaction.amount)))} · {transaction.categoryConfidence}%
                  </span>
                </div>
              ))
            ) : (
              <div className="overview-panel__item">
                <strong>Everything is reviewed</strong>
                <span>No rows are waiting in the review queue right now.</span>
              </div>
            )}
          </div>
        </article>

        <article className="feature-card glass">
          <p className="eyebrow">Patterns</p>
          <h3>Spot what changed before it becomes a habit.</h3>
          <p>Trends, category mix, source mix, and recurring behavior are all reflected on the dashboard.</p>
          <div className="overview-panel__list">
            <div className="overview-panel__item">
              <strong>{topCategory ? `${topCategory.name} leads at ${currencyFormatter.format(topCategory.amount)}` : "No spend yet"}</strong>
              <span>
                {topCategory
                  ? `${topCategoryShare}% of recent spending`
                  : "Import data to see category mix and spending concentration"}
              </span>
            </div>
            <div className="overview-panel__item">
              <strong>
                {biggestMover ? `${biggestMover.name} is up ${formatPercent(biggestMover.percentage)}` : "No category shifts yet"}
              </strong>
              <span>
                {biggestMover
                  ? `${currencyFormatter.format(biggestMover.amount)} this month vs the previous 30 days`
                  : "Comparisons appear once Clover has two similar periods to compare"}
              </span>
            </div>
            <div className="overview-panel__item">
              <strong>
                {topMerchant
                  ? `${topMerchant.name} repeated ${topMerchant.count} time${topMerchant.count === 1 ? "" : "s"}`
                  : "No repeated merchant yet"}
              </strong>
              <span>
                {topMerchant
                  ? `Most recent appearance ${formatRelativeDate(topMerchant.lastSeen)}`
                  : "Repeated merchants will show up once they start to matter"}
              </span>
            </div>
          </div>
        </article>

        <article className="feature-card glass">
          <p className="eyebrow">Trust</p>
          <h3>Keep confirmed data separate from guesses.</h3>
          <p>
            Clover keeps the raw import trail intact, surfaces low-confidence rows for review, and learns from the
            changes you confirm.
          </p>
          <div className="overview-panel__list">
            <div className="overview-panel__item">
              <strong>{reviewCoverageText}</strong>
              <span>Confirmed and edited rows are the ones Clover trusts most.</span>
            </div>
            <div className="overview-panel__item">
              <strong>{selectedWorkspace._count.importFiles} import{selectedWorkspace._count.importFiles === 1 ? "" : "s"} processed</strong>
              <span>{latestImport ? `Latest: ${latestImport.fileName}` : "No statement files imported yet"}</span>
            </div>
          </div>
        </article>

        <article className="feature-card glass">
          <p className="eyebrow">Habit loop</p>
          <h3>Make Clover a weekly check-in, not just an upload tool.</h3>
          <p>
            A quick review every week keeps the dashboard fresh, catches category drift early, and turns imports into a
            repeatable routine.
          </p>
          <div className="overview-panel__list">
            <div className="overview-panel__item">
              <strong>Weekly summary</strong>
              <span>Open Reports to compare the same window and spot drift before it spreads.</span>
            </div>
            <div className="overview-panel__item">
              <strong>Next best action</strong>
              <span>{reviewAttentionCount > 0 ? "Clear the review queue first" : "Import the next statement when it lands"}</span>
            </div>
          </div>
        </article>
      </section>

      <section className="overview-insight-grid" id="insights">
        <article className="glass insight-card overview-panel overview-panel--large">
          <p className="eyebrow">What changed</p>
          <h4>Recent movement, compared with the prior 30 days</h4>
          <div className="overview-panel__list overview-panel__list--wide">
            <div className="overview-panel__item">
              <strong>Workspace</strong>
              <span>{selectedWorkspace.name}</span>
            </div>
            <div className="overview-panel__item">
              <strong>Income</strong>
              <span>{formatSignedCurrency(currentSummary.incomeDelta)} vs the previous 30 days</span>
            </div>
            <div className="overview-panel__item">
              <strong>Spending</strong>
              <span>{formatSignedCurrency(currentSummary.expenseDelta)} vs the previous 30 days</span>
            </div>
            <div className="overview-panel__item">
              <strong>Net</strong>
              <span>{formatSignedCurrency(currentSummary.netDelta)} versus the previous 30 days</span>
            </div>
          </div>
        </article>

        <article className="glass insight-card overview-panel">
          <p className="eyebrow">Latest import</p>
          <h4>Keep the next handoff visible</h4>
          <div className="overview-panel__list">
            <div className="overview-panel__item">
              <strong>{latestImport ? latestImport.fileName : "No import yet"}</strong>
              <span>
                {latestImport ? `${latestImport.status} · ${formatDate(latestImport.uploadedAt)}` : "Upload a statement to unlock the dashboard"}
              </span>
            </div>
            <div className="overview-panel__item">
              <strong>Recent uploads</strong>
              <span>
                {recentImports.length > 0
                  ? recentImports.map((file) => `${file.fileName} (${file.status})`).join(" · ")
                  : "No uploads in this workspace yet"}
              </span>
            </div>
          </div>
        </article>
      </section>

      <section className="overview-activity-grid">
        <article className="glass insight-card overview-panel overview-panel--full">
          <div className="overview-panel__head">
            <div>
              <p className="eyebrow">Activity</p>
              <h4>Recent imports and transactions</h4>
            </div>
          </div>
          <div className="overview-activity-list">
            {recentImports.map((file) => (
              <div key={file.id} className="overview-panel__item">
                <strong>{file.fileName}</strong>
                <span>
                  <span className={`status status--${file.status}`}>{file.status}</span> · {formatRelativeDate(file.uploadedAt)}
                </span>
              </div>
            ))}
            {recentActivityTransactions.map((transaction) => (
              <div key={transaction.id} className="overview-panel__item">
                <strong>{transaction.merchantClean || transaction.merchantRaw}</strong>
                <span>
                  {transaction.account.name}
                  {transaction.category?.name ? ` · ${transaction.category.name}` : ""} ·{" "}
                  {currencyFormatter.format(Math.abs(toAmount(transaction.amount)))}
                </span>
              </div>
            ))}
            {recentImports.length === 0 && recentActivityTransactions.length === 0 ? (
              <div className="overview-panel__item">
                <strong>No recent activity</strong>
                <span>Import a statement or add a transaction to start populating this workspace.</span>
              </div>
            ) : null}
          </div>
        </article>
      </section>
    </CloverShell>
  );
}
