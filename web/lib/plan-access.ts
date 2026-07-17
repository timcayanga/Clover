import type { UserLimits } from "@/lib/user-limits";
import { getEffectiveUserLimits } from "@/lib/user-limits";
import { prisma } from "@/lib/prisma";
import { countNonCashAccounts } from "@/lib/account-limit-count";

export { countNonCashAccounts } from "@/lib/account-limit-count";

type PlanLimitSource = {
  clerkUserId?: string | null;
  planTier: "free" | "pro";
  accountLimit: number | null;
  monthlyUploadLimit: number | null;
  transactionLimit: number | null;
};

export const getMonthStart = (referenceDate = new Date()) =>
  new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);

export const countWorkspaceTransactions = (workspaceId: string) =>
  prisma.transaction.count({
    where: { workspaceId },
  });

export const countWorkspaceOwnerTransactions = async (workspaceId: string) => {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { userId: true },
  });

  if (!workspace) {
    return 0;
  }

  return prisma.transaction.count({
    where: {
      workspace: {
        userId: workspace.userId,
      },
    },
  });
};

export const countWorkspaceImportFilesThisMonth = (workspaceId: string, referenceDate = new Date()) =>
  prisma.importFile.count({
    where: {
      workspaceId,
      status: "done",
      createdAt: {
        gte: getMonthStart(referenceDate),
      },
    },
  });

export const countWorkspaceOwnerImportFilesThisMonth = async (workspaceId: string, referenceDate = new Date()) => {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { userId: true },
  });

  if (!workspace) {
    return 0;
  }

  return prisma.importFile.count({
    where: {
      status: "done",
      workspace: {
        userId: workspace.userId,
      },
      createdAt: {
        gte: getMonthStart(referenceDate),
      },
    },
  });
};

export const countWorkspaceOwnerPlanLimitedAccounts = async (workspaceId: string) => {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { userId: true },
  });

  if (!workspace) {
    return 0;
  }

  const accounts = await prisma.account.findMany({
    where: {
      workspace: {
        userId: workspace.userId,
      },
    },
    select: {
      type: true,
      name: true,
      institution: true,
    },
  });

  return countNonCashAccounts(accounts);
};

export const getUserPlanUsage = async (userId: string, referenceDate = new Date()) => {
  const [accounts, monthlyUploadCount, transactionCount] = await Promise.all([
    prisma.account.findMany({
      where: {
        workspace: {
          userId,
        },
      },
      select: {
        type: true,
        name: true,
        institution: true,
      },
    }),
    prisma.importFile.count({
      where: {
        status: "done",
        workspace: {
          userId,
        },
        createdAt: {
          gte: getMonthStart(referenceDate),
        },
      },
    }),
    prisma.transaction.count({
      where: {
        workspace: {
          userId,
        },
      },
    }),
  ]);

  return {
    accountCount: countNonCashAccounts(accounts),
    cashAccountCount: accounts.filter((account) => account.type === "cash").length,
    monthlyUploadCount,
    transactionCount,
  };
};

export const getWorkspaceOwnerPlanUsage = async (workspaceId: string, referenceDate = new Date()) => {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { userId: true },
  });

  if (!workspace) {
    return null;
  }

  return getUserPlanUsage(workspace.userId, referenceDate);
};

export async function getWorkspaceOwnerLimits(workspaceId: string): Promise<UserLimits | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      user: {
        select: {
          clerkUserId: true,
          planTier: true,
          accountLimit: true,
          monthlyUploadLimit: true,
          transactionLimit: true,
        },
      },
    },
  });

  if (!workspace?.user) {
    return null;
  }

  return getEffectiveUserLimits(workspace.user as PlanLimitSource);
}
