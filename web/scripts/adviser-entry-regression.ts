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
import { completeEntryAccountChoice, prepareSimpleAccountEntries } from "../lib/adviser-entry-accounts";
import { applicableCategorySuggestion } from "../../shared/category-suggestion";
import { speechLocale, speechErrorMessage } from "../../shared/speech-input";
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
assert.equal(Object.hasOwn(update, "rawPayload"), false, "Confirmed receipt edits must leave the original source payload untouched.");
assert.deepEqual(source.rawPayload, evidence);
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

assert.equal(simpleEntryRows("500 at Mendokoro")?.[0].merchant, "Mendokoro");
assert.equal(simpleEntryRows("500 at Mendokoro")?.[0].amount, "500");
assert.equal(simpleEntryRows("500 at Mendokoro")?.[0].accountId, "");
assert.equal(simpleEntryRows("USD 20.50 at Coffee Bean")?.[0].currency, "USD");
assert.equal(simpleEntryRows("500 at Mendokoro", {kind:"account",fields:{}}), null);
assert(isEntryRequest("BPI Savings", {kind:"account",fields:{}}));
assert.equal(simpleEntryRows("500 at Mendokoro", {kind:"transaction",fields:{accountId:"selected",currency:"PHP"}})?.[0].accountId,"selected");

const entryContext = { kind: "transaction" as const, fields: { accountId: "cash", currency: "PHP", date: "2026-10-03" } };
const bpi = { id: "bpi-savings", name: "BPI Savings", institution: "BPI", type: "bank", currency: "PHP" };
const newBank = prepareSimpleAccountEntries("groceries 1,200 from BPI", entryContext, []);
assert.equal(newBank?.accounts[0].type, "bank");
assert.equal(newBank?.accounts[0].balance, "0");
assert.equal(newBank?.confidence, 85, "An inferred new account remains a suggestion for review.");
assert.equal(newBank?.transactions[0].amount, "1200");
assert.equal(newBank?.transactions[0].merchant, "groceries");
assert.equal(newBank?.transactions[0].accountId, "new:account-1");
assert.match(newBank!.reply, /Nothing is saved until you confirm/);
const existingBank = prepareSimpleAccountEntries("groceries 1200 from BPI", entryContext, [bpi]);
assert.equal(existingBank?.accounts.length, 0);
assert.equal(existingBank?.transactions[0].accountId, bpi.id, "An explicit bank overrides the form's default Cash account.");
const twoBanks = prepareSimpleAccountEntries("groceries 1200 from BPI", entryContext, [bpi, { ...bpi, id: "bpi-card", name: "BPI Credit Card", type: "credit_card" }]);
assert.equal(twoBanks?.accounts.length, 0);
assert.equal(twoBanks?.transactions[0].accountId, "");
assert.equal(twoBanks?.confidence, 60, "Ambiguous account choices must lower draft confidence.");
assert.match(twoBanks!.reply, /Which BPI account/);
const wrongCurrency = prepareSimpleAccountEntries("groceries USD 20 from BPI", entryContext, [bpi]);
assert.equal(wrongCurrency?.accounts.length, 0, "Do not duplicate a known bank to bypass a currency mismatch.");
assert.equal(wrongCurrency?.transactions[0].accountId, "");
assert.match(wrongCurrency!.reply, /currency does not match/);
const unknown = prepareSimpleAccountEntries("groceries 1200 from Travel Fund", entryContext, []);
assert.equal(unknown?.accounts.length, 0);
assert.match(unknown!.reply, /bank account, wallet, credit card, or cash/);
assert.equal(prepareSimpleAccountEntries("lunch 500 with cash", entryContext, [])?.accounts[0].type, "cash");
assert.equal(prepareSimpleAccountEntries("lunch 500 using GCash", entryContext, [])?.accounts[0].type, "wallet");
assert.equal(prepareSimpleAccountEntries("lunch 500 from BPI; coffee 100 from BPI", entryContext, [])?.accounts.length, 1);
const incomplete = { ...draft, transactions: [{ ...row, accountId: "" }] };
assert.equal(completeEntryAccountChoice("Use BPI Savings", incomplete, [bpi])?.transactions[0].accountId, bpi.id);
assert.equal(completeEntryAccountChoice("Use BPI Savings", { ...incomplete, transactions: [...incomplete.transactions, { ...incomplete.transactions[0], key: "second" }] }, [bpi]), null, "A short account reply must not assign every row of a multi-transaction draft.");
assert.equal(completeEntryAccountChoice("Use BPI Savings", { ...incomplete, transactions: [{ ...row, accountId: "", currency: "USD" }] }, [bpi]), null);
assert.equal(prepareSimpleAccountEntries("What was my spending last month?", entryContext, []), null);

const suggestion = { categoryId: "food", categoryName: "Food & Dining", confidence: 85, source: "heuristic" as const, sourceLabel: "keyword", reason: "food" };
const categoryOptions = [{ id: "food", type: "expense" }];
assert(applicableCategorySuggestion(suggestion, categoryOptions, "expense"));
assert(!applicableCategorySuggestion(suggestion, categoryOptions, "expense", true), "Never replace a user-selected category.");
assert(!applicableCategorySuggestion(suggestion, categoryOptions, "income"));
assert(!applicableCategorySuggestion({ ...suggestion, confidence: 59 }, categoryOptions, "expense"));
assert(!applicableCategorySuggestion({ ...suggestion, categoryId: "foreign" }, categoryOptions, "expense"));
assert(!applicableCategorySuggestion({ ...suggestion, confidence: NaN }, categoryOptions, "expense"));
assert.equal(speechLocale(["en-PH"], ["fr-FR", "en_US"]), "en-US");
assert.equal(speechLocale(["ko-KR"], ["en-US", "ko_KR"]), "ko-KR");
assert.equal(speechLocale(["id-ID"], ["id_ID", "en-US"]), "id-ID");
assert.equal(speechLocale(["en-PH"], []), "en-US", "Older speech services without locale discovery must not hardcode unsupported en-PH.");
assert.equal(speechErrorMessage("aborted"), "", "Leaving a screen is not a microphone failure.");
assert.match(speechErrorMessage("not-allowed"), /Settings/);
assert.match(speechErrorMessage("no-speech"), /didn’t hear/);
console.log("PASS account-aware entry drafts, ambiguity and currency guards, draft category policy and speech locale selection");
