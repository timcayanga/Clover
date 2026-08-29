import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildTransactionDetailDraft, detailDraftTypeToTransactionType } from "../lib/transaction-detail-draft";
import { buildTransactionUpdatePayload } from "../lib/transaction-update-payload";

const sourceTransaction = {
  merchantRaw: "Fund transfer",
  merchantClean: "Fund Transfer",
  date: "2026-08-05T00:00:00.000Z",
  accountId: "account-1",
  categoryId: "category-transfers",
  amount: "1000.00",
  currency: "PHP",
  type: "transfer" as const,
  isExcluded: false,
  isTransfer: true,
};

const draft = buildTransactionDetailDraft(sourceTransaction, {
  merchantClean: "Fund Transfer",
  effectiveType: "transfer",
  categoryId: "category-transfers",
  isTransfer: true,
});

assert.equal(draft.type, "transfer", "opening a Transfer must not reduce it to Expense");
assert.equal(detailDraftTypeToTransactionType("transfer"), "transfer");
assert.deepEqual(
  { type: buildTransactionUpdatePayload(draft, sourceTransaction).type, isTransfer: buildTransactionUpdatePayload(draft, sourceTransaction).isTransfer },
  { type: "transfer", isTransfer: true },
  "saving the details editor must persist Transfer consistently"
);

const transactionsPage = readFileSync(new URL("../app/transactions/page.tsx", import.meta.url), "utf8");
const accountDetailPage = readFileSync(new URL("../app/accounts/[accountId]/page.tsx", import.meta.url), "utf8");
const detailPage = readFileSync(new URL("../app/transactions/[transactionId]/page.tsx", import.meta.url), "utf8");
const detailRoute = readFileSync(new URL("../app/api/transactions/[transactionId]/route.ts", import.meta.url), "utf8");
const globalStyles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

assert.match(transactionsPage, /router\.push\(`\/transactions\/\$\{encodeURIComponent\(transaction\.id\)\}`/);
assert.match(transactionsPage, /className="transaction-drawer-form__amount-type-row transaction-drawer-form__amount-type-row--amount-only"/);
assert.match(accountDetailPage, /className="transaction-drawer-form__amount-type-row"/);
assert.match(globalStyles, /\.transaction-drawer-select__icon\s*\{[^}]*z-index:\s*2;/s);
assert.match(globalStyles, /@media \(max-width: 1100px\)[\s\S]*?\.transaction-drawer-form__amount-type-row\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);/);
assert.match(detailPage, /\{ value: "transfer", label: "Transfer", icon: "↔" \}/, "Mobile editing must use the shared three-option type selector.");
assert.match(detailPage, /editing \? "Edit transaction" : "Transaction details"/, "Mobile details must distinguish view and edit states.");
assert.match(detailPage, /Save changes/, "Mobile edits must require an explicit save.");
assert.match(detailPage, /beginEditing\("name"\)/, "Clicking a visible detail must enter editing without a separate Edit action.");
assert.match(detailPage, /transaction-detail-page__delete-button/, "Mobile deletion must remain available at the bottom of the page.");
assert.match(detailPage, /method: "PATCH"/);
assert.match(detailPage, /method: "DELETE"/);
assert.match(detailPage, /TransactionAccountPicker/, "The full details page must show institution icons in account choices.");
assert.match(detailPage, /TransactionCategoryPicker/, "The full details page must show category icons in category choices.");
assert.match(detailPage, /AccountBrandMark/, "The full details page must show the account icon in read mode.");
assert.match(detailPage, /mobileBackHref="\/transactions"/, "The shared mobile header must own the single back action.");
assert.match(detailPage, /transaction-detail-page__line-items-view/, "Read mode must retain a visible Line Items section.");
assert.match(detailPage, /No line items yet\. Tap to add one\./, "An empty Line Items section must provide a direct editing affordance.");
assert.match(globalStyles, /@media \(min-width: 768px\)[\s\S]*?transaction-cross-feature-actions__buttons \.button[\s\S]*?min-height:\s*28px;/, "Desktop Transaction Details cross-feature actions must remain compact.");
assert.match(detailRoute, /export async function GET/);
assert.match(detailRoute, /assertWorkspaceAccess\(userId, transaction\.workspaceId\)/);
assert.match(detailRoute, /type: \{ not: "investment" \}/, "Investment holdings must not be returned as transaction accounts.");

console.log("Transaction detail page regression passed.");
