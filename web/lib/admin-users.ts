import { clerkClient } from "@clerk/nextjs/server";
import { BillingSubscriptionStatus, Prisma, type FinancialExperienceLevel, type PlanTier, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { reconcileBillingPlanTier } from "@/lib/paypal-billing";
import { getEffectiveUserLimits, getPlanDisplayLabel } from "@/lib/user-limits";

export type AdminUserListFilters = {
  query?: string;
  page?: number;
  pageSize?: number;
  planTier?: "all" | PlanTier;
  verified?: "all" | "yes" | "no";
  locked?: "all" | "locked" | "unlocked";
};

export type AdminUserListItem = {
  id: string;
  clerkUserId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  verified: boolean;
  planTier: PlanTier;
  planTierLocked: boolean;
  planLabel: string;
  financialExperience: FinancialExperienceLevel | null;
  primaryGoal: string | null;
  goalTargetAmount: string | null;
  goalTargetSource: string | null;
  accountLimit: number;
  monthlyUploadLimit: number;
  transactionLimit: number | null;
  onboardingCompletedAt: string | null;
  dataWipedAt: string | null;
  createdAt: string;
  updatedAt: string;
  workspaceCount: number;
  bankAccountCount: number;
  transactionCount: number;
  activeAccountCount: number;
  investmentAccountCount: number;
  investmentValue: string;
  transactionVolume: string;
  monthlyUploads: number;
  renewalAt: string | null;
  lastActivityAt: string | null;
  recentErrorCount: number;
  attentionLevel: "low" | "medium" | "high";
  attentionFlags: string[];
  billingSubscription: {
    status: BillingSubscriptionStatus;
    planTier: PlanTier;
    interval: "monthly" | "annual" | null;
    currentPeriodEnd: string | null;
  } | null;
};

export type AdminUserListResponse = {
  users: AdminUserListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  overview: AdminUserOverview;
};

export type AdminUserOverview = {
  totalUsers: number;
  proUsers: number;
  verifiedUsers: number;
  lockedUsers: number;
  totalWorkspaces: number;
  totalBankAccounts: number;
  totalTransactionCount: number;
  totalTransactionVolume: string;
  totalInvestmentAccounts: number;
  totalInvestmentValue: string;
  monthlyUploads: number;
  failedImports: number;
  productionErrors7d: number;
  engagedUsers30d: number;
  activeUsers7d: number;
  activeUsersPrev7d: number;
  imports7d: number;
  importsPrev7d: number;
  errors7dTrend: number;
  errorsPrev7d: number;
  signups7d: number;
  signupsPrev7d: number;
};

export type AdminUserDetail = {
  id: string;
  clerkUserId: string;
  email: string;
  fullName: string;
  planTier: PlanTier;
  planTierLocked: boolean;
  planLabel: string;
  verified: boolean;
  workspaceCount: number;
  bankAccountCount: number;
  transactionCount: number;
  activeAccountCount: number;
  investmentAccountCount: number;
  investmentValue: string;
  transactionVolume: string;
  monthlyUploads: number;
  renewalAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string | null;
  recentErrorCount: number;
  attentionLevel: "low" | "medium" | "high";
  attentionFlags: string[];
  recentTransactions: Array<{
    id: string;
    date: string;
    amount: string;
    type: string;
    merchant: string;
    accountName: string;
    workspaceName: string;
    isTransfer: boolean;
    isExcluded: boolean;
  }>;
  recentImports: Array<{
    id: string;
    uploadedAt: string;
    fileName: string;
    status: string;
    parsedRowsCount: number;
    confirmedTransactionsCount: number;
    workspaceName: string;
  }>;
  recentGoals: Array<{
    id: string;
    createdAt: string;
    primaryGoal: string | null;
    targetAmount: string | null;
    source: string | null;
  }>;
  recentErrors: Array<{
    id: string;
    occurredAt: string;
    message: string;
    buildId: string;
    route: string | null;
  }>;
  recentAuditLogs: Array<{
    id: string;
    createdAt: string;
    action: string;
    entity: string;
    entityId: string | null;
    workspaceName: string;
  }>;
  workspaces: Array<{
    id: string;
    name: string;
    type: string;
    accountCount: number;
    transactionCount: number;
    importCount: number;
    updatedAt: string;
  }>;
};

export type AdminUserUpdateInput = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string;
  planTier?: PlanTier;
  planTierLocked?: boolean;
  accountLimit?: number | null;
  monthlyUploadLimit?: number | null;
  transactionLimit?: number | null;
  financialExperience?: FinancialExperienceLevel | null;
  primaryGoal?: string | null;
  goalTargetAmount?: string | null;
  goalTargetSource?: string | null;
  onboardingCompletedAt?: string | null;
  dataWipedAt?: string | null;
  verified?: boolean;
};

export type AdminUserSearchFilters = {
  query?: string;
  page?: number;
  pageSize?: number;
  planTier?: "all" | PlanTier;
  verified?: "all" | "yes" | "no";
  locked?: "all" | "locked" | "unlocked";
};

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const PRODUCTION_USER_WHERE: Prisma.UserWhereInput = {
  environment: "production",
};

function getFullName(user: Pick<User, "firstName" | "lastName" | "email">) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;
}

