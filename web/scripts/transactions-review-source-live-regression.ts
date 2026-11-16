import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
const database = new URL(process.env.DATABASE_URL ?? "");
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.port, "55439");
assert.equal(database.pathname, "/clover_qa");
async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { clerkUserId: "local-admin" } });
  const profile = await prisma.workspace.create({ data: { userId: user.id, name: "Disposable review regression" } });
  try {
    const account = await prisma.account.create({ data: { workspaceId: profile.id, name: "QA", type: "bank", currency: "PHP" } });
    const category = await prisma.category.create({ data: { workspaceId: profile.id, name: "QA", type: "expense" } });
    const file = await prisma.importFile.create({ data: { workspaceId: profile.id, fileName: "qa-origin.csv", fileType: "text/csv", storageKey: "synthetic/source", status: "done" } });
    const ids = Array.from({ length: 51 }, (_, i) => `review-${profile.id}-${String(i).padStart(3, "0")}`);
    await prisma.transaction.createMany({ data: ids.map((id, i) => ({ id, workspaceId: profile.id, accountId: account.id, categoryId: category.id, date: new Date("2026-09-08"), merchantRaw: "RAW", merchantClean: `Fixture ${i}`, amount: "1", type: "expense", currency: "PHP", importFileId: file.id, reviewStatus: i === 25 ? "pending_review" : "confirmed", parserConfidence: i === 25 ? 30 : 98, categoryConfidence: 98, accountMatchConfidence: 98 })) });
    const before = await prisma.transaction.findMany({ where: { workspaceId: profile.id }, orderBy: { id: "asc" } });
    for (const mode of ["light", "full"]) {
      const query = new URLSearchParams({ workspaceId: profile.id, summaryMode: mode, pageSize: "25", sortField: "date", sortDirection: "desc" });
      const response = await fetch(`http://localhost:4321/api/transactions?${query}`);
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.summary.review, 1);
      assert.equal(data.summary.firstReviewTransaction.id, ids[25]);
      assert.equal(data.summary.firstReviewTransactionIndex, 25);
      assert.equal(data.transactions.length, 25);
      assert.equal(data.transactions.some((row: { id: string }) => row.id === ids[25]), false);
      assert.equal(data.transactions[0].importFileId, file.id);
      assert.equal(data.transactions[0].importFileName, "qa-origin.csv");
      query.set("query", "Fixture 50");
      const filtered = await (await fetch(`http://localhost:4321/api/transactions?${query}`)).json();
      assert.equal(filtered.totalCount, 1);
      assert.equal(filtered.summary.review, 0);
      assert.equal(filtered.summary.firstReviewTransaction, null);
    }
    const detail = await (await fetch(`http://localhost:4321/api/transactions/${ids[50]}`)).json();
    assert.equal(detail.transaction.importFileName, "qa-origin.csv");
    assert.deepEqual(await prisma.transaction.findMany({ where: { workspaceId: profile.id }, orderBy: { id: "asc" } }), before);
    console.log("PASS: unloaded review target, zero-based boundary, filtered count, light/full/detail source reference, unchanged records");
  } finally { await prisma.workspace.delete({ where: { id: profile.id } }); await prisma.$disconnect(); }
}
void main();
