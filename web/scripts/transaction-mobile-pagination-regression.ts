import { reconcileTransactionTotal } from "@/lib/transaction-mobile-pagination";
import assert from "node:assert/strict";
import {
  getKnownMobileTransactionTotal,
  getNextMobileTransactionPage,
  isMobileTransactionPaginationExhausted,
} from "../lib/transaction-mobile-pagination";

assert.equal(
  getNextMobileTransactionPage(25, 25),
  2,
  "A 25-row initial response must continue with server page 2."
);
assert.equal(
  getNextMobileTransactionPage(26, 25),
  2,
  "Optimistic rows must not make mobile pagination skip server page 2."
);
assert.equal(
  getNextMobileTransactionPage(50, 25),
  3,
  "Two complete server pages must continue with page 3."
);
assert.equal(
  getKnownMobileTransactionTotal(25, 29, 25),
  29,
  "A lightweight page total must not hide a larger known transaction total."
);
assert.equal(
  getKnownMobileTransactionTotal(25, Number.NaN, -1),
  25,
  "Invalid known totals must be ignored."
);

assert.equal(
  isMobileTransactionPaginationExhausted({
    previousTransactionCount: 25,
    nextTransactionCount: 29,
    fetchedTransactionCount: 4,
    totalTransactionCount: 29,
  }),
  true,
  "The load-more sentinel must disappear when the known total is loaded."
);
assert.equal(
  isMobileTransactionPaginationExhausted({
    previousTransactionCount: 25,
    nextTransactionCount: 25,
    fetchedTransactionCount: 0,
    totalTransactionCount: 29,
  }),
  true,
  "An empty server page must stop automatic retries even if the total is stale."
);
assert.equal(
  isMobileTransactionPaginationExhausted({
    previousTransactionCount: 25,
    nextTransactionCount: 25,
    fetchedTransactionCount: 12,
    totalTransactionCount: 40,
  }),
  true,
  "A duplicate-only response must stop automatic retries."
);
assert.equal(
  isMobileTransactionPaginationExhausted({
    previousTransactionCount: 25,
    nextTransactionCount: 37,
    fetchedTransactionCount: 12,
    totalTransactionCount: 40,
  }),
  false,
  "Pagination must continue when a response adds rows below the known total."
);

console.log("[PASS] Mobile transaction pagination keeps the server page size and terminates on no progress.");

assert.equal(reconcileTransactionTotal(111, 25, 121, true), 111, "Completed mixed imports must replace inflated cached totals");
assert.equal(reconcileTransactionTotal(110, 111, 121, true), 111, "Visible pending rows remain counted during handoff");
assert.equal(reconcileTransactionTotal(25, 25, 29, false), 29, "Legacy approximate counts retain the known larger scope");
assert.equal(reconcileTransactionTotal(1000, 25, 1000, true), 1000, "A paged list retains the exact full ledger count");
