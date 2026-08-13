import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AdminCommandCenterSnapshot } from "@/components/admin-command-center";
import {
  adminRealUserSqlPredicate,
  getAdminRealUserWhere,
  getAdminRealWorkspaceWhere,
  getCurrentDeploymentErrorWhere,
} from "@/lib/admin-data-scope";
import { FEATURE_FUNNEL_DEFINITIONS } from "@/lib/feature-adoption";
import { getPostHogFeatureFunnels } from "@/lib/posthog-query";
import { getAdminDataEnvironment } from "@/lib/admin";

const formatCount = (value: number) => value.toLocaleString();
const formatTrackedAmount = (value: Prisma.Decimal | string | number | null) => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount)
    : "0.00";
};

export async function getAdminCommandCenterSnapshot(): Promise<AdminCommandCenterSnapshot> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const eightWeeksAgo = new Date(now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000);
  const realUser = getAdminRealUserWhere();
  const realWorkspace = getAdminRealWorkspaceWhere();
  const activeTransaction = { deletedAt: null } as const;
  const activeImport = { status: { not: "deleted" } } as const;
  const recentActivity = {
    OR: [
      {
        transactions: {
          some: { ...activeTransaction, createdAt: { gte: sevenDaysAgo } },
        },
      },
      {
        importFiles: {
          some: { ...activeImport, uploadedAt: { gte: sevenDaysAgo } },
        },
      },
    ],
  };
  const priorActivity = {
    OR: [
      {
        transactions: {
          some: {
            ...activeTransaction,
            createdAt: { gte: thirtyDaysAgo, lt: sevenDaysAgo },
          },
        },
      },
      {
        importFiles: {
          some: {
            ...activeImport,
            uploadedAt: { gte: thirtyDaysAgo, lt: sevenDaysAgo },
          },
        },
      },
    ],
  };

  const [
    users,
    workspaces,
    bankAccounts,
    transactionSummaryRows,
    imports,
    errors24h,
    analytics,
    funnelCounts,
    retentionCounts,
    adoptionCounts,
    posthogFeatureFunnels,
    recentSignups,
    recentImports,
  ] = await Promise.all([
    prisma.user.count({
      where: realUser,
    }),
    prisma.workspace.count({
      where: realWorkspace,
    }),
    prisma.account.count({
      where: { workspace: realWorkspace },
    }),
    prisma.$queryRaw<
      Array<{
        transactionCount: bigint;
        trackedAmount: Prisma.Decimal | string | number | null;
      }>
    >(Prisma.sql`
      SELECT
        COUNT(*)::bigint AS "transactionCount",
        COALESCE(SUM(ABS(t."amount")), 0) AS "trackedAmount"
      FROM "Transaction" t
      INNER JOIN "Workspace" w ON w."id" = t."workspaceId"
      INNER JOIN "User" u ON u."id" = w."userId" AND ${adminRealUserSqlPredicate("u")}
      WHERE t."deletedAt" IS NULL
    `),
    prisma.importFile.count({
      where: { ...activeImport, workspace: realWorkspace },
    }),
    prisma.appErrorLog.count({
      where: getCurrentDeploymentErrorWhere(
        new Date(now.getTime() - 24 * 60 * 60 * 1000),
      ),
    }),
    Promise.all([
      prisma.user.count({
        where: { ...realUser, onboardingCompletedAt: { not: null } },
      }),
      prisma.importFile.count({
        where: { status: "processing", workspace: realWorkspace },
      }),
      prisma.importFile.count({
        where: {
          status: "done",
          updatedAt: { gte: sevenDaysAgo },
          workspace: realWorkspace,
        },
      }),
      prisma.importFile.count({
        where: {
          status: "failed",
          updatedAt: { gte: sevenDaysAgo },
          workspace: realWorkspace,
        },
      }),
      prisma.transaction.count({
        where: {
          ...activeTransaction,
          isExcluded: false,
          reviewStatus: {
            notIn: ["confirmed", "rejected", "duplicate_skipped"],
          },
          workspace: realWorkspace,
        },
      }),
      prisma.transaction.count({
        where: {
          ...activeTransaction,
          isExcluded: false,
          OR: [
            { parserConfidence: { lt: 70 } },
            { categoryConfidence: { lt: 70 } },
            { accountMatchConfidence: { lt: 70 } },
          ],
          workspace: realWorkspace,
        },
      }),
    ]),
    Promise.all([
      prisma.user.count({
        where: { ...realUser, onboardingCompletedAt: { not: null } },
      }),
      prisma.user.count({
        where: {
          ...realUser,
          onboardingCompletedAt: { not: null },
          workspaces: {
            some: {
              OR: [
                { accounts: { some: {} } },
                { transactions: { some: activeTransaction } },
              ],
            },
          },
        },
      }),
      prisma.user.count({
        where: {
          ...realUser,
          workspaces: { some: { importFiles: { some: activeImport } } },
        },
      }),
      prisma.user.count({
        where: {
          ...realUser,
          onboardingCompletedAt: { not: null },
          workspaces: { some: { transactions: { some: activeTransaction } } },
        },
      }),
      prisma.user.count({
        where: {
          ...realUser,
          workspaces: {
            some: {
              OR: [
                { accounts: { some: {} } },
                { transactions: { some: activeTransaction } },
              ],
            },
          },
        },
      }),
      prisma.user.count({
        where: {
          ...realUser,
          workspaces: { some: { transactions: { some: activeTransaction } } },
        },
      }),
      prisma.user.count({
        where: {
          ...realUser,
          workspaces: {
            some: {
              transactions: {
                some: {
                  ...activeTransaction,
                  createdAt: { gte: thirtyDaysAgo },
                },
              },
            },
          },
        },
      }),
    ]),
    Promise.all([
      prisma.user.count({
        where: {
          ...realUser,
          workspaces: {
            some: {
              OR: [
                {
                  transactions: {
                    some: {
                      ...activeTransaction,
                      createdAt: { gte: thirtyDaysAgo },
                    },
                  },
                },
                {
                  importFiles: {
                    some: {
                      ...activeImport,
                      uploadedAt: { gte: thirtyDaysAgo },
                    },
                  },
                },
              ],
            },
          },
        },
      }),
      prisma.user.count({
        where: { ...realUser, workspaces: { some: recentActivity } },
      }),
      prisma.user.count({
        where: {
          ...realUser,
          AND: [
            { workspaces: { some: recentActivity } },
            { workspaces: { some: priorActivity } },
          ],
        },
      }),
    ]),
    Promise.all([
      prisma.user.count({
        where: {
          ...realUser,
          workspaces: { some: { recurringPatterns: { some: {} } } },
        },
      }),
      prisma.user.count({
        where: {
          ...realUser,
          workspaces: { some: { budgets: { some: {} } } },
        },
      }),
      prisma.user.count({ where: { ...realUser, goalSettings: { some: {} } } }),
      prisma.user.count({
        where: {
          ...realUser,
          workspaces: { some: { accounts: { some: { type: "investment" } } } },
        },
      }),
      prisma.user.count({
        where: {
          ...realUser,
          OR: [
            { ownedCircles: { some: { archivedAt: null } } },
            { circleMemberships: { some: { status: "active" } } },
          ],
        },
      }),
      prisma.user.count({
        where: { ...realUser, splitBills: { some: {} } },
      }),
    ]),
    getPostHogFeatureFunnels(getAdminDataEnvironment()),
    prisma.user.findMany({
      where: { ...realUser, createdAt: { gte: eightWeeksAgo } },
      select: { createdAt: true },
    }),
    prisma.importFile.findMany({
      where: {
        ...activeImport,
        uploadedAt: { gte: eightWeeksAgo },
        workspace: realWorkspace,
      },
      select: { uploadedAt: true },
    }),
  ]);

  const transactionSummary = transactionSummaryRows[0] ?? {
    transactionCount: 0n,
    trackedAmount: 0,
  };
  const transactions = Number(transactionSummary.transactionCount);
  const [
    onboardedUsers,
    activatedUsers,
    usersWithImports,
    activatedUsersWithTransactions,
    usersStartedTracking,
    usersWithTransactions,
    usersWithRecentTransactions,
  ] = funnelCounts;

  const activity = Array.from({ length: 8 }, (_, index) => {
    const start = new Date(
      eightWeeksAgo.getTime() + index * 7 * 24 * 60 * 60 * 1000,
    );
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    return {
      label: new Intl.DateTimeFormat("en-PH", {
        month: "short",
        day: "numeric",
      }).format(start),
      signups: recentSignups.filter(
        (item) => item.createdAt >= start && item.createdAt < end,
      ).length,
      imports: recentImports.filter(
        (item) => item.uploadedAt >= start && item.uploadedAt < end,
      ).length,
    };
  });

  const databaseFallbacks = {
    users,
    accounts: usersStartedTracking,
    transactions: usersWithTransactions,
    imports: usersWithImports,
    recurring: adoptionCounts[0],
    budgets: adoptionCounts[1],
    goals: adoptionCounts[2],
    investments: adoptionCounts[3],
    circles: adoptionCounts[4],
    splitBills: adoptionCounts[5],
  } as const;
  const adoption = FEATURE_FUNNEL_DEFINITIONS.map((feature) => ({
    key: feature.key,
    label: feature.label,
    description: feature.description,
    status: posthogFeatureFunnels.status === "ready" ? "live" as const : "fallback" as const,
    steps: feature.steps.map((step) => {
      const eventCount = posthogFeatureFunnels.counts[`${feature.key}__${step.key}`];
      if (posthogFeatureFunnels.status === "ready" && eventCount !== undefined) {
        return { label: step.label, count: eventCount, source: "PostHog" as const };
      }

      if (step.databaseFallback) {
        return { label: step.label, count: databaseFallbacks[step.databaseFallback], source: "Database" as const };
      }

      return { label: step.label, count: 0, source: "Unavailable" as const };
    }),
  }));

  return {
    adoptionBase: users,
    metrics: [
      { label: "Users", value: formatCount(users), href: "/admin/users" },
      {
        label: "Profiles",
        value: formatCount(workspaces),
        href: "/admin/users",
      },
      {
        label: "Accounts",
        value: formatCount(bankAccounts),
        href: "/admin/users",
      },
      {
        label: "Transactions",
        value: formatCount(transactions),
        href: "/admin/users",
      },
      {
        label: "Amount tracked",
        value: formatTrackedAmount(transactionSummary.trackedAmount),
        note: "Absolute total · mixed currencies",
        href: "/admin/users",
      },
      { label: "Imports", value: formatCount(imports), href: "/admin/data-qa" },
      {
        label: "Current deploy errors",
        value: formatCount(errors24h),
        href: "/admin/errors",
      },
    ],
    funnels: [
      {
        name: "Activation",
        steps: [
          { label: "Signed up", count: users },
          { label: "Onboarded", count: onboardedUsers },
          { label: "Started tracking", count: activatedUsers },
          { label: "Has transactions", count: activatedUsersWithTransactions },
        ],
      },
      {
        name: "Core tracking",
        steps: [
          { label: "Started tracking", count: usersStartedTracking },
          { label: "Has transactions", count: usersWithTransactions },
          { label: "Added data in 30d", count: usersWithRecentTransactions },
        ],
      },
      {
        name: "Repeat use",
        steps: [
          { label: "Active 30d", count: retentionCounts[0] },
          { label: "Active 7d", count: retentionCounts[1] },
          { label: "Returned", count: retentionCounts[2] },
        ],
      },
    ],
    retention: {
      active30d: retentionCounts[0],
      active7d: retentionCounts[1],
      returning7d: retentionCounts[2],
    },
    activity,
    adoption,
    attention: [
      {
        label: "Processing imports",
        value: analytics[1],
        status: analytics[1] ? "warning" : "good",
        href: "/admin/operations#imports",
      },
      {
        label: "Failed imports, 7d",
        value: analytics[3],
        status: analytics[3] ? "danger" : "good",
        href: "/admin/data-qa",
      },
      {
        label: "Review queue",
        value: analytics[4],
        status: analytics[4] ? "warning" : "good",
        href: "/admin/data-qa",
      },
      {
        label: "Low confidence",
        value: analytics[5],
        status: analytics[5] ? "warning" : "good",
        href: "/admin/data-qa",
      },
      {
        label: "Current deploy errors",
        value: errors24h,
        status: errors24h ? "danger" : "good",
        href: "/admin/errors",
      },
    ],
  };
}
