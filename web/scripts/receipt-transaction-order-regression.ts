import { mergeCommittedReceiptRows } from "../../mobile/src/committed-receipt-rows";
import type { Transaction } from "../../mobile/src/types";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { withMobileRequestContext } from "../lib/mobile-request-context";
import { GET } from "../app/api/transactions/route";
import { mobileApiResponse } from "../lib/mobile-api-response";

const restores: (() => void)[] = [];
function stub(target: object, key: string, implementation: unknown) {
  const original = Reflect.get(target, key);
  Reflect.set(target, key, implementation);
  restores.push(() => { Reflect.set(target, key, original); });
}
async function main() {
  const account = { id: "receipt-cash", name: "Cash", type: "cash", currency: "PHP", institution: null, accountNumber: null, source: "manual" };
  const created = Date.now();
  const fixtures = ["2026-09-09", "2026-10-05", "2026-09-28"].map((date, i) => ({
    id: `receipt-${i}`, workspaceId: "qa", accountId: account.id, account,
    date: new Date(`${date}T00:00:00Z`), createdAt: new Date(created - i * 1000),
    amount: String(100 + i), currency: "PHP", type: "expense", isTransfer: false, isExcluded: false,
    merchantRaw: `Receipt ${i}`, merchantClean: `Receipt ${i}`, description: null,
    categoryId: "food", category: { name: "Food & Dining" }, reviewStatus: "confirmed",
    parserConfidence: 98, categoryConfidence: 98, accountMatchConfidence: 100, duplicateConfidence: 0, transferConfidence: 0,
    importFileId: `import-${i}`, rawPayload: { source: "upload", sourceRowIndex: 0 }, normalizedPayload: {}, splitBill: null,
  }));
  // No database connections or writes. Use the real route, mapping, summaries,
  // query order and pagination against deterministic Prisma read fixtures.
  stub(prisma.clerkIdentityDeletion, "findUnique", async () => null);
  stub(prisma.workspace, "findFirst", async () => ({ id: "qa" }));
  stub(prisma.account, "findMany", async () => [account]);
  stub(prisma.category, "findMany", async () => [{ id: "food", name: "Food & Dining" }]);
  stub(prisma.transactionTag, "findMany", async () => []);
  stub(prisma.importFile, "findMany", async () => fixtures.map(r => ({ id: r.importFileId, fileName: "receipt.jpg" })));
  stub(prisma, "$queryRaw", async () => [{ currency: "PHP" }]);
  let snapshotReads = 0;
  stub(prisma, "$transaction", async (read: (db: typeof prisma) => Promise<unknown>, options: {isolationLevel: string}) => {
    assert.equal(options.isolationLevel, "RepeatableRead", "Page IDs and hydration use the same snapshot");
    snapshotReads++;
    return read(prisma);
  });
  stub(prisma, "$executeRaw", async () => { throw new Error("Receipt ordering must remain read-only"); });
  stub(prisma.transaction, "count", async () => fixtures.length);
  stub(prisma.transaction, "findFirst", async () => null);
  stub(prisma.transaction, "groupBy", async (query: Record<string, any>) => {
    // All fixtures are positive. Respect the separate negative-only aggregate
    // instead of returning the full sum for every WHERE clause.
    if (query.where?.AND?.some((condition: any) => condition.amount?.lt === 0)) return [];
    return [{ type: "expense", isTransfer: false, categoryId: "food", accountId: account.id, currency: "PHP", _sum: { amount: 303 } }];
  });
  stub(prisma.transaction, "findMany", async (query: Record<string, any>) => {
    if (query.where?.id?.in) {
      assert(query.where.id.in.every((id:string)=>fixtures.some(row=>row.id===id)));
      // Hydration may arrive in another database order; the route must restore
      // the order of the narrow, authorized ID page.
      return fixtures.filter(row=>query.where.id.in.includes(row.id)).reverse();
    }
    if (query.select?.id && query.orderBy && Object.keys(query.select).length===1) {
      assert(JSON.stringify(query.where).includes('"workspaceId":"qa"'), "Narrow page selection retains Profile scope");
      assert.deepEqual(query.select, {id:true}, "Pagination does not sort wide receipt payloads");
    }
    // Summary adjustment/counterpart reads have no matching synthetic rows.
    if (!query.orderBy && !query.select?.createdAt) return [];
    let rows = [...fixtures];
    if (query.where?.createdAt?.gte) rows = rows.filter(r => r.createdAt >= query.where.createdAt.gte);
    rows.sort((a, b) => {
      for (const clause of query.orderBy ?? []) {
        const [key, direction] = Object.entries(clause)[0];
        const av = a[key as keyof typeof a], bv = b[key as keyof typeof b];
        const value = av! < bv! ? -1 : av! > bv! ? 1 : 0;
        if (value) return value * (direction === "desc" ? -1 : 1);
      }
      return 0;
    });
    return rows.slice(query.skip ?? 0, query.take === undefined ? undefined : (query.skip ?? 0) + query.take);
  });
  try {
    for (const summaryMode of ["rows", "light", "full"]) for (const pageSize of [1, 2, 25]) for (const direction of ["desc", "asc"]) {
      const ids: string[] = [];
      for (let page = 1; page <= Math.ceil(fixtures.length / pageSize); page++) {
        // Deliberately unfiltered: this is where recent imports used to jump.
        const query = new URLSearchParams({ workspaceId: "qa", summaryMode, pageSize: String(pageSize), page: String(page), sortDirection: direction });
        const request = new Request(`https://clover.ph/api/transactions?${query}`);
        const response = await withMobileRequestContext("qa-user", request, () => GET(request));
        assert.equal(response.status, 200);
        const data = await response.json();
        assert.equal(data.totalCount, 3);
        assert.equal(data.transactions.length, Math.min(pageSize, 3 - (page - 1) * pageSize));
        if (summaryMode !== "rows") assert.equal(data.summary.spending, 303);
        const native = mobileApiResponse("transactions", data) as { transactions: { id: string }[] };
        assert.deepEqual(native.transactions.map(r => r.id), data.transactions.map((r: { id: string }) => r.id));
        ids.push(...native.transactions.map(r => r.id));
      }
      assert.deepEqual(ids, direction === "desc" ? ["receipt-1", "receipt-2", "receipt-0"] : ["receipt-0", "receipt-2", "receipt-1"], `${summaryMode}, page size ${pageSize}, ${direction}`);
    }
    assert.equal(snapshotReads, 24);
    const row = { ...fixtures[0], amount: String(fixtures[0].amount), date: fixtures[0].date.toISOString(),
      createdAt: fixtures[0].createdAt.toISOString(), accountName: "Cash", categoryName: "Food & Dining",
      accountNumber: "12345678", rawPayload: { privateEvidence: "never sent" } };
    const status = mobileApiResponse("import-status", { receiptTransaction: row }) as {
      receiptTransactionId: string; receiptTransaction: Transaction;
    };
    const committed = status.receiptTransaction;
    assert.equal(status.receiptTransactionId, committed.id);
    assert.equal(committed.workspaceId, "qa");
    assert.equal(committed.categoryName, "Food & Dining");
    assert.equal(committed.merchantLogoUrl, null, "An unresolved logo uses the category icon until refresh");
    assert.equal(committed.lastFour, "5678");
    assert.ok(!("rawPayload" in committed) && !("accountNumber" in committed));
    const refreshed = { ...committed, merchantLogoUrl: "/assets/brand.png", merchantClean: "Updated merchant" };
    const newer = { ...committed, id: "newer", date: "2027-01-01T00:00:00.000Z" };
    assert.deepEqual(mergeCommittedReceiptRows([newer], [committed]), [newer, committed]);
    assert.deepEqual(mergeCommittedReceiptRows([newer, refreshed], [committed]), [newer, refreshed]);
    console.log("PASS receipt chronological order: newest upload is oldest receipt; rows/light/full API, native projection, both directions, stable pages and unchanged totals");
  } finally { restores.reverse().forEach(restore => restore()); await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
