import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { sanitizeTransactionTagNames } from "../lib/transaction-tags";

// Execute the actual body expression sent by the form, not an optimistic-row fixture.
const source = ts.createSourceFile("page.tsx", readFileSync("app/transactions/page.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let payload: ts.Expression | undefined;
let historyPredicate: ts.Expression | undefined;
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "filteredTransactions" && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(source) === "transactions.filter") {
    historyPredicate = node.initializer.arguments[0];
  }
  if (ts.isCallExpression(node) && node.expression.getText(source) === "fetch" && node.arguments[0]?.getText(source) === '"/api/transactions"') {
    const options = node.arguments[1];
    if (options && ts.isObjectLiteralExpression(options)) {
      const body = options.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(source) === "body");
      if (body && ts.isPropertyAssignment(body) && ts.isCallExpression(body.initializer)) payload = body.initializer.arguments[0];
    }
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(payload, "Manual creation must submit a JSON body");
const serialize = new Function("manualForm", "accountId", "categoryId", "transactionCurrency", "receiptLineItems", "sanitizeTransactionTagNames", "activeWorkspaceId", "normalizedManualAmount", `return JSON.parse(JSON.stringify(${payload.getText(source)}));`);
for (const type of ["debit", "credit"]) {
  const result = serialize({ type, date: "2026-09-08", amount: "12,345.67", merchantRaw: "QA", description: " Note ", tags: [" Work ", "work", "Travel", ""] }, "account", "category", "PHP", [], sanitizeTransactionTagNames, "profile", "12345.67");
  assert.deepEqual(result.tags, ["Work", "Travel"]);
  assert.equal(result.type, type === "credit" ? "income" : "expense");
  assert.equal(result.amount, "12345.67");
  assert.equal(result.description, "Note");
}
console.log("Manual expense/income request preserves selected tags, amount and note");

assert.ok(historyPredicate, "History must apply its client filters");
const names = ["searchText", "currencyFilter", "categoryFilters", "tagFilters", "expandedAccountFilters", "typeFilters", "dateFilterMode", "dateFilterAnchor", "customStart", "customEnd", "amountMin", "amountMax", "reviewFilter", "sourceFilter", "confidenceFilter", "otherCategoryId", "categoryNameById", "accountNumberById"];
const predicateFactory = new Function("matchesTransactionSearch", "matchesTransactionFilters", ...names, `return (${historyPredicate.getText(source)});`);
for (const isExcluded of [false, true]) {
  assert.equal(predicateFactory(() => true, () => true)({ isExcluded }), true, "Exclusions stay visible in matching history");
  assert.equal(predicateFactory(() => false, () => true)({ isExcluded }), false, "History must retain search filtering");
  assert.equal(predicateFactory(() => true, () => false)({ isExcluded }), false, "History must retain other filters");
}
console.log("Client history retains exclusions while applying search and filters");
