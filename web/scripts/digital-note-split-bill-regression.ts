import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isImportedSplitBillStructure } from "@/lib/imported-split-bill";

const readProjectFile = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const promptSource = readProjectFile("lib/openai-import-parser.ts");
const workerSource = readProjectFile("workers/import-processor.ts");
const splitBillSource = readProjectFile("lib/imported-split-bill.ts");
const workspaceSource = readProjectFile("components/split-bill-workspace.tsx");

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
  /payerKnown:\s*false[\s\S]*payerReviewRequired:\s*true/,
  "Participant shares must not be treated as payments when the payer is absent."
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

console.log("Digital-note split-bill regression passed.");
