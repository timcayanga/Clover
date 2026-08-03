import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyWorkspaceInternalTransfers,
  findSameCurrencyCashAccount,
  inferTransferCandidateDirection,
  isAtmCashWithdrawalCandidate,
  type WorkspaceTransferCandidate,
} from "@/lib/internal-transfer-matching";

assert.equal(
  isAtmCashWithdrawalCandidate({
    type: "transfer",
    merchantRaw: "Trading Wallet Withdraw",
    merchantClean: "ATM Withdrawal",
    description: "Withdraw - GCrypto Wallet",
    rawPayload: {
      bank: "GCrypto",
      providerInstitution: "PDAX",
      kind: "gcrypto_mobile_screenshot_transaction",
    },
  }),
  false,
  "GCrypto wallet movements must never create ATM Cash transfers"
);
import { buildOptimisticPreviewTransactions } from "@/lib/import-preview-transactions";
import { deriveReconciledBalance } from "@/lib/account-balance";

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

assert.equal(
  isAtmCashWithdrawalCandidate({
    type: "expense",
    merchantRaw: "ATM Withdrawal",
    merchantClean: "ATM Withdrawal",
    description: "W/D FR SAV BDO",
    rawPayload: null,
  }),
  true,
  "A real ATM withdrawal should be eligible for routing into Cash."
);
assert.equal(
  isAtmCashWithdrawalCandidate({
    type: "expense",
    merchantRaw: "ATM Withdrawal Acquirer Fee",
    merchantClean: "ATM Fee",
    description: "ATM withdrawal fee",
    rawPayload: null,
  }),
  false,
  "An ATM fee must remain an expense instead of increasing Cash."
);
assert.equal(
  isAtmCashWithdrawalCandidate({
    type: "income",
    merchantRaw: "Reversal - ATM Withdrawal",
    merchantClean: "ATM Reversal",
    description: null,
    rawPayload: null,
  }),
  false,
  "An ATM reversal must not create a cash destination entry."
);

const cashAccounts = [
  { id: "cash-php", type: "cash", currency: "PHP" },
  { id: "cash-gbp", type: "cash", currency: "GBP" },
  { id: "bank-gbp", type: "bank", currency: "GBP" },
];
assert.equal(findSameCurrencyCashAccount(cashAccounts, "gbp")?.id, "cash-gbp");
assert.equal(findSameCurrencyCashAccount(cashAccounts, "EUR"), null);
assert.equal(
  deriveReconciledBalance({
    balance: "0",
    transactions: [
      {
        amount: "100.00",
        type: "transfer",
        description: "Cash received from BPI 3012",
        rawPayload: { amountDelta: 100 },
      },
    ],
  }),
  "100.00",
  "The generated cash-side transfer must increase the Cash account balance."
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
assert.match(
  workerSource,
  /findSameCurrencyCashAccount\(workspaceAccountsForTransferMatching, rowCurrency\)/,
  "ATM routing must resolve Cash by the transaction currency."
);
assert.match(
  workerSource,
  /kind: "atm_cash_destination_transfer"[\s\S]+amountDelta: Math\.abs\(sourceAmount\)[\s\S]+sourceTransactionId/,
  "ATM routing must persist an idempotent, positive cash-side transfer linked to its statement row."
);
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
