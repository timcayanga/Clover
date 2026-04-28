import nextDynamic from "next/dynamic";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CloverLoadingScreen } from "@/components/clover-loading-screen";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";
import { EmptyDataCta } from "@/components/empty-data-cta";
import type { ReportsQueueItem } from "@/components/reports-review-queue";
import { PostHogEvent } from "@/components/posthog-analytics";
import { analyticsOnceKey } from "@/lib/analytics";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";
import { getGoalPlanSummary, getGoalProgressSnapshot, normalizeGoalPlan, type GoalKey } from "@/lib/goals";
import { recordAppError } from "@/lib/error-logs";
import { Suspense } from "react";

const ReportsReviewQueue = nextDynamic(() => import("@/components/reports-review-queue").then((module) => module.ReportsReviewQueue), {
  loading: () => (
    <div className="reports-review-queue reports-review-queue--loading" aria-label="Loading review queue">
      <div className="report-card__head">
        <div>
          <p className="eyebrow">Action queue</p>
          <h4>Review queue</h4>
        </div>
      </div>
      <div className="reports-review-queue__body">
        <div className="empty-state">
          <strong>Loading review items</strong>
          <p>Clover is pulling the queue together in the background.</p>
        </div>
      </div>
    </div>
  ),
});

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Reports",
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

type WindowSummary = {
  income: number;
  expense: number;
  transfer: number;
  expenseCategories: Map<string, number>;
};

type ReportTransaction = {
  id: string;
  date: Date;
  amount: unknown;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  description: string | null;
  account: {
    name: string;
  };
  category: {
    name: string;
  } | null;
  importFileId: string | null;
};

type MonthBucket = {
  key: string;
  label: string;
  income: number;
  expense: number;
  net: number;
};

type WorkspaceAccountSnapshot = {
  id: string;
  name: string;
  balance: unknown;
  currency: string;
  type: string;
};

type RecurringMerchant = {
  label: string;
  amount: number;
  dates: Date[];
  count: number;
  cadenceLabel: string;
  nextDueDate: Date | null;
};

type ReportsRange = "30d" | "90d" | "ytd";

const reportsRangeLabels: Record<ReportsRange, string> = {
  "30d": "30 days",
  "90d": "90 days",
  ytd: "Year to date",
};

const normalizeReportsRange = (value: string | undefined): ReportsRange => {
  if (value === "90d" || value === "ytd") {
    return value;
  }

  return "30d";
};

const getReportWindow = (anchor: Date, range: ReportsRange) => {
  const currentStart = new Date(anchor);
  if (range === "30d") {
    currentStart.setDate(currentStart.getDate() - 30);
  } else if (range === "90d") {
    currentStart.setDate(currentStart.getDate() - 90);
  } else {
    currentStart.setMonth(0, 1);
    currentStart.setHours(0, 0, 0, 0);
  }

  const previousStart = new Date(currentStart);
  if (range === "30d") {
    previousStart.setDate(previousStart.getDate() - 30);
  } else if (range === "90d") {
    previousStart.setDate(previousStart.getDate() - 90);
  } else {
    const durationDays = Math.max(Math.round((anchor.getTime() - currentStart.getTime()) / 86400000), 1);
    previousStart.setDate(previousStart.getDate() - durationDays);
  }

  return { currentStart, previousStart };
};

const formatCurrency = (value: number) => currencyFormatter.format(value);

const formatSignedCurrency = (value: number) => `${value < 0 ? "-" : ""}${currencyFormatter.format(Math.abs(value))}`;

