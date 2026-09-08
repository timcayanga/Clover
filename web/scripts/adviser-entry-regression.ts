import assert from "node:assert/strict";
import {
  entryAccount,
  entryTransaction,
  entryLine,
  entryIssues,
  lineTotal,
  minorUnits,
  formatMinor,
  type EntryDraft,
} from "../lib/adviser-entry-types";
import {
  entryDraftSchema,
  entryFormSchema,
  normalizeEntryProposal,
} from "../lib/adviser-entry-schema";
import { simpleEntryRows, isEntryRequest } from "../lib/adviser-entry-intent";
import { parseReceiptLineItemsFromPayload } from "../lib/receipt-line-items";
const row = {
  ...entryTransaction("t"),
  merchant: "Coffee",
  amount: "180",
  date: "2026-09-08",
  accountId: "account",
};
const draft: EntryDraft = {
  version: 1,
  id: "test",
  workspaceId: "workspace",
  sourceText: "coffee 180",
  confidence: 0,
  accounts: [],
  transactions: [row],
  receipts: [],
};
assert.deepEqual(entryIssues(draft), []);
assert.equal(minorUnits("1e3"), null);
assert.equal(minorUnits("0.001"), null);
assert.equal(formatMinor("99999999999999"), "999999999999.99");
assert.equal(
  lineTotal([
    { ...entryLine(), description: "Item", unitPrice: "100", quantity: "1.5" },
    {
      ...entryLine(),
      description: "Discount",
      unitPrice: "20",
      kind: "discount",
    },
  ]),
  "13000",
);
for (const date of ["2026-02-30", "not-a-date", "2026-13-01"])
  assert(entryIssues({ ...draft, transactions: [{ ...row, date }] }).length);
assert(
  entryIssues({ ...draft, transactions: [{ ...row, amount: "0" }] }).length,
);
assert(
  entryIssues({
    ...draft,
    transactions: [
      {
        ...row,
        lines: [{ ...entryLine(), description: "Coffee", unitPrice: "179" }],
      },
    ],
  }).some((issue) => issue.includes("match")),
);
assert(
  entryIssues({
    ...draft,
    transactions: [{ ...row, accountId: "new:missing" }],
  }).length,
);
assert(
  !entryDraftSchema.safeParse({ ...draft, transactions: Array(51).fill(row) })
    .success,
);
assert(
  !entryDraftSchema.safeParse({
    ...draft,
    transactions: [{ ...row, type: "transfer" }],
  }).success,
);
assert(
  !entryFormSchema.safeParse({
    kind: "account",
    fields: { password: "secret" },
  }).success,
);
assert(
  !entryFormSchema.safeParse({
    kind: "account",
    fields: { accountNumber: "private" },
  }).success,
);
assert(
  entryFormSchema.safeParse({
    kind: "account",
    fields: { name: "BPI", balance: "100" },
  }).success,
);
const proposed = normalizeEntryProposal(
  { transactions: [{ key: "t", merchant: "Coffee", amount: "180" }] },
  { id: "test", workspaceId: "workspace", sourceText: "Coffee 180" },
);
assert(proposed.success);
if (proposed.success) assert.equal(proposed.data.transactions[0].accountId, "");
assert.equal(simpleEntryRows("Coffee 180; Parking 50")?.length, 2);
assert.equal(simpleEntryRows("Coffee 180")?.[0].currency, "");
assert.equal(simpleEntryRows("Coffee 180")?.[0].date, "");
assert.equal(simpleEntryRows("How much did I spend on coffee?"), null);
assert(isEntryRequest("I paid 180 for coffee yesterday"));
assert(!isEntryRequest("What was my spending last month?"));
assert.equal(simpleEntryRows("Buy 1,250 shares"), null);
assert.deepEqual(
  parseReceiptLineItemsFromPayload(
    { receiptLineItems: [{ description: "Raw item", amount: "5" }] },
    { receiptLineItems: [{ description: "Confirmed item", amount: "10" }] },
  )[0].description,
  "Confirmed item",
);
// A later confirmed edit must update the normalized items, preserving raw evidence.
import { buildTransactionUpdatePayload } from "../lib/transaction-update-payload";
import { buildTransactionDetailDraft } from "../lib/transaction-detail-draft";
const evidence = {
  receiptLineItems: [{ description: "Imported", amount: "40" }],
  original: "statement",
};
const source = {
  merchantRaw: "Receipt",
  date: "2026-09-08",
  accountId: "account",
  categoryId: "",
  amount: "100",
  currency: "PHP",
  isExcluded: false,
  rawPayload: evidence,
  normalizedPayload: {
    receiptLineItems: [{ description: "Confirmed", amount: "100" }],
  },
};
const detail = buildTransactionDetailDraft(source, {
  merchantClean: "Receipt",
  effectiveType: "expense",
  currencyFallback: "PHP",
});
const update = buildTransactionUpdatePayload(
  { ...detail, receiptLineItems: [] },
  source,
);
assert.deepEqual(update.rawPayload, evidence);
assert.deepEqual(update.receiptLineItems, []);

console.log(
  "PASS entry schemas, exact money, reconciliation, incomplete drafts, context minimization, intent and subsequent receipt edits",
);
import { mobileOperation } from "../lib/mobile-api-policy";
import { isEntryDraft } from "../lib/adviser-entry-types";
assert.equal(
  mobileOperation("POST", ["adviser", "entries"]),
  "adviser-entries",
);
assert.equal(mobileOperation("POST", ["adviser", "actions"]), null);
assert(isEntryDraft(draft));
assert(!isEntryDraft({ version: 1, workspaceId: "workspace" }));
assert(
  !entryDraftSchema.safeParse({ ...draft, confirmedByUser: true }).success,
);
