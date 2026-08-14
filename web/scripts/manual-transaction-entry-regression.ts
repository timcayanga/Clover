import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), "utf8");

const transactions = read("app/transactions/page.tsx");
const dashboardActions = read("components/dashboard-top-actions.tsx");
const transferRoute = read("app/api/transactions/manual-transfer/route.ts");
const suggestionsRoute = read("app/api/transaction-name-suggestions/route.ts");
const categoryRoute = read("app/api/categories/route.ts");
const categoryPicker = read("components/transaction-category-picker.tsx");
const categorySettings = read("components/settings-categories-panel.tsx");
const styles = read("app/globals.css");

for (const [surface, source] of [["Transactions", transactions], ["Dashboard", dashboardActions]] as const) {
  assert.match(source, /TransactionNameAutocomplete/, `${surface} must provide prior-name suggestions.`);
  assert.match(source, /TransactionCategoryPicker/, `${surface} must use the grouped category picker.`);
  assert.match(source, />Transfer</, `${surface} must offer Transfer beside Expense and Income.`);
  assert.match(source, /feeAmount/, `${surface} transfers must support an optional fee.`);
  assert.match(source, /sanitizeTransactionTagNames/, `${surface} must preserve tags.`);
}

assert.match(transferRoute, /prisma\.\$transaction/, "Paired transfer rows must be written atomically.");
assert.match(transferRoute, /transferDirection: "out", amountDelta: -amount/, "The source account must decrease.");
assert.match(transferRoute, /transferDirection: "in", amountDelta: amount/, "The destination account must increase.");
assert.match(transferRoute, /manual_transfer_fee/, "Transfer fees must remain a separate expense.");
assert.match(transferRoute, /source\.currency[\s\S]*destination\.currency/, "Manual transfers must reject unsafe cross-currency pairing.");

assert.match(suggestionsRoute, /where:\s*\{\s*workspaceId,/, "Name suggestions must stay workspace-scoped.");
assert.match(suggestionsRoute, /take: 80/, "Suggestions must use bounded history reads.");
assert.match(read("components/transaction-name-autocomplete.tsx"), /suppressQueryRef/, "A selected name must not immediately reopen its suggestion menu.");
assert.match(categoryPicker, /setOpen\(false\)/, "Category choices must dismiss after selection.");
assert.match(categoryPicker, /sortOtherLast/, "Other must remain the final category choice.");
assert.match(categoryPicker, /label: type === "expense" \? "Expenses"/, "Categories must be grouped into readable transaction types.");
assert.match(categorySettings, /parentCategoryId/, "Custom categories must support user-selected groups.");
assert.match(categoryRoute, /assertValidParentCategory/, "Category groups must be validated server-side.");

assert.match(styles, /@media \(max-width: 1100px\)[\s\S]*?\.dashboard-home__report-card \.eyebrow \{ font-size: 13px/, "Mobile report labels must meet the new readability floor.");
assert.match(styles, /\.transaction-category-picker__menu[\s\S]*?position: fixed/, "The mobile category picker must use a navigable bottom sheet.");

console.log("Manual transaction entry regression passed.");
