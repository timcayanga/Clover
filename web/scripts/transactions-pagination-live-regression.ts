import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";

// Never create fixtures on a shared/staging database.
const database = new URL(process.env.DATABASE_URL ?? "");
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.port, "55439");
assert.equal(database.pathname, "/clover_qa");
const origin = "http://localhost:4321";
const count = 201;
const directions = ["asc", "desc"] as const;
const fields = ["date", "name", "amount", "account", "category"] as const;

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { clerkUserId: "local-admin" } });
  const profile = await prisma.workspace.create({ data: { userId: user.id, name: "Disposable tied-pagination regression" } });
  try {
    const account = await prisma.account.create({ data: { workspaceId: profile.id, name: "QA Checking", type: "bank", currency: "PHP" } });
    const category = await prisma.category.create({ data: { workspaceId: profile.id, name: "QA Food", type: "expense" } });
    const fixture = Array.from({ length: count }, (_, index) => ({
      id: `qa-tie-${profile.id}-${String(index).padStart(3, "0")}`,
      workspaceId: profile.id,
      accountId: account.id,
      categoryId: category.id,
      merchantClean: `Name ${index % 3}`,
      merchantRaw: "Original synthetic description",
      amount: String(index % 3 + 1),
      currency: "PHP",
      type: "expense" as const,
      reviewStatus: "confirmed" as const,
      date: new Date("2026-09-08T00:00:00Z"),
      createdAt: new Date("2026-09-08T00:00:00Z"),
    }));
    await prisma.transaction.createMany({ data: fixture });
    let sequences = 0;
    for (const summaryMode of ["light", "full"]) {
      for (const field of fields) for (const direction of directions) {
        // Independent expected order: all other keys tie, with three name/amount
        // groups. A stable ID must resolve ties within every group and page.
        const expected = [...fixture].sort((a, b) => {
          const primaryA = field === "name" ? a.merchantClean : field === "amount" ? Number(a.amount) : 0;
          const primaryB = field === "name" ? b.merchantClean : field === "amount" ? Number(b.amount) : 0;
          const primary = primaryA < primaryB ? -1 : primaryA > primaryB ? 1 : 0;
          const tie = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
          return (direction === "asc" ? 1 : -1) * (primary || tie);
        }).map(row => row.id);
        for (const pageSize of [25, 50, 100, 200]) {
          const ids: string[] = [];
          for (let page = 1; page <= Math.ceil(count / pageSize); page++) {
            const query = new URLSearchParams({ workspaceId: profile.id, currency: "PHP", summaryMode, sortField: field, sortDirection: direction, pageSize: String(pageSize), page: String(page) });
            const response = await fetch(`${origin}/api/transactions?${query}`, { signal: AbortSignal.timeout(30000) });
            assert.equal(response.status, 200, `${summaryMode}/${field}/${direction}/${pageSize}/${page}`);
            const data = await response.json();
            assert.equal(data.totalCount, count);
            assert.equal(data.transactions.length, Math.min(pageSize, count - (page - 1) * pageSize));
            assert.equal(data.summary.income, 0);
            assert.equal(data.summary.spending, 402);
            ids.push(...data.transactions.map((row: { id: string }) => row.id));
          }
          assert.equal(new Set(ids).size, count, "No repeated or missing records across pages");
          assert.deepEqual(ids, expected, `${summaryMode}/${field}/${direction}/${pageSize}: stable complete order`);
          sequences++;
        }
      }
    }
    console.log(`PASS: ${sequences} complete pagination sequences; 201 unique tied rows each; light/full summaries remain 0/402.`);
  } finally {
    await prisma.workspace.delete({ where: { id: profile.id } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
