import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isImportedSplitBillStructure } from "@/lib/imported-split-bill";
import {
  buildSplitBillSettlement,
  getSplitBillSettlementStatus,
} from "@/lib/split-bill";

const readProjectFile = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const promptSource = readProjectFile("lib/openai-import-parser.ts");
const workerSource = readProjectFile("workers/import-processor.ts");
const splitBillSource = readProjectFile("lib/imported-split-bill.ts");
const workspaceSource = readProjectFile("components/split-bill-workspace.tsx");
const splitBillHomeSource = readProjectFile("components/split-bill-home.tsx");

assert.match(
  promptSource,
  /split-cost table with items as rows and people as columns[\s\S]*return transactions: \[\]/,
  "Digital split-cost notes must suppress participant and line-item transaction rows."
);
assert.doesNotMatch(
  promptSource,
  /create one review transaction per person/i,
  "No active extraction prompt may recreate the legacy participant-row behavior."
);
assert.match(
  workerSource,
  /promotesNotesSplitBillToReceipt[\s\S]*effectiveImportMode = "receipt"/,
  "A recognized split-cost note must enter the receipt confirmation path."
);
assert.match(
  workerSource,
  /promotesNotesSplitBillToReceipt\s*\?\s*\[\]/,
  "A recognized split-cost note must discard model transaction rows before persistence."
);
assert.match(
  workerSource,
  /import \{ ensureImportedSplitBill, isImportedSplitBillStructure \} from "@\/lib\/imported-split-bill"[\s\S]*await ensureImportedSplitBill/,
  "Receipt confirmation must create the linked Split Bills record before completing."
);
assert.match(
  workerSource,
  /readPersistedSplitBillReceiptDetails[\s\S]*persistedSplitBillReceiptDetails[\s\S]*trainedReceiptDetails/,
  "A retry must reuse a structurally valid saved split-bill extraction instead of downgrading it to OCR rows."
);
assert.match(
  workerSource,
  /findPriorSplitBillReceiptDetails[\s\S]*sourceFingerprint[\s\S]*priorSplitBillReceiptDetails[\s\S]*trainedReceiptDetails/,
  "A previously processed split-bill image must reuse its exact-fingerprint extraction instead of repeating vision parsing."
);
assert.doesNotMatch(
  splitBillHomeSource,
  /if\s*\(entries\.length\s*===\s*0\)\s*\{\s*return\s*["']Settled["']/,
  "A zero personal balance must render as currency; 'Settled' is reserved for a bill's settlement status."
);
assert.match(
  workerSource,
  /imported_rows: confirmedImportResult\.imported[\s\S]*imported: confirmedImportResult\.imported/,
  "Document completion must report the transaction count that confirmation actually published."
);
assert.match(
  splitBillSource,
  /where:\s*\{\s*transactionId: params\.transactionId\s*\}/,
  "Imported split bills must deduplicate by their linked transaction."
);
assert.match(
  splitBillSource,
  /payerSource:\s*payerWasExplicit\s*\?\s*"document"\s*:\s*payerParticipant\s*\?\s*"clover_account_owner"/,
  "Imported split bills should infer the Clover account owner as payer while preserving review state."
);
assert.match(
  promptSource,
  /participant_allocations[\s\S]*participant_name[\s\S]*amount/,
  "Digital-note extraction must preserve each non-empty item/person table cell."
);
assert.match(
  promptSource,
  /payer_name/,
  "Digital-note extraction must return an explicit payer only when the source identifies one."
);
assert.match(
  workspaceSource,
  /People and balances[\s\S]*Who pays whom/,
  "Bill details must expose per-person shares and settlement transfers."
);
assert.match(
  workspaceSource,
  /isSamePersonName[\s\S]*leftParts\[0\] === rightParts\[0\]/,
  "Imported first-name columns must match the Clover account owner's full name in balance summaries."
);
assert.match(
  readProjectFile("lib/split-bill.ts"),
  /reconciliationDifference[\s\S]*payerParticipantId[\s\S]*toFixed\(2\)/,
  "A one-peso source-table reconciliation difference should fall to the payer for consistent settlement totals."
);
assert.match(
  workspaceSource,
  /<CloverShell[\s\S]*active="split-bill"[\s\S]*title="Split Bills"/,
  "The Split Bills route must highlight Split Bills, not Circles."
);

const declaredTotal = 7030;
const shares = [375, 1326, 951, 573, 951, 951, 951, 951];
const shareTotal = shares.reduce((sum, share) => sum + share, 0);
assert.equal(shareTotal, 7029, "The regression fixture should preserve the source table's one-peso discrepancy.");
assert.ok(
  Math.abs(declaredTotal - shareTotal) <= 1,
  "The source table should reconcile within the documented rounding tolerance."
);
assert.equal(
  isImportedSplitBillStructure({
    total: declaredTotal,
    lineItems: ["Heineken", "Gin", "Tonic Water", "Pizza", "Sisig", "Mushroom Chips"],
    allocations: [
      { participant_name: "Ferdie", charged: 375 },
      { participant_name: "Joey", charged: 1326 },
    ],
  }),
  true,
  "Split-cost notes must be recognized from their financial structure regardless of the model's receipt_type label."
);
assert.equal(
  isImportedSplitBillStructure({
    total: declaredTotal,
    lineItems: ["Heineken"],
    allocations: [{ participant_name: "Ferdie", charged: 375 }],
  }),
  false,
  "A single allocation must not be promoted to a group split bill."
);

const participants = [
  { id: "ferdie", name: "Ferdie" },
  { id: "tim", name: "Tim" },
];
const awaitingPayerSettlement = buildSplitBillSettlement({
  participants,
  items: [{
    amount: "100",
    participantIds: ["ferdie", "tim"],
    splitMethod: "exact",
    allocations: [
      { participantId: "ferdie", value: "60" },
      { participantId: "tim", value: "40" },
    ],
  }],
  payments: [],
});
assert.equal(
  getSplitBillSettlementStatus({ settlement: awaitingPayerSettlement, rawPayload: {} }),
  "awaiting_payer",
  "A fully allocated bill with no payer must not be marked settled."
);

const inferredPayerSettlement = buildSplitBillSettlement({
  participants,
  items: [{
    amount: "100",
    participantIds: ["ferdie", "tim"],
    splitMethod: "exact",
    allocations: [
      { participantId: "ferdie", value: "60" },
      { participantId: "tim", value: "40" },
    ],
  }],
  payments: [{ participantId: "tim", amount: "100" }],
});
assert.deepEqual(
  inferredPayerSettlement.transfers.map((transfer) => ({
    from: transfer.fromParticipantName,
    to: transfer.toParticipantName,
    amount: transfer.amount,
  })),
  [{ from: "Ferdie", to: "Tim", amount: 60 }],
  "Clover should calculate the exact person-to-payer transfer."
);
assert.equal(
  getSplitBillSettlementStatus({
    settlement: inferredPayerSettlement,
    rawPayload: { payerReviewRequired: true },
  }),
  "needs_payer_confirmation",
  "An inferred payer must remain open for confirmation."
);

console.log("Digital-note split-bill regression passed.");
