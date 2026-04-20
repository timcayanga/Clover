import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";
import { DashboardVisualsIsland } from "@/components/dashboard-visuals-island";
import { PostHogEvent, analyticsOnceKey } from "@/components/posthog-analytics";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { getGoalDefinition } from "@/lib/goals";

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

type GoalNextStep = {
  title: string;
  body: string;
  href: string;
  label: string;
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
  const selectedGoalKey = user.primaryGoal?.trim() ?? null;
  const selectedGoal = getGoalDefinition(selectedGoalKey);
  const hasPrimaryGoal = Boolean(selectedGoalKey);
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
  const currentSavingsRatePercent = currentSavingsRate === null ? null : currentSavingsRate * 100;
  const goalRateGap =
    currentSavingsRate === null ? null : Math.round(selectedGoal.targetRate - currentSavingsRate * 100);
  const reviewAttentionTransactions = currentThirtyDayTransactions.filter(
    (transaction) => transaction.reviewStatus !== "confirmed" || transaction.categoryId === null || transaction.categoryConfidence < 70
  );
  const reviewAttentionCount = reviewAttentionTransactions.length;
  const goalProgressCopy =
    !hasPrimaryGoal
      ? "Pick a goal so Clover can show you how close you are and what to focus on next."
      : currentSavingsRate === null
        ? "Import enough income and spending to calculate a real pace against your goal."
        : selectedGoalKey === "track_spending"
          ? `${uncategorizedTransactions.length} item${uncategorizedTransactions.length === 1 ? "" : "s"} still need categorization, and ${reviewAttentionCount} row${
              reviewAttentionCount === 1 ? "" : "s"
            } need a quick review.`
          : goalRateGap !== null && goalRateGap <= 0
            ? `You are ${Math.abs(goalRateGap)} percentage point${Math.abs(goalRateGap) === 1 ? "" : "s"} ahead of the target pace.`
            : `You need about ${Math.max(goalRateGap ?? 0, 0)} more percentage point${Math.max(goalRateGap ?? 0, 0) === 1 ? "" : "s"} of savings pace to hit the goal.`;
  const goalStatusPill =
    !hasPrimaryGoal
      ? "No goal set"
      : `${selectedGoal.title} · ${selectedGoal.targetRate}% target`;
  const goalNextSteps: GoalNextStep[] = [
    {
      title: hasPrimaryGoal ? `Review ${selectedGoal.title.toLowerCase()}` : "Set your goal",
      body: hasPrimaryGoal
        ? "Use the Goal page to see the full lane, then come back here for the at-a-glance pace check."
        : "Pick a focus so Clover can compare your spending pace against a real target.",
      href: "/goals",
      label: hasPrimaryGoal ? "Open goals" : "Choose goal",
    },
    {
      title: "Clear the blockers",
      body:
        reviewAttentionCount > 0
          ? `${reviewAttentionCount} transaction${reviewAttentionCount === 1 ? "" : "s"} still need review or categorization.`
          : "Nothing is waiting in review right now.",
      href: "/review",
      label: reviewAttentionCount > 0 ? "Open review" : "View queue",
    },
    {
      title: recurringMerchants[0] ? `Trim ${recurringMerchants[0].label}` : "Watch recurring drag",
      body: recurringMerchants[0]
        ? `That recurring spend is carrying ${formatSignedCurrency(recurringMerchants[0].amount)} of pressure.`
        : "Recurring spend is light right now, so the goal is mostly about consistency.",
      href: "/reports",
      label: "Open reports",
    },
  ];
  const goalPaceLabel =
    currentSavingsRatePercent === null ? "No pace yet" : `${formatRate(currentSavingsRatePercent)} current pace`;
  const goalTargetLabel = `${selectedGoal.targetRate}% target pace`;
  const goalGapLabel =
    currentSavingsRatePercent === null
      ? "Import enough income to calculate pace"
      : goalRateGap !== null && goalRateGap > 0
        ? `${goalRateGap} pts to target`
        : goalRateGap !== null
          ? `${Math.abs(goalRateGap)} pts ahead`
          : "Pace unavailable";
  const goalScoreCopy =
    !hasPrimaryGoal
      ? "Choose a goal to make the dashboard measurable."
      : currentSavingsRatePercent === null
        ? "Import enough income and spending to calculate your pace."
        : `You are ${Math.abs(goalRateGap ?? 0)} percentage point${Math.abs(goalRateGap ?? 0) === 1 ? "" : "s"} ${
            goalRateGap !== null && goalRateGap <= 0 ? "ahead of" : "away from"
          } the target pace.`;
  const goalSnapshot = [
    {
      label: "Current pace",
      value: goalPaceLabel,
      note: hasPrimaryGoal ? selectedGoal.signal : "Choose a goal to compare pace.",
    },
    {
      label: "Target pace",
      value: goalTargetLabel,
      note: goalGapLabel,
    },
    {
      label: "Data health",
      value: `${cleanlinessScore}% clean`,
      note:
        uncategorizedTransactions.length > 0
          ? `${uncategorizedTransactions.length} uncategorized transaction${uncategorizedTransactions.length === 1 ? "" : "s"}`
          : "No uncategorized transactions in the last 30 days",
    },
    {
      label: "Recurring drag",
      value: recurringMerchants.length > 0 ? formatSignedCurrency(recurringDrag) : "Low",
      note:
        recurringMerchants.length > 0
          ? `${recurringMerchants.length} repeated merchant${recurringMerchants.length === 1 ? "" : "s"}`
          : "Nothing recurring is pulling hard right now",
    },
  ];

  const recentConfirmedShare = currentThirtyDayTransactions.length
    ? Math.round((currentSummary.current.confirmed / currentThirtyDayTransactions.length) * 100)
    : 0;
  const reviewCoverageText =
    currentThirtyDayTransactions.length > 0
      ? `${recentConfirmedShare}% of the last 30 days is confirmed or edited`
      : "No recent transactions to score yet";

  const latestImport = selectedImportFiles[0] ?? null;
  const recentImports = selectedImportFiles.slice(0, 3);

  const recentActivityTransactions = currentTransactions.slice(0, 4);
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
      kicker="Goals first"
      title={hasPrimaryGoal ? selectedGoal.title : "Set your first goal"}
      subtitle={
        hasPrimaryGoal
          ? `Dashboard progress starts with how close you are to ${selectedGoal.title.toLowerCase()}, then shows the blockers still in the way.`
          : "Set a goal so the dashboard can show your pace, your blockers, and the next move."
      }
      showTopbar={false}
      actions={
        <>
          <Link className="pill-link" href="/goals">
            Goals
          </Link>
          <Link className="pill-link" href="/review">
            Review queue
          </Link>
          <Link className="pill-link" href="/reports">
            Reports
          </Link>
        </>
      }
    >
      <PostHogEvent
        event="dashboard_viewed"
        onceKey={analyticsOnceKey("dashboard_viewed", "session")}
        properties={{
          workspace_name: selectedWorkspace.name,
          account_count: selectedWorkspace._count.accounts,
          transaction_count: selectedWorkspace._count.transactions,
          import_count: selectedWorkspace._count.importFiles,
        }}
      />
      <section className="goals-story">
        <article className="goals-hero glass">
          <div className="goals-hero__copy">
            <div className="goals-hero__header">
              <span className="pill pill-accent">Goal progress</span>
              <span className="pill pill-subtle">{goalStatusPill}</span>
            </div>
            <h3>
              {hasPrimaryGoal
                ? `You are ${goalProgressLabel.toLowerCase()} toward ${selectedGoal.title.toLowerCase()}.`
                : "Choose a goal so Clover can show how close you are and what to do next."}
            </h3>
            <p>{goalProgressCopy}</p>

            <div className="goals-hero__summary">
              <span className={`pill ${goalScore >= 70 ? "pill-good" : goalScore >= 50 ? "pill-accent" : "pill-warning"}`}>
                {goalProgressLabel}
              </span>
              <span>{hasPrimaryGoal ? selectedGoal.signal : "Set a goal to unlock the pace comparison."}</span>
              <span>{hasPrimaryGoal ? selectedGoal.coachNote : "The dashboard will show your target, blockers, and momentum."}</span>
            </div>

            <div className="goals-progress">
              <div className="goals-progress__head">
                <strong>{hasPrimaryGoal ? `${selectedGoal.title} pace` : "Goal readiness"}</strong>
                <span>{goalRingValue} of 100</span>
              </div>
              <div className="goals-progress__bar" aria-hidden="true">
                <div className="goals-progress__fill" style={{ width: `${goalRingValue}%` }} />
              </div>
              <p>{goalScoreCopy}</p>
            </div>

            <div className="hero-actions">
              <Link className="button button-primary" href="/goals">
                {hasPrimaryGoal ? "Open goals" : "Choose a goal"}
              </Link>
              <Link className="button button-secondary" href={reviewAttentionCount > 0 ? "/review" : "/transactions"}>
                {reviewAttentionCount > 0 ? "Clear blockers" : "Import more data"}
              </Link>
              <Link className="button button-secondary" href="/reports">
                Weekly summary
              </Link>
            </div>
          </div>

          <div className="goals-hero__visual">
            <div className="goals-hero__ring-card">
              <div className="goals-hero__ring" role="img" aria-label={`Goal readiness at ${goalRingValue}%`}>
                <svg viewBox="0 0 240 240">
                  <defs>
                    <linearGradient id="dashboard-goals-ring-gradient" x1="0" x2="1" y1="0" y2="1">
                      <stop offset="0%" stopColor="rgba(34, 197, 94, 0.25)" />
                      <stop offset="100%" stopColor="rgba(3, 168, 192, 0.92)" />
                    </linearGradient>
                  </defs>
                  <circle cx="120" cy="120" r="84" className="goals-ring__track" />
                  <circle
                    cx="120"
                    cy="120"
                    r="84"
                    className="goals-ring__progress"
                    stroke="url(#dashboard-goals-ring-gradient)"
                    style={{
                      strokeDasharray: `${2 * Math.PI * 84 * (goalRingValue / 100)} ${2 * Math.PI * 84}`,
                    }}
                  />
                </svg>
                <div className="goals-hero__ring-copy">
                  <strong>{goalRingValue}%</strong>
                  <span>{hasPrimaryGoal ? selectedGoal.title : "Goal readiness"}</span>
                </div>
              </div>

              <div className="goals-hero__stats">
                {goalSnapshot.map((item) => (
                  <div key={item.label} className="goals-stat">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.note}</small>
                  </div>
                ))}
              </div>
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

      <article className="goals-actions glass">
        <div className="goals-panel__head">
          <div>
            <p className="eyebrow">What to do next</p>
            <h4>The three moves that will improve your goal fastest</h4>
          </div>
          <div className="goals-panel__stat">
            <strong>{goalProgressLabel}</strong>
            <span>{hasPrimaryGoal ? selectedGoal.title : "Set a goal first"}</span>
          </div>
        </div>

        <div className="goals-action-grid">
          {goalNextSteps.map((step, index) => (
            <article key={step.title} className="goals-action">
              <div className="goals-lane__top">
                <div className="goals-lane__icon" aria-hidden="true">
                  <span>{String(index + 1)}</span>
                </div>
                <span className="pill pill-subtle">{step.label}</span>
              </div>
              <div>
                <strong>{step.title}</strong>
                <span>{step.body}</span>
              </div>
              <Link className="pill-link pill-link--inline" href={step.href}>
                {step.label}
              </Link>
            </article>
          ))}
        </div>
      </article>

      <section className="overview-insight-grid" id="insights">
        <article className="glass insight-card overview-panel overview-panel--large">
          <p className="eyebrow">Goal health</p>
          <h4>What is helping or slowing the goal</h4>
          <div className="overview-panel__list overview-panel__list--wide">
            <div className="overview-panel__item">
              <strong>Current pace</strong>
              <span>{goalPaceLabel}</span>
            </div>
            <div className="overview-panel__item">
              <strong>Target pace</strong>
              <span>{goalTargetLabel}</span>
            </div>
            <div className="overview-panel__item">
              <strong>Gap</strong>
              <span>{goalGapLabel}</span>
            </div>
            <div className="overview-panel__item">
              <strong>Data health</strong>
              <span>
                {reviewCoverageText}
                {uncategorizedTransactions.length > 0 ? ` · ${uncategorizedTransactions.length} need categorization` : ""}
              </span>
            </div>
          </div>
        </article>

        <article className="glass insight-card overview-panel">
          <p className="eyebrow">Latest import</p>
          <h4>Keep the trail visible</h4>
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
