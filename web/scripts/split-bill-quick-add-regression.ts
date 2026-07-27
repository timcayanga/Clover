import assert from "node:assert/strict";
import { getQuickAddItemParticipantIds } from "../lib/split-bill-quick-add";

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

console.log("Split bill quick-add regression passed.");
