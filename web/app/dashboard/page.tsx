import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";
import { getSessionContext } from "@/lib/auth";
import { analyticsOnceKey } from "@/lib/analytics";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { formatCurrencyAmount, formatCurrencyCode } from "@/lib/currency-format";
import { deriveReconciledBalance } from "@/lib/account-balance";
import { isLiabilityAccountType, isSpendableAccountType } from "@/lib/account-types";
import { RouteSplash } from "@/components/route-splash";
import { PostHogEvent, PostHogPersonProperties } from "@/components/posthog-analytics";
import { DashboardTopActions } from "@/components/dashboard-top-actions";
import { DashboardImportTrigger } from "@/components/dashboard-import-trigger";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";
import { getPlannedPaymentSuggestions } from "@/lib/planned-payment-suggestions";
import { isTransientDataError } from "@/lib/transient-data";
import { TransientDataRecovery } from "@/components/transient-data-recovery";
import { isNextNavigationSignal, recordServerPageError } from "@/lib/server-page-error";
import { coerceTransactionTypeFromCategoryName } from "@/lib/transaction-directions";
import { repairWorkspaceDataVisibility } from "@/lib/reconciliation";
import { buildVisibleWorkspaceTransactionWhere } from "@/lib/transaction-query";
import { DashboardBudgetPulse } from "@/components/dashboard-budget-pulse";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Home",
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en-PH", {
  numeric: "auto",
});

