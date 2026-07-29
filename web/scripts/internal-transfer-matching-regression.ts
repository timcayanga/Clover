import assert from "node:assert/strict";
import {
  classifyWorkspaceInternalTransfers,
  inferTransferCandidateDirection,
  type WorkspaceTransferCandidate,
} from "@/lib/internal-transfer-matching";

const outgoing: WorkspaceTransferCandidate = {
  id: "hsbc-outgoing",
  accountId: "hsbc",
  accountNumber: "12345678",
  date: "2026-07-06",
  amount: "250.00",
  currency: "GBP",
  type: "expense",
  categoryName: "Transfers",
  merchantRaw: "BP ALEX SMITH",
  rawPayload: {
    bank: "HSBC",
    transactionCode: "BP",
    parsedDirectionType: "expense",
  },
};

assert.equal(
  inferTransferCandidateDirection({ ...outgoing, type: "transfer" }),
  "expense",
  "An HSBC bank payment must retain its outgoing ledger direction."
);

const withoutOwnedCounterpart = classifyWorkspaceInternalTransfers(
  [outgoing],
  [{ id: "hsbc", accountNumber: "12345678" }]
);
assert.equal(
  withoutOwnedCounterpart.internalIds.size,
  0,
  "A payment to another person's account must remain an expense even when categorized as Transfers."
);

const laterUploadedCounterpart: WorkspaceTransferCandidate = {
  id: "wise-incoming",
  accountId: "wise",
  accountNumber: "87654321",
  date: "2026-07-07",
  amount: "250.00",
  currency: "GBP",
  type: "income",
  categoryName: "Transfers",
  merchantRaw: "Received from HSBC",
};
const withLaterOwnedCounterpart = classifyWorkspaceInternalTransfers(
  [outgoing, laterUploadedCounterpart],
  [
    { id: "hsbc", accountNumber: "12345678" },
    { id: "wise", accountNumber: "87654321" },
  ]
);
assert.deepEqual(
  Array.from(withLaterOwnedCounterpart.internalIds).sort(),
  ["hsbc-outgoing", "wise-incoming"],
  "Uploading the destination account later must retroactively promote both matching movements."
);

const unrelatedExpense: WorkspaceTransferCandidate = {
  ...laterUploadedCounterpart,
  id: "utility-expense",
  accountId: "bpi",
  type: "expense",
  categoryName: "Bills & Utilities",
};
const categoryGuard = classifyWorkspaceInternalTransfers(
  [laterUploadedCounterpart, unrelatedExpense],
  [
    { id: "wise", accountNumber: "87654321" },
    { id: "bpi", accountNumber: "3012" },
  ]
);
assert.equal(
  categoryGuard.internalIds.size,
  0,
  "Equal opposite movements must not pair unless both are transfer-category candidates."
);

console.log("[PASS] internal transfer ownership matching regression");
