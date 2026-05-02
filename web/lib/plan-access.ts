import type { UserLimits } from "@/lib/user-limits";
import { getEffectiveUserLimits } from "@/lib/user-limits";
import { prisma } from "@/lib/prisma";
import { countNonCashAccounts } from "@/lib/account-limit-count";

export { countNonCashAccounts } from "@/lib/account-limit-count";

type PlanLimitSource = {
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

export const countWorkspaceImportFilesThisMonth = (workspaceId: string, referenceDate = new Date()) =>
  prisma.importFile.count({
    where: {
      workspaceId,
      createdAt: {
        gte: getMonthStart(referenceDate),
      },
    },
  });

export async function getWorkspaceOwnerLimits(workspaceId: string): Promise<UserLimits | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      user: {
        select: {
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
