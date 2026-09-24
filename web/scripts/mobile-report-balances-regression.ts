import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { mobileReportBalances } from "../lib/mobile-report-balances";
import { buildActiveWorkspaceTransactionWhere } from "../lib/transaction-query";

async function main() {
  const now = new Date("2026-09-14T18:00:00Z"); // September 15 in Manila.
  const transaction = (
    accountId: string,
    amount: string,
    type: string,
    date: string,
    rawPayload: unknown = null,
  ) => ({
    accountId,
    amount,
    type,
    date: new Date(date),
    createdAt: new Date(date),
    currency: "PHP",
    merchantRaw: "Example",
    merchantClean: null,
    description: null,
    rawPayload,
  });
  const movements = [
    transaction("bank", "2000", "income", "2026-09-14T00:00:00Z"),
    transaction("bank", "500", "expense", "2026-09-14T16:30:00Z"),
    transaction("bank", "1000", "transfer", "2026-09-14T17:00:00Z", {
      amountDelta: -1000,
    }),
    transaction("cash", "1000", "transfer", "2026-09-14T17:00:00Z", {
      amountDelta: 1000,
    }),
  ];
  let accounts = [
    {
      id: "bank",
      type: "bank",
      source: "manual",
      currency: "PHP",
      balance: "10000",
      transactions: movements.filter((t) => t.accountId === "bank"),
      statementCheckpoints: [],
    },
    {
      id: "cash",
      type: "cash",
      source: "manual",
      currency: "PHP",
      balance: "0",
      transactions: movements.filter((t) => t.accountId === "cash"),
      statementCheckpoints: [],
    },
  ];
  const originalAccounts = prisma.account.findMany,
    originalMovements = prisma.transaction.findMany;
  const originalLinks = prisma.finverseAccountLink.findMany;
  prisma.finverseAccountLink.findMany = (async () => []) as typeof originalLinks;
  const before = JSON.stringify({ accounts, movements });
  prisma.account.findMany = (async (args: any) => {
    assert.deepEqual(args.where, { workspaceId: "profile-a", currency: "PHP" });
    assert.deepEqual(args.select.transactions.where, {
      deletedAt: null,
      isExcluded: false,
      account: { source: "manual" },
    });
    return accounts;
  }) as typeof originalAccounts;
  prisma.transaction.findMany = (async (args: any) => {
    assert.deepEqual(
      args.where,
      buildActiveWorkspaceTransactionWhere("profile-a", {
        currency: "PHP",
        date: {
          gte: new Date("2026-08-16T16:00:00Z"),
          lt: new Date("2026-09-15T16:00:00Z"),
        },
      }),
    );
    return movements;
  }) as typeof originalMovements;
  try {
    const result = await mobileReportBalances("profile-a", "PHP", now);
    assert.equal(result.weekly.length, 7);
    assert.equal(result.monthly.length, 30);
    assert.deepEqual(result.weekly.at(-1), {
      date: "2026-09-15",
      balance: 11500,
    });
    assert.deepEqual(result.weekly.at(-2), {
      date: "2026-09-14",
      balance: 12000,
    });
    assert.equal(result.monthly[0].balance, 10000);
    assert.deepEqual(result.weekly, result.monthly.slice(-7));
    assert.equal(JSON.stringify({ accounts, movements }), before);
    assert.deepEqual(Object.keys(result).sort(), [
      "accountCount",
      "currency",
      "monthly",
      "range",
      "weekly",
    ]);
    accounts = [];
    assert.deepEqual(
      (await mobileReportBalances("profile-a", "PHP", now)).monthly,
      [],
    );
    accounts = [
      {
        id: "unknown",
        type: "bank",
        source: "import",
        currency: "PHP",
        balance: null as unknown as string,
        transactions: [],
        statementCheckpoints: [],
      },
    ];
    assert.deepEqual(
      (await mobileReportBalances("profile-a", "PHP", now)).monthly,
      [],
      "Unknown balance must not become a zero line",
    );
  } finally {
    prisma.finverseAccountLink.findMany = originalLinks;
    prisma.account.findMany = originalAccounts;
    prisma.transaction.findMany = originalMovements;
  }
  console.log(
    "Native report balances: shared web reconciliation, transfer neutrality, Manila dates, currency/Profile scoping, empty/unknown history and no writes passed.",
  );
}
void main();
