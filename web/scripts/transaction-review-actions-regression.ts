import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getTransactionReviewReasons, transactionNeedsReview } from "../lib/transaction-review-reasons";
import { clearJsonRequestCache, fetchJsonOnce } from "../lib/request-dedupe";

const clean = { reviewStatus: "pending_review", categoryId: "food", categoryName: "Food", merchantRaw: "Lunch", parserConfidence: 98, categoryConfidence: 98, accountMatchConfidence: 98, isExcluded: false };
const rows = [clean, { ...clean, isExcluded: true }, { ...clean, parserConfidence: 30 }, { ...clean, warningReason: "Review similar transaction" }, { ...clean, categoryConfidence: 40, reviewStatus: "edited" }, { ...clean, isExcluded: true, reviewStatus: "confirmed" }];
assert.equal(rows.filter(transactionNeedsReview).length, 3, "Clean pending and edited rows are not warnings");
assert.deepEqual(getTransactionReviewReasons(rows[1]), ["Ignored from totals"]);
for (const reviewStatus of ["confirmed", "edited", "rejected", "duplicate_skipped"]) {
  assert.equal(transactionNeedsReview({ ...rows[1], reviewStatus }), false);
}
const resolved = rows.map(row => ({ ...row, reviewStatus: "confirmed" }));
assert.equal(resolved.filter(transactionNeedsReview).length, 0);
const route = readFileSync(new URL("../app/api/transactions/route.ts", import.meta.url), "utf8");
assert.ok(route.indexOf('filters.reviewFilter !== "pending" || transactionNeedsReview(transaction)') < route.lastIndexOf('transactions.slice(pageStart'), "Exact review filtering happens before page slicing");
const page = readFileSync(new URL("../app/transactions/page.tsx", import.meta.url), "utf8");
const navigation = page.slice(page.indexOf('const openTransactionReview ='), page.indexOf('const resolveTransactionWarning ='));
assert.match(navigation, /openTransactionDetail\(transaction\)/);
assert.doesNotMatch(navigation, /setTransactionsPage|await /, "Review opens immediately from the summary row, without a list-page fetch");
assert.doesNotMatch(page, /Transaction kept\./);
for (const path of ["../app/transactions/page.tsx", "../app/transactions/[transactionId]/page.tsx"]) {
  assert.match(readFileSync(new URL(path, import.meta.url), "utf8"), /<TransactionReviewControls/);
}

async function cacheRace() {
  const originalFetch = globalThis.fetch;
  const pending: Array<(value: Response) => void> = [];
  globalThis.fetch = (() => new Promise<Response>(resolve => pending.push(resolve))) as typeof fetch;
  const options = { key: "transactions:list:fixture:pending", route: "test", input: "https://example.invalid", cacheTtlMs: 60000 };
  try {
    clearJsonRequestCache();
    const stale = fetchJsonOnce(options);
    clearJsonRequestCache("transactions:list:fixture:");
    const fresh = fetchJsonOnce(options);
    assert.equal(pending.length, 2, "Post-mutation refresh must not join a pre-mutation request");
    pending[0](Response.json({ review: 245 }));
    await stale;
    const dedupedFresh = fetchJsonOnce(options);
    assert.equal(pending.length, 2, "Old completion must not delete the new in-flight request");
    pending[1](Response.json({ review: 10 }));
    await fresh;
    assert.deepEqual((await dedupedFresh).json, { review: 10 });
    assert.deepEqual((await fetchJsonOnce(options)).json, { review: 10 }, "Stale results must never repopulate the cache");
  } finally { globalThis.fetch = originalFetch; clearJsonRequestCache(); }
}
void cacheRace().then(() => console.log("PASS: warning/filter parity, resolved exclusion, instant warning navigation, detail actions, and in-flight cache invalidation."));
