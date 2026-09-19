import { parseAddFormDraft } from "../../shared/add-form-draft";
import { entryFormSchema } from "../lib/adviser-entry-schema";
import assert from "node:assert/strict";
import {
  emptyTableRow,
  parseTablePaste,
  populatedRow,
  tableRowIssues,
  duplicateTableKeys,
} from "../../shared/transaction-table";
import { mobileOperation } from "../lib/mobile-api-policy";
const options = {
  accounts: [
    { id: "a", name: "Cash", currency: "PHP", type: "cash" },
    { id: "b", name: "Bank", currency: "PHP", type: "bank" },
    { id: "c", name: "USD", currency: "USD", type: "bank" },
  ],
  categories: [{ id: "food", name: "Food", type: "expense" }],
};
const valid = {
  ...emptyTableRow("1"),
  merchant: "Lunch",
  date: "2026-09-19",
  amount: "350.25",
  currency: "PHP",
  accountId: "a",
  categoryId: "food",
};
assert.deepEqual(
  parseTablePaste(
    '2026-09-19\t"Lunch\twith friends"\t350\r\n2026-09-20\t"Two\nlines and ""quotes"""\t40\r\n',
  ),
  [
    ["2026-09-19", "Lunch\twith friends", "350"],
    ["2026-09-20", 'Two\nlines and "quotes"', "40"],
  ],
);
assert.throws(() => parseTablePaste('"unfinished'), /unclosed quote/);
assert.equal(populatedRow(emptyTableRow("0")), false);
assert.equal(populatedRow({ ...emptyTableRow("0"), notes: "Remember" }), true);
assert.deepEqual(tableRowIssues(valid, options), {});
for (const amount of ["-1", "0", "1.234", "1e3", "NaN"]) {
  assert.ok(tableRowIssues({ ...valid, amount }, options).amount);
}
assert.ok(tableRowIssues({ ...valid, date: "2026-02-30" }, options).date);
assert.ok(
  tableRowIssues({ ...valid, accountId: "other-profile" }, options).accountId,
);
assert.ok(tableRowIssues({ ...valid, currency: "USD" }, options).currency);
assert.ok(tableRowIssues({ ...valid, type: "income" }, options).categoryId);
assert.deepEqual(
  tableRowIssues(
    { ...valid, type: "transfer", destinationAccountId: "b" },
    options,
  ),
  {},
);
assert.ok(
  tableRowIssues(
    { ...valid, type: "transfer", destinationAccountId: "c" },
    options,
  ).destinationAccountId,
);
assert.deepEqual(
  [...duplicateTableKeys([valid, { ...valid, key: "2", amount: "350.250" }])],
  ["1", "2"],
);
assert.equal(
  mobileOperation("POST", ["transactions", "batch"]),
  "transaction-batch",
);
assert.equal(mobileOperation("GET", ["transactions", "batch"]), null);
console.log(
  "Transaction table parsing, validation, duplicates and native policy passed.",
);

assert.equal(
  parseAddFormDraft({ kind: "split", fields: { requestPayment: "true" } }),
  null,
);
assert.equal(
  parseAddFormDraft({ kind: "recurring", fields: { amount: 100 } }),
  null,
);
assert.deepEqual(
  parseAddFormDraft({
    kind: "recurring",
    fields: { title: "Internet", amount: "1499" },
  }),
  { kind: "recurring", fields: { title: "Internet", amount: "1499" } },
);
assert.ok(
  entryFormSchema.safeParse({
    kind: "recurring",
    fields: { title: "Internet", recurrence: "monthly" },
  }).success,
);

assert.deepEqual(
  parseAddFormDraft({
    kind: "trade",
    fields: { assetName: "ALI", amount: "2850", quantity: "100" },
  }),
  {
    kind: "trade",
    fields: { assetName: "ALI", amount: "2850", quantity: "100" },
  },
);
