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
const accountPicker = read("components/transaction-account-picker.tsx");
const accountDetail = read("app/accounts/[accountId]/page.tsx");
const transactionDetail = read("app/transactions/[transactionId]/page.tsx");
const crossFeatureActions = read("components/transaction-cross-feature-actions.tsx");
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
assert.match(categoryPicker, /CategoryBrandMark/, "Category choices must show the same category marks as transaction rows.");
assert.match(accountPicker, /AccountBrandMark/, "Account choices must show the same institution marks as transaction rows.");
assert.doesNotMatch(accountPicker, /account\.subtitle \? <span>/, "Account choices must remain a compact single-line list.");
assert.match(accountPicker, /buttonRef\?: React\.Ref<HTMLButtonElement>/, "Account picker triggers must support accessible icon shortcuts.");
assert.match(categoryPicker, /buttonRef\?: React\.Ref<HTMLButtonElement>/, "Category picker triggers must support accessible icon shortcuts.");
assert.match(transactions, /const transactionAccountTypes = new Set<AccountType>\(\["bank", "wallet", "credit_card", "cash"\]\)/, "Transactions must only offer banks, wallets, credit cards, and cash accounts.");
assert.match(transactions, /!transactionAccountTypes\.has\(account\.type\) \|\| Boolean\(account\.investmentSubtype\)/, "Manual and edited transactions must not offer typed investment holdings as payment accounts.");
assert.match(transactions, /transactionInvestmentIdentityPattern\.test/, "Legacy investment-shaped shadow accounts must stay out of transaction pickers.");
assert.match(transactions, /getDeletedWorkspaceAccountIds\(selectedWorkspaceId\)/, "Deleted accounts must stay out of transaction pickers immediately.");
assert.match(transactions, /buildTransactionAccountLabels\(selectableTransactionAccounts\)/, "Cross-currency account families must receive distinct picker labels.");
assert.match(transactions, /buildTransactionAccountFilterOptions\(selectableTransactionAccounts\)/, "Transaction filters must use the same eligible account list as transaction editors.");
assert.match(transactions, /\{selectableTransactionAccounts\.map\(\(account\) => \(/, "Bulk transaction edits must not reintroduce investment accounts.");
assert.match(
  transactions,
  /className="transactions-filter-group transactions-filter-group--currency"[\s\S]{0,1400}className="transactions-filter-currency"/,
  "Mobile Transactions must expose the shared currency selector inside the Filter panel."
);
assert.match(transactions, /TransactionAccountPicker/, "Transaction account edits must use the icon-rich account picker.");
assert.match(transactions, /inlineAccountPickerButtonRefs\.current\.get\(transaction\.id\)\?\.click\(\)/, "Clicking a row account mark must open its account editor.");
assert.match(transactions, /inlineCategoryPickerButtonRefs\.current\.get\(transaction\.id\)\?\.click\(\)/, "Clicking a row category mark must open its category editor.");
assert.match(categorySettings, /parentCategoryId/, "Custom categories must support user-selected groups.");
assert.match(categoryRoute, /assertValidParentCategory/, "Category groups must be validated server-side.");

assert.match(styles, /@media \(max-width: 1100px\)[\s\S]*?\.dashboard-home__report-card \.eyebrow \{ font-size: 13px/, "Mobile report labels must meet the new readability floor.");
assert.match(styles, /\.transaction-category-picker__menu[\s\S]*?position: fixed/, "The mobile category picker must use a navigable bottom sheet.");
assert.match(styles, /\.transaction-account-picker__menu[\s\S]*?position: fixed/, "The mobile account picker must use a navigable bottom sheet.");
assert.match(styles, /\.transaction-account-picker__option \.accounts-brand-mark \{[\s\S]*?width: 24px;[\s\S]*?height: 24px;/, "Account picker marks must remain visually compact.");
assert.match(styles, /\.transaction-category-picker__option > \.transaction-category-icon \{ width: 24px; height: 24px; \}/, "Category picker marks must remain visually compact.");
assert.match(transactions, /if \(syncRoute && isCompactViewport\)[\s\S]*?router\.push\(`\/transactions\/\$\{encodeURIComponent\(transaction\.id\)\}`/, "Only compact layouts should route transaction details to a standalone page.");
assert.match(accountDetail, /if \(isMobileViewport\) \{[\s\S]{0,120}router\.push\(`\/transactions\/\$\{encodeURIComponent\(transaction\.id\)\}`/, "Mobile Account Details must route transactions to the shared standalone detail page.");
assert.match(transactions, /transaction-drawer--sidepanel/, "Desktop transaction details must retain the right-side drawer.");
assert.match(transactionDetail, /<summary>More<\/summary>/, "Mobile transaction details must retain the More section.");
assert.match(transactionDetail, /Line Items/, "Mobile transaction details must show editable line items.");
assert.match(transactionDetail, /confidenceScore/, "Mobile transaction details must show confidence context.");
assert.doesNotMatch(transactionDetail, /Source Details/, "Transaction details should not expose source diagnostics in the user interface.");
assert.match(crossFeatureActions, /Add to Circles/, "Transaction details must support Circles linking.");
assert.match(crossFeatureActions, /Add to Recurring/, "Transaction details must support Recurring linking.");
assert.match(crossFeatureActions, /Add to Split Bills/, "Transaction details must support Split Bills linking.");
assert.match(crossFeatureActions, /if \(splitBillOpen\)[\s\S]*?setPanel\(null\)/, "Opening Split Bills must close other transaction action panels.");
assert.match(crossFeatureActions, /Create new Circle/, "Transaction details must allow creating a Circle without leaving the transaction.");
assert.match(crossFeatureActions, /Add to Circle/, "Transaction details must allow choosing and sharing to an existing Circle.");
const splitBillLinkFields = read("components/split-bill-transaction-link-fields.tsx");
assert.match(splitBillLinkFields, /fetch\("\/api\/split-bill-people"\)/, "Split Bills transaction linking must load saved people suggestions.");
assert.match(splitBillLinkFields, /Create new group/, "Split Bills transaction linking must allow creating a group in place.");
assert.match(splitBillLinkFields, /Saved people suggestions/, "Split Bills transaction linking must expose type-ahead people suggestions.");
assert.match(styles, /\.transaction-detail-page__delete-button[\s\S]*?width: auto/, "The transaction delete action must remain compact.");
assert.match(transactions, /transaction-drawer-delete-footer/, "Desktop transaction deletion must remain at the bottom of the details drawer.");

console.log("Manual transaction entry regression passed.");
