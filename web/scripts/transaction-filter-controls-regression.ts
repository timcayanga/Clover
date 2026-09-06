import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { applyTransactionTagSelection } from "../lib/transaction-tags";
import { buildTransactionQueryWhere } from "../lib/transaction-query";

const readSource = (relativePath: string) => readFile(path.join(process.cwd(), relativePath), "utf8");

async function main() {
  assert.deepEqual(applyTransactionTagSelection(["Work", "Travel"], ["work", "Family"], "add"), ["Work", "Travel", "Family"]);
  assert.deepEqual(applyTransactionTagSelection(["Work", "Travel"], ["WORK"], "remove"), ["Travel"]);
  assert.deepEqual(applyTransactionTagSelection(["Work"], ["Missing"], "remove"), ["Work"]);
  assert.match(JSON.stringify(buildTransactionQueryWhere("workspace", { query: "Family" })), /transactionTags/);
  const toolbar = await readSource("components/transaction-selection-toolbar.tsx");
  const toolbarStyles = await readSource("components/transaction-selection-toolbar.css");
  const patchRoute = await readSource("app/api/transactions/[transactionId]/route.ts");
  assert.match(toolbar, /placeholder="Search transactions"/);
  assert.match(toolbar, /Actions · \{count\}/);
  assert.match(toolbar, /count === 1 \? "Edit" : "Edit selected"/);
  assert.match(toolbar, /document.addEventListener\("pointerdown", outside\)/);
  assert.match(toolbarStyles, /height: 48px;[\s\S]{0,80}flex: 0 0 48px;/, "Toolbar space must remain fixed during selection.");
  assert.match(patchRoute, /payload.tagAction === "add"[\s\S]{0,250}create: buildTransactionTagWrites/);
  assert.match(patchRoute, /payload.tagAction === "remove"[\s\S]{0,130}deleteMany: \{ tagId: \{ in: removedTagIds/, "Removing selected tags must not delete other tags.");
  const [transactionsPage, transactionsRoute, styles] = await Promise.all([
    readSource("app/transactions/page.tsx"),
    readSource("app/api/transactions/route.ts"),
    readSource("app/globals.css"),
  ]);
  assert.doesNotMatch(transactionsPage, /transactions-selection-menu--footer/, "Selection actions should no longer be hidden in the footer.");
  assert.match(transactionsPage, /onClick=\{\(\) => hasSelectedTransactions \? toggleSelectedTransaction/);
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
