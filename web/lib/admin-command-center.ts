import { prisma } from "@/lib/prisma";
import type { AdminCommandCenterSnapshot } from "@/components/admin-command-center";

const formatCount = (value: number) => value.toLocaleString();

export async function getAdminCommandCenterSnapshot(): Promise<AdminCommandCenterSnapshot> {
  const [users, workspaces, bankAccounts, transactions, imports, errors, analytics] = await Promise.all([
    prisma.user.count({
      where: {
        environment: "production",
      },
    }),
    prisma.workspace.count({
      where: {
        user: {
          environment: "production",
        },
      },
    }),
    prisma.account.count({
      where: {
        workspace: {
          user: {
            environment: "production",
          },
        },
      },
    }),
    prisma.transaction.count({
      where: {
        deletedAt: null,
        workspace: {
          user: {
            environment: "production",
          },
        },
      },
    }),
    prisma.importFile.count({
      where: {
        status: {
          not: "deleted",
        },
        workspace: {
          user: {
            environment: "production",
          },
        },
      },
    }),
    prisma.appErrorLog.count({
      where: {
        environment: "production",
      },
    }),
    Promise.all([
      prisma.user.count({
        where: {
          environment: "production",
          onboardingCompletedAt: { not: null },
        },
      }),
      prisma.importFile.count({
        where: {
          status: "processing",
          workspace: { user: { environment: "production" } },
        },
      }),
      prisma.importFile.count({
        where: {
          status: "done",
          updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          workspace: { user: { environment: "production" } },
        },
      }),
      prisma.importFile.count({
        where: {
          status: "failed",
          updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          workspace: { user: { environment: "production" } },
        },
      }),
      prisma.transaction.count({
        where: {
          deletedAt: null,
          isExcluded: false,
          reviewStatus: { notIn: ["confirmed", "rejected", "duplicate_skipped"] },
          workspace: { user: { environment: "production" } },
        },
      }),
      prisma.transaction.count({
        where: {
          deletedAt: null,
          isExcluded: false,
          OR: [
            { parserConfidence: { lt: 70 } },
            { categoryConfidence: { lt: 70 } },
            { accountMatchConfidence: { lt: 70 } },
          ],
          workspace: { user: { environment: "production" } },
        },
      }),
    ]),
  ]);

  return {
    metrics: [
      { label: "Production users", value: formatCount(users), href: "/admin/users" },
      { label: "Workspaces", value: formatCount(workspaces), href: "/admin/users" },
      { label: "Bank accounts", value: formatCount(bankAccounts), href: "/admin/users" },
      { label: "Transactions", value: formatCount(transactions), href: "/admin/users" },
      { label: "Imports", value: formatCount(imports), href: "/admin/data-qa" },
      { label: "Recent errors", value: formatCount(errors), href: "/admin/users" },
    ],
    analytics: {
      onboardingCompletedUsers: analytics[0],
      processingImports: analytics[1],
      completedImports7d: analytics[2],
      failedImports7d: analytics[3],
      reviewQueueItems: analytics[4],
      lowConfidenceItems: analytics[5],
    },
    cards: [
      {
        title: "Users",
        body: "Review production users, plan tiers, account limits, and activity signals.",
        href: "/admin/users",
      },
      {
        title: "Inquiries",
        body: "Triage support requests and keep customer conversations moving.",
        href: "/admin/inquiries",
      },
      {
        title: "Data QA",
        body: "Inspect imported statement quality, parser output, and training coverage.",
        href: "/admin/data-qa",
      },
    ],
  };
}
