import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { removeEmptyNonDefaultCashAccounts } from "../lib/empty-cash-account-cleanup";

const readSource = (relativePath: string) => readFile(path.join(process.cwd(), relativePath), "utf8");

async function main() {
  let accountWhere: Record<string, unknown> | null = null;
  let auditRows: Array<Record<string, unknown>> = [];
  let deletedAccountIds: string[] = [];
  const tx = {
    workspace: {
      findUnique: async () => ({
        user: {
          regionalPreferences: { baseCurrency: "SGD" },
        },
      }),
    },
    account: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        accountWhere = where;
        return [{ id: "cash-thb", name: "Cash", currency: "THB" }];
      },
      deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        deletedAccountIds = where.id.in;
        return { count: deletedAccountIds.length };
      },
    },
    auditLog: {
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        auditRows = data;
        return { count: data.length };
      },
    },
  };

  const removed = await removeEmptyNonDefaultCashAccounts(tx as never, {
    workspaceId: "workspace-1",
    accountIds: ["cash-thb", "cash-thb"],
    actorUserId: "user-1",
  });

  assert.deepEqual(removed, ["cash-thb"]);
  assert.deepEqual(deletedAccountIds, ["cash-thb"]);
  assert.equal(auditRows[0]?.action, "empty_cash_account_removed");
  assert.equal(accountWhere?.type, "cash");
  assert.equal(accountWhere?.source, "manual");
  assert.deepEqual(accountWhere?.currency, { not: "SGD" });
  assert.equal(accountWhere?.nameCustomized, false);
  assert.equal(accountWhere?.institutionCustomized, false);
  assert.equal(accountWhere?.logoCustomized, false);
  assert.deepEqual(accountWhere?.transactions, { none: { deletedAt: null } });
  assert.deepEqual(accountWhere?.financialCommitments, { none: {} });
  assert.deepEqual(accountWhere?.budgets, { none: {} });
  assert.deepEqual(accountWhere?.accountRules, { none: {} });

  const [singleDeleteRoute, bulkDeleteRoute, accountsRoute, transactionsPage, cleanupSource] = await Promise.all([
    readSource("app/api/transactions/[transactionId]/route.ts"),
    readSource("app/api/transactions/bulk-delete/route.ts"),
    readSource("app/api/accounts/route.ts"),
    readSource("app/transactions/page.tsx"),
    readSource("lib/empty-cash-account-cleanup.ts"),
  ]);
  assert.match(singleDeleteRoute, /removeEmptyNonDefaultCashAccounts\(tx,/);
  assert.match(bulkDeleteRoute, /removeEmptyNonDefaultCashAccounts\(tx,/);
  assert.match(accountsRoute, /cleanupEmptyCashAccounts[\s\S]{0,500}removeEmptyNonDefaultCashAccounts\(tx,/);
  assert.match(singleDeleteRoute, /NextResponse\.json\(\{ ok: true, removedAccountIds \}\)/);
  assert.match(bulkDeleteRoute, /removedAccountIds,/);
  assert.match(
    transactionsPage,
    /syncRemovedCashAccounts[\s\S]{0,500}setAccounts\(\(current\) => current\.filter/,
    "Removed cash accounts must disappear from Transactions without requiring navigation."
  );
  assert.match(
    transactionsPage,
    /\/api\/accounts\?workspaceId=\$\{encodeURIComponent\(workspaceId\)\}&cleanupEmptyCashAccounts=true/,
    "Loading Transactions must also remove eligible stale cash accounts left by earlier deletions."
  );
  assert.match(cleanupSource, /balance: null[\s\S]{0,100}new Prisma\.Decimal\(0\)/);
  assert.match(cleanupSource, /transactions:[\s\S]{0,80}none: \{ deletedAt: null \}/);

  console.log("Empty non-default cash account cleanup regression passed.");
}

void main();
