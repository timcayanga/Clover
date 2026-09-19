import { prisma } from "@/lib/prisma";
import { buildReportNetWorth } from "@/lib/report-net-worth-data";

export async function loadReportNetWorthAccounts(workspaceId: string, accountId?: string, currency?: string) {
  return prisma.account.findMany({
    where: { workspaceId, ...(currency ? { currency } : {}), ...(accountId ? { id: accountId } : {}) },
    select: {
      id: true,
      type: true,
      currency: true,
      statementCheckpoints: {
        where: { endingBalance: { not: null }, status: { not: "mismatch" } },
        select: {
          endingBalance: true,
          statementEndDate: true,
          createdAt: true,
          sourceMetadata: true,
        },
        orderBy: { statementEndDate: "asc" },
      },
    },
  });
}

export async function loadReportNetWorth(workspaceId: string, currency: string, from: Date, to: Date, accountId?: string) {
  return buildReportNetWorth(await loadReportNetWorthAccounts(workspaceId, accountId, currency), currency, from, to);
}
