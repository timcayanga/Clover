import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";

// Explicitly limited to the disposable local QA database, never shared data.
const database = new URL(process.env.DATABASE_URL ?? "");
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/clover_qa");
const origin = "http://127.0.0.1:4321";
async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(origin + path, { method, headers: { Origin: origin, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${!response.ok ? await response.text() : ""}`);
  return response.json();
}
async function main() {
  const user = await prisma.user.upsert({ where: { clerkUserId: "local-admin" }, update: {}, create: { id: "local-admin", clerkUserId: "local-admin", email: "local-admin@qa.invalid", verified: true } });
  const profile = await prisma.workspace.create({ data: { userId: user.id, name: "Isolated history regression" } });
  try {
    const account = await prisma.account.create({ data: { workspaceId: profile.id, name: "QA Checking", type: "bank", currency: "PHP" } });
    const category = await prisma.category.create({ data: { workspaceId: profile.id, name: "QA Food", type: "expense" } });
    const base = { workspaceId: profile.id, accountId: account.id, categoryId: category.id, date: new Date("2026-09-08"), currency: "PHP", reviewStatus: "confirmed" as const, merchantRaw: "QA History", rawPayload: { source: "qa", description: "Original source" } };
    await prisma.transaction.create({ data: { ...base, merchantClean: "Salary", type: "income", amount: "10000" } });
    await prisma.transaction.create({ data: { ...base, merchantClean: "Spending", type: "expense", amount: "1500" } });
    const excluded = await prisma.transaction.create({ data: { ...base, merchantClean: "Excluded", type: "expense", amount: "999", isExcluded: true } });
    await prisma.transaction.create({ data: { ...base, merchantClean: "Deleted", type: "expense", amount: "888", deletedAt: new Date() } });
    const list = (extra: Record<string, string>) => request("/api/transactions?" + new URLSearchParams({ workspaceId: profile.id, currency: "PHP", pageSize: "1", ...extra }));
    for (const summaryMode of ["light", "full"]) {
      for (const categoryFilter of [false, true]) {
        const filters = { summaryMode, ...(categoryFilter ? { categoryId: category.id } : {}) };
        const result = await list(filters);
        assert.equal(result.totalCount, 3, "History must count exclusions but not deletions");
        assert.equal(result.summary.income, 10000);
        assert.equal(result.summary.spending, 1500, "Exclusions must not affect totals");
        const seen = new Set<string>();
        for (let page = 1; page <= 3; page++) for (const row of (await list({ ...filters, page: String(page) })).transactions) seen.add(row.id);
        assert.equal(seen.size, 3);
        assert.ok(seen.has(excluded.id));
      }
    }
    await request(`/api/transactions/${excluded.id}`, "PATCH", { isExcluded: false });
    assert.equal((await list({ summaryMode: "light" })).summary.spending, 2499);
    await request(`/api/transactions/${excluded.id}`, "PATCH", { isExcluded: true });
    assert.equal((await list({ summaryMode: "light" })).summary.spending, 1500);
    assert.deepEqual((await prisma.transaction.findUniqueOrThrow({ where: { id: excluded.id } })).rawPayload, base.rawPayload);
    const created = await request("/api/transactions", "POST", { workspaceId: profile.id, accountId: account.id, categoryId: category.id, date: "2026-09-08", currency: "PHP", type: "expense", amount: "123.45", merchantRaw: "Saved with tags", tags: ["Work", "work", "Travel"] });
    const detail = await request(`/api/transactions/${created.transaction.id}`);
    assert.deepEqual(detail.transaction.tags.map((tag: { name: string }) => tag.name).sort(), ["Travel", "Work"]);
    console.log("PASS: history visibility, pagination, light/full/category-filtered totals, include/exclude round trip, raw preservation and tag persistence");
  } finally {
    await prisma.workspace.delete({ where: { id: profile.id } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
