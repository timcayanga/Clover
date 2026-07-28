import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getQuickAddItemParticipantIds } from "../lib/split-bill-quick-add";
import { createBlankSplitBillDraft, deriveSplitBillDraftTotals } from "../lib/split-bill";

const participants = [
  { id: "owner", name: "Tim" },
  { id: "friend", name: "Friend" },
];

assert.deepEqual(
  getQuickAddItemParticipantIds("you-paid", participants, "Tim"),
  ["owner", "friend"],
  "Equal splits must include the payer's own share."
);
assert.deepEqual(
  getQuickAddItemParticipantIds("person-paid", participants, "Friend"),
  ["owner", "friend"],
  "Equal splits must include a friend payer's own share."
);
assert.deepEqual(
  getQuickAddItemParticipantIds("you-owed", participants, "Tim"),
  ["friend"],
  "Full-amount owed mode must assign the whole item away from the payee."
);

const manualDraft = createBlankSplitBillDraft();
manualDraft.items = [{ ...manualDraft.items[0]!, amount: "1000" }];
assert.deepEqual(
  deriveSplitBillDraftTotals(manualDraft),
  { subtotal: "1000.00", total: "1000.00" },
  "Manual split bills must derive persisted totals from their item rows."
);

manualDraft.tax = "120";
manualDraft.discount = "20";
assert.deepEqual(
  deriveSplitBillDraftTotals(manualDraft),
  { subtotal: "1000.00", total: "1100.00" },
  "Derived split-bill totals must include adjustments."
);

manualDraft.subtotal = "950";
manualDraft.total = "975";
assert.deepEqual(
  deriveSplitBillDraftTotals(manualDraft),
  { subtotal: "950.00", total: "975.00" },
  "Explicit receipt summaries must remain authoritative."
);

const editorSource = fs.readFileSync(path.join(process.cwd(), "components/split-bill-editor.tsx"), "utf8");
assert.match(
  editorSource,
  /draft\.items = draft\.items\.map\(\(item, index\) => \(\{[\s\S]{0,120}id: item\.id \?\? `draft-item-\$\{index \+ 1\}`/,
  "Every split-bill item must receive a stable draft ID before controlled fields can update it."
);
assert.match(
  editorSource,
  /draft\.payments = draft\.payments\.map\(\(payment, index\) => \(\{[\s\S]{0,120}id: payment\.id \?\? `draft-payment-\$\{index \+ 1\}`/,
  "Every split-bill payment must receive a stable draft ID before controlled fields can update it."
);
assert.doesNotMatch(
  editorSource.slice(editorSource.indexOf("const makeInitialDraft"), editorSource.indexOf("const readJsonResponse")),
  /createDraftId\(\)/,
  "The server and browser must render the same initial split-bill IDs."
);

console.log("Split bill quick-add regression passed.");
