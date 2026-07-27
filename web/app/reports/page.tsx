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
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";
import { getGoalPlanSummary, getGoalProgressSnapshot, normalizeGoalPlan, type GoalKey } from "@/lib/goals";
import { RouteSplash } from "@/components/route-splash";
import { CloverLoadingScreen } from "@/components/clover-loading-screen";
import { formatCurrencyAmount, formatCurrencyCode } from "@/lib/currency-format";
import { recordAppError } from "@/lib/error-logs";
import { InfoTooltip as ReportInfoTip } from "@/components/info-tooltip";
import { InfoTooltip } from "@/components/info-tooltip";
import { getCategoryIconTone } from "@/lib/category-icons";
import { getEffectiveTransactionCategoryName } from "@/lib/transaction-display";
import { coerceTransactionTypeFromCategoryName } from "@/lib/transaction-directions";
import { repairWorkspaceDataVisibility } from "@/lib/reconciliation";
import { buildVisibleWorkspaceTransactionWhere } from "@/lib/transaction-query";
import { hasFullFeatureAccess } from "@/lib/beta-access";

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

const getReadableTextColor = (backgroundColor: string) => {
  const channels = backgroundColor.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length < 3) {
    return "#07111d";
  }

  const [red = 0, green = 0, blue = 0] = channels;
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.58 ? "#07111d" : "#f8fafc";
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
    name: string;
    institution: string | null;
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
  coerceTransactionTypeFromCategoryName(
    getReportTransactionCategoryName(transaction),
    transaction.type,
    transaction.amount,
    transaction.isTransfer
  );

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

