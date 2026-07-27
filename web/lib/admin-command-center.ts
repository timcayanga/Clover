import { prisma } from "@/lib/prisma";
import { getAdminDataEnvironment } from "@/lib/admin";
import type { AdminCommandCenterSnapshot } from "@/components/admin-command-center";

const formatCount = (value: number) => value.toLocaleString();

export async function getAdminCommandCenterSnapshot(): Promise<AdminCommandCenterSnapshot> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const eightWeeksAgo = new Date(now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000);
  const environment = getAdminDataEnvironment();
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
    transactions,
    imports,
    errors24h,
    analytics,
    funnelCounts,
    retentionCounts,
    adoptionCounts,
    recentSignups,
    recentImports,
  ] = await Promise.all([
    prisma.user.count({
      where: { environment },
    }),
    prisma.workspace.count({
      where: { user: { environment } },
    }),
    prisma.account.count({
      where: { workspace: { user: { environment } } },
    }),
    prisma.transaction.count({
      where: { ...activeTransaction, workspace: { user: { environment } } },
    }),
    prisma.importFile.count({
      where: { ...activeImport, workspace: { user: { environment } } },
    }),
    prisma.appErrorLog.count({
      where: {
        environment,
        occurredAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
    }),
    Promise.all([
      prisma.user.count({
        where: { environment, onboardingCompletedAt: { not: null } },
      }),
      prisma.importFile.count({
        where: { status: "processing", workspace: { user: { environment } } },
      }),
      prisma.importFile.count({
        where: {
          status: "done",
          updatedAt: { gte: sevenDaysAgo },
          workspace: { user: { environment } },
        },
      }),
      prisma.importFile.count({
        where: {
          status: "failed",
          updatedAt: { gte: sevenDaysAgo },
          workspace: { user: { environment } },
        },
      }),
      prisma.transaction.count({
        where: {
          ...activeTransaction,
          isExcluded: false,
          reviewStatus: {
            notIn: ["confirmed", "rejected", "duplicate_skipped"],
          },
          workspace: { user: { environment } },
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
          workspace: { user: { environment } },
        },
      }),
    ]),
    Promise.all([
      prisma.user.count({
        where: { environment, onboardingCompletedAt: { not: null } },
      }),
      prisma.user.count({
        where: {
          environment,
          workspaces: { some: { accounts: { some: {} } } },
        },
      }),
      prisma.user.count({
        where: {
          environment,
          workspaces: { some: { importFiles: { some: activeImport } } },
        },
      }),
      prisma.user.count({
        where: {
          environment,
          workspaces: {
            some: {
              importFiles: { some: { ...activeImport, status: "done" } },
            },
          },
        },
      }),
      prisma.user.count({
        where: {
          environment,
          workspaces: { some: { transactions: { some: activeTransaction } } },
        },
      }),
    ]),
    Promise.all([
      prisma.user.count({
        where: {
          environment,
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
        where: { environment, workspaces: { some: recentActivity } },
      }),
      prisma.user.count({
        where: {
          environment,
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
          environment,
          workspaces: { some: { recurringPatterns: { some: {} } } },
        },
      }),
      prisma.user.count({
        where: {
          environment,
          workspaces: { some: { budgets: { some: {} } } },
        },
      }),
      prisma.user.count({ where: { environment, goalSettings: { some: {} } } }),
      prisma.user.count({
        where: {
          environment,
          workspaces: { some: { accounts: { some: { type: "investment" } } } },
        },
      }),
      prisma.user.count({
        where: {
          environment,
          OR: [
            { ownedCircles: { some: { archivedAt: null } } },
            { circleMemberships: { some: { status: "active" } } },
          ],
        },
      }),
    ]),
    prisma.user.findMany({
      where: { environment, createdAt: { gte: eightWeeksAgo } },
      select: { createdAt: true },
    }),
    prisma.importFile.findMany({
      where: {
        ...activeImport,
        uploadedAt: { gte: eightWeeksAgo },
        workspace: { user: { environment } },
      },
      select: { uploadedAt: true },
    }),
  ]);

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

  return {
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
      { label: "Imports", value: formatCount(imports), href: "/admin/data-qa" },
      {
        label: "Errors 24h",
        value: formatCount(errors24h),
        href: "/admin/errors",
      },
    ],
    funnels: [
      {
        name: "Activation",
        steps: [
          { label: "Signed up", count: users },
          { label: "Onboarded", count: funnelCounts[0] },
          { label: "Added account", count: funnelCounts[1] },
          { label: "Uploaded", count: funnelCounts[2] },
          { label: "Has transactions", count: funnelCounts[4] },
        ],
      },
      {
        name: "Import success",
        steps: [
          { label: "Uploaded", count: funnelCounts[2] },
          { label: "Completed", count: funnelCounts[3] },
          { label: "Has transactions", count: funnelCounts[4] },
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
    adoption: [
      { label: "Recurring", users: adoptionCounts[0] },
      { label: "Budgeting", users: adoptionCounts[1] },
      { label: "Goals", users: adoptionCounts[2] },
      { label: "Investments", users: adoptionCounts[3] },
      { label: "Circles", users: adoptionCounts[4] },
    ],
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
        label: "Errors, 24h",
        value: errors24h,
        status: errors24h ? "danger" : "good",
        href: "/admin/errors",
      },
    ],
  };
}
