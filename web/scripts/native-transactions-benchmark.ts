import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { prisma } from "../lib/prisma";
import { GET } from "../app/api/transactions/route";
import { withMobileRequestContext } from "../lib/mobile-request-context";
import { mobileApiResponse } from "../lib/mobile-api-response";

type Page = { transactions: { id: string }[]; page: number; hasMore?: boolean; totalCount: number; totalCountIsExact?: boolean };
const rowCount = 50_000;

async function main() {
  assert.equal(process.env.DATABASE_URL, "postgresql://clover_benchmark@127.0.0.1:56547/clover_transaction_bench");
  const { GET: baseline } = await import(pathToFileURL(process.env.CLOVER_TRANSACTION_BENCH_BASELINE!).href) as { GET: typeof GET };
  const user = await prisma.user.create({ data: { clerkUserId: "qa-transactions", email: "qa@example.invalid" } });
  const workspace = await prisma.workspace.create({ data: { userId: user.id, name: "Large synthetic Profile" } });
  const other = await prisma.workspace.create({ data: { userId: user.id, name: "Other Profile" } });
  const account = await prisma.account.create({ data: { workspaceId: workspace.id, name: "BPI QA", institution: "BPI", accountNumber: "1234", currency: "PHP", type: "bank" } });
  const source = await prisma.importFile.create({ data: { workspaceId: workspace.id, fileName: "synthetic.pdf", fileType: "application/pdf", storageKey: "synthetic.pdf" } });
  const category = await prisma.category.create({ data: { workspaceId: workspace.id, name: "Food & Dining", type: "expense" } });
  await prisma.$executeRaw`INSERT INTO "Transaction"
    ("id","workspaceId","accountId","importFileId","categoryId","date","amount","currency","type","merchantRaw","reviewStatus","createdAt","updatedAt","deletedAt","rawPayload")
    SELECT 'fixture-' || n, ${workspace.id}, ${account.id}, ${source.id}, ${category.id},
      TIMESTAMP '2026-01-01' + (n / 120) * INTERVAL '1 day', 120.50,
      CASE WHEN n % 40 = 0 THEN 'USD' ELSE 'PHP' END, 'expense',
      CASE WHEN n % 2 = 0 THEN 'Starbucks' ELSE 'Jollibee' END, 'confirmed',
      TIMESTAMP '2026-11-01', TIMESTAMP '2026-11-01',
      CASE WHEN n % 71 = 0 THEN TIMESTAMP '2026-11-02' ELSE NULL END,
      jsonb_build_object('fixture', n, 'statementEvidence', repeat('qa', 500))
    FROM generate_series(1, ${rowCount}) AS n`;
  const tag = await prisma.tag.create({ data: { workspaceId: workspace.id, name: "Synthetic", normalizedName: "synthetic" } });
  await prisma.transactionTag.create({ data: { tagId: tag.id, transactionId: "fixture-50000" } });
  await prisma.$executeRaw`ANALYZE "Transaction"`;

  async function run(handler: typeof GET, fast: boolean, options: Record<string, string> = {}, userId = user.clerkUserId) {
    const params = new URLSearchParams({ workspaceId: workspace.id, summaryMode: "rows", page: "1", pageSize: "30", ...options });
    if (fast) params.set("pagination", "lookahead");
    const request = new Request(`https://fixture.invalid/api/mobile/v1/transactions?${params}`);
    const started = performance.now();
    const response = await withMobileRequestContext(userId, request, () => handler(request));
    const body = mobileApiResponse("transactions", await response.json()) as Page;
    return { body, ms: performance.now() - started, status: response.status, timings: response.headers.get("Server-Timing") };
  }
  const list = async (handler: typeof GET, fast: boolean, options?: Record<string, string>) => {
    const result = await run(handler, fast, options);
    assert.equal(result.status, 200);
    return result;
  };
  const oldFirst = await list(baseline, false);
  const newFirst = await list(GET, true);
  const legacy = await list(GET, false);
  assert.equal(oldFirst.body.transactions.length, 30);
  assert.deepEqual(newFirst.body.transactions, oldFirst.body.transactions, "Preserve every projected row field, logo, tag and review state");
  assert.equal(legacy.body.totalCount, oldFirst.body.totalCount, "Older clients keep exact counts");
  assert.equal(newFirst.body.hasMore, true);
  assert.equal(newFirst.body.totalCountIsExact, false);
  assert.match(newFirst.timings ?? "", /tx_scope;dur=.*tx_query;dur=.*tx_rows;dur=/);
  const second = await list(GET, true, { page: "2" });
  assert.deepEqual(second.body.transactions, (await list(baseline, false, { page: "2" })).body.transactions);
  assert.equal(new Set([...newFirst.body.transactions, ...second.body.transactions].map(row => row.id)).size, 60);
  const last = await list(GET, true, { page: String(Math.ceil(oldFirst.body.totalCount / 30)) });
  assert.equal(last.body.hasMore, false);
  assert.equal(last.body.totalCount, oldFirst.body.totalCount);
  const empty = await list(GET, true, { workspaceId: other.id });
  assert.equal(empty.body.transactions.length, 0);
  assert.equal(empty.body.hasMore, false);
  assert.notEqual((await run(GET, true, {}, "unknown-user")).status, 200);
  for (const filter of [{ reviewFilter: "pending" }, { query: "Starbucks" }, { categoryId: category.id, dateFilterMode: "custom", customStart: "2026-02-01", customEnd: "2026-02-01" }]) {
    const before = await list(baseline, false, filter as Record<string, string>);
    const after = await list(GET, true, filter as Record<string, string>);
    assert.deepEqual(after.body.transactions, before.body.transactions);
    if ("reviewFilter" in filter) assert.equal(after.body.totalCount, before.body.totalCount);
  }

  const durations = { before: [] as number[], after: [] as number[] };
  for (let i = 0; i < 20; i++) {
    // Alternate order so warming and other local activity do not favor one route.
    if (i % 2 === 0) {
      durations.before.push((await list(baseline, false)).ms);
      durations.after.push((await list(GET, true)).ms);
    } else {
      durations.after.push((await list(GET, true)).ms);
      durations.before.push((await list(baseline, false)).ms);
    }
  }
  const stats = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const percentile = (p: number) => Number(sorted[Math.ceil(values.length * p) - 1].toFixed(1));
    return { median_ms: percentile(0.5), p95_ms: percentile(0.95) };
  };
  console.log(JSON.stringify({ rows: rowCount, measured_requests_per_route: 20,
    boundary: "local route and native projection", before: stats(durations.before), after: stats(durations.after),
  }));
  console.log("PASS Transactions paging, ordering, display parity, Profile isolation and legacy compatibility");
}
void main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