const formatPercent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(0)}%`;

const isValidDate = (value: unknown): value is Date =>
  value instanceof Date && Number.isFinite(value.getTime());

const toIsoMonth = (date: Date) => (isValidDate(date) ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : "");

const toMonthLabel = (date: Date) => (isValidDate(date) ? monthFormatter.format(date) : "");

const formatShortDate = (value: unknown) => {
  if (!isValidDate(value)) {
    return "";
  }

  return shortDateFormatter.format(value);
};

const normalizeMerchant = (value: string) => value.trim().toLowerCase();

const buildTransactionsHref = (params: Record<string, string>) => `/transactions?${new URLSearchParams(params).toString()}`;

const isDefined = <T,>(value: T | null | undefined): value is T => value !== null && value !== undefined;

const goalLabels: Record<string, string> = {
  save_more: "Save more",
  pay_down_debt: "Pay down debt",
  track_spending: "Track spending",
  build_emergency_fund: "Build an emergency fund",
  invest_better: "Invest better",
};

const bucketMonth = (date: Date, buckets: MonthBucket[]) => {
  if (!isValidDate(date)) {
    return null;
  }

  const monthKey = toIsoMonth(date);
  return monthKey ? buckets.find((bucket) => bucket.key === monthKey) ?? null : null;
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

function ReportsStreamFallback() {
  return (
    <section className="reports-grid reports-grid--primary" aria-label="Loading reports content">
      <article className="report-card glass report-card--wide">
        <div className="report-card__head">
          <div>
            <h4>Cash flow</h4>
          </div>
        </div>
        <div className="empty-state">
          <strong>Loading report data</strong>
          <p>Clover is fetching transactions, imports, and balances in the background.</p>
        </div>
      </article>
    </section>
  );
}

async function ReportsStream({
  active = "reports",
  searchParams,
}: {
  active?: "reports" | "insights";
  searchParams?: { range?: string };
}) {
  const cookieStore = await cookies();
  const selectedWorkspaceCookieId = cookieStore.get(selectedWorkspaceKey)?.value ?? "";
  const selectedRange = normalizeReportsRange(searchParams?.range);
  const selectedRangeLabel = reportsRangeLabels[selectedRange];
  const rangeWindowText = selectedRangeLabel.toLowerCase();

  const session = await getSessionContext();
  const existingUser = await prisma.user.findUnique({
    where: { clerkUserId: session.userId },
  });
  const user = existingUser ?? (await getOrCreateCurrentUser(session.userId));
  const isPro = user.planTier === "pro";
  if (!session.isGuest && !hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }

  let selectedWorkspaceId: string =
    (
      (selectedWorkspaceCookieId
        ? await prisma.workspace.findFirst({
            where: {
              id: selectedWorkspaceCookieId,
              userId: user.id,
            },
            select: { id: true },
          })
        : null) ??
      (await prisma.workspace.findFirst({
        where: { userId: user.id },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      }))
    )?.id ?? "";

  if (!selectedWorkspaceId) {
    const starterWorkspace = await ensureStarterWorkspace(user);
    const starterWorkspaceId = starterWorkspace?.id;
    if (!starterWorkspaceId) {
      await recordAppError({
        message: "Reports starter workspace could not be resolved",
        name: "ReportsWorkspaceError",
        source: "reports-page",
        route: "/reports",
        userId: user.id,
        clerkUserId: user.clerkUserId,
        metadata: {
          selectedWorkspaceCookieId,
        },
      }).catch(() => null);
      redirect("/dashboard");
    }
    const starterWorkspaceData = await prisma.workspace.findUnique({
      where: { id: starterWorkspaceId },
      select: { id: true },
    });
    if (!starterWorkspaceData?.id) {
      await recordAppError({
        message: "Reports starter workspace lookup failed",
        name: "ReportsWorkspaceError",
        source: "reports-page",
        route: "/reports",
        userId: user.id,
        clerkUserId: user.clerkUserId,
        metadata: {
          starterWorkspaceId,
        },
      }).catch(() => null);
      redirect("/dashboard");
    }
    selectedWorkspaceId = starterWorkspaceData.id;
  }

  try {
    const now = new Date();
    const { currentStart: currentWindowStart, previousStart: previousWindowStart } = getReportWindow(now, selectedRange);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      currentWindowTransactions,
      previousWindowTransactions,
      sixMonthTransactions,
      importedTransactionStats,
      manualTransactionStats,
      accountStats,
      workspaceAccountSnapshots,
      latestImport,
      processingImportCount,
      doneImportCount,
      failedImportCount,
      deletedImportCount,
    ] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          workspaceId: selectedWorkspaceId,
          isExcluded: false,
          date: { gte: currentWindowStart },
        },
        select: {
          id: true,
          date: true,
          amount: true,
          type: true,
          merchantRaw: true,
          merchantClean: true,
          importFileId: true,
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
          workspaceId: selectedWorkspaceId,
          isExcluded: false,
          date: {
            gte: previousWindowStart,
            lt: currentWindowStart,
          },
        },
        select: {
          id: true,
          date: true,
          amount: true,
          type: true,
          merchantRaw: true,
          merchantClean: true,
          importFileId: true,
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
      }),
      prisma.transaction.findMany({
        where: {
          workspaceId: selectedWorkspaceId,
          isExcluded: false,
          date: { gte: sixMonthsAgo },
        },
        select: {
          date: true,
          amount: true,
          type: true,
        },
      }),
      prisma.transaction.findMany({
        where: {
          workspaceId: selectedWorkspaceId,
          isExcluded: false,
          date: { gte: currentWindowStart },
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
        },
        orderBy: { date: "desc" },
        take: 250,
      }),
      prisma.transaction.aggregate({
        where: {
          workspaceId: selectedWorkspaceId,
          isExcluded: false,
          importFileId: { not: null },
        },
        _count: { id: true },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: {
          workspaceId: selectedWorkspaceId,
          isExcluded: false,
          importFileId: null,
        },
        _count: { id: true },
        _sum: { amount: true },
      }),
      prisma.account.aggregate({
        where: {
          workspaceId: selectedWorkspaceId,
        },
        _sum: { balance: true },
        _count: { id: true, balance: true },
      }),
      prisma.account.findMany({
        where: {
          workspaceId: selectedWorkspaceId,
        },
        select: {
          id: true,
          name: true,
          balance: true,
          currency: true,
          type: true,
        },
        orderBy: [{ balance: "desc" }, { updatedAt: "desc" }],
        take: 5,
      }) as Promise<WorkspaceAccountSnapshot[]>,
      prisma.importFile.findFirst({
        where: { workspaceId: selectedWorkspaceId },
        orderBy: { uploadedAt: "desc" },
        select: {
          fileName: true,
          status: true,
          uploadedAt: true,
        },
      }),
      prisma.importFile.count({ where: { workspaceId: selectedWorkspaceId, status: "processing" } }),
      prisma.importFile.count({ where: { workspaceId: selectedWorkspaceId, status: "done" } }),
      prisma.importFile.count({ where: { workspaceId: selectedWorkspaceId, status: "failed" } }),
      prisma.importFile.count({ where: { workspaceId: selectedWorkspaceId, status: "deleted" } }),
    ]);

    const importStatusCounts = {
      processing: Number(processingImportCount ?? 0),
      done: Number(doneImportCount ?? 0),
      failed: Number(failedImportCount ?? 0),
      deleted: Number(deletedImportCount ?? 0),
    };
    const reportCurrentWindowTransactions = Array.isArray(currentWindowTransactions)
      ? currentWindowTransactions.filter(isDefined)
      : [];
    const reportPreviousWindowTransactions = Array.isArray(previousWindowTransactions)
      ? previousWindowTransactions.filter(isDefined)
      : [];
    const reportSixMonthTransactions = Array.isArray(sixMonthTransactions) ? sixMonthTransactions.filter(isDefined) : [];
    const accountStatsCountId = Number((accountStats as { _count?: { id?: number } } | null | undefined)?._count?.id ?? 0);
    const isFreshResetWorkspace =
      user.dataWipedAt !== null && accountStatsCountId <= 1 && Object.values(importStatusCounts).every((count) => count === 0);
    const latestImportSummary = latestImport as unknown as
      | {
          fileName: string;
          status: string;
          uploadedAt: Date;
        }
      | null;
    const isEmptyWorkspace = accountStatsCountId <= 1 && reportCurrentWindowTransactions.length === 0 && Object.values(importStatusCounts).every((count) => count === 0);

    const currentSummary: WindowSummary = reportCurrentWindowTransactions.reduce(
      (accumulator, transaction) => {
        const amount = Number(transaction.amount);
        if (transaction.type === "income") {
          accumulator.income += amount;
        } else if (transaction.type === "expense") {
          accumulator.expense += amount;
        } else {
          accumulator.transfer += amount;
        }

        const categoryName = transaction.category?.name ?? "Uncategorized";
        if (transaction.type === "expense") {
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
      } as WindowSummary
    );

    const previousSummary: WindowSummary = reportPreviousWindowTransactions.reduce(
      (accumulator, row) => {
        const amount = Number(row.amount ?? 0);
        if (row.type === "income") {
          accumulator.income += amount;
        } else if (row.type === "expense") {
          accumulator.expense += amount;
        } else {
          accumulator.transfer += amount;
        }

        if (row.type === "expense") {
          const categoryName = row.category?.name ?? "Uncategorized";
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
      } as WindowSummary
    );

    const monthBuckets = getMonthBuckets(now);
    reportSixMonthTransactions.forEach((transaction) => {
      const bucket = bucketMonth(transaction.date, monthBuckets);
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

    const accountStatsSummary = accountStats as unknown as {
      _sum?: { balance?: number | null };
      _count?: { id?: number; balance?: number };
    };
    const workspaceAccountSummaries = Array.isArray(workspaceAccountSnapshots)
      ? (workspaceAccountSnapshots as Array<WorkspaceAccountSnapshot | null | undefined>).flatMap((account) => {
          if (!account || typeof account.id !== "string") {
            return [];
          }

          return [
            {
              id: account.id,
              name: typeof account.name === "string" && account.name.trim().length > 0 ? account.name : "Account",
              balance: account.balance,
              currency: typeof account.currency === "string" && account.currency.trim().length > 0 ? account.currency : "PHP",
              type: typeof account.type === "string" && account.type.trim().length > 0 ? account.type : "account",
            },
          ];
        })
      : [];
    const totalAccountBalance = Number(accountStatsSummary._sum?.balance ?? 0);
    const activeAccountCount = Number(accountStatsSummary._count?.balance ?? 0);
    const accountCount = Number(accountStatsSummary._count?.id ?? 0);
    const uncategorizedTransactions = reportCurrentWindowTransactions.filter(
      (transaction) => !transaction.category?.name || !transaction.merchantClean
    );

    const duplicateGroups = new Map<string, (typeof reportCurrentWindowTransactions)[number][]>();
    reportCurrentWindowTransactions.forEach((transaction) => {
      if (!isValidDate(transaction.date)) {
        return;
      }

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

    const actionableCount =
      uncategorizedTransactions.length + possibleDuplicateGroups.length + importStatusCounts.processing + importStatusCounts.failed;

    const nextStep =
      uncategorizedTransactions.length > 0
        ? {
            title: `${uncategorizedTransactions.length} transaction${uncategorizedTransactions.length === 1 ? "" : "s"} need review`,
            body: "Finish assigning categories and merchant names so the reports stay clean.",
            href: "/transactions",
            label: "Review transactions",
          }
        : possibleDuplicateGroups.length > 0
          ? {
              title: `${possibleDuplicateGroups.length} possible duplicate set${possibleDuplicateGroups.length === 1 ? "" : "s"} found`,
              body: "Check the repeated rows before they affect cash flow and category totals.",
              href: "/transactions",
              label: "Check duplicates",
            }
          : importStatusCounts.failed > 0
              ? {
                  title: `${importStatusCounts.failed} import${importStatusCounts.failed === 1 ? "" : "s"} need attention`,
                  body: "Review settings if a connected source stopped sending clean data.",
                  href: "/settings",
                  label: "Review settings",
                }
              : importStatusCounts.processing > 0
                ? {
                  title: `${importStatusCounts.processing} import${importStatusCounts.processing === 1 ? "" : "s"} still syncing`,
                  body: "Wait for the sync to finish, then review the newest transactions.",
                  href: "/transactions",
                  label: "Open transactions",
                }
              : {
                  title: "No urgent clean-up items",
                  body: "Your current data looks tidy. You can still review spending and cash flow trends below.",
                  href: "/transactions",
              label: "Open transactions",
            };

    const recurringMerchantHistory = new Map<
      string,
      {
        label: string;
        amount: number;
        dates: Date[];
      }
    >();

    [...reportPreviousWindowTransactions, ...reportCurrentWindowTransactions].forEach((transaction) => {
      if (!isValidDate(transaction.date)) {
        return;
      }

      if (transaction.type !== "expense") {
        return;
      }

      const label = transaction.merchantClean ?? transaction.merchantRaw;
      const key = normalizeMerchant(label);
      const existing = recurringMerchantHistory.get(key) ?? { label, amount: 0, dates: [] };
      existing.amount += Math.abs(Number(transaction.amount));
      existing.dates.push(transaction.date);
      recurringMerchantHistory.set(key, existing);
    });

    const recurringMerchants: RecurringMerchant[] = Array.from(recurringMerchantHistory.values())
      .filter((merchant) => merchant.dates.length > 1)
      .map((merchant) => {
        const sortedDates = [...merchant.dates].filter(isValidDate).sort((a, b) => a.getTime() - b.getTime());
        if (sortedDates.length <= 1) {
          return {
            ...merchant,
            count: sortedDates.length,
            cadenceLabel: "Repeat merchant",
            nextDueDate: null,
          };
        }

        const intervals = sortedDates
          .slice(1)
          .map((date, index) => (date.getTime() - sortedDates[index].getTime()) / 86400000)
          .filter((days) => Number.isFinite(days) && days > 0);
        const averageGapDays = intervals.length > 0 ? intervals.reduce((sum, days) => sum + days, 0) / intervals.length : null;
        const cadenceLabel =
          averageGapDays === null
            ? "Repeat merchant"
            : averageGapDays <= 10
              ? "Weekly"
              : averageGapDays <= 17
                ? "Biweekly"
                : averageGapDays <= 40
                  ? "Monthly"
                  : "Periodic";
        const nextDueDate =
          averageGapDays === null ? null : new Date(sortedDates[sortedDates.length - 1].getTime() + averageGapDays * 86400000);
        return {
          ...merchant,
          count: sortedDates.length,
          cadenceLabel,
          nextDueDate,
        };
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);

    const topCategories = Array.from(currentSummary.expenseCategories.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const maxCategorySpend = topCategories[0]?.[1] ?? 0;

    const currentNet = currentSummary.income - currentSummary.expense;
    const previousNet = previousSummary.income - previousSummary.expense;
    const currentSpend = currentSummary.expense;
    const previousSpend = previousSummary.expense;
    const savingsRate = currentSummary.income > 0 ? currentNet / currentSummary.income : null;
    const spendDelta = previousSpend > 0 ? ((currentSpend - previousSpend) / previousSpend) * 100 : null;
    const incomeDelta = previousSummary.income > 0 ? ((currentSummary.income - previousSummary.income) / previousSummary.income) * 100 : null;
    const topCategoryShare = currentSpend > 0 ? maxCategorySpend / currentSpend : null;
    const importedTransactionStatsSummary = importedTransactionStats as unknown as {
      _count?: { id?: number };
      _sum?: { amount?: number | null };
    };
    const manualTransactionStatsSummary = manualTransactionStats as unknown as {
      _count?: { id?: number };
      _sum?: { amount?: number | null };
    };
    const importedTransactions = Number(importedTransactionStatsSummary._count?.id ?? 0);
    const manualTransactions = Number(manualTransactionStatsSummary._count?.id ?? 0);
    const importedAmount = Number(importedTransactionStatsSummary._sum?.amount ?? 0);
    const manualAmount = Number(manualTransactionStatsSummary._sum?.amount ?? 0);
    const goalKey = user.primaryGoal?.trim() ?? null;
    const goalLabel = goalKey ? goalLabels[goalKey] ?? goalKey : null;
    const goalTargetAmount = user.goalTargetAmount ? Number(user.goalTargetAmount) : null;
    const currentGoalPlan = normalizeGoalPlan(user.goalPlan, goalKey as GoalKey | null, goalTargetAmount);
    const goalPlanSummary = getGoalPlanSummary(currentGoalPlan, currentSummary.income > 0 ? currentSummary.income : null);

    const merchantSpend = new Map<
      string,
      {
        label: string;
        amount: number;
        count: number;
      }
    >();

    reportCurrentWindowTransactions.forEach((transaction) => {
      if (transaction.type !== "expense") {
        return;
      }

      const label = transaction.merchantClean ?? transaction.merchantRaw;
      const key = normalizeMerchant(label);
      const existing = merchantSpend.get(key) ?? { label, amount: 0, count: 0 };
      existing.amount += Math.abs(Number(transaction.amount));
      existing.count += 1;
      merchantSpend.set(key, existing);
    });

    const previousMerchantSpend = new Map<
      string,
      {
        label: string;
        amount: number;
        count: number;
      }
    >();

    reportPreviousWindowTransactions.forEach((transaction) => {
      if (transaction.type !== "expense") {
        return;
      }

      const label = transaction.merchantClean ?? transaction.merchantRaw;
      const key = normalizeMerchant(label);
      const existing = previousMerchantSpend.get(key) ?? { label, amount: 0, count: 0 };
      existing.amount += Math.abs(Number(transaction.amount));
      existing.count += 1;
      previousMerchantSpend.set(key, existing);
    });

    const topMerchants = Array.from(merchantSpend.values()).sort((a, b) => b.amount - a.amount).slice(0, 5);
    const merchantMovements = Array.from(merchantSpend.values())
      .map((merchant) => {
        const previousMerchant = previousMerchantSpend.get(normalizeMerchant(merchant.label));
        const previousAmount = previousMerchant?.amount ?? 0;
        const delta = merchant.amount - previousAmount;
        const deltaPercent = previousAmount > 0 ? (delta / previousAmount) * 100 : null;

        return {
          ...merchant,
          previousAmount,
          delta,
          deltaPercent,
        };
      })
      .filter((merchant) => merchant.delta > 0 || merchant.previousAmount === 0)
      .sort((a, b) => {
        const deltaGap = b.delta - a.delta;
        if (deltaGap !== 0) {
          return deltaGap;
        }

        return b.count - a.count;
      })
      .slice(0, 3);
    const currentMonthBucket = monthBuckets[monthBuckets.length - 1];
    const previousMonthBucket = monthBuckets[monthBuckets.length - 2] ?? monthBuckets[monthBuckets.length - 1];
    const monthlyNetChange = currentMonthBucket.net - previousMonthBucket.net;
    const reportChartWidth = 560;
    const reportChartHeight = 220;
    const reportChartPadding = 24;
    const reportChartXSpan = reportChartWidth - reportChartPadding * 2;
    const reportChartYSpan = reportChartHeight - reportChartPadding * 2;
    const reportCashFlowValues = monthBuckets.map((bucket) => bucket.net);
    const reportCashFlowMax = Math.max(...reportCashFlowValues);
    const reportCashFlowMin = Math.min(...reportCashFlowValues);
    const reportCashFlowRange = Math.max(reportCashFlowMax - reportCashFlowMin, 1);
    const reportCashFlowPoints = monthBuckets.map((bucket, index) => {
      const x = reportChartPadding + (index / Math.max(monthBuckets.length - 1, 1)) * reportChartXSpan;
      const normalized = (bucket.net - reportCashFlowMin) / reportCashFlowRange;
      const y = reportChartPadding + (1 - normalized) * reportChartYSpan;
      return { ...bucket, x, y };
    });
    const reportCashFlowPath = reportCashFlowPoints
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
      .join(" ");
    const reportCategoryPalette = ["#0ea5c8", "#36b6e0", "#7dd3fc", "#14b8a6", "#f59e0b", "#8b5cf6"];
    const reportCategorySegments = topCategories.map(([categoryName, amount], index) => ({
      categoryName,
      amount,
      share: currentSpend > 0 ? amount / currentSpend : 0,
      color: reportCategoryPalette[index % reportCategoryPalette.length],
    }));
    const currentTrackedCategorySpend = topCategories.reduce((sum, [, amount]) => sum + amount, 0);
    const currentOtherSpend = Math.max(currentSpend - currentTrackedCategorySpend, 0);
    const recurringSavingsPotential = recurringMerchants.reduce((sum, merchant) => sum + merchant.amount, 0) * 0.2;
    const topRecurringMerchant = recurringMerchants[0] ?? null;
    const averageRecurringSpend = recurringMerchants.length > 0
      ? recurringMerchants.reduce((sum, merchant) => sum + merchant.amount, 0) / recurringMerchants.length
      : 0;
    const topCategoryName = topCategories[0]?.[0] ?? null;
    const topCategoryAmount = topCategories[0]?.[1] ?? 0;
    const previousTopCategoryAmount = topCategoryName ? previousSummary.expenseCategories.get(topCategoryName) ?? 0 : 0;
    const topCategoryDelta = topCategoryAmount - previousTopCategoryAmount;
    const topCategoryDeltaPercent = previousTopCategoryAmount > 0 ? (topCategoryDelta / previousTopCategoryAmount) * 100 : null;
    const goalProgress = getGoalProgressSnapshot({
      goalKey: goalKey as GoalKey | null,
      targetAmount: goalTargetAmount,
      goalPlan: currentGoalPlan,
      currentNet,
      currentSpend,
      monthlyIncome: currentSummary.income > 0 ? currentSummary.income : null,
      currentSavingsRate: savingsRate,
      previousSavingsRate: previousSummary.income > 0 ? (previousSummary.income - previousSummary.expense) / previousSummary.income : null,
      spendDelta,
      recurringShare: recurringMerchants.reduce((sum, merchant) => sum + merchant.amount, 0) / Math.max(currentSpend, 1),
    });
    const topBalanceAccount = workspaceAccountSummaries.find((account) => account.balance !== null) ?? null;
    const topBalanceAccountName = topBalanceAccount?.name ?? null;
    const accountBalanceCoverage = accountCount > 0 ? activeAccountCount / accountCount : 0;
    const topBalanceAccountBalance = topBalanceAccount ? Number(topBalanceAccount.balance ?? 0) : 0;
    const accountConcentrationShare = totalAccountBalance > 0 && topBalanceAccountBalance > 0 ? topBalanceAccountBalance / totalAccountBalance : null;
    const confidenceScore = Math.max(
      58,
      Math.min(
        99,
        60 +
          reportCurrentWindowTransactions.length * 0.12 +
          doneImportCount * 1.5 +
          activeAccountCount * 1.5 -
          failedImportCount * 8 -
          actionableCount * 2.5 -
          (1 - accountBalanceCoverage) * 8
      )
    );
    const confidenceLabel =
      confidenceScore >= 85 ? "High confidence" : confidenceScore >= 70 ? "Good confidence" : "Watch closely";
    const confidenceCopy =
      confidenceScore >= 85
        ? "The report has enough clean signal to support confident decisions."
        : confidenceScore >= 70
          ? "The report is dependable, though a few review items still deserve attention."
          : "A few missing balances or review items are reducing signal quality.";
    const currentReviewCount = uncategorizedTransactions.length + possibleDuplicateGroups.length;
    const leadingMerchantMovement = merchantMovements[0] ?? null;
    const reviewSummary =
      currentReviewCount > 0
        ? `${uncategorizedTransactions.length} uncategorized and ${possibleDuplicateGroups.length} duplicate set${possibleDuplicateGroups.length === 1 ? "" : "s"} are still open.`
        : "No unresolved review items remain in the queue.";
    const attentionItems = [
      {
        title: topCategoryName
          ? `${topCategoryName} changed by ${formatSignedCurrency(topCategoryDelta)}`
          : "No category shift yet",
        body: topCategoryName
          ? previousTopCategoryAmount > 0
            ? `${formatPercent(topCategoryDeltaPercent ?? 0)} vs the prior ${rangeWindowText} · ${formatCurrency(topCategoryAmount)} this period`
            : `${formatCurrency(topCategoryAmount)} this period, with no prior baseline`
          : "Add more spending data to reveal the dominant category change.",
        href: topCategoryName ? buildTransactionsHref({ category: topCategoryName }) : "/transactions",
        label: topCategoryName ? "Open category" : "Open transactions",
      },
      {
        title: leadingMerchantMovement
          ? `${leadingMerchantMovement.label} is spending more`
          : "No unusual merchant spike",
        body: leadingMerchantMovement
          ? leadingMerchantMovement.previousAmount === 0
            ? `${formatCurrency(leadingMerchantMovement.amount)} total · new merchant this period`
            : `${formatCurrency(leadingMerchantMovement.amount)} total · ${formatSignedCurrency(leadingMerchantMovement.delta)} vs the prior ${rangeWindowText}`
          : "The largest merchants are staying stable relative to the prior period.",
        href: "/transactions",
        label: "Inspect merchants",
      },
      {
        title: `${currentReviewCount} item${currentReviewCount === 1 ? "" : "s"} need review`,
        body: reviewSummary,
        href: "/review",
        label: "Open review",
      },
    ];
    const reportReviewQueueItems: ReportsQueueItem[] = [];
    const primaryUncategorizedTransaction = uncategorizedTransactions[0];
    const primaryDuplicateGroup = possibleDuplicateGroups[0];
    const topCategoryOptions = topCategories.map(([categoryName]) => categoryName);
    if (primaryUncategorizedTransaction) {
      reportReviewQueueItems.push({
        title: `${primaryUncategorizedTransaction.merchantClean ?? primaryUncategorizedTransaction.merchantRaw} needs a category`,
        description: `${primaryUncategorizedTransaction.account.name} · ${formatShortDate(primaryUncategorizedTransaction.date)} · ${formatCurrency(Number(primaryUncategorizedTransaction.amount))}`,
        tags: [
          "No category",
          primaryUncategorizedTransaction.importFileId ? "Imported transaction" : "Manual entry",
          formatCurrency(Number(primaryUncategorizedTransaction.amount)),
        ],
        categoryOptions: topCategoryOptions.length > 0 ? topCategoryOptions : ["Food & Dining", "Transport", "Groceries", "Utilities", "Subscriptions", "Entertainment"],
        actions: [
          { label: "Review transaction", href: buildTransactionsHref({ review: primaryUncategorizedTransaction.id }) },
          { label: "Open transactions", href: "/transactions", variant: "secondary" },
        ],
      });
    }
    if (primaryDuplicateGroup && primaryDuplicateGroup.length > 0) {
      const representative = primaryDuplicateGroup[0];
      if (representative) {
        const duplicateTotal = primaryDuplicateGroup.reduce((sum, transaction) => sum + Number(transaction.amount), 0);
        reportReviewQueueItems.push({
          title: `${representative.merchantClean ?? representative.merchantRaw} appears more than once`,
          description: `${primaryDuplicateGroup.length} matching rows · ${representative.account.name} · ${formatShortDate(representative.date)}`,
          tags: ["Potential duplicate", `${primaryDuplicateGroup.length} matches`, formatCurrency(duplicateTotal)],
          actions: [
            { label: "Review duplicates", href: buildTransactionsHref({ review: representative.id }) },
            { label: "Open transactions", href: "/transactions", variant: "secondary" },
          ],
        });
      }
    }
    if (importStatusCounts.failed > 0 || importStatusCounts.processing > 0) {
      reportReviewQueueItems.push({
        title:
          importStatusCounts.failed > 0
            ? `${importStatusCounts.failed} import${importStatusCounts.failed === 1 ? "" : "s"} failed`
            : `${importStatusCounts.processing} import${importStatusCounts.processing === 1 ? "" : "s"} still processing`,
        description:
          importStatusCounts.failed > 0
            ? "Review settings if a connected source stopped sending clean data."
            : "Wait for the sync to finish so the newest rows can roll into the reports.",
        tags: [
          importStatusCounts.failed > 0 ? "Failed import" : "Processing import",
          `${importStatusCounts.done} done`,
          `${importStatusCounts.processing} processing`,
        ],
        actions: [
          { label: "Open transactions", href: "/transactions" },
          { label: "Review settings", href: "/settings", variant: "secondary" },
        ],
      });
    }

    const trendDirection = currentNet >= previousNet ? "improving" : "softening";
    const spendDirection = spendDelta === null ? null : spendDelta > 0 ? "up" : spendDelta < 0 ? "down" : "flat";

    const goalSummary = goalLabel
      ? goalTargetAmount !== null
        ? `${goalLabel} is ${goalProgress.progressPercent === null ? "set" : `${Math.round(goalProgress.progressPercent)}% complete`}. ${goalPlanSummary?.detail ?? goalProgress.nextAction}`
        : currentNet >= 0
          ? `Your ${goalLabel.toLowerCase()} goal has room to move forward because the last ${rangeWindowText} ended positive.`
          : `Your ${goalLabel.toLowerCase()} goal needs a tighter spending pattern or higher income to move faster.`
      : "Set a primary goal so Clover can compare your cash flow and spending against something specific.";
    const comparisonCopy =
      selectedRange === "ytd"
        ? "Compared with the same span earlier in the year"
        : `Compared with the previous ${rangeWindowText}`;

    const aiHeadline =
      currentNet >= 0
        ? `Cash flow finished positive at ${formatSignedCurrency(currentNet)}.`
        : `Cash flow softened to ${formatSignedCurrency(currentNet)}.`;

    const aiSummary =
      topCategoryName
        ? `${topCategoryName} is the biggest spending driver${leadingMerchantMovement ? `, and ${leadingMerchantMovement.label} is the most unusual merchant.` : "."}`
        : "More spending data is needed before the page can isolate the biggest drivers.";

    const aiSignals = [
      {
        label: "Top category shift",
        value: topCategoryName ?? "N/A",
        detail:
          topCategoryName === null
            ? "No category leader yet"
            : previousTopCategoryAmount > 0
              ? `${formatPercent(topCategoryDeltaPercent ?? 0)} vs prior ${rangeWindowText}`
              : "No prior baseline",
        tone: topCategoryDelta >= 0 ? ("subtle" as const) : ("good" as const),
      },
      {
        label: "Unusual merchant",
        value: leadingMerchantMovement?.label ?? "Stable",
        detail: leadingMerchantMovement
          ? leadingMerchantMovement.previousAmount === 0
            ? "New merchant this period"
            : `${formatSignedCurrency(leadingMerchantMovement.delta)} vs prior ${rangeWindowText}`
          : "No merchant spikes detected",
        tone: leadingMerchantMovement ? ("danger" as const) : ("good" as const),
      },
      {
        label: "Recurring costs",
        value: formatCurrency(recurringSavingsPotential),
        detail: `${recurringMerchants.length} repeat merchant${recurringMerchants.length === 1 ? "" : "s"} surfaced`,
        tone: recurringMerchants.length > 0 ? ("subtle" as const) : ("good" as const),
      },
      {
        label: "Review load",
        value: `${currentReviewCount}`,
        detail: reviewSummary,
        tone: currentReviewCount > 0 ? ("danger" as const) : ("good" as const),
      },
    ] as const;

    const aiActions = [
      {
        title: topCategoryName ? `Open ${topCategoryName.toLowerCase()}` : "Open spending trends",
        body: topCategoryName
          ? `${topCategoryName} is where the page sees the biggest concentration of spend.`
          : "A category leader will appear once there is enough spending data to compare.",
        href: topCategoryName ? buildTransactionsHref({ category: topCategoryName }) : "/transactions",
        label: topCategoryName ? "Open category" : "Open transactions",
      },
      {
        title: currentReviewCount > 0 ? "Open the review queue" : "Review the transaction list",
        body: currentReviewCount > 0
          ? reviewSummary
          : "The queue is clean, so the next best step is checking transactions directly.",
        href: currentReviewCount > 0 ? "/review" : "/transactions",
        label: currentReviewCount > 0 ? "Open review" : "Open transactions",
      },
      {
        title: "Review settings",
        body: confidenceCopy,
        href: "/settings",
        label: "Open settings",
      },
    ];

    const goalNextStep = goalLabel
      ? {
          title: `Keep ${goalLabel.toLowerCase()} in view`,
          body: goalTargetAmount !== null
            ? `${goalProgress.bandLabel} right now. ${goalProgress.nextAction}`
            : "Use goal-aware insights to see whether spending and cash flow are helping or slowing you down.",
          href: "/goals",
          label: "Open goals",
        }
      : {
          title: "Choose a goal to sharpen the insights",
          body: "A goal gives the page a destination, so every trend can be evaluated against progress instead of noise.",
          href: "/goals",
          label: "Set a goal",
        };

    return (
      <>
        <PostHogEvent
          event="report_viewed"
          onceKey={analyticsOnceKey("report_viewed", `workspace:${selectedWorkspaceId}:${selectedRange}`)}
          properties={{
            report_type: selectedRange,
            workspace_id: selectedWorkspaceId,
            transaction_count: reportCurrentWindowTransactions.length,
            import_count:
              Number(doneImportCount ?? 0) +
              Number(processingImportCount ?? 0) +
              Number(failedImportCount ?? 0) +
              Number(deletedImportCount ?? 0),
          }}
        />
        <PostHogEvent
          event="first_report_viewed"
          onceKey={analyticsOnceKey("first_report_viewed", "session")}
          properties={{
            report_type: selectedRange,
            workspace_id: selectedWorkspaceId,
          }}
        />
        <PostHogEvent
          event="report_filtered"
          onceKey={analyticsOnceKey("report_filtered", `workspace:${selectedWorkspaceId}:${selectedRange}`)}
          properties={{
            report_type: selectedRange,
            workspace_id: selectedWorkspaceId,
            view: "reports",
            filter_type: "range",
          }}
        />
        <PostHogEvent
          event="insight_generated"
          onceKey={analyticsOnceKey("insight_generated", `workspace:${selectedWorkspaceId}:${selectedRange}`)}
          properties={{
            workspace_id: selectedWorkspaceId,
            report_type: selectedRange,
            goal: goalLabel ?? null,
            current_net: currentNet,
            savings_rate: savingsRate === null ? null : Math.round(savingsRate * 100),
          }}
        />
        <PostHogEvent
          event="insight_opened"
          onceKey={analyticsOnceKey("insight_opened", `workspace:${selectedWorkspaceId}:${selectedRange}`)}
          properties={{
            workspace_id: selectedWorkspaceId,
            report_type: selectedRange,
            insight_type: "reports_overview",
          }}
        />
        <PostHogEvent
          event="cashflow_viewed"
          onceKey={analyticsOnceKey("cashflow_viewed", `workspace:${selectedWorkspaceId}:${selectedRange}`)}
          properties={{
            workspace_id: selectedWorkspaceId,
            report_type: selectedRange,
            chart_type: "line",
          }}
        />
        <PostHogEvent
          event="category_mix_viewed"
          onceKey={analyticsOnceKey("category_mix_viewed", `workspace:${selectedWorkspaceId}:${selectedRange}`)}
          properties={{
            workspace_id: selectedWorkspaceId,
            report_type: selectedRange,
            chart_type: "donut",
          }}
        />
        <PostHogEvent
          event="top_sources_viewed"
          onceKey={analyticsOnceKey("top_sources_viewed", `workspace:${selectedWorkspaceId}:${selectedRange}`)}
          properties={{
            workspace_id: selectedWorkspaceId,
            report_type: selectedRange,
            chart_type: "list",
          }}
        />
        <PostHogEvent
          event="trend_line_viewed"
          onceKey={analyticsOnceKey("trend_line_viewed", `workspace:${selectedWorkspaceId}:${selectedRange}`)}
          properties={{
            workspace_id: selectedWorkspaceId,
            report_type: selectedRange,
            chart_type: "timeline",
          }}
        />
        {isEmptyWorkspace ? (
          <div style={{ marginBottom: 20 }}>
            <EmptyDataCta
              eyebrow={isFreshResetWorkspace ? "Fresh start" : "No data yet"}
              title="Your reports are ready for new data."
              copy="Add transactions and accounts, and Clover will populate cash flow, spending, review items, and goal-aware summaries for you."
              accountHref="/accounts"
              transactionHref="/transactions?manual=1"
            />
          </div>
        ) : null}

    <section className="reports-range-switch glass">
          <div className="reports-range-switch__copy">
            <span className="eyebrow">Range</span>
            <p>{selectedRangeLabel}</p>
            <small>
              {comparisonCopy} · {latestImportSummary ? "Fresh data available" : "No recent refresh yet"}
            </small>
          </div>
          <div className="reports-range-switch__controls" role="tablist" aria-label="Report range">
            {(["30d", "90d", "ytd"] as const).map((range) => (
              <Link key={range} className={`pill pill-interactive ${selectedRange === range ? "pill-is-selected" : ""}`} href={`?range=${range}`}>
                {reportsRangeLabels[range]}
              </Link>
            ))}
          </div>
        </section>

        <section className="reports-summary-grid reports-summary-grid--highlights">
          <article className="metric compact metric--highlight glass">
            <span>Income</span>
            <strong>{formatCurrency(currentSummary.income)}</strong>
          </article>
          <article className="metric compact metric--highlight glass">
            <span>Expenses</span>
            <strong>{formatCurrency(currentSummary.expense)}</strong>
          </article>
          <article className="metric compact metric--highlight glass">
            <span>Net income</span>
            <strong className={currentNet >= 0 ? "positive" : "negative"}>{formatSignedCurrency(currentNet)}</strong>
          </article>
          <article className="metric compact metric--highlight glass">
            <span>Savings rate</span>
            <strong>{savingsRate === null ? "N/A" : formatPercent(savingsRate * 100)}</strong>
          </article>
        </section>

        {isPro ? (
          <>
            <section className="reports-brief-grid">
              <article className="report-ai-card report-ai-card--compact glass">
                <p className="eyebrow">What changed</p>
                <h3>{aiHeadline}</h3>
                <p>{aiSummary}</p>
                <div className="report-ai-card__actions">
                  <Link className="button button-primary button-pill" href={buildTransactionsHref({ month: currentMonthBucket.key })}>
                    Open cash flow
                  </Link>
                </div>
              </article>

              <article className="report-ai-card report-ai-card--compact glass">
                <p className="eyebrow">Why it changed</p>
                <div className="report-ai-signal-grid report-ai-signal-grid--compact">
                  {aiSignals.slice(0, 3).map((signal) => (
                    <div key={signal.label} className={`report-ai-signal report-ai-signal--${signal.tone}`}>
                      <span>{signal.label}</span>
                      <strong>{signal.value}</strong>
                      <small>{signal.detail}</small>
                    </div>
                  ))}
                </div>
              </article>

              <article className="report-ai-card report-ai-card--compact glass">
                <p className="eyebrow">What to do next</p>
                <div className="report-list">
                  {aiActions.map((action) => (
                    <div key={action.title} className="report-list__item report-list__item--compact">
                      <div className="report-list__meta">
                        <strong>{action.title}</strong>
                        <span>{action.body}</span>
                      </div>
                      <Link className="pill-link pill-link--inline" href={action.href}>
                        {action.label}
                      </Link>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <article className="reports-next glass">
              <p className="eyebrow">Goal lens</p>
              <h4>{goalNextStep.title}</h4>
              <p>{goalSummary}</p>
              <div className="reports-next__meta">
                <span>{goalLabel ?? "No primary goal set"}</span>
                <span>{savingsRate === null ? "Savings rate unavailable" : `${formatPercent(savingsRate * 100)} savings rate`}</span>
              </div>
              <Link className="button button-primary button-pill" href={goalNextStep.href}>
                {goalNextStep.label}
              </Link>
              <div className="reports-next__meta">
                <span>
                  {actionableCount} item{actionableCount === 1 ? "" : "s"} need attention
                </span>
                <span>{accountCount} account{accountCount === 1 ? "" : "s"}</span>
              </div>
            </article>

            <section className="reports-attention-strip">
              {attentionItems.map((item) => (
                <article key={item.title} className="reports-attention-card glass">
                  <span className="eyebrow">Things to check</span>
                  <h4>{item.title}</h4>
                  <p>{item.body}</p>
                  <Link className="pill-link pill-link--inline" href={item.href}>
                    {item.label}
                  </Link>
                </article>
              ))}
            </section>

            <article className="reports-decision-lens glass">
              <div>
                <p className="eyebrow">Next best action</p>
                <h4>{nextStep.title}</h4>
                <p>{nextStep.body}</p>
              </div>
              <Link className="button button-primary button-pill" href={nextStep.href}>
                {nextStep.label}
              </Link>
            </article>
          </>
        ) : null}

        <section className="reports-grid reports-grid--primary">
          <article className="report-card glass report-card--wide">
            <div className="report-card__head">
              <div>
                <h4>Where your money went</h4>
              </div>
              <div className="report-card__stat">
                <strong>{formatCurrency(currentSummary.income)}</strong>
                <span>how spending is split across categories</span>
              </div>
            </div>

            <div className="report-flow-map">
              <div className="report-flow-map__source">
                <span>Total income</span>
                <strong>{formatCurrency(currentSummary.income)}</strong>
                <small>{formatCurrency(currentSpend)} routed to spending categories</small>
              </div>
              <div className="report-flow-map__rows">
                {reportCategorySegments.length > 0 ? (
                  <>
                    {reportCategorySegments.map((segment) => (
                      <Link
                        key={segment.categoryName}
                        href={buildTransactionsHref({ category: segment.categoryName })}
                        className="report-flow-map__row report-list__item--link"
                      >
                        <div className="report-flow-map__meta">
                          <strong>{segment.categoryName}</strong>
                          <span>{formatCurrency(segment.amount)}</span>
                        </div>
                        <div className="report-flow-map__bar" aria-hidden="true">
                          <span style={{ width: `${Math.max(segment.share * 100, 8)}%`, background: segment.color }} />
                        </div>
                        <strong className="report-flow-map__share">{formatPercent(segment.share * 100)}</strong>
                      </Link>
                    ))}
                    {currentOtherSpend > 0 ? (
                      <div className="report-flow-map__row report-flow-map__row--other">
                        <div className="report-flow-map__meta">
                          <strong>Other spend</strong>
                          <span>{formatCurrency(currentOtherSpend)}</span>
                        </div>
                        <div className="report-flow-map__bar" aria-hidden="true">
                          <span style={{ width: `${Math.max((currentOtherSpend / Math.max(currentSpend, 1)) * 100, 8)}%`, background: "var(--border-subtle)" }} />
                        </div>
                        <strong className="report-flow-map__share">{formatPercent((currentOtherSpend / Math.max(currentSpend, 1)) * 100)}</strong>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="empty-state">Add categorized spending and Clover will show where income is flowing.</div>
                )}
              </div>
            </div>
          </article>

          <article className="report-card glass">
            <div className="report-card__head">
              <div>
                <h4>Spending by category</h4>
              </div>
              <div className="report-card__stat">
                <strong>{formatCurrency(currentSpend)}</strong>
                <span>
                  {topCategories.length > 0 ? `${topCategories.length} leading categories · ${formatPercent(topCategoryShare ? topCategoryShare * 100 : 0)} top share` : "No spending yet"}
                </span>
              </div>
            </div>

            <div className="report-donut">
              <div className="report-donut__chart" role="img" aria-label="Spending breakdown donut chart">
                <svg viewBox="0 0 240 240">
                  <circle cx="120" cy="120" r="82" className="report-donut__track" />
                  {reportCategorySegments.length > 0
                    ? (() => {
                        const circumference = 2 * Math.PI * 82;
                        let offset = 0;
                        return reportCategorySegments.map((segment) => {
                          const dashLength = segment.share * circumference;
                          const circle = (
                            <circle
                              key={segment.categoryName}
                              cx="120"
                              cy="120"
                              r="82"
                              className="report-donut__segment"
                              style={{
                                stroke: segment.color,
                                strokeDasharray: `${dashLength} ${circumference}`,
                                strokeDashoffset: -offset,
                              }}
                            />
                          );
                          offset += dashLength;
                          return circle;
                        });
                      })()
                    : null}
                </svg>
                <div className="report-donut__center">
                  <strong>{formatCurrency(currentSpend)}</strong>
                  <span>spent</span>
                </div>
              </div>

              <div className="report-donut__legend">
                {reportCategorySegments.length > 0 ? (
                  reportCategorySegments.map((segment) => {
                    const previousAmount = previousSummary.expenseCategories.get(segment.categoryName) ?? 0;
                    const delta = segment.amount - previousAmount;
                    return (
                      <Link
                        key={segment.categoryName}
                        href={buildTransactionsHref({ category: segment.categoryName })}
                        className="report-donut__legend-item report-list__item--link"
                      >
                        <span className="report-donut__swatch" style={{ background: segment.color }} />
                        <div className="report-donut__meta">
                          <strong>{segment.categoryName}</strong>
                          <span>
                            {formatCurrency(segment.amount)} · {formatPercent(segment.share * 100)}
                          </span>
                          <small className={delta >= 0 ? "negative" : "positive"}>
                            {delta === 0 ? "Flat vs prior period" : `${delta >= 0 ? "+" : "-"}${formatCurrency(Math.abs(delta))} vs prior period`}
                          </small>
                        </div>
                      </Link>
                    );
                  })
                ) : (
                  <div className="empty-state">No categorized expenses yet. Review uncategorized rows or import a fuller statement to surface the main spending groups.</div>
                )}
                {currentOtherSpend > 0 ? (
                  <div className="report-donut__legend-item">
                    <span className="report-donut__swatch" style={{ background: "var(--border-subtle)" }} />
                    <div className="report-donut__meta">
                      <strong>Other spend</strong>
                      <span>{formatCurrency(currentOtherSpend)}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

          </article>
        </section>

        <section className="reports-grid reports-grid--free">
          <article className="report-card glass">
            <div className="report-card__head">
              <div>
                <h4>Repeat charges</h4>
              </div>
              <div className="report-card__stat">
                <strong>{recurringMerchants.length}</strong>
                <span>
                  fixed costs surfaced · {formatCurrency(recurringSavingsPotential)} monthly savings potential
                </span>
              </div>
            </div>

            <div className="report-list">
              {recurringMerchants.length > 0 ? (
                recurringMerchants.map((merchant) => (
                  <Link
                    key={merchant.label}
                    href={buildTransactionsHref({ merchant: merchant.label })}
                    className="report-list__item report-list__item--link"
                  >
                    <div className="report-list__meta">
                      <strong>{merchant.label}</strong>
                      <span>
                        {merchant.count} transaction{merchant.count === 1 ? "" : "s"} · {formatCurrency(merchant.amount)}
                      </span>
                      <small>
                        {merchant.cadenceLabel}
                        {merchant.nextDueDate ? ` · next due ${formatShortDate(merchant.nextDueDate)}` : ""}
                      </small>
                    </div>
                    <div className="report-tags">
                      <span className="pill pill-subtle">{merchant.cadenceLabel}</span>
                      <span className="pill pill-subtle">{formatPercent((merchant.amount / Math.max(currentSpend, 1)) * 100)} of spend</span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="empty-state">No repeat merchants surfaced yet. Add more transactions or imports to reveal the fixed costs Clover can track.</div>
              )}
            </div>
            <div className="report-subsection report-subsection--compact">
              <p className="eyebrow">Recurring signal</p>
              <div className="report-list">
                <div className="report-list__item">
                  <div className="report-list__meta">
                    <strong>{topRecurringMerchant?.label ?? "No recurring merchant"}</strong>
                    <span>
                      {topRecurringMerchant ? `Average of ${formatCurrency(averageRecurringSpend)} across repeat costs` : "More activity will reveal recurring merchants"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <article className="report-card glass">
            <div className="report-card__head">
              <div>
                <h4>Top spenders</h4>
              </div>
              <div className="report-card__stat">
                <strong>{topMerchants.length}</strong>
                <span>
                  where spending concentrates · {topMerchants[0] ? formatPercent((topMerchants[0].amount / Math.max(currentSpend, 1)) * 100) : "0%"} top share
                </span>
              </div>
            </div>

            <div className="report-list">
              {topMerchants.length > 0 ? (
                topMerchants.map((merchant) => (
                  <Link
                    key={merchant.label}
                    href={buildTransactionsHref({ merchant: merchant.label })}
                    className="report-list__item report-list__item--link"
                  >
                    <div className="report-list__meta">
                    <strong>{merchant.label}</strong>
                    <span>
                      {merchant.count} transaction{merchant.count === 1 ? "" : "s"} · {formatCurrency(merchant.amount)}
                    </span>
                  </div>
                    <div className="report-list__track" aria-hidden="true">
                      <span className="report-list__fill" style={{ width: `${Math.max((merchant.amount / currentSpend) * 100, 10)}%` }} />
                    </div>
                  </Link>
                ))
              ) : (
                <div className="empty-state">No merchants surfaced yet. Import more activity and Clover will surface the concentration points for you.</div>
              )}
            </div>
          </article>

          <article className="report-card glass">
            <div className="report-card__head">
              <div>
                <h4>This month</h4>
              </div>
              <div className="report-card__stat">
                <strong className={currentMonthBucket.net >= 0 ? "positive" : "negative"}>{formatSignedCurrency(currentMonthBucket.net)}</strong>
                <span>
                  {currentMonthBucket.label} · {monthlyNetChange >= 0 ? "up" : "down"} vs last month
                </span>
              </div>
            </div>

            <div className="report-insight-grid">
              <div className="report-insight">
                <span>Gross inflow</span>
                <strong>{formatCurrency(currentMonthBucket.income)}</strong>
                <small>{currentMonthBucket.label}</small>
              </div>
              <div className="report-insight">
                <span>Gross outflow</span>
                <strong>{formatCurrency(currentMonthBucket.expense)}</strong>
                <small>All tracked expenses</small>
              </div>
              <div className="report-insight">
                <span>Net position</span>
                <strong className={currentMonthBucket.net >= 0 ? "positive" : "negative"}>{formatSignedCurrency(currentMonthBucket.net)}</strong>
                <small>Income minus spending</small>
              </div>
              <div className="report-insight">
                <span>Month-over-month delta</span>
                <strong className={monthlyNetChange >= 0 ? "positive" : "negative"}>{formatSignedCurrency(monthlyNetChange)}</strong>
                <small>{previousMonthBucket.label} · {monthlyNetChange >= 0 ? "improving" : "softening"}</small>
              </div>
            </div>
            <div className="report-subsection report-subsection--compact">
              <Link className="pill-link pill-link--inline" href={buildTransactionsHref({ month: currentMonthBucket.key })}>
                Open {currentMonthBucket.label}
              </Link>
            </div>
          </article>
        </section>

        {!isPro ? (
          <div className="reports-footer-upsell">
            <p>
              Want a little more context and room to explore? <Link href="/pricing">Upgrade to Pro</Link> to unlock more charts,
              deeper comparisons, and extra analysis when you need it.
            </p>
          </div>
        ) : null}

      </>
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDigest =
      error && typeof error === "object" && "digest" in error && typeof (error as { digest?: unknown }).digest === "string"
        ? (error as { digest: string }).digest
        : "";

    await recordAppError({
      message: errorMessage,
      name: error instanceof Error ? error.name : "Error",
      stack: error instanceof Error ? error.stack ?? null : null,
      source: "reports-page",
      route: "/reports",
      metadata: {
        digest: errorDigest || null,
      },
    }).catch(() => null);

    return (
      <>
        <section className="report-card glass">
          <p className="eyebrow">Reports unavailable</p>
          <h4>We hit a temporary server issue while building this page.</h4>
          <p className="panel-muted">
            Try again in a moment. If the problem keeps happening, the data feed or database connection may need a quick check.
          </p>
          <details className="report-error-details">
            <summary>Technical details</summary>
            <pre>
              {errorMessage}
              {errorDigest ? `\nDigest: ${errorDigest}` : ""}
            </pre>
          </details>
        </section>
      </>
    );
  }
}

async function ReportsPageStream({ searchParams }: { searchParams?: Promise<{ range?: string }> }) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const session = await getSessionContext();
  const user = await getOrCreateCurrentUser(session.userId);
  if (!session.isGuest && !hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }

  return (
    <CloverShell
      active="reports"
      kicker="Insights"
      title="A clearer report on where your money stands."
      subtitle="Cash flow, spending concentration, recurring costs, and review items are pulled directly from your uploaded transactions and accounts."
      showTopbar={false}
      actions={
        <>
          <Link className="pill-link" href="/transactions">
            Transactions
          </Link>
          <Link className="pill-link" href="/settings">
            Settings
          </Link>
        </>
      }
    >
      <Suspense fallback={<ReportsStreamFallback />}>
        <ReportsStream active="reports" searchParams={resolvedSearchParams} />
      </Suspense>
    </CloverShell>
  );
}

export default function ReportsPage({ searchParams }: { searchParams?: Promise<{ range?: string }> }) {
  return (
    <Suspense fallback={<CloverLoadingScreen label="reports" />}>
      <ReportsPageStream searchParams={searchParams} />
    </Suspense>
  );
}
