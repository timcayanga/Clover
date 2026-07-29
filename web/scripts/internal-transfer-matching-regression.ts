import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyWorkspaceInternalTransfers,
  inferTransferCandidateDirection,
  type WorkspaceTransferCandidate,
} from "@/lib/internal-transfer-matching";
import { buildOptimisticPreviewTransactions } from "@/lib/import-preview-transactions";

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

const hsbcCardPreview = buildOptimisticPreviewTransactions(
  [
    {
      date: "2025-02-10",
      amount: "6.35",
      currency: "GBP",
      type: "expense",
      categoryName: "Transfers",
      merchantRaw: "Crown Liquor Saloo Belfast",
      rawPayload: {
        bank: "HSBC",
        transactionCode: ")))",
        parsedDirectionType: "expense",
      },
    },
  ],
  {
    importFileId: "hsbc-preview",
    accountId: "hsbc",
    accountName: "HSBC 5067",
    institution: "HSBC",
  }
);
assert.equal(hsbcCardPreview[0]?.type, "expense");
assert.equal(hsbcCardPreview[0]?.isTransfer, false);
assert.equal(hsbcCardPreview[0]?.categoryName, "Food & Dining");

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workerSource = readFileSync(join(scriptDir, "..", "workers", "import-processor.ts"), "utf8");
const enrichmentLogIndex = workerSource.indexOf('console.info("[import-enrichment] processed batch"');
const enrichmentReconciliationIndex = workerSource.indexOf(
  "await reconcileWorkspaceInternalTransfers(prisma, String(importFile.workspaceId));",
  enrichmentLogIndex
);
const enrichmentCompletionIndex = workerSource.indexOf(
  "if (processedRows >= totalRows)",
  enrichmentLogIndex
);
assert.ok(enrichmentLogIndex >= 0, "The enrichment completion section must remain identifiable.");
assert.ok(
  enrichmentReconciliationIndex > enrichmentLogIndex &&
    enrichmentReconciliationIndex < enrichmentCompletionIndex,
  "Ownership reconciliation must run after enrichment updates and before enrichment completes."
);

console.log("[PASS] internal transfer ownership matching regression");
