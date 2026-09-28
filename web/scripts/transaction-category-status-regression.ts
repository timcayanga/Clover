import assert from "node:assert/strict";
import { needsTransactionCategory } from "../lib/transaction-category-status";
for (const name of [null, undefined, "", "  ", "Uncategorized", "Needs category review"]) assert.equal(needsTransactionCategory(name), true);
for (const name of ["Income", "Transfers", "Other", "Financial", "Food & Drink"]) assert.equal(needsTransactionCategory(name), false);
const categorizedWithoutCleanMerchant = { category: { name: "Income" }, merchantClean: null };
assert.equal(needsTransactionCategory(categorizedWithoutCleanMerchant.category.name), false);
console.log("Category completion does not depend on merchant cleanup.");