type DashboardTransaction = {
  id: string;
  date: Date;
  amount: unknown;
  isExcluded: boolean;
  reviewStatus: "pending_review" | "suggested" | "confirmed" | "edited" | "rejected" | "duplicate_skipped";
  categoryConfidence: number | null;
  categoryId: string | null;
  type: "income" | "expense" | "transfer";
  merchantRaw: string | null;
  merchantClean: string | null;
  account: {
    name: string;
    currency: string | null;
  } | null;
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

type HomeAdviserItem = {
  emoji: string;
  label: string;
  copy: string;
  href?: string;
  actionLabel?: string;
  tone?: "neutral" | "positive" | "warning";
};

type WorkspaceSummary = {
  id: string;
  name: string;
  accounts: Array<{
    id: string;
    name: string;
    institution: string | null;
    accountNumber: string | null;
    type: string;
    currency: string;
    balance: unknown;
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

const toIsoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const toDayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const normalizeNetWorthBalance = (type: string, value: number) => (isLiabilityAccountType(type as Parameters<typeof isLiabilityAccountType>[0]) ? -Math.abs(value) : Math.abs(value));

const getDashboardTransactionType = (transaction: DashboardTransaction) =>
  coerceTransactionTypeFromCategoryName(transaction.category?.name, transaction.type, transaction.amount);

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

const summarizeTransactions = (transactions: DashboardTransaction[]): AggregatedTransactionTotals => {
  return transactions.reduce<AggregatedTransactionTotals>(
    (accumulator, transaction) => {
      const amount = Math.abs(toAmount(transaction.amount));
      const transactionType = getDashboardTransactionType(transaction);

      if (transactionType === "income") {
        accumulator.income += amount;
      } else if (transactionType === "expense") {
        accumulator.expense += amount;
      } else {
        accumulator.transfer += amount;
      }

      if (transaction.reviewStatus === "confirmed" || transaction.reviewStatus === "edited") {
        accumulator.confirmed += 1;
      }

      if (transaction.reviewStatus !== "confirmed" || transaction.categoryId === null || (transaction.categoryConfidence ?? 0) < 70) {
        accumulator.reviewAttention += 1;
      }

      if (transactionType === "expense") {
        const categoryName = transaction.category?.name ?? "Unassigned";
        accumulator.expenseCategories.set(categoryName, (accumulator.expenseCategories.get(categoryName) ?? 0) + amount);

        const merchantName = transaction.merchantClean?.trim() || transaction.merchantRaw?.trim() || "Unknown merchant";
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

function DashboardUnavailableContent() {
  return (
    <section className="dashboard-home">
      <TransientDataRecovery eyebrow="Home" pageLabel="Home" />
    </section>
  );
}

function DashboardUnavailableState() {
  return (
    <CloverShell active="dashboard" title="Home">
      <DashboardUnavailableContent />
    </CloverShell>
  );
}


function DashboardStreamFallback() {
  return (
    <section className="dashboard-home" aria-label="Loading dashboard content">
      <article className="dashboard-home__hero dashboard-home__hero--balance dashboard-home__hero--loading glass">
        <div className="dashboard-home__hero-main">
          <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 108 }} />
          <span className="skeleton-block skeleton-block--line" style={{ width: "min(100%, 340px)", height: 38, borderRadius: 999 }} />
        </div>
        <div className="dashboard-home__hero-aside" aria-hidden="true">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="dashboard-home__hero-mini-pill dashboard-home__hero-mini-pill--loading">
              <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 112 }} />
              <span className="skeleton-block skeleton-block--line skeleton-block--line-long" style={{ width: 88, height: 18 }} />
            </div>
          ))}
        </div>
      </article>

      <section className="dashboard-home__hero-mobile-metrics" aria-label="Loading monthly balance summary">
        {Array.from({ length: 2 }).map((_, index) => (
          <article key={index} className="dashboard-home__hero-mobile-card glass">
            <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 112 }} />
            <span className="skeleton-block skeleton-block--line skeleton-block--line-long" style={{ width: 88, height: 18 }} />
          </article>
        ))}
      </section>

      <article className="dashboard-home__insight-strip dashboard-home__insight-strip--loading glass">
        <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 68 }} />
        <div className="dashboard-home__insight-strip-list">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="dashboard-home__insight-strip-item">
              <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 100 }} />
              <span className="skeleton-block skeleton-block--line skeleton-block--line-long" style={{ width: "90%" }} />
              <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 80 }} />
            </div>
          ))}
        </div>
      </article>

      <div className="dashboard-home__snapshot-grid">
        {Array.from({ length: 2 }).map((_, index) => (
          <article key={index} className="dashboard-home__report-card dashboard-home__report-card--loading glass">
            <div className="dashboard-home__report-card-head">
              <div className="dashboard-home__summary-card-title">
                <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 116 }} />
                <span className="skeleton-block skeleton-block--line skeleton-block--line-long" style={{ width: 128, height: 30 }} />
              </div>
              <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 92 }} />
            </div>
            <div className="dashboard-home__report-metrics">
              {Array.from({ length: 3 }).map((__, metricIndex) => (
                <span key={metricIndex}>
                  <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 54 }} />
                  <span className="skeleton-block skeleton-block--line skeleton-block--line-long" style={{ width: 76 }} />
                </span>
              ))}
            </div>
            <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 96 }} />
          </article>
        ))}
      </div>

      <div className="dashboard-home__snapshot-grid dashboard-home__snapshot-grid--lower">
        {Array.from({ length: 2 }).map((_, index) => (
          <article key={index} className="dashboard-home__goal-card dashboard-home__goal-card--loading glass">
            <div className="dashboard-home__goal-card-head">
              <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 116 }} />
            </div>
            <div className="dashboard-home__goal-card-body">
              <span className="skeleton-block dashboard-home__ring dashboard-home__ring--compact" />
              <div className="dashboard-home__goal-card-copy">
                <span className="skeleton-block skeleton-block--line skeleton-block--line-long" style={{ width: "min(100%, 180px)", height: 22 }} />
                <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: "min(100%, 220px)" }} />
                <span className="skeleton-block skeleton-block--line skeleton-block--line-short" style={{ width: 112 }} />
              </div>
            </div>
            <span className="skeleton-block skeleton-block--line" style={{ width: 128, height: 34, borderRadius: 999 }} />
          </article>
        ))}
      </div>

    </section>
  );
}

