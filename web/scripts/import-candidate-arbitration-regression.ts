import assert from "node:assert/strict";
import {
  arbitrateImportCandidates,
  assessImportCandidate,
  assessStatementLayoutDrift,
} from "../lib/import-candidate-arbitration";
import type { ParsedImportRow } from "../lib/import-parser";

const row = (params: Partial<ParsedImportRow> & Pick<ParsedImportRow, "date" | "amount" | "merchantRaw">): ParsedImportRow => ({
  currency: "PHP",
  merchantClean: params.merchantRaw,
  categoryName: "Shopping",
  type: "expense",
  confidence: 90,
  rawPayload: {
    amountText: params.amount,
    parserEvidence: { source_text: `${params.date} ${params.merchantRaw} ${params.amount}` },
  },
  ...params,
});

const unsafeTrainedRows = [
  row({
    date: "2026-07-01",
    amount: "1234567890604.99",
    merchantRaw: "Merchant approval 1234567890",
    rawPayload: {
      amountText: "1234567890 604.99",
      parserEvidence: { source_text: "Jul 1 Merchant approval 1234567890 604.99" },
    },
  }),
];
const safeGenericRows = [
  row({ date: "2026-07-01", amount: "604.99", merchantRaw: "Merchant" }),
  row({ date: "2026-07-02", amount: "100.00", merchantRaw: "Second Merchant" }),
];

const unsafeAssessment = assessImportCandidate({
  source: "trained",
  rows: unsafeTrainedRows,
  metadata: { currency: "PHP" },
});
assert.equal(unsafeAssessment.critical, true, "merged approval codes must make a candidate critical");

const safeWinner = arbitrateImportCandidates({
  candidates: [
    { source: "trained", rows: unsafeTrainedRows, metadata: { currency: "PHP" } },
    { source: "generic", rows: safeGenericRows, metadata: { currency: "PHP" } },
  ],
  preferredSource: "trained",
});
assert.equal(safeWinner.winner, "generic", "a safe generic parser must replace an unsafe trained parser");
assert.equal(safeWinner.materiallyBetter, true);

const reconciledRows = [
  row({ date: "2026-07-01", amount: "200.00", merchantRaw: "Payroll", type: "income", categoryName: "Income" }),
  row({ date: "2026-07-02", amount: "50.00", merchantRaw: "Groceries" }),
];
const reconciled = assessImportCandidate({
  source: "generic",
  rows: reconciledRows,
  metadata: { openingBalance: 1_000, endingBalance: 1_150, currency: "PHP", confidence: 95 },
});
assert.equal(reconciled.balanceReconciliation.reconciled, true);

const unreconciled = assessImportCandidate({
  source: "trained",
  rows: reconciledRows,
  metadata: { openingBalance: 1_000, endingBalance: 9_999, currency: "PHP", confidence: 95 },
});
assert.equal(unreconciled.balanceReconciliation.reconciled, false);
assert.equal(unreconciled.critical, true, "a declared balance mismatch must fail closed");

const creditCard = assessImportCandidate({
  source: "trained",
  rows: [row({ date: "2026-07-01", amount: "250.00", merchantRaw: "Card purchase" })],
  metadata: { accountType: "credit_card", openingBalance: 1_000, endingBalance: 1_250, currency: "PHP", confidence: 95 },
});
assert.equal(creditCard.balanceReconciliation.reconciled, true, "card expenses increase the liability balance");

const disagreement = arbitrateImportCandidates({
  candidates: [
    { source: "trained", rows: safeGenericRows, metadata: { currency: "PHP" } },
    {
      source: "generic",
      rows: [
        row({ date: "2026-07-01", amount: "700.00", merchantRaw: "Different Merchant" }),
        row({ date: "2026-07-02", amount: "80.00", merchantRaw: "Another Merchant" }),
      ],
      metadata: { currency: "PHP" },
    },
  ],
  preferredSource: "trained",
});
assert.equal(disagreement.winner, "trained", "close candidates should not displace the trained parser casually");
assert.equal(disagreement.requiresReview, true, "material disagreement must be visible to review");

const drift = assessStatementLayoutDrift({
  currentSignature: "bpi|credit_card|approval-code-column|new-ledger-v2|compact-reference",
  templateSignature: "bpi|credit_card|old-ledger-v1|legacy-footer|separate-reference",
  templateScore: 60,
});
assert.equal(drift.drifted, true, "low-overlap statement signatures should trigger backup verification");

const stable = assessStatementLayoutDrift({
  currentSignature: "bpi|credit_card|approval-code-column|ledger",
  templateSignature: "bpi|credit_card|ledger|footer",
  templateScore: 85,
});
assert.equal(stable.drifted, false);

console.log("Import candidate arbitration regression passed.");
