import { prisma } from "./prisma";
import {
  reportAccountBalance,
  buildReportBalanceSeries,
} from "./report-balances";
import { mobileHomePeriods } from "./mobile-home-periods";
import { getCalendarDayEndInTimeZone } from "./report-window";
import { buildActiveWorkspaceTransactionWhere } from "./transaction-query";

// Native Reports uses the same balance reconciliation and movement reversal as
// web Reports. This is read-only and keeps each currency and Profile separate.
export async function mobileReportBalances(
  workspaceId: string,
  currency: string,
  now = new Date(),
  window?:{start:Date;end:Date},
) {
  const { rolling, tomorrow } = mobileHomePeriods(now);
  const from = window && window.start<rolling(30).from?window.start:rolling(30).from;
  const [accounts, movements] = await Promise.all([
    prisma.account.findMany({
      where: { workspaceId, currency },
      select: {
        id: true,
        type: true,
        currency: true,
        source: true,
        balance: true,
        transactions: {
          where: {
            deletedAt: null,
            isExcluded: false,
            account: { source: "manual" },
          },
          select: {
            amount: true,
            currency: true,
            type: true,
            date: true,
            createdAt: true,
            merchantRaw: true,
            merchantClean: true,
            description: true,
            rawPayload: true,
          },
        },
        statementCheckpoints: {
          select: {
            endingBalance: true,
            status: true,
            statementEndDate: true,
            createdAt: true,
            sourceMetadata: true,
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    }),
    prisma.transaction.findMany({
      where: buildActiveWorkspaceTransactionWhere(workspaceId, {
        currency,
        date: { gte: from, lt: tomorrow },
      }),
      select: {
        accountId: true,
        amount: true,
        type: true,
        date: true,
        createdAt: true,
        merchantRaw: true,
        merchantClean: true,
        description: true,
        rawPayload: true,
      },
    }),
  ]);
  type RawPayload = Parameters<
    typeof buildReportBalanceSeries
  >[1][number]["rawPayload"];
  const balances = accounts.map((account) => ({
    id: account.id,
    currency: account.currency,
    balance: reportAccountBalance({
      ...account,
      transactions: account.transactions.map((transaction) => ({
        ...transaction,
        amount: transaction.amount.toString(),
        rawPayload: transaction.rawPayload as RawPayload,
      })),
    }),
  }));
  const asOf = getCalendarDayEndInTimeZone(now, "Asia/Manila");
  const datedMovements = movements.map((transaction) => ({
    ...transaction,
    amount: transaction.amount.toString(),
    rawPayload: transaction.rawPayload as RawPayload,
    date: getCalendarDayEndInTimeZone(transaction.date, "Asia/Manila"),
  }));
  const points = (days: number) =>
    buildReportBalanceSeries(
      balances,
      datedMovements,
      getCalendarDayEndInTimeZone(rolling(days).from, "Asia/Manila"),
      asOf,
      asOf,
    ).find((series) => series.currency === currency)?.points ?? [];
  return {
    currency,
    range:window?buildReportBalanceSeries(balances,datedMovements,getCalendarDayEndInTimeZone(window.start,"Asia/Manila"),getCalendarDayEndInTimeZone(window.end,"Asia/Manila"),asOf).find(series=>series.currency===currency)?.points??[]:[],
    weekly: points(7),
    monthly: points(30),
    accountCount: accounts.length,
  };
}
