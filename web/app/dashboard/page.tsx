import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";
import { EmptyDataCta } from "@/components/empty-data-cta";
import { DashboardImportLauncher } from "@/components/dashboard-import-launcher";
import { DashboardVisualsIsland } from "@/components/dashboard-visuals-island";
import { getSessionContext } from "@/lib/auth";
import { analyticsOnceKey } from "@/lib/analytics";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { getFinancialExperienceProfile } from "@/lib/goals";
import { PostHogEvent, PostHogPersonProperties } from "@/components/posthog-analytics";

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
          balance: true,
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
        balance: account.balance?.toString() ?? null,
      })),
      importFiles: [],
      _count: {
        accounts: starterWorkspace.accounts.length,
        importFiles: 0,
        transactions: 0,
      },
    } satisfies WorkspaceSummary);

  const selectedImportFiles = workspaceSummary.importFiles;
  const cashAccountCount = workspaceSummary.accounts.filter((account) => account.type === "cash").length;
  const accountsWithBalance = workspaceSummary.accounts.filter((account) => account.balance !== null);
  const linkedBalanceTotal = accountsWithBalance.reduce((sum, account) => sum + Number(account.balance ?? 0), 0);
  const accountCurrencies = new Set(workspaceSummary.accounts.map((account) => account.currency).filter(Boolean));
  const trackedBalanceCurrency = accountCurrencies.size === 1 ? workspaceSummary.accounts[0]?.currency ?? null : "mixed";
  const isEmptyWorkspace =
    workspaceSummary._count.transactions === 0 && workspaceSummary._count.importFiles === 0 && workspaceSummary._count.accounts <= 1;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
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
  const importedThisWeekCount = selectedImportFiles.filter((file) => file.uploadedAt >= sevenDaysAgo).length;
  const uncategorizedTransactions = currentThirtyDayTransactions.filter(
    (transaction) => !transaction.category?.name || !transaction.merchantClean
  );
  const reviewAttentionTransactions = currentThirtyDayTransactions.filter(
    (transaction) => transaction.reviewStatus !== "confirmed" || transaction.categoryId === null || transaction.categoryConfidence < 70
  );
  const reviewAttentionCount = reviewAttentionTransactions.length;
  const nextRecurringItem = summarizeRecurringItem(currentTransactions);
  const reviewPreviewTransactions = reviewAttentionTransactions
    .slice()
    .sort((a, b) => a.categoryConfidence - b.categoryConfidence || b.date.getTime() - a.date.getTime())
    .slice(0, 3);
  const recentConfirmedRatio = currentThirtyDayTransactions.length
    ? Math.round((currentSummary.current.confirmed / currentThirtyDayTransactions.length) * 100)
    : 0;
  const reviewCoverageText =
    currentThirtyDayTransactions.length > 0
      ? `${recentConfirmedRatio}% of the last 30 days is confirmed or edited`
      : "No recent transactions to score yet";
  const experienceProfile = getFinancialExperienceProfile(user.financialExperience);
  const latestImport = selectedImportFiles[0] ?? null;
  const currentPositionCopy =
    reviewAttentionCount > 0
      ? `${reviewAttentionCount} item${reviewAttentionCount === 1 ? "" : "s"} still need review. ${latestImport ? `Latest import: ${latestImport.fileName} is ${latestImport.status}.` : "Import a statement to surface the next action."}`
      : latestImport
        ? `Latest import: ${latestImport.fileName} · ${latestImport.status}. Clover is current and ready for the next statement.`
        : experienceProfile.currentPositionCopy;
  const daysSinceLastImport = latestImport
    ? Math.max(0, Math.round((Date.now() - latestImport.uploadedAt.getTime()) / (1000 * 60 * 60 * 24)))
    : null;
  const recentImports = selectedImportFiles.slice(0, 3);
  const recentActivityTransactions = currentTransactions.slice(0, 4);
  const importStatusCopy = latestImport
    ? `${latestImport.fileName} · ${latestImport.status} · ${formatDate(latestImport.uploadedAt)}`
    : "No statement has been imported yet";
  const primaryAction = reviewAttentionCount > 0 ? "Review queue" : "Import statement";
  const primaryActionHref = reviewAttentionCount > 0 ? "/review" : "/dashboard?import=1";
  const actionStripTitle =
    reviewAttentionCount > 0
      ? `${reviewAttentionCount} item${reviewAttentionCount === 1 ? "" : "s"} need review`
      : latestImport
        ? latestImport.status === "processing"
          ? "Latest import is still processing"
          : latestImport.status === "failed"
            ? "Latest import needs another try"
            : "Your dashboard is up to date"
        : "Import your first statement";
  const actionStripCopy =
    reviewAttentionCount > 0
      ? "Clear the review queue first so Clover can trust the numbers it shows you."
        : latestImport
          ? `Last import: ${latestImport.fileName} · ${formatRelativeDate(latestImport.uploadedAt)}`
          : experienceProfile.actionStripCopy;
  const actionStripPill = reviewAttentionCount > 0 ? "Action needed" : latestImport?.status === "processing" ? "Processing" : "Ready";
  const importedThisWeekCard = {
    label: "Imported this week",
    value: String(importedThisWeekCount || recentImports.length || 0),
    note:
      latestImport && importedThisWeekCount > 0
        ? `${latestImport.fileName} · ${formatRelativeDate(latestImport.uploadedAt)}`
        : latestImport
          ? `${latestImport.fileName} · ${latestImport.status}`
          : "No imports yet this week",
  };
  const needsReviewCard = {
    label: "Needs review",
    value: String(reviewAttentionCount),
    note:
      reviewAttentionCount > 0
        ? `${reviewPreviewTransactions.length} high-priority rows are surfaced first`
        : "No open review items right now",
  };
  const unresolvedItemsCard = {
    label: "Unresolved items",
    value: String(uncategorizedTransactions.length),
    note:
      uncategorizedTransactions.length > 0
        ? `${uncategorizedTransactions.length} rows still need categorization`
        : "Everything in the last 30 days is categorized",
  };
  const topCategoryCard = currentSummary.topCategory
    ? {
        label: "Top spending category",
        value: `${currentSummary.topCategory[0]}`,
        note: `${currencyFormatter.format(currentSummary.topCategory[1])} spent in the last 30 days`,
      }
    : {
        label: "Top spending category",
        value: "No spending yet",
        note: "Import activity will surface the biggest category here",
      };
  const recurringItemCard = nextRecurringItem
    ? {
        label: "Next bill or recurring item",
        value: nextRecurringItem.name,
        note: `${currencyFormatter.format(nextRecurringItem.amount / nextRecurringItem.count)} per transaction · last seen ${formatRelativeDate(nextRecurringItem.lastSeen)}`,
      }
    : {
        label: "Next bill or recurring item",
        value: "No recurring item found",
        note: "Once Clover sees repeating merchants, it will surface the next one here",
      };
  const currentPeriodCards = [
    importedThisWeekCard,
    needsReviewCard,
    topCategoryCard,
    recurringItemCard,
  ];
  const changeCards = [
    {
      label: "Income change",
      value: formatSignedCurrency(currentSummary.incomeDelta),
      note: currentSummary.incomeDelta >= 0 ? "Up versus the previous 30 days" : "Down versus the previous 30 days",
    },
    {
      label: "Spending change",
      value: formatSignedCurrency(currentSummary.expenseDelta),
      note: currentSummary.expenseDelta >= 0 ? "More spending than last period" : "Spending cooled versus last period",
    },
    {
      label: "Net change",
      value: formatSignedCurrency(currentSummary.netDelta),
      note: currentSummary.netDelta >= 0 ? "Better than the previous period" : "Worse than the previous period",
    },
    {
      label: "What drove it",
      value: currentSummary.biggestMover?.name ?? "No clear driver",
      note:
        currentSummary.biggestMover && currentSummary.biggestMover.previousAmount > 0
          ? `${formatCompactPercentage(currentSummary.biggestMover.percentage)} above the prior period`
          : "Clover will surface a stronger driver once more data lands",
    },
  ];
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
      subtitle={experienceProfile.dashboardSubtitle}
      showTopbar={false}
      actions={
        <Link className="pill-link" href={reviewAttentionCount > 0 ? "/review" : "/dashboard?import=1"}>
          {reviewAttentionCount > 0 ? "Review queue" : "Import statement"}
        </Link>
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
      <PostHogPersonProperties
        distinctId={user.clerkUserId}
        properties={{
          workspace_name: workspaceSummary.name,
          account_count: workspaceSummary._count.accounts,
          cash_account_count: cashAccountCount,
          tracked_balance_total: linkedBalanceTotal,
          tracked_balance_currency: trackedBalanceCurrency,
          transaction_count: workspaceSummary._count.transactions,
          import_count: workspaceSummary._count.importFiles,
          review_attention_count: reviewAttentionCount,
          goal: user.primaryGoal?.trim() || null,
          financial_experience: user.financialExperience || null,
          last_import_at: latestImport?.uploadedAt.toISOString() ?? null,
          days_since_last_import: daysSinceLastImport,
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
        <article className="dashboard-home__priority-strip glass">
          <div className="dashboard-home__priority-copy">
            <span className={`dashboard-visual-pill ${reviewAttentionCount > 0 ? "negative" : latestImport?.status === "processing" ? "positive" : ""}`}>
              {actionStripPill}
            </span>
            <div>
              <p className="eyebrow">Next best action</p>
              <h4>{actionStripTitle}</h4>
            </div>
            <p>{actionStripCopy}</p>
          </div>
          <div className="dashboard-home__priority-actions">
            <Link className="button button-primary button-small" href={primaryActionHref}>
              {primaryAction}
            </Link>
            <span className="dashboard-home__priority-hint">Keep Clover focused on the next action, not a stack of equal buttons.</span>
          </div>
        </article>

        <article className="dashboard-home__hero glass">
          <div className="dashboard-home__copy">
            <div className="dashboard-home__kicker-row">
              <span className="pill pill-accent">What needs attention now</span>
              <span className="pill pill-subtle">{workspaceSummary.name}</span>
              <span className="pill pill-subtle">{latestImport ? `Last import ${formatRelativeDate(latestImport.uploadedAt)}` : "No import yet"}</span>
            </div>

            <h3>
              {reviewAttentionCount > 0
                ? `${reviewAttentionCount} item${reviewAttentionCount === 1 ? "" : "s"} need review.`
                : latestImport
                  ? "Your latest import is ready to reconcile."
                  : "Import a statement to unlock the dashboard."}
            </h3>
            <p>{currentPositionCopy}</p>

            <div className="dashboard-home__decision-grid">
              {currentPeriodCards.map((card) => (
                <article key={card.label} className="dashboard-home__decision-card">
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                  <small>{card.note}</small>
                </article>
              ))}
            </div>
          </div>

          <div className="dashboard-home__rail">
            <article className="dashboard-home__rail-card">
              <div className="dashboard-home__rail-head">
                <div>
                  <p className="eyebrow">Live status</p>
                  <h4>{latestImport ? latestImport.fileName : "No import yet"}</h4>
                </div>
                <span
                  className={`dashboard-visual-pill ${
                    latestImport ? (latestImport.status === "failed" ? "negative" : "positive") : "negative"
                  }`}
                >
                  {latestImport ? latestImport.status : "Waiting"}
                </span>
              </div>
              <p>{latestImport ? importStatusCopy : "Import a statement to populate this workspace with live status, review, and movement data."}</p>
              <div className="dashboard-home__list">
                <div className="dashboard-home__item">
                  <strong>Imported this week</strong>
                  <span>{importedThisWeekCard.value} import{importedThisWeekCard.value === "1" ? "" : "s"} · {importedThisWeekCard.note}</span>
                </div>
                <div className="dashboard-home__item">
                  <strong>Needs review</strong>
                  <span>{needsReviewCard.note}</span>
                </div>
                <div className="dashboard-home__item">
                  <strong>Unresolved items</strong>
                  <span>{unresolvedItemsCard.note}</span>
                </div>
              </div>
              <Link className="pill-link pill-link--inline" href={primaryActionHref}>
                {primaryAction}
              </Link>
            </article>
          </div>
        </article>

        <DashboardImportLauncher workspaceId={workspaceSummary.id} accounts={workspaceSummary.accounts} initialOpen={resolvedSearchParams?.import === "1"} />

        <section className="dashboard-home__decision-grid">
          <article className="dashboard-home__decision-card dashboard-home__decision-card--strong glass">
            <div className="dashboard-home__decision-head">
              <div>
                <p className="eyebrow">What changed since last period</p>
                <h4>Movement that needs your attention</h4>
              </div>
            </div>
            <div className="dashboard-home__change-grid">
              {changeCards.map((card) => (
                <div key={card.label} className="dashboard-home__item">
                  <strong>{card.label}</strong>
                  <span>{card.value}</span>
                  <small>{card.note}</small>
                </div>
              ))}
            </div>
          </article>
        </section>

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
                        <Link key={file.id} className="dashboard-home__item dashboard-home__item-link" href="/imports">
                          <strong>{file.fileName}</strong>
                          <span>
                            <span className={`status status--${file.status}`}>{file.status}</span> · {formatRelativeDate(file.uploadedAt)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="dashboard-home__item dashboard-home__item--empty">
                      <strong>No imports yet</strong>
                      <span>Import a statement to give Clover a recent activity trail to summarize.</span>
                    </div>
                  )}

                  {recentActivityTransactions.length > 0 ? (
                    <div className="dashboard-home__activity-section">
                      <strong className="dashboard-home__section-label">Recent transactions</strong>
                      {recentActivityTransactions.map((transaction) => (
                        <Link key={transaction.id} className="dashboard-home__item dashboard-home__item-link" href={`/transactions?review=${transaction.id}`}>
                          <strong>{transaction.merchantClean || transaction.merchantRaw}</strong>
                          <span>
                            {transaction.account.name}
                            {transaction.category?.name ? ` · ${transaction.category.name}` : ""} ·{" "}
                            {currencyFormatter.format(Math.abs(toAmount(transaction.amount)))}
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="dashboard-home__item dashboard-home__item--empty">
                      <strong>No transactions yet</strong>
                      <span>Import a statement or add a manual transaction so the dashboard can show what changed.</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="dashboard-home__item dashboard-home__item--empty">
                  <strong>No recent activity</strong>
                  <span>Import your next statement and Clover will turn it into a living activity feed.</span>
                </div>
              )}
            </div>
          </article>

          <article className="dashboard-home__panel glass">
            <div className="dashboard-home__panel-head">
              <div>
                <p className="eyebrow">What changed since last period</p>
                <h4>How the numbers moved and how much Clover can trust</h4>
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
      </section>
    </CloverShell>
  );
}
