import { prisma } from "@/lib/prisma";
import { normalizeAccountBalanceSign } from "@/lib/account-balance";
import {
  getAccountCheckpointEffectiveTime,
  isAccountBalanceCheckpointEvidence,
} from "@/lib/account-balance-projection";
// Historical points require dated balance evidence for every selected account.
// Missing history is never filled with today's balance or invented growth.
export async function loadReportNetWorth(
  workspaceId: string,
  currency: string,
  from: Date,
  to: Date,
  accountId?: string,
) {
  const accounts = await prisma.account.findMany({
    where: { workspaceId, currency, ...(accountId ? { id: accountId } : {}) },
    select: {
      id: true,
      type: true,
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
  const histories = accounts.map((account) => ({
    type: account.type,
    points: account.statementCheckpoints
      .filter(isAccountBalanceCheckpointEvidence)
      .map((point) => ({
        time: getAccountCheckpointEffectiveTime(point),
        balance: Number(point.endingBalance),
      }))
      .filter((point) => point.time > 0 && Number.isFinite(point.balance))
      .sort((a, b) => a.time - b.time),
  }));
  const dates = [
    ...new Set(
      histories.flatMap((account) => account.points.map((point) => point.time)),
    ),
  ]
    .filter((time) => time >= +from && time <= +to)
    .sort((a, b) => a - b);
  const points = dates.flatMap((time) => {
    const values = histories.map((account) => {
      const point = account.points.filter((point) => point.time <= time).at(-1);
      return point
        ? normalizeAccountBalanceSign(account.type, point.balance)
        : null;
    });
    return values.length && values.every((value) => value !== null)
      ? [
          {
            date: new Date(time).toISOString().slice(0, 10),
            balance: values.reduce<number>(
              (total, value) => total + (value ?? 0),
              0,
            ),
          },
        ]
      : [];
  });
  return {
    points: [...new Map(points.map((point) => [point.date, point])).values()],
    accountCount: accounts.length,
  };
}
