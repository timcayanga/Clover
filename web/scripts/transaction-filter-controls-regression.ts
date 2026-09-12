import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { applyTransactionTagSelection } from "../lib/transaction-tags";
import { buildTransactionQueryWhere, buildTransactionQuerySearchParams, parseTransactionQueryFilters } from "../lib/transaction-query";

const readSource = (relativePath: string) => readFile(path.join(process.cwd(), relativePath), "utf8");

async function main() {
  assert.deepEqual(applyTransactionTagSelection(["Work", "Travel"], ["work", "Family"], "add"), ["Work", "Travel", "Family"]);
  assert.deepEqual(applyTransactionTagSelection(["Work", "Travel"], ["WORK"], "remove"), ["Travel"]);
  assert.deepEqual(applyTransactionTagSelection(["Work"], ["Missing"], "remove"), ["Work"]);
  assert.match(JSON.stringify(buildTransactionQueryWhere("workspace", { query: "Family" })), /transactionTags/);
  const filterParams = buildTransactionQuerySearchParams("workspace", { reviewFilter: "confirmed", sourceFilter: "manual", confidenceFilter: "high" });
  const parsedFilters = parseTransactionQueryFilters(filterParams);
  assert.equal(parsedFilters.reviewFilter, "confirmed");
  assert.equal(parsedFilters.sourceFilter, "manual");
  assert.equal(parsedFilters.confidenceFilter, "high");
  const filteredWhere = JSON.stringify(buildTransactionQueryWhere("workspace", parsedFilters));
  assert.match(filteredWhere, /"reviewStatus":"confirmed"/);
  assert.match(filteredWhere, /"importFileId":null/);
  assert.match(filteredWhere, /"parserConfidence":\{"gte":85\}/);
  const toolbar = await readSource("components/transaction-selection-toolbar.tsx");
  const toolbarStyles = await readSource("components/transaction-selection-toolbar.css");
  const patchRoute = await readSource("app/api/transactions/[transactionId]/route.ts");
  assert.match(toolbar, /placeholder="Search"/);
  assert.match(toolbar, /__count[\s\S]*onClick=\{onClear\}/, "Selection must expose its count and clear action.");
  assert.match(toolbar, />Edit<\/button>/);
  assert.match(toolbar, /type="search" aria-label="Search"/);
  assert.doesNotMatch(toolbar, /searchOpen/, "Mobile search stays visible in the page.");
  assert.match(toolbarStyles, /height: 48px;[\s\S]{0,80}flex: 0 0 48px;/, "Toolbar space must remain fixed during selection.");
  assert.match(patchRoute, /payload.tagAction === "add"[\s\S]{0,250}create: buildTransactionTagWrites/);
  assert.match(patchRoute, /payload.tagAction === "remove"[\s\S]{0,130}deleteMany: \{ tagId: \{ in: removedTagIds/, "Removing selected tags must not delete other tags.");
  const [transactionsPage, transactionsRoute, styles] = await Promise.all([
    readSource("app/transactions/page.tsx"),
    readSource("app/api/transactions/route.ts"),
    readSource("app/globals.css"),
  ]);
  assert.doesNotMatch(transactionsPage, /transactions-selection-menu--footer/, "Selection actions should no longer be hidden in the footer.");
  assert.match(transactionsPage, /longPress.consume\(\)/);
  assert.match(transactionsPage, /hasSelectedTransactions \? <label className="transactions-mobile-select"/);
  assert.match(transactionsPage, /<TransactionsManageMenu compact \/>/, "Compact Transactions actions must include Manage.");
  assert.match(transactionsPage, /<TransactionsManageMenu \/>/, "Desktop Transactions actions must include Manage.");
  assert.doesNotMatch(transactionsPage, /transactions-column-header" role="row"/, "The visual column header must not claim incomplete table-row semantics.");
  assert.match(transactionsPage, /<nav className="transactions-pagination" aria-label="Transaction pages">/);
  assert.match(transactionsPage, /<section className="transactions-footer-snapshot" aria-label="Cash flow snapshot for all filtered transactions">/);
  assert.match(transactionsPage, /selectedTransactionCount\} selected/);
  const overlay = await readSource("components/transactions-header-overlay.tsx");
  const longPress = await readSource("components/use-transaction-long-press.ts");
  assert.match(overlay, /getBoundingClientRect\(\).bottom/);
  assert.match(overlay, /createPortal/);
  assert.match(overlay, /<details/);
  assert.match(longPress, /450/);
  assert.match(longPress, /Math.hypot[\s\S]{0,100}cancel\(\)/);
  assert.match(toolbarStyles, /text-overflow: ellipsis/);
  assert.match(transactionsPage, /label="Dates"[\s\S]*label="Accounts"[\s\S]*label="Categories"[\s\S]*label="Types"[\s\S]*aria-label="Amount Range"[\s\S]*label="Review status"[\s\S]*label="Currency"[\s\S]*label="Tags"/);
  assert.match(transactionsPage, /transactions-mobile-select/);
  assert.match(transactionsRoute, /transactions: await withTransactionTags\(transactions, workspaceId\)/);
  assert.match(transactionsRoute, /transactions: await withTransactionTags\(pageTransactions, workspaceId\)/);

  assert.match(
    transactionsPage,
    /function TransactionsManageMenu[\s\S]{0,1800}document\.addEventListener\("pointerdown", handlePointerDown\)/,
    "The Manage menu must close through a document-level outside-pointer handler."
  );
  assert.match(
    transactionsPage,
    /aria-haspopup="menu"[\s\S]{0,250}aria-expanded=\{open\}/,
    "The controlled Manage trigger must expose its open state to assistive technology."
  );
  assert.match(
    styles,
    /\.transactions-manage-menu__popover a \{[\s\S]{0,300}font-weight: 400;/,
    "Manage actions must use regular rather than bold text."
  );
  assert.match(styles, /\.line-item-header \{[\s\S]{0,500}color: #4b5563;/, "Sortable column labels must meet text-contrast requirements.");
  assert.match(styles, /\.transactions-page \.transactions-toolbar-add \{[\s\S]{0,300}color: #006b7c;/, "Add transaction text must meet text-contrast requirements.");
  assert.match(
    transactionsPage,
    /buildTransactionAccountFilterOptions[\s\S]{0,1200}\.sort\(\(left, right\) => left\.label\.localeCompare\(right\.label/,
    "Transaction account filter choices must be sorted by their displayed labels."
  );
  assert.match(
    transactionsRoute,
    /SELECT DISTINCT "currency"[\s\S]{0,180}"deletedAt" IS NULL/,
    "Currency choices must be derived only from active transactions."
  );
  assert.doesNotMatch(
    transactionsRoute,
    /return codes\.length > 0 \? codes : \["PHP"\]/,
    "An empty transaction set must not invent a PHP currency choice."
  );
  assert.match(
    transactionsPage,
    /authoritativeCurrencyWorkspaceRef\.current !== selectedWorkspaceId[\s\S]{0,350}setCurrencyFilter\(""\)/,
    "A saved currency with no remaining transactions must be cleared after an authoritative response."
  );
  assert.match(transactionsPage, /const saved = readTransactionListContext\(selectedWorkspaceId\)/);
  assert.match(
    transactionsPage,
    /setSelectedTransactionIds\(\[\]\);[\s\S]{0,900}setQuery\(saved\?\.query \?\? ""\);[\s\S]{0,900}setCategoryFilters\(saved\?\.categoryFilters \?\? \[\]\);[\s\S]{0,1300}setSortField\(saved\?\.sortField \?\? "date"\);[\s\S]{0,300}setTransactionsPage\(1\);/,
    "Switching Profiles clears selections and restores only that Profile’s saved filters/sort, with empty defaults and first-page pagination."
  );
  assert.match(
    transactionsPage,
    /workspaceCurrencyCodes\.length > 0 \? <CurrencySelector/,
    "The toolbar must hide its currency selector when the workspace has no transaction currencies."
  );
  assert.match(
    styles,
    /\.transactions-selected-count \{[\s\S]{0,700}?height: var\(--action-button-height\);[\s\S]{0,400}?font-size: var\(--action-button-font-size\);[\s\S]{0,200}?font-weight: var\(--action-button-font-weight\);/,
    "The selected-count status must share the Actions button height and typography."
  );

  console.log("Transaction filter controls regression passed.");
}

void main();
