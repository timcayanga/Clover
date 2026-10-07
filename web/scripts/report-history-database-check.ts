/** Optional integration check. Only runs against the dedicated disposable localhost database. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { prisma } from "../lib/prisma";
import { POST, GET } from "../app/api/reports/recoveries/route";
const url = new URL(process.env.DATABASE_URL ?? "");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55437");
assert.equal(url.pathname, "/clover_reports_b3");
const pool = new Pool({ connectionString: url.toString() });
async function main() {
  await prisma.user.create({
    data: {
      id: "local-user",
      clerkUserId: "local-clerk",
      email: "reports@example.invalid",
    },
  });
  await prisma.workspace.createMany({
    data: [
      { id: "local-a", userId: "local-user", name: "A" },
      { id: "local-b", userId: "local-user", name: "B" },
    ],
  });
  await prisma.account.create({
    data: { id: "local-bank", workspaceId: "local-a", name: "Bank" },
  });
  await prisma.budget.create({
    data: {
      id: "local-budget",
      workspaceId: "local-a",
      name: "Dining",
      targetAmount: 1000,
    },
  });
  // Apply the actual migration to a pre-existing budget and empty new tables.
  await pool.query(
    'DROP TRIGGER IF EXISTS clover_budget_revision ON "Budget"; DROP FUNCTION IF EXISTS clover_record_budget_revision(); DROP TABLE "ReportRecovery", "BudgetRevision"',
  );
  await pool.query(
    `DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  );
  await pool.query(
    readFileSync(
      new URL(
        "../prisma/migrations/20261007120000_report_history_recoveries/migration.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal((await prisma.budgetRevision.findMany())[0].source, "baseline");
  await prisma.budget.update({
    where: { id: "local-budget" },
    data: { targetAmount: 2000 },
  });
  const before = await prisma.budgetRevision.findMany({
    orderBy: { sequence: "asc" },
  });
  assert.equal(before.length, 2);
  assert.equal((before[0].snapshot as any).targetAmount, 1000);
  assert.equal((before[1].snapshot as any).targetAmount, 2000);
  await prisma.budget.update({
    where: { id: "local-budget" },
    data: { emoji: "🍀" },
  });
  assert.equal(await prisma.budgetRevision.count(), 2);
  await prisma.budget.delete({ where: { id: "local-budget" } });
  assert.equal(await prisma.budgetRevision.count(), 3);
  assert.equal(
    (await prisma.budgetRevision.findFirst({ orderBy: { sequence: "desc" } }))!
      .source,
    "delete",
  );
  await prisma.budget.create({
    data: {
      id: "local-new",
      workspaceId: "local-a",
      name: "New",
      targetAmount: 3000,
    },
  });
  assert.equal(
    (await prisma.budgetRevision.findFirst({
      where: { budgetId: "local-new" },
    }))!.source,
    "insert",
  );
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      await tx.budget.update({
        where: { id: "local-new" },
        data: { targetAmount: 9000 },
      });
      throw Error("rollback");
    }),
  );
  assert.equal(
    await prisma.budgetRevision.count({ where: { budgetId: "local-new" } }),
    1,
  );
  for (const [id, type, amount] of [
    ["local-expense", "expense", 500],
    ["local-payment", "income", 300],
    ["local-payment-2", "income", 300],
  ] as const)
    await prisma.transaction.create({
      data: {
        id,
        workspaceId: "local-a",
        accountId: "local-bank",
        merchantRaw: id,
        date: new Date("2026-10-05T00:00:00Z"),
        amount,
        type,
        reviewStatus: "edited",
      },
    });
  const original = await prisma.transaction.findMany({
    orderBy: { id: "asc" },
  });
  const request = (body: object) =>
    new Request(
      "https://clover.example/api/reports/recoveries?workspaceId=local-a",
      {
        method: "POST",
        headers: {
          origin: "https://clover.example",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
  const data = {
    action: "create",
    expenseId: "local-expense",
    incomingId: "local-payment",
    amount: 300,
    kind: "refund",
  };
  const results = await Promise.all([
    POST(request(data)),
    POST(request({ ...data, incomingId: "local-payment-2" })),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const candidates = await GET(
    new Request(
      "https://clover.example/api/reports/recoveries?workspaceId=local-a&type=expense&currency=PHP",
    ),
  );
  assert.equal(candidates.status, 200);
  assert.equal((await candidates.json()).candidates[0].available, 200);
  assert.deepEqual(
    await prisma.transaction.findMany({ orderBy: { id: "asc" } }),
    original,
  );
  const recovery = await prisma.reportRecovery.findFirstOrThrow();
  assert.equal(
    (await POST(request({ action: "delete", id: recovery.id }))).status,
    200,
  );
  await prisma.workspace.delete({ where: { id: "local-a" } });
  assert.equal(await prisma.budgetRevision.count(), 0);
  assert.equal(await prisma.reportRecovery.count(), 0);
  const security = await pool.query(
    `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('BudgetRevision','ReportRecovery')`,
  );
  assert(security.rows.every((r) => r.relrowsecurity));
  await prisma.user.delete({ where: { id: "local-user" } });
  console.log(
    "Local PostgreSQL passed: real migration baseline, trigger inserts/updates/deletes, rollback, concurrent API limits, original record immutability, RLS and Profile erasure.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