async function resolveDashboardWorkspaceSummary(user: Awaited<ReturnType<typeof getOrCreateCurrentUser>>) {
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
        accountNumber: true,
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
            accountNumber: true,
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
    redirect("/home");
  }

  const activeWorkspaceSummary = workspaceSummary;

  await repairWorkspaceDataVisibility(activeWorkspaceSummary.id).catch((error) => {
    console.warn("[home] unable to repair workspace data visibility", {
      workspaceId: activeWorkspaceSummary.id,
      error,
    });
  });
  workspaceSummary = await prisma.workspace.findUnique({
    where: { id: activeWorkspaceSummary.id },
    select: workspaceSelect,
  });

  if (!workspaceSummary) {
    redirect("/home");
  }

  return workspaceSummary;
}

async function DashboardStream({
  user,
  workspaceSummary,
}: {
  user: Awaited<ReturnType<typeof getOrCreateCurrentUser>>;
  workspaceSummary: WorkspaceSummary;
}) {
  try {
  const cashAccountCount = workspaceSummary.accounts.filter((account) => account.type === "cash").length;
  const shouldShowStarterCard =
    workspaceSummary._count.transactions === 0 && workspaceSummary._count.importFiles === 0 && workspaceSummary._count.accounts === 0;
  const preferredDashboardCurrency = (() => {
    const currencies = Array.from(
      new Set(workspaceSummary.accounts.map((account) => formatCurrencyCode(account.currency)).filter(Boolean))
    ).sort((left, right) => left.localeCompare(right));

    if (currencies.includes("PHP")) {
      return "PHP";
    }

    return currencies[0] ?? "PHP";
  })();

  const shouldLoadTransactions = workspaceSummary._count.transactions > 0;
  const now = new Date();
  const latestTransactionDatePromise = shouldLoadTransactions
    ? prisma.transaction.findFirst({
        where: buildVisibleWorkspaceTransactionWhere(workspaceSummary.id, {
          isExcluded: false,
        }),
        orderBy: { date: "desc" },
        select: { date: true },
      })
    : Promise.resolve(null);
  const latestTransactionDate = await latestTransactionDatePromise;
  const activityAnchorDate = latestTransactionDate?.date ?? now;
  const todayStart = toDayStart(activityAnchorDate);
  const sevenDaysAgo = new Date(todayStart);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const thirtyDaysAgo = new Date(todayStart);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  const sixtyDaysAgo = new Date(activityAnchorDate);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const ninetyDaysAgo = new Date(activityAnchorDate);
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

  const dashboardAccountsPromise =
    workspaceSummary._count.accounts > 0
      ? prisma.account.findMany({
          where: {
            workspaceId: workspaceSummary.id,
          },
          select: {
            id: true,
            name: true,
            institution: true,
            accountNumber: true,
            type: true,
            currency: true,
            balance: true,
            transactions: {
              where: { isExcluded: false },
              select: {
                amount: true,
                type: true,
                isExcluded: true,
                merchantRaw: true,
                merchantClean: true,
                description: true,
                date: true,
                createdAt: true,
                rawPayload: true,
              },
              orderBy: { date: "desc" },
            },
            statementCheckpoints: {
              select: {
                endingBalance: true,
                status: true,
                statementEndDate: true,
                createdAt: true,
              },
              orderBy: [
                { statementEndDate: "desc" },
                { createdAt: "desc" },
              ],
              take: 1,
            },
          },
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([]);

  const transactionsPromise = shouldLoadTransactions
    ? prisma.transaction.findMany({
        where: buildVisibleWorkspaceTransactionWhere(workspaceSummary.id, {
          isExcluded: false,
          date: { gte: ninetyDaysAgo },
        }),
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

  const [latestImport, recentTransactions, dashboardAccounts] = await Promise.all([
    latestImportPromise,
    transactionsPromise,
    dashboardAccountsPromise,
  ]);

  const currentTransactions = recentTransactions as DashboardTransaction[];
  const displayCurrency = preferredDashboardCurrency;
  const formatCurrency = (value: number, currency: string | null = displayCurrency) => formatCurrencyAmount(value, currency);
  const formatSignedCurrency = (value: number, currency: string | null = displayCurrency) =>
    `${value < 0 ? "-" : ""}${formatCurrencyAmount(Math.abs(value), currency)}`;

  const normalizedDashboardAccounts = dashboardAccounts.filter(
    (account) => formatCurrencyCode(account.currency) === displayCurrency
  );

  const reconcileAccountBalance = (account: (typeof dashboardAccounts)[number]) => {
    const latestCheckpoint = account.statementCheckpoints[0] ?? null;
    const checkpointBalance =
      latestCheckpoint?.status !== "mismatch" && latestCheckpoint?.endingBalance ? latestCheckpoint.endingBalance : null;
    const reconciledBalance =
      checkpointBalance ??
      deriveReconciledBalance({
        balance: account.balance as Parameters<typeof deriveReconciledBalance>[0]["balance"],
        transactions: account.transactions as unknown as Parameters<typeof deriveReconciledBalance>[0]["transactions"],
        checkpoints: latestCheckpoint ? ([latestCheckpoint] as unknown as Parameters<typeof deriveReconciledBalance>[0]["checkpoints"]) : [],
      });

    return Number(reconciledBalance ?? account.balance ?? 0);
  };

  const savingsTotal = normalizedDashboardAccounts.reduce((sum, account) => {
    const signedBalance = normalizeNetWorthBalance(account.type, reconcileAccountBalance(account));
    if (!isSpendableAccountType(account.type as Parameters<typeof isSpendableAccountType>[0])) {
      return sum;
    }

    return sum + Math.max(signedBalance, 0);
  }, 0);
  const investmentsTotal = normalizedDashboardAccounts.reduce((sum, account) => {
    if (account.type !== "investment") {
      return sum;
    }

    const signedBalance = normalizeNetWorthBalance(account.type, reconcileAccountBalance(account));
    return sum + Math.max(signedBalance, 0);
  }, 0);
  const currentThirtyDayTransactions = currentTransactions.filter((transaction) => transaction.date >= thirtyDaysAgo);
  const currentSevenDayTransactions = currentTransactions.filter((transaction) => transaction.date >= sevenDaysAgo);
  const previousSevenDaysAgo = new Date(sevenDaysAgo);
  previousSevenDaysAgo.setDate(previousSevenDaysAgo.getDate() - 7);
  const previousSevenDayTransactions = currentTransactions.filter(
    (transaction) => transaction.date >= previousSevenDaysAgo && transaction.date < sevenDaysAgo
  );
  const previousTransactionsWindow = currentTransactions.filter(
    (transaction) => transaction.date >= sixtyDaysAgo && transaction.date < thirtyDaysAgo
  );
  const currentSummary = comparePeriods(currentThirtyDayTransactions, previousTransactionsWindow);
  const weeklySummary = comparePeriods(currentSevenDayTransactions, previousSevenDayTransactions);
  const weeklyWindowSummary = summarizeWindow(currentSevenDayTransactions, "This week");
  const monthSummary = summarizeWindow(currentThirtyDayTransactions, "This month");
  const currentSavingsRate = currentSummary.current.income > 0 ? currentSummary.net / currentSummary.current.income : null;
  const previousNet = currentSummary.previous.income - currentSummary.previous.expense;
  const previousSavingsRate = currentSummary.previous.income > 0 ? previousNet / currentSummary.previous.income : null;
  const reviewAttentionTransactions = currentThirtyDayTransactions.filter(
    (transaction) => transaction.reviewStatus !== "confirmed" || transaction.categoryId === null || (transaction.categoryConfidence ?? 0) < 70
  );
  const reviewAttentionCount = reviewAttentionTransactions.length;
  const daysSinceLastImport = latestImport
    ? Math.max(0, Math.floor((now.getTime() - latestImport.uploadedAt.getTime()) / 86400000))
    : null;
  const categorySpikeThreshold = Math.max(500, currentSummary.current.expense * 0.08);
  const categorySpike =
    currentSummary.biggestMover &&
    currentSummary.biggestMover.delta >= categorySpikeThreshold &&
    (currentSummary.biggestMover.previousAmount === 0 || currentSummary.biggestMover.percentage >= 25)
      ? currentSummary.biggestMover
      : null;
  const encodedSpikeCategory = categorySpike ? encodeURIComponent(categorySpike.name) : "";
  const uploadReminderCopy = latestImport
    ? `Last import was ${daysSinceLastImport === 0 ? "today" : `${daysSinceLastImport ?? 0} day${daysSinceLastImport === 1 ? "" : "s"} ago`}. Add recent statements so advice stays current.`
    : "Upload a recent statement so Clover can start finding spending patterns.";
  const weeklySpendDelta = weeklySummary.current.expense - weeklySummary.previous.expense;
  const weeklyNetLabel =
    weeklySummary.net >= 0
      ? `${formatCurrency(weeklySummary.net)} left after spending`
      : `${formatCurrency(Math.abs(weeklySummary.net))} short this week`;
  const weeklySpendMovement =
    weeklySummary.previous.expense > 0
      ? `${weeklySpendDelta >= 0 ? "up" : "down"} ${formatCurrency(Math.abs(weeklySpendDelta))} vs last week`
      : `${formatCurrency(weeklySummary.current.expense)} spent this week`;
  const nextSevenDays = new Date(now);
  nextSevenDays.setDate(nextSevenDays.getDate() + 7);
  const plannedPaymentSuggestions = await getPlannedPaymentSuggestions(workspaceSummary.id).catch(() => []);
  const plannedPaymentsDueSoon = plannedPaymentSuggestions.filter(
    (suggestion) => suggestion.dueDate && new Date(suggestion.dueDate) <= nextSevenDays
  );
  const recurringSuggestionCount = plannedPaymentSuggestions.filter(
    (suggestion) => suggestion.sourceKind === "recurring_transaction" || suggestion.sourceKind === "installment"
  ).length;
  const recurringWatchCount = Math.max(recurringSuggestionCount, plannedPaymentsDueSoon.length);
  const recurringWatchProgress = recurringWatchCount > 0 ? Math.min(recurringWatchCount * 30, 100) : 18;
  const insightCandidates: Array<HomeAdviserItem | null> = [
    daysSinceLastImport === null || daysSinceLastImport >= 7
      ? {
          emoji: "📥",
          label: "Import Reminder",
          copy: uploadReminderCopy,
          href: "/transactions",
          actionLabel: "Import now",
          tone: daysSinceLastImport === null ? "neutral" : "warning",
        }
      : null,
    categorySpike
      ? {
          emoji: "📈",
          label: "Spending spike",
          copy: `${categorySpike.name} is up ${formatCurrency(categorySpike.delta)} vs the previous 30 days.`,
          href: `/transactions?category=${encodedSpikeCategory}`,
          actionLabel: "Review category",
          tone: "warning",
        }
      : null,
    plannedPaymentsDueSoon.length > 0
      ? {
          emoji: "🗓️",
          label: "Upcoming payment",
          copy: `${plannedPaymentsDueSoon.length} planned payment${plannedPaymentsDueSoon.length === 1 ? "" : "s"} are due in the next 7 days.`,
          href: "/recurring",
          actionLabel: "Review payments",
          tone: "warning",
        }
      : null,
    recurringSuggestionCount > 0
      ? {
          emoji: "🔁",
          label: "Recurring check",
          copy: `${recurringSuggestionCount} potential recurring payment${recurringSuggestionCount === 1 ? "" : "s"} found.`,
          href: "/recurring",
          actionLabel: "Review recurring",
          tone: "neutral",
        }
      : null,
    currentSevenDayTransactions.length > 0
      ? {
          emoji: "🗓️",
          label: "Weekly summary",
          copy: `${weeklyNetLabel}; spending is ${weeklySpendMovement}.`,
          href: "/adviser",
          actionLabel: "Open Adviser",
          tone: weeklySummary.net >= 0 ? "positive" : "warning",
        }
      : null,
  ];
  const insightItems = insightCandidates.filter((item): item is HomeAdviserItem => Boolean(item)).slice(0, 3);
  const totalBalanceLabel = formatCurrency(savingsTotal, displayCurrency);
  const balanceHighlights = [
    {
      key: "income",
      label: "Monthly Income",
      value: formatCurrency(monthSummary.income, displayCurrency),
      trend: currentSummary.incomeDelta,
    },
    {
      key: "expenses",
      label: "Monthly Expenses",
      value: formatCurrency(monthSummary.expense, displayCurrency),
      trend: currentSummary.expenseDelta,
    },
  ];
  const weeklyReportTone = weeklySummary.net >= 0 ? "positive" : "warning";
  const monthlyReportTone = currentSummary.net >= 0 ? "positive" : "warning";
  return (
    <>
      <PostHogPersonProperties
        distinctId={user.clerkUserId}
        properties={{
          workspace_name: workspaceSummary.name,
          account_count: workspaceSummary._count.accounts,
          cash_account_count: cashAccountCount,
          tracked_balance_total: Number(savingsTotal.toFixed(2)),
          tracked_balance_currency: displayCurrency,
          transaction_count: workspaceSummary._count.transactions,
          import_count: workspaceSummary._count.importFiles,
          review_attention_count: reviewAttentionCount,
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
        <article
          className="dashboard-home__hero dashboard-home__hero--fresh dashboard-home__hero--balance glass"
          style={{ background: "linear-gradient(135deg, #03A8C0 0%, #5ED3D0 100%)" }}
        >
          <div className="dashboard-home__hero-main">
            <p className="eyebrow">My balance</p>
            <strong>{totalBalanceLabel}</strong>
          </div>
          <div className="dashboard-home__hero-aside" aria-label="Monthly balance summary">
            {balanceHighlights.map((pill) => (
              <div key={pill.key} className="dashboard-home__hero-mini-pill">
                <span className="dashboard-home__hero-mini-label">{pill.label}</span>
                <div className="dashboard-home__hero-mini-row">
                  <strong className="dashboard-home__hero-mini-value">{pill.value}</strong>
                  <span className={pill.trend >= 0 ? "dashboard-home__hero-mini-trend positive" : "dashboard-home__hero-mini-trend negative"}>
                    {pill.trend === 0 ? "0%" : `${pill.trend > 0 ? "+" : ""}${Math.abs(pill.trend).toFixed(0)}%`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <section className="dashboard-home__hero-mobile-metrics" aria-label="Monthly balance summary">
          {balanceHighlights.map((pill) => (
            <article key={pill.key} className="dashboard-home__hero-mobile-card glass">
              <span className="dashboard-home__hero-mini-label">{pill.label}</span>
              <div className="dashboard-home__hero-mini-row">
                <strong className="dashboard-home__hero-mini-value">{pill.value}</strong>
                <span className={pill.trend >= 0 ? "dashboard-home__hero-mini-trend positive" : "dashboard-home__hero-mini-trend negative"}>
                  {pill.trend === 0 ? "0%" : `${pill.trend > 0 ? "+" : ""}${Math.abs(pill.trend).toFixed(0)}%`}
                </span>
              </div>
            </article>
          ))}
        </section>

        {insightItems.length > 0 ? (
          <article className="dashboard-home__insight-strip glass" aria-label="Home Adviser">
            <p className="eyebrow">Adviser</p>
            <div className="dashboard-home__insight-strip-list">
              {insightItems.map((item) => (
                <div key={item.label} className={`dashboard-home__insight-strip-item${item.tone ? ` dashboard-home__insight-strip-item--${item.tone}` : ""}`}>
                  <div className="dashboard-home__insight-strip-label">
                    <span className="dashboard-home__insight-strip-emoji" aria-hidden="true">{item.emoji}</span>
                    <span>{item.label}</span>
                  </div>
                  <span className="dashboard-home__insight-strip-copy">{item.copy}</span>
                  {item.href && item.actionLabel ? (
                    <Link className="dashboard-home__insight-strip-action" href={item.href}>
                      {item.actionLabel}
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          </article>
        ) : null}

        <DashboardBudgetPulse />

        <div className="dashboard-home__snapshot-grid" aria-label="Week and month snapshot">
          <article className={`dashboard-home__report-card dashboard-home__report-card--${weeklyReportTone} glass`}>
            <div className="dashboard-home__report-card-head">
              <div>
                <p className="eyebrow">Weekly Report</p>
                <h4>{formatSignedCurrency(weeklySummary.net, displayCurrency)}</h4>
              </div>
              <span className="dashboard-visual-pill">{weeklyWindowSummary.activeDays} active day{weeklyWindowSummary.activeDays === 1 ? "" : "s"}</span>
            </div>
            <div className="dashboard-home__report-metrics" aria-label="Weekly report metrics">
              <span>
                <small>Income</small>
                <strong>{formatCurrency(weeklySummary.current.income, displayCurrency)}</strong>
              </span>
              <span>
                <small>Spent</small>
                <strong>{formatCurrency(weeklySummary.current.expense, displayCurrency)}</strong>
              </span>
              <span>
                <small>Transactions</small>
                <strong>{weeklyWindowSummary.transactions}</strong>
              </span>
            </div>
            <Link className="dashboard-home__report-link" href="/reports?section=trends">
              Open Adviser
            </Link>
          </article>

          <article className={`dashboard-home__report-card dashboard-home__report-card--${monthlyReportTone} glass`}>
            <div className="dashboard-home__report-card-head">
              <div>
                <p className="eyebrow">Monthly Report</p>
                <h4>{formatSignedCurrency(currentSummary.net, displayCurrency)}</h4>
              </div>
              <span className="dashboard-visual-pill">{monthSummary.activeDays} active day{monthSummary.activeDays === 1 ? "" : "s"}</span>
            </div>
            <div className="dashboard-home__report-metrics" aria-label="Monthly report metrics">
              <span>
                <small>Income</small>
                <strong>{formatCurrency(monthSummary.income, displayCurrency)}</strong>
              </span>
              <span>
                <small>Spent</small>
                <strong>{formatCurrency(monthSummary.expense, displayCurrency)}</strong>
              </span>
              <span>
                <small>Transactions</small>
                <strong>{monthSummary.transactions}</strong>
              </span>
            </div>
            <Link className="dashboard-home__report-link" href="/reports?section=trends">
              Open Adviser
            </Link>
          </article>
        </div>

        <div className="dashboard-home__snapshot-grid dashboard-home__snapshot-grid--lower">
          <div className="dashboard-home__goal-card dashboard-home__recurring-card">
            <div className="dashboard-home__goal-card-head">
                <p className="eyebrow">What&apos;s coming up</p>
            </div>
            <div className="dashboard-home__goal-card-body">
              <div
                className="dashboard-home__ring dashboard-home__ring--compact"
                style={{
                  background: `conic-gradient(var(--accent) 0 ${Math.min(
                    recurringWatchProgress,
                    100
                  )}%, rgba(15, 23, 42, 0.08) ${Math.min(recurringWatchProgress, 100)}% 100%)`,
                }}
              >
                <div className="dashboard-home__ring-inner">
                  <strong>{recurringWatchCount}</strong>
                </div>
              </div>
              <div className="dashboard-home__goal-card-copy">
                <strong>{recurringWatchCount > 0 ? "Recurring payments" : "Repeat bills surface here"}</strong>
                <small>
                  {plannedPaymentsDueSoon.length > 0
                    ? `${plannedPaymentsDueSoon.length} planned payment${plannedPaymentsDueSoon.length === 1 ? "" : "s"} due soon`
                    : recurringSuggestionCount > 0
                      ? `${recurringSuggestionCount} potential recurring payment${recurringSuggestionCount === 1 ? "" : "s"} found`
                      : "Clover will surface repeat costs and upcoming payments here."}
                </small>
              </div>
            </div>
            <Link className="dashboard-home__report-link" href="/recurring">
              Open recurring
            </Link>
          </div>
          {shouldShowStarterCard ? (
            <div className="dashboard-home__starter-card">
              <p className="eyebrow">Get started</p>
              <strong>Upload files to unlock your dashboard.</strong>
              <p>Bring in a statement and Clover will populate balance, movement, and recurring patterns in one place.</p>
              <div className="dashboard-home__starter-actions">
                <DashboardImportTrigger className="button button-primary button-small">
                  Upload files
                </DashboardImportTrigger>
                <Link className="button button-secondary button-small" href="/accounts">
                  Add an account
                </Link>
              </div>
            </div>
          ) : (
            <div className="dashboard-home__goal-card dashboard-home__review-card">
              <div className="dashboard-home__goal-card-head">
                <p className="eyebrow">Things to review</p>
              </div>
              <div className="dashboard-home__goal-card-body">
                <div
                  className="dashboard-home__ring dashboard-home__ring--compact"
                  style={{
                    background: `conic-gradient(var(--accent) 0 ${Math.min(reviewAttentionCount * 12, 100)}%, rgba(15, 23, 42, 0.08) ${Math.min(
                      reviewAttentionCount * 12,
                      100
                    )}% 100%)`,
                  }}
                >
                  <div className="dashboard-home__ring-inner">
                    <strong>{reviewAttentionCount > 0 ? `${reviewAttentionCount}` : "0"}</strong>
                  </div>
                </div>
                <div className="dashboard-home__goal-card-copy">
                  <strong>{reviewAttentionCount > 0 ? `${reviewAttentionCount} transactions need review` : "Transactions look tidy"}</strong>
                  <small>
                    {reviewAttentionCount > 0
                      ? "Low-confidence rows and uncategorized items are ready for cleanup."
                      : "Clover is keeping the transaction list clean and ready for reports."}
                  </small>
                </div>
              </div>
              <Link className="dashboard-home__report-link" href={reviewAttentionCount > 0 ? "/review" : "/transactions"}>
                {reviewAttentionCount > 0 ? "Open review" : "Open transactions"}
              </Link>
            </div>
          )}
        </div>

      </section>
    </>
  );
  } catch (error) {
    if (isNextNavigationSignal(error)) {
      throw error;
    }

    await recordServerPageError({
      error,
      source: "dashboard-stream",
      route: "/home",
      userId: user.id,
      clerkUserId: user.clerkUserId,
      workspaceId: workspaceSummary.id,
      metadata: {
        transient: isTransientDataError(error),
      },
    });
    return <DashboardUnavailableContent />;
  }
}

async function DashboardPageStream() {
  try {
    const session = await getSessionContext();
    const user = await getOrCreateCurrentUser(session.userId);
    if (!session.isGuest && !hasCompletedOnboarding(user)) {
      redirect("/onboarding");
    }
    const workspaceSummary = await resolveDashboardWorkspaceSummary(user);

    return (
      <CloverShell
        active="dashboard"
        title="Home"
        actions={
        <DashboardTopActions
          workspaceId={workspaceSummary.id}
          accounts={workspaceSummary.accounts.map((account) => ({
            id: account.id,
            name: account.name,
            institution: account.institution,
            type: account.type,
            currency: account.currency,
          }))}
        />
      }
      >
      <Suspense fallback={<DashboardStreamFallback />}>
        <DashboardStream user={user} workspaceSummary={workspaceSummary} />
      </Suspense>
    </CloverShell>
    );
  } catch (error) {
    if (isNextNavigationSignal(error)) {
      throw error;
    }

    await recordServerPageError({
      error,
      source: "dashboard-page",
      route: "/home",
      metadata: {
        transient: isTransientDataError(error),
      },
    });
    return <DashboardUnavailableState />;
  }
}

export function DashboardPageContent() {
  return (
    <RouteSplash label="home">
      <DashboardPageStream />
    </RouteSplash>
  );
}

export default function DashboardPage() {
  redirect("/home");
}
