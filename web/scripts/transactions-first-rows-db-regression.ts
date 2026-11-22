import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { mock } from "node:test";

const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.port, "55441");
assert.equal(database.pathname, "/clover_migration_qa");
assert(process.argv.includes("--execute"));
const require = createRequire(import.meta.url);

async function main() {
  const { prisma } = await import("../lib/prisma");
  const clerkUserId = `qa-${randomUUID()}`;
  const user = await prisma.user.create({ data: { clerkUserId, email: `${clerkUserId}@example.invalid` } });
  const authPath = require.resolve("../lib/auth");
  require.cache[authPath] = { id: authPath, filename: authPath, loaded: true,
    exports: { isLocalDevHost: async () => false, requireAuth: async () => ({ userId: clerkUserId }) },
  } as NodeModule;
  try {
    const { GET } = await import("../app/api/transactions/route");
    const workspace = await prisma.workspace.create({ data: { userId: user.id, name: "Desktop first rows QA" } });
    const account = await prisma.account.create({ data: { workspaceId: workspace.id, name: "QA Cash", currency: "PHP", type: "cash" } });
    const size = 30000;
    for (let start = 0; start < size; start += 1000) {
      await prisma.transaction.createMany({ data: Array.from({ length: 1000 }, (_, offset) => {
        const i = start + offset;
        return {
          workspaceId: workspace.id, accountId: account.id, date: new Date(Date.UTC(2025, 0, 1 + (i % 365))),
          merchantRaw: `Synthetic merchant ${i % 500}`, currency: i % 13 === 0 ? "USD" : "PHP",
          type: "expense", reviewStatus: "confirmed", amount: i % 100 + 1,
        };
      }) });
    }
    type Payload = { transactions: { id: string }[]; totalCount: number; totalCountIsExact: boolean; currencyCodes: string[] };
    async function load(page: number, preview: boolean) {
      const params = new URLSearchParams({ workspaceId: workspace.id, page: String(page), pageSize: "200", summaryMode: "rows" });
      if (preview) params.set("preview", "first_rows");
      else params.set("previewSize", "25");
      const start = performance.now();
      const response = await GET(new Request(`http://localhost/api/transactions?${params}`));
      assert.equal(response.status, 200);
      const body = await response.json() as Payload;
      assert.match(response.headers.get("server-timing") ?? "", /tx_scope;dur=.*tx_query;dur=.*tx_rows;dur=/);
      return { body, ms: performance.now() - start };
    }
    const previous: number[] = [], optimized: number[] = [];
    for (const page of [1, 25, 1, 25, 1, 25, 1, 25, 1, 25]) {
      const normal = await load(page, false);
      const fast = await load(page, true);
      assert.equal(normal.body.totalCount, size);
      assert.deepEqual(normal.body.currencyCodes, ["PHP", "USD"]);
      assert.equal(fast.body.totalCountIsExact, false);
      assert.equal(fast.body.transactions.length, 25);
      assert.deepEqual(fast.body.transactions.map(row => row.id), normal.body.transactions.map(row => row.id));
      previous.push(normal.ms);
      optimized.push(fast.ms);
    }
    // A drilldown can supply both a saved account ID and an imported identity.
    // Both aliases must resolve against the same directory snapshot.
    const alias = await prisma.account.create({ data: { workspaceId: workspace.id, name: "QA Cash", currency: "PHP", type: "cash" } });
    const originalFindMany = prisma.account.findMany;
    const directoryRead = mock.fn(originalFindMany);
    prisma.account.findMany = directoryRead;
    try {
      const params = new URLSearchParams({ workspaceId: workspace.id, summaryMode: "rows", accountId: alias.id, accountName: "QA Cash", accountType: "cash", accountCurrency: "PHP" });
      const response = await GET(new Request(`http://localhost/api/transactions?${params}`));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).totalCount, size);
      assert.equal(directoryRead.mock.callCount(), 1);
    } finally { prisma.account.findMany = originalFindMany; }
    // The same account list backs the web page and the native gateway.
    const accountsRoute = await import("../app/api/accounts/route");
    const { withMobileRequestContext } = await import("../lib/mobile-request-context");
    const { mobileApiResponse } = await import("../lib/mobile-api-response");
    const checking = await prisma.account.create({ data: { workspaceId: workspace.id, name: "QA Checking", institution: "QA Bank", accountNumber: "12345678", type: "bank", source: "upload", currency: "PHP" } });
    const checkpoint = { workspaceId: workspace.id, accountId: checking.id, status: "reconciled" as const };
    await prisma.accountStatementCheckpoint.createMany({ data: [
      { ...checkpoint, endingBalance: 870, statementEndDate: new Date("2026-09-01"), createdAt: new Date("2026-10-05") },
      { ...checkpoint, endingBalance: 950, statementEndDate: new Date("2026-10-01"), createdAt: new Date("2026-10-03") },
      { ...checkpoint, endingBalance: 10, sourceMetadata: { importMode: "receipt" }, createdAt: new Date("2026-10-06") },
    ] });
    const directoryRequest = new Request(`http://localhost/api/accounts?workspaceId=${workspace.id}`);
    const full = await accountsRoute.GET(directoryRequest);
    const compact = await withMobileRequestContext(clerkUserId, directoryRequest, () => accountsRoute.GET(directoryRequest));
    assert.equal(full.status, 200);
    assert.equal(compact.status, 200);
    const fullBody = await full.json();
    const compactBody = await compact.json();
    assert.equal(fullBody.accounts.find((a: { id: string }) => a.id === checking.id)?.balance, "950");
    assert.deepEqual(mobileApiResponse("accounts", compactBody), mobileApiResponse("accounts", fullBody));
    assert.ok(fullBody.statementCheckpoints.length > 0);
    assert.deepEqual(compactBody.statementCheckpoints, []);
    const percentile = (samples: number[], fraction: number) => [...samples].sort((a,b) => a-b)[Math.ceil(samples.length * fraction) - 1].toFixed(1);
    console.log(`30,000 transactions, 10 requests per path: baseline p50/p90 ${percentile(previous,.5)}/${percentile(previous,.9)}ms, first rows p50/p90 ${percentile(optimized,.5)}/${percentile(optimized,.9)}ms`);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
