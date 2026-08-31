import nextDynamic from "next/dynamic";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";
import type { ReportsQueueItem } from "@/components/reports-review-queue";
import { ReportsRangeMenu } from "@/components/reports-range-menu";
import { ReportsSection as ReportsSectionPanel, ReportsTabsProvider, ReportsTopTabs } from "@/components/reports-tabs";
import { PostHogEvent } from "@/components/posthog-analytics";
import { analyticsOnceKey } from "@/lib/analytics";
import { getPageSessionContext } from "@/lib/page-auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";
import { getGoalPlanSummary, getGoalProgressSnapshot, normalizeGoalPlan, type GoalKey } from "@/lib/goals";
import { RouteSplash } from "@/components/route-splash";
import { CloverLoadingScreen } from "@/components/clover-loading-screen";
import { formatCurrencyAmount, formatCurrencyCode } from "@/lib/currency-format";
import { recordAppError } from "@/lib/error-logs";
import { InfoTooltip as ReportInfoTip } from "@/components/info-tooltip";
import { InfoTooltip } from "@/components/info-tooltip";
import { CategoryBrandMark } from "@/components/category-brand-mark";
import { getCategoryIconTone } from "@/lib/category-icons";
import { getEffectiveTransactionCategoryName, getVerifiedSpendingMerchantName } from "@/lib/transaction-display";
import { resolveFinancialTransactionType } from "@/lib/transaction-directions";
import { getTransactionSummaryTypeOverrides } from "@/lib/transaction-summary";
import { buildActiveWorkspaceTransactionWhere } from "@/lib/transaction-query";
import { hasFullFeatureAccess } from "@/lib/beta-access";
import { getCalendarDayEndInTimeZone, resolveReportWindow } from "@/lib/report-window";
import { normalizeRegionalPreferences } from "@/lib/regional-preferences";
import { buildSpendingPaceSnapshot } from "@/lib/spending-pace";
import { SpendingPaceCard } from "@/components/spending-pace-card";
import type { User } from "@prisma/client";
import { AdviserHeaderLink } from "@/components/adviser-header-link";
import { ReportsCurrencyFilter } from "@/components/reports-currency-filter";
import {
  ReportsMoneyOverTimeChart,
  type ReportsMoneyPoint,
} from "@/components/reports-money-over-time-chart";
import { ReportsCashFlowMap } from "@/components/reports-cash-flow-map";
import {
  ReportsPeriodComparisonChart,
  type ReportsPeriodComparisonPoint,
} from "@/components/reports-period-comparison-chart";

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
export const reportsMetadata = {
  title: "Reports",
};

const monthFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "2-digit",
});

const buildReportPieSlicePath = (startShare: number, endShare: number) => {
  const center = 120;
  const radius = 88;
  const toPoint = (share: number) => {
    const angle = share * Math.PI * 2 - Math.PI / 2;
    return {
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
    };
  };
  const start = toPoint(startShare);
  const end = toPoint(endShare);
  if (endShare - startShare >= 0.9999) {
    return `M ${center} ${center} L ${center} ${center - radius} A ${radius} ${radius} 0 1 1 ${center} ${center + radius} A ${radius} ${radius} 0 1 1 ${center} ${center - radius} Z`;
  }
  return `M ${center} ${center} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${endShare - startShare > 0.5 ? 1 : 0} 1 ${end.x} ${end.y} Z`;
};

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
  rawPayload: unknown;
  account: {
    id: string;
    name: string;
    institution: string | null;
    accountNumber: string | null;
    currency: string;
    type: string;
  };
  category: {
    name: string;
  } | null;
  importFileId: string | null;
  isTransfer: boolean;
};

const getReportTransactionCategoryName = (transaction: ReportTransaction) =>
  getEffectiveTransactionCategoryName({
    categoryName: transaction.category?.name ?? null,
    rawPayload: transaction.rawPayload as never,
    merchantRaw: transaction.merchantRaw,
    merchantClean: transaction.merchantClean,
    description: transaction.description,
    institution: transaction.account.institution,
    source: transaction.importFileId ? "upload" : "manual",
    type: transaction.type,
  }) ?? "Uncategorized";

const getReportTransactionType = (transaction: ReportTransaction) =>
  resolveFinancialTransactionType({
    type: transaction.type,
    amount: transaction.amount,
    isTransfer: transaction.isTransfer,
    categoryName: getReportTransactionCategoryName(transaction),
    merchantRaw: transaction.merchantRaw,
    merchantClean: transaction.merchantClean,
    description: transaction.description,
    institution: transaction.account.institution,
  });

const reportSankeyExcludedMerchantMatchers = [
  "check clearing",
  "cash clearing",
  "cash deposit",
  "cash withdrawal",
  "finance charge",
  "interest charge",
  "bank fee",
];
const reportSankeyExcludedCategoryNames = new Set(["income", "financial", "cash & atm"]);

