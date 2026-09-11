import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
const database = new URL(process.env.DATABASE_URL ?? "");
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.port, "55439");
assert.equal(database.pathname, "/clover_qa");
async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { clerkUserId: "local-admin" } });
  const profile = await prisma.workspace.create({ data: { userId: user.id, name: "Disposable summary ranking regression" } });
  try {
    const account = await prisma.account.create({ data: { workspaceId: profile.id, name: "Cash flow", type: "bank", currency: "PHP" } });
    const transferAccount = await prisma.account.create({ data: { workspaceId: profile.id, name: "Transfer source", type: "bank", currency: "PHP" } });
    const income = await prisma.category.create({ data: { workspaceId: profile.id, name: "Income", type: "income" } });
    const transfers = await prisma.category.create({ data: { workspaceId: profile.id, name: "Transfers", type: "transfer" } });
    const base = { workspaceId: profile.id, accountId: account.id, date: new Date("2026-09-08"), currency: "PHP", merchantRaw: "Synthetic", reviewStatus: "confirmed" as const, parserConfidence: 98, categoryConfidence: 98, accountMatchConfidence: 98 };
    await prisma.transaction.createMany({ data: [
      { ...base, merchantClean: "Salary", amount: "100", type: "income", categoryId: income.id },
      { ...base, merchantClean: "Food", amount: "15", type: "expense" },
      { ...base, merchantClean: "Transfer only", amount: "200", type: "transfer", isTransfer: true, accountId: transferAccount.id, categoryId: transfers.id },
      { ...base, merchantClean: "Excluded", amount: "500", type: "expense", isExcluded: true },
      { ...base, merchantClean: "Deleted", amount: "900", type: "expense", deletedAt: new Date() },
    ] });
    const before = await prisma.transaction.findMany({ where: { workspaceId: profile.id }, orderBy: { id: "asc" } });
    for (const [query, category, source, count, transferTotal] of [
      ["", ["Income", 100], ["Cash flow", 115], 4, 200],
      ["Transfer only", null, null, 1, 200],
      ["Salary", ["Income", 100], ["Cash flow", 100], 1, 0],
    ] as const) {
      const params = new URLSearchParams({ workspaceId: profile.id, summaryMode: "full", query, pageSize: "1" });
      const response = await fetch(`http://localhost:4321/api/transactions?${params}`);
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.totalCount, count);
      assert.deepEqual(data.summary.topCategory, category);
      assert.deepEqual(data.summary.topAccount, source);
      assert.equal(data.summary.transfers, transferTotal);
      if (!query) { assert.equal(data.summary.income, 100); assert.equal(data.summary.spending, 15); }
    }
    assert.deepEqual(await prisma.transaction.findMany({ where: { workspaceId: profile.id }, orderBy: { id: "asc" } }), before);
    console.log("PASS: rankings exclude transfers/excluded/deleted rows; transfer-only rankings empty; filtered and all-page totals correct; records unchanged");
  } finally { await prisma.workspace.delete({ where: { id: profile.id } }); await prisma.$disconnect(); }
}
void main();