const isReportSpendingTransaction = (transaction: ReportTransaction) => {
  if (getReportTransactionType(transaction) !== "expense") {
    return false;
  }

  const categoryName = getReportTransactionCategoryName(transaction).trim().toLowerCase();
  return !reportSankeyExcludedCategoryNames.has(categoryName);
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
type ReportsSection = "overview" | "spending" | "trends" | "advanced";

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

const normalizeReportsSection = (value: string | undefined): ReportsSection => {
  if (value === "spending" || value === "trends" || value === "advanced") {
    return value;
  }

  return "overview";
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

const getWorkspaceReportRowCount = (
  workspace: { id: string; _count: { transactions: number } },
  parsedRowsByWorkspaceId: Map<string, number>
) => workspace._count.transactions + (parsedRowsByWorkspaceId.get(workspace.id) ?? 0);

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
    importFile: {
      account: {
        name: string;
        institution: string | null;
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
          name: row.importFile?.account?.name ?? row.accountName ?? "Imported account",
          institution: row.importFile?.account?.institution ?? row.institution,
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
}: {
  active?: "reports" | "adviser";
  searchParams?: { range?: string; section?: string; filter?: string };
}) {
  const cookieStore = await cookies();
  const selectedWorkspaceCookieId = cookieStore.get(selectedWorkspaceKey)?.value ?? "";
  const selectedRange = normalizeReportsRange(searchParams?.range);
  const selectedRangeLabel = reportsRangeLabels[selectedRange];
  const rangeWindowText = selectedRange === "ytd" ? "year-to-date" : selectedRangeLabel.toLowerCase();
  const requestedSection = normalizeReportsSection(searchParams?.section);

  const session = await getSessionContext();
  const existingUser = await prisma.user.findUnique({
    where: { clerkUserId: session.userId },
  });
  const user = existingUser ?? (await getOrCreateCurrentUser(session.userId));
  const isPro = hasFullFeatureAccess(user.planTier);
  const initialSection = isPro || requestedSection !== "advanced" ? requestedSection : "overview";
  const sectionTabs: ReportsSection[] = isPro ? ["overview", "spending", "trends", "advanced"] : ["overview", "spending", "trends"];
  const needsSpendingData = true;
  const needsTrendData = true;
  const needsAdvancedData = isPro;
  if (!session.isGuest && !hasCompletedOnboarding(user)) {
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
      _count: {
        select: {
          accounts: true,
          importFiles: true,
          transactions: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const parsedRowCounts = await prisma.parsedTransaction
    .groupBy({
      by: ["workspaceId"],
      where: {
        workspaceId: { in: userWorkspaces.map((workspace) => workspace.id) },
        date: { not: null },
        amount: { not: null },
      },
      _count: { _all: true },
    })
    .catch(() => []);
  const parsedRowsByWorkspaceId = new Map(
    parsedRowCounts.map((row) => [row.workspaceId, Number(row._count._all ?? 0)])
  );
  const cookieWorkspace = selectedWorkspaceCookieId
    ? userWorkspaces.find((workspace) => workspace.id === selectedWorkspaceCookieId) ?? null
    : null;
  const workspaceWithMostData =
    [...userWorkspaces].sort((left, right) => {
      const transactionGap =
        getWorkspaceReportRowCount(right, parsedRowsByWorkspaceId) -
        getWorkspaceReportRowCount(left, parsedRowsByWorkspaceId);
      if (transactionGap !== 0) {
        return transactionGap;
      }

      const importGap = right._count.importFiles - left._count.importFiles;
      if (importGap !== 0) {
        return importGap;
      }

      return right._count.accounts - left._count.accounts;
    })[0] ?? null;
  const activeWorkspace =
    cookieWorkspace &&
    (getWorkspaceReportRowCount(cookieWorkspace, parsedRowsByWorkspaceId) > 0 ||
      ((workspaceWithMostData ? getWorkspaceReportRowCount(workspaceWithMostData, parsedRowsByWorkspaceId) : 0) === 0 &&
        (cookieWorkspace._count.importFiles > 0 || cookieWorkspace._count.accounts > 1)))
      ? cookieWorkspace
      : workspaceWithMostData ?? cookieWorkspace;

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

  await repairWorkspaceDataVisibility(selectedWorkspaceId).catch((error) => {
    console.warn("[reports] unable to repair workspace data visibility", {
      workspaceId: selectedWorkspaceId,
      error,
    });
  });

  try {
    const now = new Date();
    const { currentStart: currentWindowStart, previousStart: previousWindowStart } = getReportWindow(now, selectedRange);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      reportTransactions,
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
        where: buildVisibleWorkspaceTransactionWhere(selectedWorkspaceId, {
          isExcluded: false,
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
              name: true,
              institution: true,
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
      needsAdvancedData
        ? prisma.transaction.aggregate({
            where: buildVisibleWorkspaceTransactionWhere(selectedWorkspaceId, {
              isExcluded: false,
              importFileId: { not: null },
            }),
            _count: { id: true },
            _sum: { amount: true },
          })
        : Promise.resolve({ _count: { id: 0 }, _sum: { amount: 0 } }),
      needsAdvancedData
        ? prisma.transaction.aggregate({
            where: buildVisibleWorkspaceTransactionWhere(selectedWorkspaceId, {
              isExcluded: false,
              importFileId: null,
            }),
            _count: { id: true },
            _sum: { amount: true },
          })
        : Promise.resolve({ _count: { id: 0 }, _sum: { amount: 0 } }),
      needsAdvancedData
        ? prisma.account.aggregate({
            where: {
              workspaceId: selectedWorkspaceId,
            },
            _sum: { balance: true },
            _count: { id: true, balance: true },
          })
        : Promise.resolve({ _sum: { balance: 0 }, _count: { id: 0, balance: 0 } }),
      needsAdvancedData
        ? (prisma.account.findMany({
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
          }) as Promise<WorkspaceAccountSnapshot[]>)
        : Promise.resolve([] as WorkspaceAccountSnapshot[]),
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
      needsAdvancedData ? prisma.importFile.count({ where: { workspaceId: selectedWorkspaceId, status: "processing" } }) : Promise.resolve(0),
      needsAdvancedData ? prisma.importFile.count({ where: { workspaceId: selectedWorkspaceId, status: "done" } }) : Promise.resolve(0),
      needsAdvancedData ? prisma.importFile.count({ where: { workspaceId: selectedWorkspaceId, status: "failed" } }) : Promise.resolve(0),
      needsAdvancedData ? prisma.importFile.count({ where: { workspaceId: selectedWorkspaceId, status: "deleted" } }) : Promise.resolve(0),
    ]);

    const importStatusCounts = {
      processing: Number(processingImportCount ?? 0),
      done: Number(doneImportCount ?? 0),
      failed: Number(failedImportCount ?? 0),
      deleted: Number(deletedImportCount ?? 0),
    };
    const normalizedReportTransactions = Array.isArray(reportTransactions) ? reportTransactions.filter(isDefined) : [];
    const normalizedImportFileIds = new Set(
      normalizedReportTransactions.flatMap((transaction) => (transaction.importFileId ? [transaction.importFileId] : []))
    );
    const parsedReportRows = await prisma.parsedTransaction
      .findMany({
        where: {
          workspaceId: selectedWorkspaceId,
          date: { not: null },
          amount: { not: null },
          importFileId: normalizedImportFileIds.size > 0 ? { notIn: Array.from(normalizedImportFileIds) } : undefined,
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
          importFile: {
            select: {
              account: {
                select: {
                  name: true,
                  institution: true,
                },
              },
            },
          },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      })
      .catch(() => []);
    const reportAllTransactions = [
      ...normalizedReportTransactions,
      ...mapParsedRowsToReportTransactions(parsedReportRows),
    ].sort((left, right) => right.date.getTime() - left.date.getTime());
    const requestedFilter = searchParams?.filter?.trim().toLowerCase() ?? "";
    const reportScopedTransactions = requestedFilter
      ? reportAllTransactions.filter((transaction) => {
          const category = getReportTransactionCategoryName(transaction).toLowerCase();
          const merchant = normalizeMerchant(transaction.merchantClean ?? transaction.merchantRaw).toLowerCase();
          const account = transaction.account.name.toLowerCase();
          return category.includes(requestedFilter) || merchant.includes(requestedFilter) || account.includes(requestedFilter);
        })
      : reportAllTransactions;
    const reportCurrentWindowTransactions = reportScopedTransactions.filter((transaction) => transaction.date >= currentWindowStart);
    const reportPreviousWindowTransactions = reportScopedTransactions.filter(
      (transaction) => transaction.date >= previousWindowStart && transaction.date < currentWindowStart
    );
    const reportSixMonthTransactions = reportScopedTransactions.filter((transaction) => transaction.date >= sixMonthsAgo);
    const reportDisplayTransactions =
      reportCurrentWindowTransactions.length > 0
        ? reportCurrentWindowTransactions
        : reportSixMonthTransactions.length > 0
          ? reportSixMonthTransactions
          : reportAllTransactions;
    const reportTrendTransactions =
      reportSixMonthTransactions.length > 0 ? reportSixMonthTransactions : reportDisplayTransactions;
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
    const isEmptyWorkspace = accountStatsCountId <= 1 && reportDisplayTransactions.length === 0 && Object.values(importStatusCounts).every((count) => count === 0);
    const reportFallbackNotice =
      reportCurrentWindowTransactions.length === 0 && reportDisplayTransactions.length > 0
        ? "No activity in the selected range yet. Showing the latest available transactions instead."
        : null;
    const reportHistoricalTransactions = reportScopedTransactions.filter((transaction) => transaction.date < currentWindowStart);

    const currentSummary: WindowSummary = reportDisplayTransactions.reduce(
      (accumulator, transaction) => {
        const magnitude = toReportMagnitude(transaction.amount);
        const transactionType = getReportTransactionType(transaction);
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
        const transactionType = getReportTransactionType(row);
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

    const monthBuckets = getMonthBuckets(reportTrendTransactions[0]?.date ?? reportAllTransactions[0]?.date ?? now);
    reportTrendTransactions.forEach((transaction) => {
      const bucket = bucketMonth(transaction.date, monthBuckets);
      if (!bucket) {
        return;
      }

      const amount = toReportMagnitude(transaction.amount);
      const transactionType = getReportTransactionType(transaction);
      if (transactionType === "income") {
        bucket.income += amount;
      } else if (transactionType === "expense") {
        bucket.expense += amount;
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
              currency: typeof account.currency === "string" && account.currency.trim().length > 0 ? account.currency : "MIXED",
              type: typeof account.type === "string" && account.type.trim().length > 0 ? account.type : "account",
            },
          ];
        })
      : [];
    const currencyCandidates = new Set(
      workspaceAccountSummaries.map((account) => formatCurrencyCode(account.currency)).filter((currency) => currency.length > 0)
    );
    const displayCurrency = currencyCandidates.size === 1 ? Array.from(currencyCandidates)[0] : "MIXED";
    const formatCurrency = (value: number, currency: string | null = displayCurrency) => formatCurrencyAmount(value, currency);
    const formatSignedCurrency = (value: number, currency: string | null = displayCurrency) =>
      `${value < 0 ? "-" : ""}${formatCurrencyAmount(Math.abs(value), currency)}`;
    const totalAccountBalance = Number(accountStatsSummary._sum?.balance ?? 0);
    const activeAccountCount = Number(accountStatsSummary._count?.balance ?? 0);
    const accountCount = Number(accountStatsSummary._count?.id ?? 0);
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
    const savingsRate = currentSummary.income > 0 ? currentNet / currentSummary.income : null;
    const spendDelta = previousSpend > 0 ? ((currentSpend - previousSpend) / previousSpend) * 100 : null;
    const incomeDelta = previousSummary.income > 0 ? ((currentSummary.income - previousSummary.income) / previousSummary.income) * 100 : null;

    const reportExpenseTransactions = reportDisplayTransactions.filter(isReportSpendingTransaction);
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
    const reportExpenseTopCategories = reportExpenseCategoryEntries.slice(0, 5);
    const reportSpentTotal = reportExpenseTotal > 0 ? reportExpenseTotal : currentSpend;

    const reportSankeyIncomeTransactions = reportDisplayTransactions.filter((transaction) => getReportTransactionType(transaction) === "income");
    const reportSankeyExpenseTransactions = reportExpenseTransactions;
    const reportSankeyAccountIncome = new Map<
      string,
      {
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
      const accountLabel = transaction.account.name?.trim().length > 0 ? transaction.account.name : "Account";
      const key = normalizeMerchant(accountLabel);
      const existing = reportSankeyAccountIncome.get(key) ?? { label: accountLabel, amount: 0 };
      existing.amount += Math.abs(Number(transaction.amount));
      reportSankeyAccountIncome.set(key, existing);
    });

    reportSankeyExpenseTransactions.forEach((transaction) => {
      const accountLabel = transaction.account.name?.trim().length > 0 ? transaction.account.name : "Account";
      const accountKey = normalizeMerchant(accountLabel);
      if (!reportSankeyAccountIncome.has(accountKey)) {
        reportSankeyAccountIncome.set(accountKey, { label: accountLabel, amount: 0 });
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

    const reportSankeyAccounts = Array.from(reportSankeyAccountIncome.values())
      .map((account) => {
        const expenseAmount = Array.from(reportSankeyAccountExpenseByCategory.get(normalizeMerchant(account.label))?.values() ?? []).reduce(
          (sum, category) => sum + category.amount,
          0
        );
        return {
          ...account,
          incomeAmount: account.amount,
          amount: Math.max(account.amount, expenseAmount),
          expenseAmount,
        };
      })
      .filter((account) => account.amount > 0 || account.expenseAmount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);

    const reportSankeyCategories = Array.from(reportSankeyCategoryTotals.values())
      .filter((category) => category.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);

    const reportSankeyCategoryColorByKey = new Map(
      reportSankeyCategories.map((category) => [normalizeMerchant(category.label), getCategoryIconTone(category.label)])
    );

    const sankeyIncomeAmount = reportSankeyAccounts.reduce((sum, account) => sum + account.amount, 0);
    const sankeyExpenseAmount = reportSankeyCategories.reduce((sum, category) => sum + category.amount, 0);
    const sankeyBarWidth = 18;
    const sankeyNodeHeight = 34;
    const sankeyNodeGap = 20;
    const sankeyAccountNodes = reportSankeyAccounts;
    const sankeyCategoryNodes = reportSankeyCategories.map((category) => ({
      ...category,
      color: reportSankeyCategoryColorByKey.get(normalizeMerchant(category.label)) ?? getCategoryIconTone(category.label),
    }));
    const sankeyChartHeight = Math.max(300, Math.max(sankeyAccountNodes.length, sankeyCategoryNodes.length) * (sankeyNodeHeight + sankeyNodeGap) + 42);
    const sankeyChartWidth = 980;
    const sankeyIncomeX = 28;
    const sankeyAccountX = 356;
    const sankeyCategoryX = 730;
    const sankeySourceWidth = Math.min(190, Math.max(96, sankeyAccountNodes.length * 30));
    const sankeyIncomeColumnTop = (sankeyChartHeight - sankeySourceWidth) / 2;
    const layoutSankeyColumn = <T,>(nodes: T[]) => {
      const totalHeight = nodes.length * sankeyNodeHeight + Math.max(nodes.length - 1, 0) * sankeyNodeGap;
      const top = Math.max(20, (sankeyChartHeight - totalHeight) / 2);
      return nodes.map((node, index) => ({
        ...node,
        y: top + index * (sankeyNodeHeight + sankeyNodeGap),
        height: sankeyNodeHeight,
      }));
    };
    const sankeyAccountLayouts = layoutSankeyColumn(sankeyAccountNodes);
    const sankeyCategoryLayouts = layoutSankeyColumn(sankeyCategoryNodes);

    const sankeyCategoryLayoutByKey = new Map(sankeyCategoryLayouts.map((category) => [normalizeMerchant(category.label), category]));
    const sankeyIncomeLinks = sankeyAccountLayouts.map((account, index) => {
      const sourceY = sankeyIncomeColumnTop + ((index + 0.5) / Math.max(sankeyAccountLayouts.length, 1)) * sankeySourceWidth;
      return {
        key: account.label,
        amount: account.amount,
        sourceY,
        targetY: account.y + account.height / 2,
        height: 8 + 22 * Math.sqrt(account.amount / Math.max(sankeyIncomeAmount, 1)),
      };
    });

    const sankeyCategoryLinks = sankeyAccountLayouts.flatMap((account) => {
      const accountExpenses = Array.from(reportSankeyAccountExpenseByCategory.get(normalizeMerchant(account.label))?.values() ?? []).filter(
        (entry) => entry.amount > 0 && sankeyCategoryLayoutByKey.has(normalizeMerchant(entry.label))
      );
      return accountExpenses.map((entry, index) => {
        const categoryLayout = sankeyCategoryLayoutByKey.get(normalizeMerchant(entry.label));

        return {
          key: `${account.label}:${entry.label}`,
          accountLabel: account.label,
          categoryLabel: entry.label,
          amount: entry.amount,
          sourceY: account.y + ((index + 0.5) / Math.max(accountExpenses.length, 1)) * account.height,
          targetY: (categoryLayout?.y ?? 20) + (categoryLayout?.height ?? sankeyNodeHeight) / 2,
          height: 6 + 20 * Math.sqrt(entry.amount / Math.max(sankeyExpenseAmount, 1)),
          color: categoryLayout?.color.borderColor ?? getCategoryIconTone(entry.label).borderColor,
        };
      });
    });

    const sankeyLegendCategories = reportSankeyCategories.map((category) => ({
      ...category,
      color: reportSankeyCategoryColorByKey.get(normalizeMerchant(category.label)) ?? getCategoryIconTone(category.label),
    }));
    const buildSankeyCurve = (startX: number, startY: number, endX: number, endY: number) => {
      const controlX = startX + (endX - startX) * 0.45;
      const controlX2 = startX + (endX - startX) * 0.55;
      return `M ${startX.toFixed(1)} ${startY.toFixed(1)} C ${controlX.toFixed(1)} ${startY.toFixed(1)} ${controlX2.toFixed(1)} ${endY.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}`;
    };

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
    const goalPlanSummary = getGoalPlanSummary(
      currentGoalPlan,
      currentSummary.income > 0 ? currentSummary.income : null,
      displayCurrency
    );

    const reportRecentTransactions = reportCurrentWindowTransactions.length > 0 ? reportCurrentWindowTransactions : reportDisplayTransactions;
    const reportRecentExpenseTransactions = reportRecentTransactions.filter(
      (transaction) => getReportTransactionType(transaction) === "expense" && isReportMerchantEligible(transaction)
    );
    const reportHistoricalExpenseTransactions = reportHistoricalTransactions.filter(
      (transaction) => getReportTransactionType(transaction) === "expense" && isReportMerchantEligible(transaction)
    );

    const recentMerchantSpend = new Map<
      string,
      {
        label: string;
        amount: number;
        count: number;
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
      const label = transaction.merchantClean ?? transaction.merchantRaw;
      const key = normalizeMerchant(label);
      const existing = recentMerchantSpend.get(key) ?? { label, amount: 0, count: 0 };
      existing.amount += Math.abs(Number(transaction.amount));
      existing.count += 1;
      recentMerchantSpend.set(key, existing);
    });

    reportHistoricalExpenseTransactions.forEach((transaction) => {
      const label = transaction.merchantClean ?? transaction.merchantRaw;
      const key = normalizeMerchant(label);
      const existing = historicalMerchantSpend.get(key) ?? { label, amount: 0, count: 0 };
      existing.amount += Math.abs(Number(transaction.amount));
      existing.count += 1;
      historicalMerchantSpend.set(key, existing);
    });

    const topMerchants = Array.from(recentMerchantSpend.values()).sort((a, b) => b.amount - a.amount).slice(0, 5);
    const merchantMovements = Array.from(recentMerchantSpend.values())
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
    const weeklySummaryEnd = reportTrendTransactions[0]?.date ?? reportAllTransactions[0]?.date ?? now;
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
          const transactionType = getReportTransactionType(transaction);
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
    const reportCategorySegments = reportExpenseTopCategories.map(([categoryName, amount]) => ({
      categoryName,
      amount,
      share: reportExpenseTotal > 0 ? amount / reportExpenseTotal : 0,
      color: getCategoryIconTone(categoryName),
    }));
    const currentTrackedCategorySpend = reportExpenseTopCategories.reduce((sum, [, amount]) => sum + amount, 0);
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
          if (getReportTransactionType(transaction) !== "expense") {
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
      previousSavingsRate: previousSummary.income > 0 ? (previousSummary.income - previousSummary.expense) / previousSummary.income : null,
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
        {active === "reports" ? <ReportsSectionPanel section="overview">
          <>
            <section className="reports-summary-grid reports-summary-grid--highlights reports-overview-grid">
              <article className="metric compact metric--highlight glass">
                <InfoTooltip className="reports-container-info" align="left" label="All money coming in during the selected range." />
                <div className="metric__label"><span>Income</span></div>
                <strong>{formatCurrency(currentSummary.income)}</strong>
              </article>
              <article className="metric compact metric--highlight glass">
                <ReportInfoTip className="reports-container-info" label="All spending recorded in the selected range." />
                <div className="metric__label"><span>Expenses</span></div>
                <strong>{formatCurrency(currentSummary.expense)}</strong>
              </article>
              <article className="metric compact metric--highlight glass">
                <ReportInfoTip className="reports-container-info" label="Income minus spending for the selected range." />
                <div className="metric__label"><span>Net income</span></div>
                <strong className={currentNet >= 0 ? "positive" : "negative"}>{formatSignedCurrency(currentNet)}</strong>
              </article>
              <article className="metric compact metric--highlight glass">
                <ReportInfoTip className="reports-container-info" label="The share of income left after spending." />
                <div className="metric__label"><span>Savings rate</span></div>
                <strong>{savingsRate === null ? "N/A" : formatPercent(savingsRate * 100)}</strong>
              </article>
            </section>

            <section className="reports-grid reports-grid--primary reports-overview-visual">
              <article className="report-card glass report-card--wide">
                <ReportInfoTip className="reports-container-info" label={`A ${reportCurrentWindowTransactions.length > 0 ? rangeWindowText : "latest available activity"} view of how the balance moved.`} />
                <div className="report-card__head">
                  <div className="report-card__head-title">
                    <h4>Money over time</h4>
                  </div>
                  <div className="report-card__stat">
                    <strong className={currentNet >= 0 ? "positive" : "negative"}>{formatSignedCurrency(currentNet)}</strong>
                    <span>{reportCurrentWindowTransactions.length > 0 ? selectedRangeLabel : "Latest available"}</span>
                  </div>
                </div>

                <div className="report-chart report-chart--overview">
                  <svg className="report-chart__svg" viewBox={`0 0 ${reportChartWidth} ${reportChartHeight}`} role="img" aria-label="Cash flow trend chart">
                    <defs>
                      <linearGradient id="reportCashFlowFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="rgba(3, 168, 192, 0.22)" />
                        <stop offset="100%" stopColor="rgba(3, 168, 192, 0.03)" />
                      </linearGradient>
                    </defs>
                    <g aria-hidden="true">
                      {[0.25, 0.5, 0.75].map((fraction) => {
                        const y = reportChartPadding + reportChartYSpan * fraction;
                        return <line key={fraction} x1={reportChartPadding} y1={y} x2={reportChartWidth - reportChartPadding} y2={y} className="report-chart__gridline" />;
                      })}
                      <path
                        d={`${reportCashFlowPath} L ${reportChartWidth - reportChartPadding} ${reportChartHeight - reportChartPadding} L ${reportChartPadding} ${reportChartHeight - reportChartPadding} Z`}
                        className="report-chart__area"
                      />
                      <path d={reportCashFlowPath} className={`report-chart__line ${currentNet >= 0 ? "report-chart__line--positive" : "report-chart__line--negative"}`} />
                      {reportCashFlowPoints.map((point) => (
                        <circle
                          key={point.key}
                          cx={point.x}
                          cy={point.y}
                          r="4"
                          className="report-chart__point"
                          style={{ stroke: currentNet >= 0 ? "var(--good)" : "#f97316" }}
                        />
                      ))}
                    </g>
                  </svg>
                  <div className="report-chart__labels report-chart__labels--six">
                    {reportCashFlowPoints.map((bucket) => (
                      <div key={bucket.key} className="report-chart__label">
                        <span>{bucket.label}</span>
                        <strong className={bucket.net >= 0 ? "positive" : "negative"}>{formatSignedCurrency(bucket.net)}</strong>
                      </div>
                    ))}
                  </div>
                  {reportFallbackNotice ? (
                    <div className="reports-data-note reports-data-note--inline">
                      <strong>{reportFallbackNotice}</strong>
                    </div>
                  ) : null}
                </div>
              </article>
            </section>
          </>
        </ReportsSectionPanel> : null}

        {isPro ? (
          <ReportsSectionPanel section="advanced">
            <>
            <section className="reports-brief-grid reports-brief-grid--more">
              <article className="report-ai-card reports-subtab-card report-ai-card--featured report-sankey-card glass">
                <ReportInfoTip className="reports-container-info" label="A Sankey view of how income flows into accounts and then into spending categories." />
                <div className="report-card__head report-card__head--compact">
                  <div>
                    <h4 className="reports-subtab-title">🗺️ Cash flow map</h4>
                  </div>
                </div>

                {sankeyIncomeLinks.length > 0 ? (
                  <>
                    <div className="report-sankey__chart-wrap">
                      <svg
                        className="report-sankey__svg"
                        viewBox={`0 0 ${sankeyChartWidth} ${sankeyChartHeight}`}
                        role="img"
                        aria-label="Cash flow Sankey diagram"
                      >
                        {sankeyIncomeLinks.map((link, index) => (
                          <path
                            key={`${link.key}-income`}
                            d={buildSankeyCurve(
                              sankeyIncomeX + sankeyBarWidth,
                              link.sourceY,
                              sankeyAccountX,
                              link.targetY
                            )}
                            fill="none"
                            stroke="rgba(3, 168, 192, 0.28)"
                            strokeWidth={Math.max(link.height, 7)}
                            strokeLinecap="butt"
                            strokeLinejoin="miter"
                            opacity={index === 0 ? 0.5 : 0.36}
                          />
                        ))}

                        <rect
                          x={sankeyIncomeX}
                          y={sankeyIncomeColumnTop}
                          width={sankeyBarWidth}
                          height={sankeySourceWidth}
                          rx="0"
                          fill="rgba(3, 168, 192, 0.52)"
                        />

                        {sankeyAccountLayouts.map((account) => (
                          <g key={account.label}>
                            <rect
                              x={sankeyAccountX}
                              y={account.y}
                              width={sankeyBarWidth}
                              height={account.height}
                              rx="0"
                              fill="rgba(15, 118, 110, 0.34)"
                              stroke="rgba(15, 118, 110, 0.18)"
                            />
                            <text x={sankeyAccountX + sankeyBarWidth + 12} y={account.y + 13} className="report-sankey__target-label report-sankey__account-label">
                              <tspan x={sankeyAccountX + sankeyBarWidth + 12} className="report-sankey__target-title">
                                {account.label}
                              </tspan>
                              <tspan x={sankeyAccountX + sankeyBarWidth + 12} dy="1.15em" className="report-sankey__target-value">
                                {formatCurrency(account.incomeAmount)} in · {formatCurrency(account.expenseAmount)} out
                              </tspan>
                            </text>
                          </g>
                        ))}

                        {sankeyCategoryLinks.map((link) => (
                          <path
                            key={link.key}
                            d={buildSankeyCurve(
                              sankeyAccountX + sankeyBarWidth,
                              link.sourceY,
                              sankeyCategoryX,
                              link.targetY
                            )}
                            fill="none"
                            stroke={link.color}
                            strokeWidth={Math.max(link.height, 7)}
                            strokeLinecap="butt"
                            strokeLinejoin="miter"
                            opacity="0.4"
                          />
                        ))}

                        {sankeyCategoryLayouts.map((category) => (
                          <g key={category.label}>
                            <rect
                              x={sankeyCategoryX}
                              y={category.y}
                              width={sankeyBarWidth}
                              height={category.height}
                              rx="0"
                              fill={category.color.backgroundColor}
                              stroke={category.color.borderColor}
                            />
                            <text x={sankeyCategoryX + sankeyBarWidth + 12} y={category.y + 13} className="report-sankey__target-label">
                              <tspan x={sankeyCategoryX + sankeyBarWidth + 12} className="report-sankey__target-title">
                                {category.label}
                              </tspan>
                              <tspan x={sankeyCategoryX + sankeyBarWidth + 12} dy="1.15em" className="report-sankey__target-value">
                                {formatCurrency(category.amount)} · {formatPercent(currentSpend > 0 ? (category.amount / currentSpend) * 100 : 0)}
                              </tspan>
                            </text>
                          </g>
                        ))}

                        <text x={sankeyIncomeX + sankeyBarWidth + 12} y={sankeyIncomeColumnTop + 18} className="report-sankey__source-label">
                          Income
                        </text>
                        <text x={sankeyIncomeX + sankeyBarWidth + 12} y={sankeyIncomeColumnTop + 40} className="report-sankey__source-value">
                          {formatCurrency(currentSummary.income)}
                        </text>
                      </svg>
                    </div>

                    <div className="report-sankey__legend" aria-label="Transaction categories">
                      {sankeyLegendCategories.map((category) => (
                        <Link
                          key={category.label}
                          href={buildTransactionsHref({ category: category.label })}
                          className="report-sankey__legend-item"
                        >
                          <span className="report-sankey__swatch" style={{ background: category.color.backgroundColor, borderColor: category.color.borderColor }} />
                          <strong>{category.label}</strong>
                          <span>{formatCurrency(category.amount)}</span>
                        </Link>
                      ))}
                    </div>
                  </>
                ) : (
                  <ReportsEmptyNote
                    title="Add a little more activity to see the cash flow map."
                    copy="Once a few categories are tracked, the Sankey diagram will show how income fans out across the month."
                  />
                )}
              </article>

              <div className="reports-brief-grid__split">
                <article className="report-ai-card reports-subtab-card report-ai-card--compact glass">
                  <ReportInfoTip className="reports-container-info" label="The biggest reasons behind the shift." />
                  <div className="report-card__head report-card__head--compact">
                    <div>
                      <h4 className="reports-subtab-title">🧭 Main drivers</h4>
                    </div>
                  </div>
                  <div className="report-ai-signal-grid report-ai-signal-grid--compact">
                    {aiSignals.slice(0, 3).map((signal) => (
                      <div key={signal.label} className={`report-ai-signal report-ai-signal--${signal.tone}`}>
                        <span>{signal.label}</span>
                        <strong>{signal.value}</strong>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="report-ai-card reports-subtab-card report-ai-card--compact glass">
                  <ReportInfoTip className="reports-container-info" label="One easy action to take right now." />
                  <div className="report-card__head report-card__head--compact">
                    <div>
                      <h4 className="reports-subtab-title">✨ Next Steps</h4>
                    </div>
                  </div>
                  <div className="report-list">
                    {aiActions.map((action) => (
                      <div key={action.title} className="report-list__item report-list__item--compact">
                        <div className="report-list__meta">
                          <span>{action.body}</span>
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
              <p className="eyebrow reports-subtab-title">🎯 Goal check</p>
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
        <section className="reports-grid reports-grid--primary">
          <article className="report-card reports-subtab-card glass report-card--wide">
            <div className="report-card__head">
              <div className="report-card__head-title">
                <h4 className="reports-subtab-title">Where it went</h4>
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
                        href={buildTransactionsHref({ category: segment.categoryName })}
                        className="report-flow-map__row report-list__item--link"
                      >
                        <div className="report-flow-map__meta">
                          <strong>{segment.categoryName}</strong>
                        </div>
                        <div className="report-flow-map__bar" aria-label={`${formatCurrency(segment.amount)}, ${formatPercent(segment.share * 100)}`}>
                          <span
                            className={getReadableTextColor(segment.color.backgroundColor) === "#07111d" ? "is-light-tone" : "is-dark-tone"}
                            style={{
                              width: `${Math.max((segment.amount / reportCategoryMaxAmount) * 100, 8)}%`,
                              background: segment.color.backgroundColor,
                              borderColor: segment.color.borderColor,
                            }}
                          >
                            <small>{formatCurrency(segment.amount)} · {formatPercent(segment.share * 100)}</small>
                          </span>
                        </div>
                      </Link>
                    ))}
                    {currentOtherSpend > 0 ? (
                      <div className="report-flow-map__row report-flow-map__row--other">
                        <div className="report-flow-map__meta">
                          <strong>Other spend</strong>
                        </div>
                        <div className="report-flow-map__bar">
                          <span style={{ width: `${Math.max((currentOtherSpend / reportCategoryMaxAmount) * 100, 8)}%`, background: "var(--border-subtle)" }}>
                            <small>{formatCurrency(currentOtherSpend)} · {formatPercent((currentOtherSpend / Math.max(currentSpend, 1)) * 100)}</small>
                          </span>
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
                <h4 className="reports-subtab-title">Spending mix</h4>
              </div>
              <ReportInfoTip className="reports-container-info" label="The biggest spending groups in this period." />
            </div>

            <div className="report-donut report-donut--pie">
              <div className="report-donut__chart" role="img" aria-label="Spending breakdown donut chart">
                <svg viewBox="0 0 240 240">
                  <circle cx="120" cy="120" r="58" className="report-donut__track" />
                  {reportSpendingMixSegments.length > 0
                    ? (() => {
                        const circumference = 2 * Math.PI * 58;
                        let offset = 0;
                        return reportSpendingMixSegments.map((segment) => {
                          const dashLength = segment.share * circumference;
                          const circle = (
                            <circle
                              key={segment.categoryName}
                              cx="120"
                              cy="120"
                              r="58"
                              className="report-donut__segment"
                              style={{
                                stroke: segment.color.borderColor,
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
              </div>

              <div className="report-donut__legend">
                {reportCategorySegments.length > 0 ? (
                  reportCategorySegments.map((segment) => {
                    return (
                      <Link
                        key={segment.categoryName}
                        href={buildTransactionsHref({ category: segment.categoryName })}
                        className="report-donut__legend-item report-list__item--link"
                      >
                        <span
                          className="report-donut__swatch"
                          style={{ background: segment.color.backgroundColor, borderColor: segment.color.borderColor }}
                        />
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
        </ReportsSectionPanel>

        <ReportsSectionPanel section="trends">
        <section className="reports-grid reports-grid--trends">
          <article className="report-card reports-subtab-card glass">
            <div className="report-card__head">
              <div className="report-card__head-title">
                <h4 className="reports-subtab-title">Weekly summary</h4>
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
            <div className="report-subsection report-subsection--compact">
              <Link
                className="pill-link pill-link--inline"
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
                <h4 className="reports-subtab-title">Monthly summary</h4>
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
            <div className="report-subsection report-subsection--compact">
              <Link className="pill-link pill-link--inline" href={buildTransactionsHref({ month: currentMonthBucket.key })}>
                Open {currentMonthBucket.label}
              </Link>
            </div>
          </article>

          <article className="report-card reports-subtab-card glass">
            <div className="report-card__head">
              <div className="report-card__head-title">
                <h4 className="reports-subtab-title">Repeat bills</h4>
              </div>
              <ReportInfoTip className="reports-container-info" label="Bills and merchants that tend to show up again." />
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
                <h4 className="reports-subtab-title">Biggest merchants</h4>
              </div>
              <ReportInfoTip className="reports-container-info" label="The merchants taking the biggest share of spend." />
            </div>

            <div className="report-list">
              {topMerchants.length > 0 ? (
                topMerchants.map((merchant, index) => (
                  <Link
                    key={merchant.label}
                    href={buildTransactionsHref({ merchant: merchant.label })}
                    className="report-list__item report-list__item--link"
                  >
                    <span className="report-merchant-rank" aria-hidden="true">{index + 1}</span>
                    <div className="report-list__meta">
                      <strong>{merchant.label}</strong>
                      <span>
                        {merchant.count} transaction{merchant.count === 1 ? "" : "s"} · {formatCurrency(merchant.amount)}
                      </span>
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

async function ReportsPageStream({ searchParams }: { searchParams?: Promise<{ range?: string; section?: string; filter?: string }> }) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const session = await getSessionContext();
  const user = await getOrCreateCurrentUser(session.userId);
  if (!session.isGuest && !hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }

  const selectedRange = normalizeReportsRange(resolvedSearchParams?.range);
  const selectedRangeLabel = reportsRangeLabels[selectedRange];
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
        actions={<ReportsRangeMenu currentRange={selectedRange} currentRangeLabel={selectedRangeLabel} />}
      >
        <ReportsStream active="reports" searchParams={resolvedSearchParams} />
      </CloverShell>
    </ReportsTabsProvider>
  );
}

export default function ReportsPage({ searchParams }: { searchParams?: Promise<{ range?: string; section?: string; filter?: string }> }) {
  redirect("/adviser");
}