const isReportMerchantEligible = (transaction: ReportTransaction) => {
  const categoryName = getReportTransactionCategoryName(transaction).trim().toLowerCase();
  if (reportSankeyExcludedCategoryNames.has(categoryName)) {
    return false;
  }

  const merchantLabel = normalizeMerchant(transaction.merchantClean ?? transaction.merchantRaw);
  if (!merchantLabel) {
    return false;
  }

  return !reportSankeyExcludedMerchantMatchers.some((matcher) => merchantLabel.includes(matcher));
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
  accountNumber: string | null;
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

type ReportsSection = "overview" | "spending" | "trends" | "advanced";

const normalizeReportsSection = (value: string | undefined): ReportsSection => {
  if (value === "spending" || value === "trends" || value === "advanced") {
    return value;
  }

  return "overview";
};

const formatCurrency = (value: number, currency?: string | null) => formatCurrencyAmount(value, currency ?? "MIXED");

const formatSignedCurrency = (value: number, currency?: string | null) =>
  `${value < 0 ? "-" : ""}${formatCurrencyAmount(Math.abs(value), currency ?? "MIXED")}`;

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

const toReportAmount = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const toReportMagnitude = (value: unknown) => Math.abs(toReportAmount(value));

const mapParsedRowsToReportTransactions = (
  rows: Array<{
    id: string;
    importFileId: string;
    date: Date | null;
    amount: unknown;
    type: "income" | "expense" | "transfer" | null;
    merchantRaw: string | null;
    merchantClean: string | null;
    categoryName: string | null;
    rawPayload: unknown;
    institution: string | null;
    accountName: string | null;
    currency: string;
    importFile: {
      account: {
        id: string;
        name: string;
        institution: string | null;
        accountNumber: string | null;
        currency: string;
        type: string;
      } | null;
    } | null;
  }>
): ReportTransaction[] =>
  rows.flatMap((row) => {
    if (!isValidDate(row.date) || row.amount === null || row.amount === undefined) {
      return [];
    }

    const merchantRaw = row.merchantRaw?.trim() || row.merchantClean?.trim() || "Imported transaction";
    const type = row.type ?? (row.categoryName?.trim().toLowerCase() === "income" ? "income" : "expense");
    return [
      {
        id: `parsed:${row.id}`,
        date: row.date,
        amount: row.amount,
        type,
        merchantRaw,
        merchantClean: row.merchantClean,
        description: null,
        rawPayload: row.rawPayload,
        account: {
          id: row.importFile?.account?.id ?? `import:${row.importFileId}`,
          name: row.importFile?.account?.name ?? row.accountName ?? "Imported account",
          institution: row.importFile?.account?.institution ?? row.institution,
          accountNumber: row.importFile?.account?.accountNumber ?? null,
          currency: row.importFile?.account?.currency ?? row.currency ?? "MIXED",
          type: row.importFile?.account?.type ?? "other",
        },
        category: row.categoryName ? { name: row.categoryName } : null,
        importFileId: row.importFileId,
        isTransfer: type === "transfer",
      },
    ];
  });

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

const getRollingWeekBuckets = (anchor: Date, count = 8) => {
  return Array.from({ length: count }, (_, index) => {
    const offset = count - index - 1;
    const end = new Date(anchor);
    end.setDate(end.getDate() - offset * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    return {
      key: `${start.toISOString().slice(0, 10)}:${end.toISOString().slice(0, 10)}`,
      label: start.toLocaleDateString("en-PH", { month: "short", day: "numeric" }),
      detailLabel: `${formatShortDate(start)} - ${formatShortDate(end)}`,
      start,
      end,
      income: 0,
      expense: 0,
    };
  });
};

function ReportsStreamFallback() {
  return <CloverLoadingScreen label="reports" />;
}

function ReportsEmptyNote({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="reports-section-empty">
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}

export async function ReportsStream({
  active = "reports",
  searchParams,
  user,
  sessionIsGuest,
}: {
  active?: "reports" | "adviser";
  searchParams?: { range?: string; section?: string; filter?: string; from?: string; to?: string; currency?: string };
  user: User;
  sessionIsGuest: boolean;
}) {
  const cookieStore = await cookies();
  const selectedWorkspaceCookieId = cookieStore.get(selectedWorkspaceKey)?.value ?? "";
  const reportWindow = resolveReportWindow(
    getCalendarDayEndInTimeZone(new Date(), normalizeRegionalPreferences(user.regionalPreferences).timeZone),
    searchParams,
  );
  const selectedRange = reportWindow.range;
  const selectedRangeLabel = reportWindow.label;
  const rangeWindowText = selectedRange === "ytd" ? "year-to-date" : selectedRangeLabel.toLowerCase();
  const requestedSection = normalizeReportsSection(searchParams?.section);

  const isPro = hasFullFeatureAccess(user.planTier);
  const initialSection = isPro || requestedSection !== "advanced" ? requestedSection : "overview";
  const sectionTabs: ReportsSection[] = isPro ? ["overview", "spending", "trends", "advanced"] : ["overview", "spending", "trends"];
  const needsSpendingData = true;
  const needsTrendData = true;
  const needsAdvancedData = isPro;
  if (!sessionIsGuest && !hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }

  const userWorkspaces = await prisma.workspace.findMany({
    where: {
      user: {
        clerkUserId: user.clerkUserId,
      },
    },
    select: {
      id: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const cookieWorkspace = selectedWorkspaceCookieId
    ? userWorkspaces.find((workspace) => workspace.id === selectedWorkspaceCookieId) ?? null
    : null;
  // Match Home and the rest of the app: the selected workspace is authoritative.
  // Reports must never jump to another workspace merely because it has more rows.
  const activeWorkspace = cookieWorkspace ?? userWorkspaces[0] ?? null;

  let selectedWorkspaceId = activeWorkspace?.id ?? "";

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
    const {
      currentStart: currentWindowStart,
      currentEnd: currentWindowEnd,
      previousStart: previousWindowStart,
      previousEnd: previousWindowEnd,
    } = reportWindow;
    const sixMonthsAgo = new Date(currentWindowEnd.getFullYear(), currentWindowEnd.getMonth() - 5, 1);
    const reportQueryStart = new Date(Math.min(previousWindowStart.getTime(), sixMonthsAgo.getTime()));

    const [
      reportTransactions,
      workspaceAccountSnapshots,
      latestImport,
      importStatusRows,
      parsedReportRowCandidates,
    ] = await Promise.all([
      prisma.transaction.findMany({
        where: buildActiveWorkspaceTransactionWhere(selectedWorkspaceId, {
          date: { gte: reportQueryStart, lte: currentWindowEnd },
        }),
        select: {
          id: true,
          date: true,
          amount: true,
          type: true,
          merchantRaw: true,
          merchantClean: true,
          description: true,
          rawPayload: true,
          importFileId: true,
          isTransfer: true,
          account: {
            select: {
              id: true,
              name: true,
              institution: true,
              accountNumber: true,
              currency: true,
              type: true,
            },
          },
          category: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { date: "desc" },
      }),
      (prisma.account.findMany({
            where: {
              workspaceId: selectedWorkspaceId,
            },
            select: {
              id: true,
              name: true,
              accountNumber: true,
              balance: true,
              currency: true,
              type: true,
            },
            orderBy: [{ balance: "desc" }, { updatedAt: "desc" }],
          }) as Promise<WorkspaceAccountSnapshot[]>),
      needsAdvancedData
        ? prisma.importFile.findFirst({
            where: { workspaceId: selectedWorkspaceId },
            orderBy: { uploadedAt: "desc" },
            select: {
              fileName: true,
              status: true,
              uploadedAt: true,
            },
          })
        : Promise.resolve(null),
      needsAdvancedData
        ? prisma.importFile.groupBy({
            by: ["status"],
            where: { workspaceId: selectedWorkspaceId },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      prisma.parsedTransaction
        .findMany({
          where: {
            workspaceId: selectedWorkspaceId,
            date: { not: null, gte: reportQueryStart, lte: currentWindowEnd },
            amount: { not: null },
            importFile: {
              OR: [{ status: "done" }, { confirmedAt: { not: null } }, { parsedRowsCount: { gt: 0 } }],
            },
          },
          select: {
            id: true,
            importFileId: true,
            date: true,
            amount: true,
            type: true,
            merchantRaw: true,
            merchantClean: true,
            categoryName: true,
            rawPayload: true,
            institution: true,
            accountName: true,
            currency: true,
            importFile: {
              select: {
                account: {
                  select: {
                    id: true,
                    name: true,
                    institution: true,
                    accountNumber: true,
                    currency: true,
                    type: true,
                  },
                },
              },
            },
          },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        })
        .catch(() => []),
    ]);

    const importCountByStatus = new Map(
      importStatusRows.map((row) => [row.status, Number(row._count._all ?? 0)])
    );
    const importStatusCounts = {
      processing: importCountByStatus.get("processing") ?? 0,
      done: importCountByStatus.get("done") ?? 0,
      failed: importCountByStatus.get("failed") ?? 0,
      deleted: importCountByStatus.get("deleted") ?? 0,
    };
    const normalizedReportTransactions = Array.isArray(reportTransactions) ? reportTransactions.filter(isDefined) : [];
    const normalizedImportFileIds = new Set(
      normalizedReportTransactions.flatMap((transaction) => (transaction.importFileId ? [transaction.importFileId] : []))
    );
    const parsedReportRows = parsedReportRowCandidates.filter(
      (row) => !normalizedImportFileIds.has(row.importFileId),
    );
    const reportAllTransactions = [
      ...normalizedReportTransactions,
      ...mapParsedRowsToReportTransactions(parsedReportRows),
    ].sort((left, right) => right.date.getTime() - left.date.getTime());
    const reportTypeOverrides = getTransactionSummaryTypeOverrides(
      reportAllTransactions.map((transaction) => ({
        id: transaction.id,
        accountId: transaction.account.id,
        accountType: transaction.account.type,
        date: transaction.date,
        amount: transaction.amount,
        currency: transaction.account.currency,
        type: transaction.type,
        isTransfer: transaction.isTransfer,
        categoryName: getReportTransactionCategoryName(transaction),
        merchantRaw: transaction.merchantRaw,
        merchantClean: transaction.merchantClean,
        description: transaction.description,
        rawPayload: transaction.rawPayload,
      }))
    );
    const getResolvedReportTransactionType = (transaction: ReportTransaction) =>
      reportTypeOverrides.get(transaction.id) ?? getReportTransactionType(transaction);
    const isResolvedReportSpendingTransaction = (transaction: ReportTransaction) =>
      getResolvedReportTransactionType(transaction) === "expense";
    const requestedFilter = searchParams?.filter?.trim().toLowerCase() ?? "";
    const requestedCurrencyValue = searchParams?.currency?.trim().toUpperCase() ?? "";
    const requestedCurrency = requestedCurrencyValue && requestedCurrencyValue !== "ALL" ? requestedCurrencyValue : null;
    const currencyScopedTransactions = requestedCurrency
      ? reportAllTransactions.filter(
          (transaction) => formatCurrencyCode(transaction.account.currency) === requestedCurrency
        )
      : reportAllTransactions;
    const reportScopedTransactions = requestedFilter
      ? currencyScopedTransactions.filter((transaction) => {
          const category = getReportTransactionCategoryName(transaction).toLowerCase();
          const merchant = normalizeMerchant(transaction.merchantClean ?? transaction.merchantRaw).toLowerCase();
          const account = transaction.account.name.toLowerCase();
          return category.includes(requestedFilter) || merchant.includes(requestedFilter) || account.includes(requestedFilter);
        })
      : currencyScopedTransactions;
    const spendingPaceTransactions = reportScopedTransactions.filter(isResolvedReportSpendingTransaction);
    const spendingPace = buildSpendingPaceSnapshot(
      spendingPaceTransactions.map((transaction) => ({
        date: transaction.date,
        amount: toReportMagnitude(transaction.amount),
        category: getReportTransactionCategoryName(transaction),
      })),
      currentWindowEnd
    );
    const spendingPaceCurrencies = Array.from(
      new Set(
        spendingPaceTransactions
          .filter((transaction) => spendingPace ? transaction.date >= spendingPace.currentMonthStart && transaction.date <= spendingPace.currentComparableEnd : false)
          .map((transaction) => formatCurrencyCode(transaction.account.currency))
      )
    );
    const spendingPaceCurrency = spendingPaceCurrencies.length === 1 ? spendingPaceCurrencies[0] : "MIXED";
    const reportCurrentWindowTransactions = reportScopedTransactions.filter(
      (transaction) => transaction.date >= currentWindowStart && transaction.date <= currentWindowEnd
    );
    const reportPreviousWindowTransactions = reportScopedTransactions.filter(
      (transaction) => transaction.date >= previousWindowStart && transaction.date <= previousWindowEnd
    );
    const reportSixMonthTransactions = reportScopedTransactions.filter(
      (transaction) => transaction.date >= sixMonthsAgo && transaction.date <= currentWindowEnd
    );
    const reportDisplayTransactions = reportCurrentWindowTransactions;
    const reportTrendTransactions = reportSixMonthTransactions;
    const accountStatsCountId = workspaceAccountSnapshots.length;
    const isFreshResetWorkspace =
      user.dataWipedAt !== null && accountStatsCountId <= 1 && Object.values(importStatusCounts).every((count) => count === 0);
    const latestImportSummary = latestImport as unknown as
      | {
          fileName: string;
          status: string;
          uploadedAt: Date;
        }
      | null;
    const isEmptyWorkspace = accountStatsCountId <= 1 && reportDisplayTransactions.length === 0 && Object.values(importStatusCounts).every((count) => count === 0);
    const reportHistoricalTransactions = reportScopedTransactions.filter((transaction) => transaction.date < currentWindowStart);

    const currentSummary: WindowSummary = reportDisplayTransactions.reduce(
      (accumulator, transaction) => {
        const magnitude = toReportMagnitude(transaction.amount);
        const transactionType = getResolvedReportTransactionType(transaction);
        if (transactionType === "income") {
          accumulator.income += magnitude;
        } else if (transactionType === "expense") {
          accumulator.expense += magnitude;
        } else {
          accumulator.transfer += magnitude;
        }

        if (transactionType === "expense") {
          const categoryName = getReportTransactionCategoryName(transaction);
          accumulator.expenseCategories.set(
            categoryName,
            (accumulator.expenseCategories.get(categoryName) ?? 0) + magnitude
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
        const magnitude = toReportMagnitude(row.amount);
        const transactionType = getResolvedReportTransactionType(row);
        if (transactionType === "income") {
          accumulator.income += magnitude;
        } else if (transactionType === "expense") {
          accumulator.expense += magnitude;
        } else {
          accumulator.transfer += magnitude;
        }

        if (transactionType === "expense") {
          const categoryName = getReportTransactionCategoryName(row);
          accumulator.expenseCategories.set(
            categoryName,
            (accumulator.expenseCategories.get(categoryName) ?? 0) + magnitude
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

    const monthBuckets = getMonthBuckets(currentWindowEnd);
    const weeklyTrendBuckets = getRollingWeekBuckets(currentWindowEnd);
    reportTrendTransactions.forEach((transaction) => {
      const bucket = bucketMonth(transaction.date, monthBuckets);
      const amount = toReportMagnitude(transaction.amount);
      const transactionType = getResolvedReportTransactionType(transaction);
      if (bucket) {
        if (transactionType === "income") {
          bucket.income += amount;
        } else if (transactionType === "expense") {
          bucket.expense += amount;
        }
        bucket.net = bucket.income - bucket.expense;
      }

      const weekBucket = weeklyTrendBuckets.find(
        (candidate) => transaction.date >= candidate.start && transaction.date <= candidate.end
      );
      if (weekBucket && transactionType === "income") {
        weekBucket.income += amount;
      } else if (weekBucket && transactionType === "expense") {
        weekBucket.expense += amount;
      }
    });
    const weeklyTrendPoints: ReportsPeriodComparisonPoint[] = weeklyTrendBuckets.map(({ start: _start, end: _end, ...bucket }) => bucket);
    const monthlyTrendPoints: ReportsPeriodComparisonPoint[] = monthBuckets.map((bucket) => ({
      key: bucket.key,
      label: bucket.label.split(" ")[0],
      detailLabel: bucket.label,
      income: bucket.income,
      expense: bucket.expense,
    }));

    const allWorkspaceAccountSummaries = Array.isArray(workspaceAccountSnapshots)
      ? (workspaceAccountSnapshots as Array<WorkspaceAccountSnapshot | null | undefined>).flatMap((account) => {
          if (!account || typeof account.id !== "string") {
            return [];
          }

          return [
            {
              id: account.id,
              name: typeof account.name === "string" && account.name.trim().length > 0 ? account.name : "Account",
              accountNumber: typeof account.accountNumber === "string" ? account.accountNumber : null,
              balance: account.balance,
              currency: typeof account.currency === "string" && account.currency.trim().length > 0 ? account.currency : "MIXED",
              type: typeof account.type === "string" && account.type.trim().length > 0 ? account.type : "account",
            },
          ];
        })
      : [];
    const workspaceAccountSummaries = requestedCurrency
      ? allWorkspaceAccountSummaries.filter(
          (account) => formatCurrencyCode(account.currency) === requestedCurrency
        )
      : allWorkspaceAccountSummaries;
    const currencyCandidates = new Set(
      workspaceAccountSummaries.map((account) => formatCurrencyCode(account.currency)).filter((currency) => currency.length > 0)
    );
    const displayCurrency = requestedCurrency ?? (currencyCandidates.size === 1 ? Array.from(currencyCandidates)[0] : "MIXED");
    const formatCurrency = (value: number, currency: string | null = displayCurrency) => formatCurrencyAmount(value, currency);
    const formatSignedCurrency = (value: number, currency: string | null = displayCurrency) =>
      `${value < 0 ? "-" : ""}${formatCurrencyAmount(Math.abs(value), currency)}`;
    const totalAccountBalance = workspaceAccountSummaries.reduce((sum, account) => {
      const balance = Number(account.balance);
      return Number.isFinite(balance) ? sum + balance : sum;
    }, 0);
    const activeAccountCount = workspaceAccountSummaries.filter((account) => account.balance !== null).length;
    const accountCount = workspaceAccountSummaries.length;
    const uncategorizedTransactions = reportDisplayTransactions.filter((transaction) => !transaction.category?.name || !transaction.merchantClean);

    const duplicateGroups = new Map<string, (typeof reportDisplayTransactions)[number][]>();
    reportDisplayTransactions.forEach((transaction) => {
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

    const currentNet = currentSummary.income - currentSummary.expense;
    const previousNet = previousSummary.income - previousSummary.expense;
    const currentSpend = currentSummary.expense;
    const previousSpend = previousSummary.expense;
    // Net income already communicates a deficit. Savings rate is the retained
    // share of income, so keep the product-facing percentage within 0–100%.
    const savingsRate = currentSummary.income > 0
      ? Math.min(1, Math.max(0, currentNet / currentSummary.income))
      : null;
    const spendDelta = previousSpend > 0 ? ((currentSpend - previousSpend) / previousSpend) * 100 : null;
    const incomeDelta = previousSummary.income > 0 ? ((currentSummary.income - previousSummary.income) / previousSummary.income) * 100 : null;

    const reportExpenseTransactions = reportDisplayTransactions.filter(isResolvedReportSpendingTransaction);
    const reportExpenseCategories = reportExpenseTransactions.reduce(
      (totals, transaction) => {
        const categoryName = getReportTransactionCategoryName(transaction);
        totals.set(categoryName, (totals.get(categoryName) ?? 0) + Math.abs(Number(transaction.amount)));
        return totals;
      },
      new Map<string, number>()
    );
    const reportExpenseCategoryEntries = Array.from(reportExpenseCategories.entries()).sort((a, b) => b[1] - a[1]);
    const reportExpenseTotal = reportExpenseCategoryEntries.reduce((sum, [, amount]) => sum + amount, 0);
    const reportExpenseDisplayCategories = reportExpenseCategoryEntries;
    const reportSpentTotal = reportExpenseTotal > 0 ? reportExpenseTotal : currentSpend;

    const reportSankeyIncomeTransactions = reportDisplayTransactions.filter((transaction) => getResolvedReportTransactionType(transaction) === "income");
    const reportSankeyExpenseTransactions = reportExpenseTransactions;
    const reportSankeyAccountIncome = new Map<
      string,
      {
        id: string;
        label: string;
        amount: number;
      }
    >();
    const reportSankeyAccountExpenseByCategory = new Map<
      string,
      Map<
        string,
        {
          label: string;
          amount: number;
        }
      >
    >();
    const reportSankeyCategoryTotals = new Map<
      string,
      {
        label: string;
        amount: number;
      }
    >();

    reportSankeyIncomeTransactions.forEach((transaction) => {
      const accountLastFour = transaction.account.accountNumber?.replace(/\D/g, "").slice(-4);
      const accountLabel = `${transaction.account.name?.trim() || "Account"}${accountLastFour ? ` ${accountLastFour}` : ""}`;
      const key = transaction.account.id;
      const existing = reportSankeyAccountIncome.get(key) ?? { id: key, label: accountLabel, amount: 0 };
      existing.amount += Math.abs(Number(transaction.amount));
      reportSankeyAccountIncome.set(key, existing);
    });

    reportSankeyExpenseTransactions.forEach((transaction) => {
      const accountLastFour = transaction.account.accountNumber?.replace(/\D/g, "").slice(-4);
      const accountLabel = `${transaction.account.name?.trim() || "Account"}${accountLastFour ? ` ${accountLastFour}` : ""}`;
      const accountKey = transaction.account.id;
      if (!reportSankeyAccountIncome.has(accountKey)) {
        reportSankeyAccountIncome.set(accountKey, { id: accountKey, label: accountLabel, amount: 0 });
      }
      const categoryLabel = getReportTransactionCategoryName(transaction);
      const categoryKey = normalizeMerchant(categoryLabel);
      const amount = Math.abs(Number(transaction.amount));
      const accountExpenseMap = reportSankeyAccountExpenseByCategory.get(accountKey) ?? new Map();
      const accountCategory = accountExpenseMap.get(categoryKey) ?? { label: categoryLabel, amount: 0 };
      accountCategory.amount += amount;
      accountExpenseMap.set(categoryKey, accountCategory);
      reportSankeyAccountExpenseByCategory.set(accountKey, accountExpenseMap);

      const categoryExisting = reportSankeyCategoryTotals.get(categoryKey) ?? { label: categoryLabel, amount: 0 };
      categoryExisting.amount += amount;
      reportSankeyCategoryTotals.set(categoryKey, categoryExisting);
    });

    const accountSnapshotById = new Map(workspaceAccountSummaries.map((account) => [account.id, account] as const));
    const reportSankeyAccounts = Array.from(reportSankeyAccountIncome.values())
      .map((account) => {
        const expenseAmount = Array.from(reportSankeyAccountExpenseByCategory.get(account.id)?.values() ?? []).reduce(
          (sum, category) => sum + category.amount,
          0
        );
        const currentBalance = Math.max(Number(accountSnapshotById.get(account.id)?.balance ?? 0), 0);
        const beginningBalance = Math.max(currentBalance - account.amount + expenseAmount, 0);
        const availableAmount = Math.max(beginningBalance + account.amount, expenseAmount);
        return {
          ...account,
          incomeAmount: account.amount,
          beginningBalance,
          currentBalance,
          amount: availableAmount,
          expenseAmount,
        };
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 12);

    const sankeyCategoryEntries = Array.from(reportSankeyCategoryTotals.values())
      .filter((category) => category.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const sankeyTopCategoryKeys = new Set(sankeyCategoryEntries.slice(0, 7).map((category) => normalizeMerchant(category.label)));
    const sankeyAccountColors = ["#08abc4", "#44c7b6", "#79c98d", "#63a9e8", "#f0bd4f", "#f28b62"];
    const sankeyCategoryTotals = new Map<string, { label: string; amount: number }>();
    const sankeyAccountFlows = reportSankeyAccounts.map((account, accountIndex) => {
      const expenses = Array.from(reportSankeyAccountExpenseByCategory.get(account.id)?.values() ?? [])
        .filter((entry) => entry.amount > 0)
        .reduce<Array<{ key: string; label: string; amount: number }>>((entries, entry) => {
          const entryKey = normalizeMerchant(entry.label);
          const key = sankeyTopCategoryKeys.has(entryKey) ? entryKey : "other-spending";
          const label = sankeyTopCategoryKeys.has(entryKey) ? entry.label : "Other spending";
          const existing = entries.find((candidate) => candidate.key === key);
          if (existing) {
            existing.amount += entry.amount;
          } else {
            entries.push({ key, label, amount: entry.amount });
          }
          return entries;
        }, []);
      const leftAfterSpending = Math.max(account.amount - account.expenseAmount, 0);
      if (leftAfterSpending > 0) {
        expenses.push({
          key: "left-after-spending",
          label: "Left after spending",
          amount: leftAfterSpending,
        });
      }
      expenses.forEach((entry) => {
        const total = sankeyCategoryTotals.get(entry.key) ?? { label: entry.label, amount: 0 };
        total.amount += entry.amount;
        sankeyCategoryTotals.set(entry.key, total);
      });
      return {
        ...account,
        color: sankeyAccountColors[accountIndex % sankeyAccountColors.length],
        flows: expenses,
      };
    });

    const sankeyCategoryNodes = Array.from(sankeyCategoryTotals.entries())
      .map(([key, category]) => {
        const categoryTone = getCategoryIconTone(category.label);
        return {
          key,
          ...category,
          color:
            key === "left-after-spending"
              ? "#35b878"
              : key === "other-spending"
                ? "#91a2ae"
                : categoryTone.borderColor,
        };
      })
      .sort((a, b) => {
        if (a.key === "left-after-spending") return 1;
        if (b.key === "left-after-spending") return -1;
        return b.amount - a.amount;
      });
    const recurringMerchantHistory = new Map<
      string,
      {
        label: string;
        amount: number;
        dates: Date[];
      }
    >();

    [...reportPreviousWindowTransactions, ...reportDisplayTransactions].forEach((transaction) => {
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

    const topCategoryShare = currentSpend > 0 ? maxCategorySpend / currentSpend : null;
    const importedReportTransactions = reportAllTransactions.filter((transaction) => transaction.importFileId !== null);
    const manualReportTransactions = reportAllTransactions.filter((transaction) => transaction.importFileId === null);
    const importedTransactions = importedReportTransactions.length;
    const manualTransactions = manualReportTransactions.length;
    const importedAmount = importedReportTransactions.reduce((sum, transaction) => sum + toReportAmount(transaction.amount), 0);
    const manualAmount = manualReportTransactions.reduce((sum, transaction) => sum + toReportAmount(transaction.amount), 0);
    const goalKey = user.primaryGoal?.trim() ?? null;
    const goalLabel = goalKey ? goalLabels[goalKey] ?? goalKey : null;
    const goalTargetAmount = user.goalTargetAmount ? Number(user.goalTargetAmount) : null;
    const currentGoalPlan = normalizeGoalPlan(user.goalPlan, goalKey as GoalKey | null, goalTargetAmount);
    const goalPlanSummary = getGoalPlanSummary(
      currentGoalPlan,
      currentSummary.income > 0 ? currentSummary.income : null,
      displayCurrency
    );

    const reportRecentTransactions = reportCurrentWindowTransactions.length > 0 ? reportCurrentWindowTransactions : reportDisplayTransactions;
    const reportRecentExpenseTransactions = reportRecentTransactions.filter(
      (transaction) => getResolvedReportTransactionType(transaction) === "expense" && isReportMerchantEligible(transaction)
    );
    const reportHistoricalExpenseTransactions = reportHistoricalTransactions.filter(
      (transaction) => getResolvedReportTransactionType(transaction) === "expense" && isReportMerchantEligible(transaction)
    );

    const recentMerchantSpend = new Map<
      string,
      {
        label: string;
        amount: number;
        count: number;
        categoryAmounts: Map<string, number>;
      }
    >();
    const historicalMerchantSpend = new Map<
      string,
      {
        label: string;
        amount: number;
        count: number;
      }
    >();

    reportRecentExpenseTransactions.forEach((transaction) => {
      const label = getVerifiedSpendingMerchantName({
        merchantClean: transaction.merchantClean,
        merchantRaw: transaction.merchantRaw,
        description: transaction.description,
        rawPayload: transaction.rawPayload as never,
        institution: transaction.account.institution,
      });
      if (!label) return;
      const key = normalizeMerchant(label);
      const amount = Math.abs(Number(transaction.amount));
      const categoryName = getReportTransactionCategoryName(transaction);
      const existing = recentMerchantSpend.get(key) ?? { label, amount: 0, count: 0, categoryAmounts: new Map<string, number>() };
      existing.amount += amount;
      existing.count += 1;
      existing.categoryAmounts.set(categoryName, (existing.categoryAmounts.get(categoryName) ?? 0) + amount);
      recentMerchantSpend.set(key, existing);
    });

    reportHistoricalExpenseTransactions.forEach((transaction) => {
      const label = getVerifiedSpendingMerchantName({
        merchantClean: transaction.merchantClean,
        merchantRaw: transaction.merchantRaw,
        description: transaction.description,
        rawPayload: transaction.rawPayload as never,
        institution: transaction.account.institution,
      });
      if (!label) return;
      const key = normalizeMerchant(label);
      const existing = historicalMerchantSpend.get(key) ?? { label, amount: 0, count: 0 };
      existing.amount += Math.abs(Number(transaction.amount));
      existing.count += 1;
      historicalMerchantSpend.set(key, existing);
    });

    const recentMerchantSummaries = Array.from(recentMerchantSpend.values()).map(({ categoryAmounts, ...merchant }) => ({
      ...merchant,
      categoryName: Array.from(categoryAmounts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "Other",
    }));
    const topMerchants = recentMerchantSummaries.sort((a, b) => b.amount - a.amount).slice(0, 5);
    const merchantMovements = recentMerchantSummaries
      .map((merchant) => {
        const historicalMerchant = historicalMerchantSpend.get(normalizeMerchant(merchant.label));
        const historicalAmount = historicalMerchant?.amount ?? 0;
        const historicalCount = historicalMerchant?.count ?? 0;
        const delta = merchant.amount - historicalAmount;
        const deltaPercent = historicalAmount > 0 ? (delta / historicalAmount) * 100 : null;
        const isNewMerchant = historicalCount === 0;
        const isNotableNewMerchant =
          isNewMerchant && (merchant.count >= 3 || merchant.amount >= Math.max(1500, currentSummary.expense * 0.08));

        return {
          ...merchant,
          previousAmount: historicalAmount,
          delta,
          deltaPercent,
          isNewMerchant,
          isNotableNewMerchant,
        };
      })
      .filter((merchant) => merchant.isNotableNewMerchant || merchant.delta > 0)
      .sort((a, b) => {
        if (a.isNotableNewMerchant !== b.isNotableNewMerchant) {
          return a.isNotableNewMerchant ? -1 : 1;
        }

        const deltaGap = b.delta - a.delta;
        if (deltaGap !== 0) {
          return deltaGap;
        }

        return b.count - a.count;
      })
      .slice(0, 3);
    const leadingMerchantMovement = merchantMovements[0] ?? null;
    const currentMonthBucket = monthBuckets[monthBuckets.length - 1];
    const previousMonthBucket = monthBuckets[monthBuckets.length - 2] ?? monthBuckets[monthBuckets.length - 1];
    const monthlyNetChange = currentMonthBucket.net - previousMonthBucket.net;
    const weeklySummaryEnd = currentWindowEnd;
    const weeklySummaryStart = new Date(weeklySummaryEnd);
    weeklySummaryStart.setDate(weeklySummaryStart.getDate() - 6);
    const previousWeeklySummaryEnd = new Date(weeklySummaryStart);
    previousWeeklySummaryEnd.setDate(previousWeeklySummaryEnd.getDate() - 1);
    const previousWeeklySummaryStart = new Date(previousWeeklySummaryEnd);
    previousWeeklySummaryStart.setDate(previousWeeklySummaryStart.getDate() - 6);
    const summarizeReportTransactions = (transactions: ReportTransaction[]): WindowSummary =>
      transactions.reduce(
        (summary, transaction) => {
          const magnitude = toReportMagnitude(transaction.amount);
          const transactionType = getResolvedReportTransactionType(transaction);
          if (transactionType === "income") {
            summary.income += magnitude;
          } else if (transactionType === "expense") {
            summary.expense += magnitude;
          } else {
            summary.transfer += magnitude;
          }
          return summary;
        },
        { income: 0, expense: 0, transfer: 0, expenseCategories: new Map<string, number>() }
      );
    const weeklySummary = summarizeReportTransactions(
      reportScopedTransactions.filter((transaction) => transaction.date >= weeklySummaryStart && transaction.date <= weeklySummaryEnd)
    );
    const previousWeeklySummary = summarizeReportTransactions(
      reportScopedTransactions.filter(
        (transaction) => transaction.date >= previousWeeklySummaryStart && transaction.date <= previousWeeklySummaryEnd
      )
    );
    const weeklyNet = weeklySummary.income - weeklySummary.expense;
    const previousWeeklyNet = previousWeeklySummary.income - previousWeeklySummary.expense;
    const weeklyNetChange = weeklyNet - previousWeeklyNet;
    const weeklySummaryLabel = `${formatShortDate(weeklySummaryStart)} - ${formatShortDate(weeklySummaryEnd)}`;
    const reportDateKey = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const dailyNetByDate = new Map<string, number>();
    reportDisplayTransactions.forEach((transaction) => {
      const type = getResolvedReportTransactionType(transaction);
      if (type !== "income" && type !== "expense") return;
      const signedAmount = toReportMagnitude(transaction.amount) * (type === "income" ? 1 : -1);
      const dateKey = reportDateKey(transaction.date);
      dailyNetByDate.set(dateKey, (dailyNetByDate.get(dateKey) ?? 0) + signedAmount);
    });
    const reportMoneyPoints: ReportsMoneyPoint[] = [];
    let runningBalance = totalAccountBalance - currentNet;
    const timelineDate = new Date(currentWindowStart);
    timelineDate.setHours(0, 0, 0, 0);
    const timelineEnd = new Date(currentWindowEnd);
    timelineEnd.setHours(23, 59, 59, 999);
    while (timelineDate <= timelineEnd) {
      const dateKey = reportDateKey(timelineDate);
      runningBalance += dailyNetByDate.get(dateKey) ?? 0;
      reportMoneyPoints.push({ date: dateKey, balance: runningBalance });
      timelineDate.setDate(timelineDate.getDate() + 1);
    }
    const reportCategorySegments = reportExpenseDisplayCategories.map(([categoryName, amount]) => ({
      categoryName,
      amount,
      share: reportExpenseTotal > 0 ? amount / reportExpenseTotal : 0,
      color: getCategoryIconTone(categoryName),
    }));
    const currentTrackedCategorySpend = reportExpenseDisplayCategories.reduce((sum, [, amount]) => sum + amount, 0);
    const currentOtherSpend = Math.max(reportExpenseTotal - currentTrackedCategorySpend, 0);
    const reportCategoryMaxAmount = Math.max(
      ...reportCategorySegments.map((segment) => segment.amount),
      currentOtherSpend,
      1,
    );
    const reportSpendingMixSegments = [
      ...reportCategorySegments,
      ...(currentOtherSpend > 0
        ? [{
            categoryName: "Other spend",
            amount: currentOtherSpend,
            share: reportExpenseTotal > 0 ? currentOtherSpend / reportExpenseTotal : 0,
            color: {
              backgroundColor: "var(--border-subtle)",
              borderColor: "#64748b",
            },
          }]
        : []),
    ];
    const recurringSavingsPotential = recurringMerchants.reduce((sum, merchant) => sum + merchant.amount, 0) * 0.2;
    const topRecurringMerchant = recurringMerchants[0] ?? null;
    const averageRecurringSpend = recurringMerchants.length > 0
      ? recurringMerchants.reduce((sum, merchant) => sum + merchant.amount, 0) / recurringMerchants.length
      : 0;
    const topCategoryName = topCategories[0]?.[0] ?? null;
    const topCategoryAmount = topCategories[0]?.[1] ?? 0;
    const historicalTopCategoryAmount = topCategoryName
      ? reportHistoricalTransactions.reduce((sum, transaction) => {
          if (getResolvedReportTransactionType(transaction) !== "expense") {
            return sum;
          }

          const categoryName = getReportTransactionCategoryName(transaction);
          return categoryName === topCategoryName ? sum + Math.abs(Number(transaction.amount)) : sum;
        }, 0)
      : 0;
    const topCategoryDelta = topCategoryAmount - historicalTopCategoryAmount;
    const topCategoryDeltaPercent = historicalTopCategoryAmount > 0 ? (topCategoryDelta / historicalTopCategoryAmount) * 100 : null;
    const goalProgress = getGoalProgressSnapshot({
      goalKey: goalKey as GoalKey | null,
      targetAmount: goalTargetAmount,
      goalPlan: currentGoalPlan,
      currentNet,
      currentSpend,
      monthlyIncome: currentSummary.income > 0 ? currentSummary.income : null,
      currentSavingsRate: savingsRate,
      previousSavingsRate: previousSummary.income > 0
        ? Math.min(1, Math.max(0, (previousSummary.income - previousSummary.expense) / previousSummary.income))
        : null,
      spendDelta,
      recurringShare: recurringMerchants.reduce((sum, merchant) => sum + merchant.amount, 0) / Math.max(currentSpend, 1),
    }, displayCurrency);
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
          reportDisplayTransactions.length * 0.12 +
          importStatusCounts.done * 1.5 +
          activeAccountCount * 1.5 -
          importStatusCounts.failed * 8 -
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
          ? historicalTopCategoryAmount > 0
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
            : historicalTopCategoryAmount > 0
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
            : "Use goal-aware Adviser guidance to see whether spending and cash flow are helping or slowing you down.",
          href: "/goals",
          label: "Open goals",
        }
      : {
          title: "Choose a goal to sharpen the guidance",
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
            transaction_count: reportDisplayTransactions.length,
            import_count: Object.values(importStatusCounts).reduce((sum, count) => sum + count, 0),
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
        {active === "reports" ? <ReportsSectionPanel section="overview">
          <>
            <section className="reports-summary-grid reports-summary-grid--highlights reports-overview-grid">
              <article className="metric compact metric--highlight glass">
                <InfoTooltip className="reports-container-info" align="left" label="All money coming in during the selected range." />
                <div className="metric__label"><span>Income</span></div>
                <strong className="positive">{formatCurrency(currentSummary.income)}</strong>
              </article>
              <article className="metric compact metric--highlight glass">
                <ReportInfoTip className="reports-container-info" label="All spending recorded in the selected range." />
                <div className="metric__label"><span>Expenses</span></div>
                <strong className="negative">{formatCurrency(currentSummary.expense)}</strong>
              </article>
              <article className="metric compact metric--highlight glass">
                <ReportInfoTip className="reports-container-info" label="Income minus spending for the selected range." />
                <div className="metric__label"><span>Net income</span></div>
                <strong className={currentNet >= 0 ? "positive" : "negative"}>{formatSignedCurrency(currentNet)}</strong>
              </article>
              <article className="metric compact metric--highlight glass">
                <ReportInfoTip className="reports-container-info" label="The share of income left after spending." />
                <div className="metric__label"><span>Savings rate</span></div>
                <strong>{savingsRate === null ? "N/A" : `${Math.round(savingsRate * 100)}%`}</strong>
              </article>
            </section>

            <section className="reports-grid reports-grid--primary reports-overview-visual">
              <article className="report-card glass report-card--wide">
                <ReportInfoTip className="reports-container-info" label={`A ${rangeWindowText} view of how income and spending changed the net position.`} />
                <ReportsMoneyOverTimeChart
                  points={reportMoneyPoints}
                  currency={displayCurrency}
                />
              </article>
            </section>
          </>
        </ReportsSectionPanel> : null}

        {isPro ? (
          <ReportsSectionPanel section="advanced">
            <>
            <section className="reports-brief-grid reports-brief-grid--more">
              <article className="report-ai-card reports-subtab-card report-ai-card--featured report-sankey-card glass">
                <ReportsCashFlowMap
                  currency={displayCurrency}
                  accounts={sankeyAccountFlows.map((account) => ({
                    id: account.id,
                    label: account.label,
                    beginningBalance: account.beginningBalance,
                    incomeAmount: account.incomeAmount,
                    color: account.color,
                    flows: account.flows,
                  }))}
                  destinations={sankeyCategoryNodes.map((destination) => ({
                    key: destination.key,
                    label: destination.label,
                    color: destination.color,
                  }))}
                />
              </article>

              <div className="reports-brief-grid__split">
                <article className="report-ai-card reports-subtab-card report-ai-card--compact glass">
                  <ReportInfoTip className="reports-container-info" label="The biggest reasons behind the shift." />
                  <div className="report-card__head report-card__head--compact">
                    <div>
                      <h4 className="reports-subtab-title">
                        <span className="reports-subtab-title__icon" aria-hidden="true">🧭</span>
                        <span>Main Drivers</span>
                      </h4>
                    </div>
                  </div>
                  <div className="report-ai-signal-grid report-ai-signal-grid--compact">
                    {aiSignals.slice(0, 3).map((signal, index) => (
                      <div key={signal.label} className={`report-ai-signal report-ai-signal--${signal.tone}`}>
                        <span className="report-ai-signal__icon" aria-hidden="true">
                          {index === 0 && topCategoryName
                            ? <CategoryBrandMark categoryName={topCategoryName} size={28} radius={8} />
                            : index === 1
                              ? "🧾"
                              : "🔁"}
                        </span>
                        <span className="report-ai-signal__copy">
                          <span>{signal.label}</span>
                          <strong>{signal.value}</strong>
                        </span>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="report-ai-card reports-subtab-card report-ai-card--compact glass">
                  <ReportInfoTip className="reports-container-info" label="One easy action to take right now." />
                  <div className="report-card__head report-card__head--compact">
                    <div>
                      <h4 className="reports-subtab-title">
                        <span className="reports-subtab-title__icon" aria-hidden="true">✨</span>
                        <span>Next Steps</span>
                      </h4>
                    </div>
                  </div>
                  <div className="report-list">
                    {aiActions.map((action, index) => (
                      <div key={action.title} className="report-list__item report-list__item--compact">
                        <div className="report-next-step__copy">
                          <span className="report-next-step__icon" aria-hidden="true">
                            {index === 0 && topCategoryName
                              ? <CategoryBrandMark categoryName={topCategoryName} size={28} radius={8} />
                              : index === 1
                                ? "✅"
                                : "⚙️"}
                          </span>
                          <div className="report-list__meta">
                            <span>{action.body}</span>
                          </div>
                        </div>
                        <Link className="button button-primary button-small report-next-step__button" href={action.href}>
                          {action.title}
                        </Link>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            </section>

            <article className="reports-next reports-subtab-card glass">
              <div className="report-card__head report-card__head--compact">
                <h4 className="reports-subtab-title">
                  <span className="reports-subtab-title__icon" aria-hidden="true">🎯</span>
                  <span>Goal Check</span>
                </h4>
              </div>
              <h4>{goalNextStep.title}</h4>
              <p>{goalSummary}</p>
              <Link className="button button-primary button-pill" href={goalNextStep.href}>
                {goalNextStep.label}
              </Link>
            </article>
            </>
          </ReportsSectionPanel>
        ) : null}

        <ReportsSectionPanel section="spending">
        <section className="reports-grid reports-grid--primary reports-grid--spending">
          <article className="report-card reports-subtab-card glass report-card--wide">
            <div className="report-card__head">
              <div className="report-card__head-title">
                <h4 className="reports-subtab-title">Where It Went</h4>
              </div>
              <ReportInfoTip className="reports-container-info" label="A simple view of where income flowed." />
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
                        href={segment.categoryName === "Other spend" ? "/transactions" : buildTransactionsHref({ category: segment.categoryName })}
                        className="report-flow-map__row report-list__item--link"
                      >
                        <div className="report-flow-map__meta">
                          <CategoryBrandMark categoryName={segment.categoryName} size={30} radius={9} />
                          <strong>{segment.categoryName}</strong>
                        </div>
                        <div className="report-flow-map__bar" aria-label={`${formatCurrency(segment.amount)}, ${formatPercent(segment.share * 100)}`}>
                          <span
                            style={{
                              width: `${Math.max((segment.amount / reportCategoryMaxAmount) * 100, 8)}%`,
                              background: segment.color.backgroundColor,
                              borderColor: segment.color.borderColor,
                            }}
                          />
                          <small className="report-flow-map__value">{formatCurrency(segment.amount)} · {formatPercent(segment.share * 100)}</small>
                        </div>
                      </Link>
                    ))}
                    {currentOtherSpend > 0 ? (
                      <div className="report-flow-map__row report-flow-map__row--other">
                        <div className="report-flow-map__meta">
                          <CategoryBrandMark categoryName="Other" size={30} radius={9} />
                          <strong>Other spend</strong>
                        </div>
                        <div className="report-flow-map__bar">
                          <span style={{ width: `${Math.max((currentOtherSpend / reportCategoryMaxAmount) * 100, 8)}%`, background: "var(--border-subtle)" }} />
                          <small className="report-flow-map__value">{formatCurrency(currentOtherSpend)} · {formatPercent((currentOtherSpend / Math.max(currentSpend, 1)) * 100)}</small>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <ReportsEmptyNote
                    title="Add categorized spending to see the flow map."
                    copy="This view becomes useful once a few transactions are categorized."
                  />
                )}
              </div>
            </div>
          </article>

          <article className="report-card reports-subtab-card glass">
            <div className="report-card__head">
              <div className="report-card__head-title">
                <h4 className="reports-subtab-title">Spending Mix</h4>
              </div>
              <ReportInfoTip className="reports-container-info" label="The biggest spending groups in this period." />
            </div>

            <div className="report-donut report-donut--pie">
              <div className="report-donut__chart" role="img" aria-label="Spending breakdown pie chart">
                <svg viewBox="0 0 240 240">
                  {reportSpendingMixSegments.length > 0
                    ? (() => {
                        let offset = 0;
                        return reportSpendingMixSegments.map((segment) => {
                          const nextOffset = offset + segment.share;
                          const wedge = (
                            <path
                              key={segment.categoryName}
                              className="report-donut__segment"
                              d={buildReportPieSlicePath(offset, nextOffset)}
                              style={{
                                fill: segment.color.borderColor,
                              }}
                            />
                          );
                          offset = nextOffset;
                          return wedge;
                        });
                      })()
                    : null}
                </svg>
              </div>

              <div className="report-donut__legend">
                {reportCategorySegments.length > 0 ? (
                  reportSpendingMixSegments.map((segment) => {
                    return (
                      <Link
                        key={segment.categoryName}
                        href={segment.categoryName === "Other spend" ? "/transactions" : buildTransactionsHref({ category: segment.categoryName })}
                        className="report-donut__legend-item report-list__item--link"
                      >
                        <CategoryBrandMark categoryName={segment.categoryName} size={32} radius={10} />
                        <div className="report-donut__meta">
                          <strong>{segment.categoryName}</strong>
                          <span>
                            {formatCurrency(segment.amount)} · {formatPercent(segment.share * 100)}
                          </span>
                        </div>
                      </Link>
                    );
                  })
                ) : (
                  <ReportsEmptyNote
                    title="No spending mix yet."
                    copy="Once you categorize a few expenses, the donut chart will fill in."
                  />
                )}
              </div>
            </div>

          </article>
        </section>
        </ReportsSectionPanel>

        <ReportsSectionPanel section="trends">
        <section className="reports-grid reports-grid--trends">
          {spendingPace ? (
            <SpendingPaceCard
              currency={spendingPaceCurrency}
              currentLabel={spendingPace.currentLabel}
              previousLabel={spendingPace.previousLabel}
              comparableDay={spendingPace.comparableDay}
              latestDateLabel={formatShortDate(spendingPace.anchorDate)}
              currentTotal={spendingPace.currentTotal}
              previousTotal={spendingPace.previousTotal}
              currentDailyAverage={spendingPace.currentDailyAverage}
              previousDailyAverage={spendingPace.previousDailyAverage}
              deltaPercent={spendingPace.deltaPercent}
              points={spendingPace.points}
              drivers={spendingPace.drivers.map((driver) => ({
                ...driver,
                href: buildTransactionsHref({
                  category: driver.category,
                  customStart: spendingPace.currentMonthStart.toISOString().slice(0, 10),
                  customEnd: spendingPace.currentComparableEnd.toISOString().slice(0, 10),
                }),
              }))}
              transactionsHref={buildTransactionsHref({
                customStart: spendingPace.currentMonthStart.toISOString().slice(0, 10),
                customEnd: spendingPace.currentComparableEnd.toISOString().slice(0, 10),
              })}
              adviserHref={`/adviser?prompt=${encodeURIComponent(
                `My cumulative spending is ${formatCurrency(spendingPace.currentTotal, spendingPaceCurrency)} through day ${spendingPace.comparableDay} of ${spendingPace.currentLabel}, compared with ${formatCurrency(spendingPace.previousTotal, spendingPaceCurrency)} through the same point in ${spendingPace.previousLabel}. Explain what changed, consider my budgets and recurring obligations, and suggest what I should review first.`
              )}`}
            />
          ) : (
            <article className="report-card reports-subtab-card glass">
              <ReportsEmptyNote title="No spending pace yet." copy="Add or import expenses to compare cumulative spending with the same days last month." />
            </article>
          )}
          <article className="report-card reports-subtab-card glass">
            <div className="report-card__head">
              <div className="report-card__head-title">
                <h4 className="reports-subtab-title">Weekly Summary</h4>
              </div>
              <ReportInfoTip className="reports-container-info" label="A quick look at this week versus the previous seven days." />
            </div>

            <div className="report-insight-grid">
              <div className="report-insight report-insight--income">
                <span>Gross inflow</span>
                <strong className="positive">{formatCurrency(weeklySummary.income)}</strong>
                <small>{weeklySummaryLabel}</small>
              </div>
              <div className="report-insight report-insight--expense">
                <span>Gross outflow</span>
                <strong className="negative">{formatCurrency(weeklySummary.expense)}</strong>
                <small>All tracked expenses</small>
              </div>
              <div className="report-insight">
                <span>Net position</span>
                <strong className={weeklyNet >= 0 ? "positive" : "negative"}>{formatSignedCurrency(weeklyNet)}</strong>
                <small>Income minus spending</small>
              </div>
              <div className="report-insight">
                <span>Week-over-week delta</span>
                <strong className={weeklyNetChange >= 0 ? "positive" : "negative"}>{formatSignedCurrency(weeklyNetChange)}</strong>
                <small>{formatShortDate(previousWeeklySummaryStart)} - {formatShortDate(previousWeeklySummaryEnd)}</small>
              </div>
            </div>
            <ReportsPeriodComparisonChart
              points={weeklyTrendPoints}
              currency={displayCurrency}
              label="Recent weekly summary"
            />
            <div className="report-subsection report-subsection--compact">
              <Link
                className="button button-primary button-small reports-trend-open-button"
                href={buildTransactionsHref({
                  customStart: weeklySummaryStart.toISOString().slice(0, 10),
                  customEnd: weeklySummaryEnd.toISOString().slice(0, 10),
                })}
              >
                Open this week
              </Link>
            </div>
          </article>

          <article className="report-card reports-subtab-card glass">
            <div className="report-card__head">
              <div className="report-card__head-title">
                <h4 className="reports-subtab-title">Monthly Summary</h4>
              </div>
              <ReportInfoTip className="reports-container-info" label="A quick look at this month versus the last one." />
            </div>

            <div className="report-insight-grid">
              <div className="report-insight report-insight--income">
                <span>Gross inflow</span>
                <strong className="positive">{formatCurrency(currentMonthBucket.income)}</strong>
                <small>{currentMonthBucket.label}</small>
              </div>
              <div className="report-insight report-insight--expense">
                <span>Gross outflow</span>
                <strong className="negative">{formatCurrency(currentMonthBucket.expense)}</strong>
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
            <ReportsPeriodComparisonChart
              points={monthlyTrendPoints}
              currency={displayCurrency}
              label="Recent monthly summary"
            />
            <div className="report-subsection report-subsection--compact">
              <Link className="button button-primary button-small reports-trend-open-button" href={buildTransactionsHref({ month: currentMonthBucket.key })}>
                Open this month
              </Link>
            </div>
          </article>

          <article className="report-card reports-subtab-card glass">
            <div className="report-card__head">
              <div className="report-card__head-title">
                <h4 className="reports-subtab-title">Repeat Bills</h4>
              </div>
              <ReportInfoTip className="reports-container-info" label="Bills and merchants that tend to show up again." />
            </div>

            <div className="report-list">
              {recurringMerchants.length > 0 ? (
                recurringMerchants.map((merchant) => (
                  <Link
                    key={merchant.label}
                    href={buildTransactionsHref({ merchant: merchant.label })}
                    className="report-list__item report-list__item--link report-list__item--ranked-merchant"
                  >
                    <div className="report-list__meta">
                      <strong>{merchant.label}</strong>
                      <span>
                        {formatCurrency(merchant.amount)} · {merchant.count} transaction{merchant.count === 1 ? "" : "s"}
                      </span>
                      <small>
                        {merchant.cadenceLabel}
                        {merchant.nextDueDate ? ` · next due ${formatShortDate(merchant.nextDueDate)}` : ""}
                      </small>
                    </div>
                  </Link>
                ))
              ) : (
                <ReportsEmptyNote
                  title="No repeat bills yet."
                  copy="More transactions will reveal subscriptions and bills that show up again."
                />
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

          <article className="report-card reports-subtab-card glass">
            <div className="report-card__head">
              <div className="report-card__head-title">
                <h4 className="reports-subtab-title">Biggest Merchants</h4>
              </div>
              <ReportInfoTip className="reports-container-info" label="The merchants taking the biggest share of spend." />
            </div>

            <div className="report-list report-list--merchant-table">
              {topMerchants.length > 0 ? (
                topMerchants.map((merchant, index) => (
                  <Link
                    key={merchant.label}
                    href={buildTransactionsHref({ merchant: merchant.label })}
                    className="report-list__item report-list__item--link report-list__item--ranked-merchant report-list__item--merchant-table"
                  >
                    <span className="report-merchant-rank" aria-hidden="true">{index + 1}</span>
                    <div className="report-merchant-details">
                      <CategoryBrandMark categoryName={merchant.categoryName} size={30} radius={9} />
                      <div className="report-list__meta">
                        <strong>{merchant.label}</strong>
                        <span>
                          {formatCurrency(merchant.amount)} · {merchant.count} transaction{merchant.count === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))
              ) : (
                <ReportsEmptyNote
                  title="No top merchants yet."
                  copy="Add more activity and the biggest spenders will show up here."
                />
              )}
            </div>
          </article>
        </section>
        </ReportsSectionPanel>

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

async function ReportsPageStream({ searchParams }: { searchParams?: Promise<{ range?: string; section?: string; filter?: string; from?: string; to?: string; currency?: string }> }) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const session = await getPageSessionContext();
  const user = await getOrCreateCurrentUser(session.userId);
  if (!session.isGuest && !hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }

  const reportWindow = resolveReportWindow(
    getCalendarDayEndInTimeZone(new Date(), normalizeRegionalPreferences(user.regionalPreferences).timeZone),
    resolvedSearchParams,
  );
  const selectedRange = reportWindow.range;
  const selectedRangeLabel = reportWindow.label;
  const requestedSection = normalizeReportsSection(resolvedSearchParams?.section);
  const isPro = hasFullFeatureAccess(user.planTier);
  const sectionTabs: ReportsSection[] = isPro ? ["overview", "spending", "trends", "advanced"] : ["overview", "spending", "trends"];
  const initialSection = isPro || requestedSection !== "advanced" ? requestedSection : "overview";

  return (
    <ReportsTabsProvider initialSection={initialSection} availableSections={sectionTabs}>
      <CloverShell
        active="reports"
        title="Reports"
        titleAddon={<ReportsTopTabs />}
        mobileSubheader={<ReportsTopTabs />}
        mobileLeadingAction={<AdviserHeaderLink />}
        actions={
          <div className="reports-page__actions">
            <AdviserHeaderLink />
            <ReportsCurrencyFilter currentCurrency={resolvedSearchParams?.currency?.trim().toUpperCase()} />
            <ReportsRangeMenu
              currentRange={selectedRange}
              currentRangeLabel={selectedRangeLabel}
              currentFrom={reportWindow.from}
              currentTo={reportWindow.to}
            />
          </div>
        }
      >
        <ReportsStream
          active="reports"
          searchParams={resolvedSearchParams}
          user={user}
          sessionIsGuest={session.isGuest}
        />
      </CloverShell>
    </ReportsTabsProvider>
  );
}

export default function ReportsPage({ searchParams }: { searchParams?: Promise<{ range?: string; section?: string; filter?: string; from?: string; to?: string; currency?: string }> }) {
  return <RouteSplash label="reports"><ReportsPageStream searchParams={searchParams} /></RouteSplash>;
}