function parseDate(value: string | null | undefined) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseDecimal(value: string | null | undefined) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const normalized = value.trim();
  return Prisma.Decimal.isDecimal(normalized) ? new Prisma.Decimal(normalized) : undefined;
}

function parseNullableInt(value: number | null | undefined) {
  if (value === null) {
    return null;
  }

  if (value === undefined) {
    return undefined;
  }

  return Number.isInteger(value) ? value : undefined;
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function classifyAttentionFlags(user: {
  accountLimit: number;
  monthlyUploadLimit: number;
  transactionLimit: number | null;
  bankAccountCount: number;
  transactionCount: number;
  monthlyUploads: number;
  recentErrorCount: number;
  planTierLocked: boolean;
  billingSubscription: AdminUserListRow["billingSubscription"];
  createdAt: Date;
  lastActivityAt: Date | null;
}) {
  const flags: string[] = [];

  if (user.recentErrorCount > 0) {
    flags.push("Has recent errors");
  }

  if (user.accountLimit > 0 && user.bankAccountCount >= Math.max(1, Math.ceil(user.accountLimit * 0.8))) {
    flags.push("Near account limit");
  }

  if (user.monthlyUploadLimit > 0 && user.monthlyUploads >= Math.max(1, Math.ceil(user.monthlyUploadLimit * 0.8))) {
    flags.push("Near upload limit");
  }

  if (user.transactionLimit !== null && user.transactionCount >= Math.max(1, Math.ceil(user.transactionLimit * 0.8))) {
    flags.push("Near transaction limit");
  }

  if (user.planTierLocked && !user.billingSubscription) {
    flags.push("Manual tier override");
  }

  if (user.lastActivityAt === null && Date.now() - user.createdAt.getTime() > 14 * 24 * 60 * 60 * 1000) {
    flags.push("No recent activity");
  }

  return flags;
}

type AdminUserListRow = User & {
  billingSubscription: {
    status: BillingSubscriptionStatus;
    planTier: PlanTier;
    interval: "monthly" | "annual" | null;
    currentPeriodEnd: Date | null;
  } | null;
  _count: {
    workspaces: number;
  };
  bankAccountCount?: number;
  transactionCount?: number;
  activeAccountCount?: number;
  investmentAccountCount?: number;
  investmentValue?: string;
  transactionVolume?: string;
  monthlyUploads?: number;
  recentErrorCount?: number;
  lastActivityAt?: Date | null;
};

function mapUser(user: AdminUserListRow): AdminUserListItem {
  const effectiveLimits = getEffectiveUserLimits(user);
  const attentionFlags = classifyAttentionFlags({
    accountLimit: effectiveLimits.accountLimit,
    monthlyUploadLimit: effectiveLimits.monthlyUploadLimit,
    transactionLimit: effectiveLimits.transactionLimit,
    bankAccountCount: user.bankAccountCount ?? 0,
    transactionCount: user.transactionCount ?? 0,
    monthlyUploads: user.monthlyUploads ?? 0,
    recentErrorCount: user.recentErrorCount ?? 0,
    planTierLocked: user.planTierLocked,
    billingSubscription: user.billingSubscription,
    createdAt: user.createdAt,
    lastActivityAt: user.lastActivityAt ?? null,
  });
  const attentionLevel = attentionFlags.length >= 3 ? "high" : attentionFlags.length >= 1 ? "medium" : "low";

  return {
    id: user.id,
    clerkUserId: user.clerkUserId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: getFullName(user),
    verified: user.verified,
    planTier: user.planTier,
    planTierLocked: user.planTierLocked,
    planLabel: getPlanDisplayLabel(user.planTier, user.billingSubscription?.interval ?? null),
    financialExperience: user.financialExperience,
    primaryGoal: user.primaryGoal,
    goalTargetAmount: user.goalTargetAmount !== null ? user.goalTargetAmount.toString() : null,
    goalTargetSource: user.goalTargetSource,
    accountLimit: effectiveLimits.accountLimit,
    monthlyUploadLimit: effectiveLimits.monthlyUploadLimit,
    transactionLimit: effectiveLimits.transactionLimit,
    onboardingCompletedAt: user.onboardingCompletedAt ? user.onboardingCompletedAt.toISOString() : null,
    dataWipedAt: user.dataWipedAt ? user.dataWipedAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    workspaceCount: user._count.workspaces,
    bankAccountCount: user.bankAccountCount ?? 0,
    transactionCount: user.transactionCount ?? 0,
    activeAccountCount: user.activeAccountCount ?? 0,
    investmentAccountCount: user.investmentAccountCount ?? 0,
    investmentValue: user.investmentValue ?? "0",
    transactionVolume: user.transactionVolume ?? "0",
    monthlyUploads: user.monthlyUploads ?? 0,
    renewalAt: user.billingSubscription?.currentPeriodEnd ? user.billingSubscription.currentPeriodEnd.toISOString() : null,
    lastActivityAt: user.lastActivityAt ? user.lastActivityAt.toISOString() : null,
    recentErrorCount: user.recentErrorCount ?? 0,
    attentionLevel,
    attentionFlags,
    billingSubscription: user.billingSubscription
      ? {
          status: user.billingSubscription.status,
          planTier: user.billingSubscription.planTier,
          interval: user.billingSubscription.interval,
          currentPeriodEnd: user.billingSubscription.currentPeriodEnd
            ? user.billingSubscription.currentPeriodEnd.toISOString()
            : null,
        }
      : null,
  };
}

async function fetchUserMetrics(userIds: string[]) {
  if (userIds.length === 0) {
    return {
      bankAccountCounts: new Map<string, number>(),
      transactionCounts: new Map<string, number>(),
      activeAccountCounts: new Map<string, number>(),
      investmentAccountCounts: new Map<string, number>(),
      investmentValues: new Map<string, string>(),
      transactionVolumes: new Map<string, string>(),
      monthlyUploads: new Map<string, number>(),
      recentErrorCounts: new Map<string, number>(),
      lastActivityAt: new Map<string, Date | null>(),
    };
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const nextMonth = new Date(startOfMonth);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const thirtyDaysAgo = daysAgo(30);

  const userIdFragments = userIds.map((userId) => Prisma.sql`${userId}`);

  const [
    bankAccountRows,
    transactionCountRows,
    activeAccountRows,
    investmentAccountRows,
    investmentValueRows,
    transactionVolumeRows,
    monthlyUploadRows,
    recentErrorRows,
    lastActivityRows,
  ] = await Promise.all([
    prisma.$queryRaw<Array<{ userId: string; bankAccountCount: bigint }>>(Prisma.sql`
      SELECT w."userId" AS "userId", COUNT(*)::bigint AS "bankAccountCount"
      FROM "Account" a
      INNER JOIN "Workspace" w ON w."id" = a."workspaceId"
      WHERE w."userId" IN (${Prisma.join(userIdFragments)})
        AND a."type" = 'bank'::"AccountType"
      GROUP BY w."userId"
    `),
    prisma.$queryRaw<Array<{ userId: string; transactionCount: bigint }>>(Prisma.sql`
      SELECT w."userId" AS "userId", COUNT(*)::bigint AS "transactionCount"
      FROM "Transaction" t
      INNER JOIN "Workspace" w ON w."id" = t."workspaceId"
      WHERE w."userId" IN (${Prisma.join(userIdFragments)})
      GROUP BY w."userId"
    `),
    prisma.$queryRaw<Array<{ userId: string; activeAccountCount: bigint }>>(Prisma.sql`
      SELECT w."userId" AS "userId", COUNT(*)::bigint AS "activeAccountCount"
      FROM "Account" a
      INNER JOIN "Workspace" w ON w."id" = a."workspaceId"
      WHERE w."userId" IN (${Prisma.join(userIdFragments)})
        AND a."balance" IS NOT NULL
      GROUP BY w."userId"
    `),
    prisma.$queryRaw<Array<{ userId: string; investmentAccountCount: bigint }>>(Prisma.sql`
      SELECT w."userId" AS "userId", COUNT(*)::bigint AS "investmentAccountCount"
      FROM "Account" a
      INNER JOIN "Workspace" w ON w."id" = a."workspaceId"
      WHERE w."userId" IN (${Prisma.join(userIdFragments)})
        AND a."type" = 'investment'::"AccountType"
      GROUP BY w."userId"
    `),
    prisma.$queryRaw<Array<{ userId: string; investmentValue: Prisma.Decimal | string | number | null }>>(Prisma.sql`
      SELECT w."userId" AS "userId", COALESCE(SUM(GREATEST(COALESCE(a."balance", 0), 0)), 0) AS "investmentValue"
      FROM "Account" a
      INNER JOIN "Workspace" w ON w."id" = a."workspaceId"
      WHERE w."userId" IN (${Prisma.join(userIdFragments)})
        AND a."type" = 'investment'::"AccountType"
      GROUP BY w."userId"
    `),
    prisma.$queryRaw<Array<{ userId: string; transactionVolume: Prisma.Decimal | string | number | null }>>(Prisma.sql`
      SELECT w."userId" AS "userId", COALESCE(SUM(ABS(t."amount")), 0) AS "transactionVolume"
      FROM "Transaction" t
      INNER JOIN "Workspace" w ON w."id" = t."workspaceId"
      WHERE w."userId" IN (${Prisma.join(userIdFragments)})
        AND t."isExcluded" = false
        AND t."isTransfer" = false
      GROUP BY w."userId"
    `),
    prisma.$queryRaw<Array<{ userId: string; monthlyUploads: bigint }>>(Prisma.sql`
      SELECT w."userId" AS "userId", COUNT(*)::bigint AS "monthlyUploads"
      FROM "ImportFile" i
      INNER JOIN "Workspace" w ON w."id" = i."workspaceId"
      WHERE w."userId" IN (${Prisma.join(userIdFragments)})
        AND i."uploadedAt" >= ${startOfMonth}
        AND i."uploadedAt" < ${nextMonth}
      GROUP BY w."userId"
    `),
    prisma.$queryRaw<Array<{ userId: string; recentErrorCount: bigint }>>(Prisma.sql`
      SELECT e."userId" AS "userId", COUNT(*)::bigint AS "recentErrorCount"
      FROM "AppErrorLog" e
      WHERE e."environment" = 'production'
        AND e."userId" IN (${Prisma.join(userIdFragments)})
        AND e."occurredAt" >= ${thirtyDaysAgo}
      GROUP BY e."userId"
    `),
    prisma.$queryRaw<Array<{ userId: string; lastActivityAt: Date | null }>>(Prisma.sql`
      SELECT activity."userId" AS "userId", MAX(activity."activityAt") AS "lastActivityAt"
      FROM (
        SELECT w."userId", t."createdAt" AS "activityAt"
        FROM "Transaction" t
        INNER JOIN "Workspace" w ON w."id" = t."workspaceId"
        WHERE w."userId" IN (${Prisma.join(userIdFragments)})
        UNION ALL
        SELECT w."userId", i."uploadedAt" AS "activityAt"
        FROM "ImportFile" i
        INNER JOIN "Workspace" w ON w."id" = i."workspaceId"
        WHERE w."userId" IN (${Prisma.join(userIdFragments)})
      ) AS activity
      GROUP BY activity."userId"
    `),
  ]);

  return {
    bankAccountCounts: new Map(
      bankAccountRows.map((row) => [row.userId, Number(row.bankAccountCount)])
    ),
    transactionCounts: new Map(
      transactionCountRows.map((row) => [row.userId, Number(row.transactionCount)])
    ),
    activeAccountCounts: new Map(
      activeAccountRows.map((row) => [row.userId, Number(row.activeAccountCount)])
    ),
    investmentAccountCounts: new Map(
      investmentAccountRows.map((row) => [row.userId, Number(row.investmentAccountCount)])
    ),
    investmentValues: new Map(
      investmentValueRows.map((row) => [row.userId, row.investmentValue === null ? "0" : String(row.investmentValue)])
    ),
    transactionVolumes: new Map(
      transactionVolumeRows.map((row) => [row.userId, row.transactionVolume === null ? "0" : String(row.transactionVolume)])
    ),
    monthlyUploads: new Map(
      monthlyUploadRows.map((row) => [row.userId, Number(row.monthlyUploads)])
    ),
    recentErrorCounts: new Map(
      recentErrorRows.map((row) => [row.userId, Number(row.recentErrorCount)])
    ),
    lastActivityAt: new Map(
      lastActivityRows.map((row) => [row.userId, row.lastActivityAt])
    ),
  };
}

async function fetchAdminOverview(): Promise<AdminUserOverview> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const sevenDaysAgo = daysAgo(7);
  const fourteenDaysAgo = daysAgo(14);
  const thirtyDaysAgo = daysAgo(30);

  const [
    userCounts,
    workspaceCount,
    bankAccountCount,
    investmentAccountCount,
    transactionCounts,
    transactionVolumeRows,
    investmentValueRows,
    monthlyUploadCounts,
    failedImportCounts,
    productionErrorCounts,
    engagedUserCounts,
    activeUsers7dRows,
    activeUsersPrev7dRows,
    imports7d,
    importsPrev7d,
    errorsPrev7d,
    signups7d,
    signupsPrev7d,
  ] = await Promise.all([
    prisma.user.groupBy({
      by: ["planTier", "verified", "planTierLocked"],
      where: PRODUCTION_USER_WHERE,
      _count: { _all: true },
    }),
    prisma.workspace.count({
      where: {
        user: PRODUCTION_USER_WHERE,
      },
    }),
    prisma.account.count({
      where: {
        type: "bank",
        workspace: {
          user: PRODUCTION_USER_WHERE,
        },
      },
    }),
    prisma.account.count({
      where: {
        type: "investment",
        workspace: {
          user: PRODUCTION_USER_WHERE,
        },
      },
    }),
    prisma.transaction.count({
      where: {
        workspace: {
          user: PRODUCTION_USER_WHERE,
        },
      },
    }),
    prisma.$queryRaw<Array<{ total: Prisma.Decimal | string | number | null }>>(Prisma.sql`
      SELECT COALESCE(SUM(ABS(t."amount")), 0) AS total
      FROM "Transaction" t
      INNER JOIN "Workspace" w ON w."id" = t."workspaceId"
      INNER JOIN "User" u ON u."id" = w."userId" AND u."environment" = 'production'
      WHERE t."isExcluded" = false
        AND t."isTransfer" = false
    `),
    prisma.$queryRaw<Array<{ total: Prisma.Decimal | string | number | null }>>(Prisma.sql`
      SELECT COALESCE(SUM(GREATEST(COALESCE(a."balance", 0), 0)), 0) AS total
      FROM "Account" a
      INNER JOIN "Workspace" w ON w."id" = a."workspaceId"
      INNER JOIN "User" u ON u."id" = w."userId" AND u."environment" = 'production'
      WHERE a."type" = 'investment'::"AccountType"
    `),
    prisma.importFile.count({
      where: {
        uploadedAt: { gte: startOfMonth },
        workspace: {
          user: PRODUCTION_USER_WHERE,
        },
      },
    }),
    prisma.importFile.count({
      where: {
        status: "failed",
        workspace: {
          user: PRODUCTION_USER_WHERE,
        },
      },
    }),
    prisma.appErrorLog.count({
      where: {
        environment: "production",
        occurredAt: {
          gte: sevenDaysAgo,
        },
      },
    }),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(DISTINCT source_user."userId")::bigint AS count
      FROM (
        SELECT w."userId", t."workspaceId"
        FROM "Transaction" t
        INNER JOIN "Workspace" w ON w."id" = t."workspaceId"
        INNER JOIN "User" u ON u."id" = w."userId" AND u."environment" = 'production'
        WHERE t."date" >= ${thirtyDaysAgo}
        UNION
        SELECT w."userId", i."workspaceId"
        FROM "ImportFile" i
        INNER JOIN "Workspace" w ON w."id" = i."workspaceId"
        INNER JOIN "User" u ON u."id" = w."userId" AND u."environment" = 'production'
        WHERE i."uploadedAt" >= ${thirtyDaysAgo}
      ) AS source_user
    `),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(DISTINCT source_user."userId")::bigint AS count
      FROM (
        SELECT w."userId"
        FROM "Transaction" t
        INNER JOIN "Workspace" w ON w."id" = t."workspaceId"
        INNER JOIN "User" u ON u."id" = w."userId" AND u."environment" = 'production'
        WHERE t."createdAt" >= ${sevenDaysAgo}
        UNION
        SELECT w."userId"
        FROM "ImportFile" i
        INNER JOIN "Workspace" w ON w."id" = i."workspaceId"
        INNER JOIN "User" u ON u."id" = w."userId" AND u."environment" = 'production'
        WHERE i."uploadedAt" >= ${sevenDaysAgo}
      ) AS source_user
    `),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(DISTINCT source_user."userId")::bigint AS count
      FROM (
        SELECT w."userId"
        FROM "Transaction" t
        INNER JOIN "Workspace" w ON w."id" = t."workspaceId"
        INNER JOIN "User" u ON u."id" = w."userId" AND u."environment" = 'production'
        WHERE t."createdAt" >= ${fourteenDaysAgo}
          AND t."createdAt" < ${sevenDaysAgo}
        UNION
        SELECT w."userId"
        FROM "ImportFile" i
        INNER JOIN "Workspace" w ON w."id" = i."workspaceId"
        INNER JOIN "User" u ON u."id" = w."userId" AND u."environment" = 'production'
        WHERE i."uploadedAt" >= ${fourteenDaysAgo}
          AND i."uploadedAt" < ${sevenDaysAgo}
      ) AS source_user
    `),
    prisma.importFile.count({
      where: {
        uploadedAt: { gte: sevenDaysAgo },
        workspace: {
          user: PRODUCTION_USER_WHERE,
        },
      },
    }),
    prisma.importFile.count({
      where: {
        uploadedAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
        workspace: {
          user: PRODUCTION_USER_WHERE,
        },
      },
    }),
    prisma.appErrorLog.count({ where: { environment: "production", occurredAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } } }),
    prisma.user.count({ where: { ...PRODUCTION_USER_WHERE, createdAt: { gte: sevenDaysAgo } } }),
    prisma.user.count({ where: { ...PRODUCTION_USER_WHERE, createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } } }),
  ]);

  const planCounts = {
    free: 0,
    pro: 0,
  };
  let verifiedUsers = 0;
  let lockedUsers = 0;
  for (const row of userCounts) {
    if (row.planTier === "free") {
      planCounts.free += row._count._all;
    } else if (row.planTier === "pro") {
      planCounts.pro += row._count._all;
    }

    if (row.verified) {
      verifiedUsers += row._count._all;
    }

    if (row.planTierLocked) {
      lockedUsers += row._count._all;
    }
  }

  const totalTransactionVolume = transactionVolumeRows[0]?.total ?? "0";
  const totalInvestmentValue = investmentValueRows[0]?.total ?? "0";

  return {
    totalUsers: planCounts.free + planCounts.pro,
    proUsers: planCounts.pro,
    verifiedUsers,
    lockedUsers,
    totalWorkspaces: workspaceCount,
    totalBankAccounts: bankAccountCount,
    totalTransactionCount: transactionCounts,
    totalTransactionVolume: String(totalTransactionVolume),
    totalInvestmentAccounts: investmentAccountCount,
    totalInvestmentValue: String(totalInvestmentValue),
    monthlyUploads: monthlyUploadCounts,
    failedImports: failedImportCounts,
    productionErrors7d: productionErrorCounts,
    errors7dTrend: productionErrorCounts,
    engagedUsers30d: Number(engagedUserCounts[0]?.count ?? 0),
    activeUsers7d: Number(activeUsers7dRows[0]?.count ?? 0),
    activeUsersPrev7d: Number(activeUsersPrev7dRows[0]?.count ?? 0),
    imports7d,
    importsPrev7d,
    errorsPrev7d,
    signups7d,
    signupsPrev7d,
  };
}

export async function getAdminUsers(filters: AdminUserListFilters = {}): Promise<AdminUserListResponse> {
  const pageSize = Math.min(Math.max(filters.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const page = Math.max(filters.page ?? 1, 1);
  const skip = (page - 1) * pageSize;
  const query = filters.query?.trim() ?? "";

  const where: Prisma.UserWhereInput = {
    ...PRODUCTION_USER_WHERE,
    ...(query
      ? {
          OR: [
            { email: { contains: query, mode: "insensitive" } },
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { clerkUserId: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(filters.planTier && filters.planTier !== "all" ? { planTier: filters.planTier } : {}),
    ...(filters.locked === "locked" ? { planTierLocked: true } : {}),
    ...(filters.locked === "unlocked" ? { planTierLocked: false } : {}),
    ...(filters.verified === "yes" ? { verified: true } : {}),
    ...(filters.verified === "no" ? { verified: false } : {}),
  };

  const [totalCount, users, overview] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
      include: {
        billingSubscription: {
          select: {
            status: true,
            planTier: true,
            interval: true,
            currentPeriodEnd: true,
          },
        },
        _count: {
          select: {
            workspaces: true,
          },
        },
      },
    }),
    fetchAdminOverview(),
  ]);

  const metrics = await fetchUserMetrics(users.map((user) => user.id));

  const enrichedUsers: AdminUserListRow[] = users.map((user) => ({
    ...user,
    bankAccountCount: metrics.bankAccountCounts.get(user.id) ?? 0,
    transactionCount: metrics.transactionCounts.get(user.id) ?? 0,
    activeAccountCount: metrics.activeAccountCounts.get(user.id) ?? 0,
    investmentAccountCount: metrics.investmentAccountCounts.get(user.id) ?? 0,
    investmentValue: metrics.investmentValues.get(user.id) ?? "0",
    transactionVolume: metrics.transactionVolumes.get(user.id) ?? "0",
    monthlyUploads: metrics.monthlyUploads.get(user.id) ?? 0,
    recentErrorCount: metrics.recentErrorCounts.get(user.id) ?? 0,
    lastActivityAt: metrics.lastActivityAt.get(user.id) ?? null,
  }));

  return {
    users: enrichedUsers.map(mapUser),
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(Math.ceil(totalCount / pageSize), 1),
    overview,
  };
}

export async function updateAdminUser(userId: string, input: AdminUserUpdateInput) {
  const currentUser = await prisma.user.findFirst({
    where: {
      id: userId,
      environment: "production",
    },
    include: {
      billingSubscription: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!currentUser) {
    throw new Error("User not found");
  }

  const nextEmail = input.email?.trim();
  const nextFirstName = input.firstName === undefined ? undefined : input.firstName?.trim() || undefined;
  const nextLastName = input.lastName === undefined ? undefined : input.lastName?.trim() || undefined;
  const nextGoalTargetAmount = parseDecimal(input.goalTargetAmount);
  const nextOnboardingCompletedAt = parseDate(input.onboardingCompletedAt);
  const nextDataWipedAt = parseDate(input.dataWipedAt);
  const nextPlanTierLocked = input.planTierLocked;
  const nextVerified = input.verified;
  const nextAccountLimit = parseNullableInt(input.accountLimit);
  const nextMonthlyUploadLimit = parseNullableInt(input.monthlyUploadLimit);
  const nextTransactionLimit = parseNullableInt(input.transactionLimit);

  if (nextEmail && nextEmail !== currentUser.email) {
    const existingEmail = await prisma.user.findFirst({
      where: {
        email: nextEmail,
        NOT: { id: currentUser.id },
      },
      select: { id: true },
    });

    if (existingEmail) {
      throw new Error("Another user already uses that email address.");
    }
  }

  if (nextEmail && nextEmail !== currentUser.email) {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(currentUser.clerkUserId);
    const currentPrimaryEmail = clerkUser.emailAddresses.find(
      (entry) => entry.id === clerkUser.primaryEmailAddressId
    );

    const newEmailAddress = await client.emailAddresses.createEmailAddress({
      userId: currentUser.clerkUserId,
      emailAddress: nextEmail,
      verified: true,
      primary: true,
    });

    if (currentPrimaryEmail && currentPrimaryEmail.id !== newEmailAddress.id) {
      await client.emailAddresses.deleteEmailAddress(currentPrimaryEmail.id).catch(() => null);
    }
  }

  const planTierChanged = input.planTier !== undefined && input.planTier !== currentUser.planTier;

  if (nextFirstName !== undefined || nextLastName !== undefined) {
    const client = await clerkClient();
    await client.users.updateUser(currentUser.clerkUserId, {
      ...(nextFirstName !== undefined ? { firstName: nextFirstName } : {}),
      ...(nextLastName !== undefined ? { lastName: nextLastName } : {}),
    });
  }

  const updatedUser = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: currentUser.id },
      data: {
        ...(nextEmail && nextEmail !== currentUser.email ? { email: nextEmail } : {}),
        ...(nextFirstName !== undefined ? { firstName: nextFirstName } : {}),
        ...(nextLastName !== undefined ? { lastName: nextLastName } : {}),
        ...(nextEmail && nextEmail !== currentUser.email ? { verified: true } : {}),
        ...(nextVerified === undefined ? {} : { verified: nextVerified }),
        ...(input.planTier ? { planTier: input.planTier } : {}),
        ...(planTierChanged ? { planTierLocked: true } : {}),
        ...(nextPlanTierLocked === undefined ? {} : { planTierLocked: nextPlanTierLocked }),
        ...(input.financialExperience === undefined ? {} : { financialExperience: input.financialExperience }),
        ...(input.primaryGoal === undefined ? {} : { primaryGoal: input.primaryGoal }),
        ...(nextGoalTargetAmount === undefined ? {} : { goalTargetAmount: nextGoalTargetAmount }),
        ...(input.goalTargetSource === undefined ? {} : { goalTargetSource: input.goalTargetSource }),
        ...(nextAccountLimit === undefined ? {} : { accountLimit: nextAccountLimit }),
        ...(nextMonthlyUploadLimit === undefined ? {} : { monthlyUploadLimit: nextMonthlyUploadLimit }),
        ...(nextTransactionLimit === undefined ? {} : { transactionLimit: nextTransactionLimit }),
        ...(nextOnboardingCompletedAt === undefined ? {} : { onboardingCompletedAt: nextOnboardingCompletedAt }),
        ...(nextDataWipedAt === undefined ? {} : { dataWipedAt: nextDataWipedAt }),
      },
      include: {
        billingSubscription: {
          select: {
            status: true,
            planTier: true,
            interval: true,
            currentPeriodEnd: true,
          },
        },
        _count: {
          select: {
            workspaces: true,
          },
        },
      },
    });

    if (
      currentUser.billingSubscription &&
      input.planTier &&
      updated.billingSubscription &&
      updated.billingSubscription.planTier !== input.planTier
    ) {
      await tx.billingSubscription.update({
        where: { id: currentUser.billingSubscription.id },
        data: { planTier: input.planTier },
      });
      updated.billingSubscription.planTier = input.planTier;
    }

    return updated;
  });

  if (nextPlanTierLocked === false) {
    await reconcileBillingPlanTier(updatedUser.id).catch(() => null);
    const reconciledUser = await prisma.user.findUnique({
      where: { id: updatedUser.id },
      include: {
        billingSubscription: {
          select: {
            status: true,
            planTier: true,
            interval: true,
            currentPeriodEnd: true,
          },
        },
        _count: {
          select: {
            workspaces: true,
          },
        },
      },
    });

    if (reconciledUser) {
      return mapUser(reconciledUser);
    }
  }

  return mapUser(updatedUser);
}

export async function getAdminUserDetail(userId: string): Promise<AdminUserDetail> {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      environment: "production",
    },
    include: {
      billingSubscription: {
        select: {
          status: true,
          planTier: true,
          interval: true,
          currentPeriodEnd: true,
        },
      },
      _count: {
        select: {
          workspaces: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const metrics = await fetchUserMetrics([user.id]);
  const effectiveLimits = getEffectiveUserLimits(user);
  const attentionFlags = classifyAttentionFlags({
    accountLimit: effectiveLimits.accountLimit,
    monthlyUploadLimit: effectiveLimits.monthlyUploadLimit,
    transactionLimit: effectiveLimits.transactionLimit,
    bankAccountCount: metrics.bankAccountCounts.get(user.id) ?? 0,
    transactionCount: metrics.transactionCounts.get(user.id) ?? 0,
    monthlyUploads: metrics.monthlyUploads.get(user.id) ?? 0,
    recentErrorCount: metrics.recentErrorCounts.get(user.id) ?? 0,
    planTierLocked: user.planTierLocked,
    billingSubscription: user.billingSubscription,
    createdAt: user.createdAt,
    lastActivityAt: metrics.lastActivityAt.get(user.id) ?? null,
  });
  const attentionLevel: "low" | "medium" | "high" =
    attentionFlags.length >= 3 ? "high" : attentionFlags.length >= 1 ? "medium" : "low";

  const [
    recentTransactions,
    recentImports,
    recentGoals,
    recentErrors,
    recentAuditLogs,
    workspaces,
  ] = await Promise.all([
    prisma.transaction.findMany({
      where: { workspace: { userId: user.id } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 10,
      select: {
        id: true,
        date: true,
        amount: true,
        type: true,
        merchantRaw: true,
        merchantClean: true,
        isTransfer: true,
        isExcluded: true,
        account: { select: { name: true } },
        workspace: { select: { name: true } },
      },
    }),
    prisma.importFile.findMany({
      where: { workspace: { userId: user.id } },
      orderBy: [{ uploadedAt: "desc" }, { createdAt: "desc" }],
      take: 10,
      select: {
        id: true,
        uploadedAt: true,
        fileName: true,
        status: true,
        parsedRowsCount: true,
        confirmedTransactionsCount: true,
        workspace: { select: { name: true } },
      },
    }),
    prisma.goalSetting.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }],
      take: 10,
      select: {
        id: true,
        createdAt: true,
        primaryGoal: true,
        targetAmount: true,
        source: true,
      },
    }),
    prisma.appErrorLog.findMany({
      where: { userId: user.id, environment: "production" },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 10,
      select: {
        id: true,
        occurredAt: true,
        message: true,
        buildId: true,
        route: true,
      },
    }),
    prisma.auditLog.findMany({
      where: { workspace: { userId: user.id } },
      orderBy: [{ createdAt: "desc" }],
      take: 10,
      select: {
        id: true,
        createdAt: true,
        action: true,
        entity: true,
        entityId: true,
        workspace: { select: { name: true } },
      },
    }),
    prisma.workspace.findMany({
      where: { userId: user.id },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        type: true,
        updatedAt: true,
        _count: {
          select: {
            accounts: true,
            transactions: true,
            importFiles: true,
          },
        },
      },
    }),
  ]);

  return {
    id: user.id,
    clerkUserId: user.clerkUserId,
    email: user.email,
    fullName: getFullName(user),
    planTier: user.planTier,
    planTierLocked: user.planTierLocked,
    planLabel: getPlanDisplayLabel(user.planTier, user.billingSubscription?.interval ?? null),
    verified: user.verified,
    workspaceCount: user._count.workspaces,
    bankAccountCount: metrics.bankAccountCounts.get(user.id) ?? 0,
    transactionCount: metrics.transactionCounts.get(user.id) ?? 0,
    activeAccountCount: metrics.activeAccountCounts.get(user.id) ?? 0,
    investmentAccountCount: metrics.investmentAccountCounts.get(user.id) ?? 0,
    investmentValue: metrics.investmentValues.get(user.id) ?? "0",
    transactionVolume: metrics.transactionVolumes.get(user.id) ?? "0",
    monthlyUploads: metrics.monthlyUploads.get(user.id) ?? 0,
    renewalAt: user.billingSubscription?.currentPeriodEnd ? user.billingSubscription.currentPeriodEnd.toISOString() : null,
    lastActivityAt: metrics.lastActivityAt.get(user.id)?.toISOString() ?? null,
    recentErrorCount: metrics.recentErrorCounts.get(user.id) ?? 0,
    attentionLevel,
    attentionFlags,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    recentTransactions: recentTransactions.map((transaction) => ({
      id: transaction.id,
      date: transaction.date.toISOString(),
      amount: transaction.amount.toString(),
      type: transaction.type,
      merchant: transaction.merchantClean ?? transaction.merchantRaw,
      accountName: transaction.account.name,
      workspaceName: transaction.workspace.name,
      isTransfer: transaction.isTransfer,
      isExcluded: transaction.isExcluded,
    })),
    recentImports: recentImports.map((entry) => ({
      id: entry.id,
      uploadedAt: entry.uploadedAt.toISOString(),
      fileName: entry.fileName,
      status: entry.status,
      parsedRowsCount: entry.parsedRowsCount,
      confirmedTransactionsCount: entry.confirmedTransactionsCount,
      workspaceName: entry.workspace.name,
    })),
    recentGoals: recentGoals.map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt.toISOString(),
      primaryGoal: entry.primaryGoal,
      targetAmount: entry.targetAmount !== null ? entry.targetAmount.toString() : null,
      source: entry.source,
    })),
    recentErrors: recentErrors.map((entry) => ({
      id: entry.id,
      occurredAt: entry.occurredAt.toISOString(),
      message: entry.message,
      buildId: entry.buildId,
      route: entry.route,
    })),
    recentAuditLogs: recentAuditLogs.map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt.toISOString(),
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      workspaceName: entry.workspace.name,
    })),
    workspaces: workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      type: workspace.type,
      accountCount: workspace._count.accounts,
      transactionCount: workspace._count.transactions,
      importCount: workspace._count.importFiles,
      updatedAt: workspace.updatedAt.toISOString(),
    })),
  };
}

export async function exportAdminUsers(filters: AdminUserListFilters = {}) {
  const query = filters.query?.trim() ?? "";
  const where: Prisma.UserWhereInput = {
    ...PRODUCTION_USER_WHERE,
    ...(query
      ? {
          OR: [
            { email: { contains: query, mode: "insensitive" } },
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { clerkUserId: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(filters.planTier && filters.planTier !== "all" ? { planTier: filters.planTier } : {}),
    ...(filters.locked === "locked" ? { planTierLocked: true } : {}),
    ...(filters.locked === "unlocked" ? { planTierLocked: false } : {}),
    ...(filters.verified === "yes" ? { verified: true } : {}),
    ...(filters.verified === "no" ? { verified: false } : {}),
  };

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    include: {
      billingSubscription: {
        select: {
          status: true,
          planTier: true,
          interval: true,
          currentPeriodEnd: true,
        },
      },
      _count: {
        select: {
          workspaces: true,
        },
      },
    },
  });

  const metrics = await fetchUserMetrics(users.map((user) => user.id));

  const rows = users.map((user) =>
    mapUser({
      ...user,
      bankAccountCount: metrics.bankAccountCounts.get(user.id) ?? 0,
      transactionCount: metrics.transactionCounts.get(user.id) ?? 0,
      activeAccountCount: metrics.activeAccountCounts.get(user.id) ?? 0,
      investmentAccountCount: metrics.investmentAccountCounts.get(user.id) ?? 0,
      investmentValue: metrics.investmentValues.get(user.id) ?? "0",
      transactionVolume: metrics.transactionVolumes.get(user.id) ?? "0",
      monthlyUploads: metrics.monthlyUploads.get(user.id) ?? 0,
    })
  );

  const headers = [
    "id",
    "clerkUserId",
    "email",
    "firstName",
    "lastName",
    "fullName",
    "planTier",
    "planTierLocked",
    "planLabel",
    "verified",
    "workspaceCount",
    "bankAccountCount",
    "transactionCount",
    "activeAccountCount",
    "investmentAccountCount",
    "investmentValue",
    "transactionVolume",
    "monthlyUploads",
    "renewalAt",
    "createdAt",
    "updatedAt",
  ];

  const escapeCsv = (value: string | number | boolean | null) => {
    const text = value === null ? "" : String(value);
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.id,
        row.clerkUserId,
        row.email,
        row.firstName ?? "",
        row.lastName ?? "",
        row.fullName,
        row.planTier,
        row.planTierLocked,
        row.planLabel,
        row.verified,
        row.workspaceCount,
        row.bankAccountCount,
        row.transactionCount,
        row.activeAccountCount,
        row.investmentAccountCount,
        row.investmentValue,
        row.transactionVolume,
        row.monthlyUploads,
        row.renewalAt ?? "",
        row.createdAt,
        row.updatedAt,
      ]
        .map(escapeCsv)
        .join(",")
    ),
  ];

  return lines.join("\n");
}
