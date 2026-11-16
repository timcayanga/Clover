import assert from "node:assert/strict";
import {
  buildOpenAIBackupSystemPrompt,
  coldLayoutCandidateNeedsStrongRetry,
  scoreColdLayoutCandidate,
  shouldUseColdVisualImportFastPath,
} from "@/lib/openai-import-parser";
import { buildStatementFamilySignature } from "@/lib/data-engine";

const statementPrompt = buildOpenAIBackupSystemPrompt("statement", true, false);
assert.match(statementPrompt, /backup parser/i);
assert.match(statementPrompt, /Do not invent data/i);
assert.match(statementPrompt, /provided page images directly/i);
assert.match(statementPrompt, /ignore app chrome/i);
assert.match(statementPrompt, /return only the rows supported by visible evidence/i);

const pdfPrompt = buildOpenAIBackupSystemPrompt("statement", false, true);
assert.match(pdfPrompt, /PDF content directly/i);
assert.doesNotMatch(pdfPrompt, /provided page images directly/i);

const portfolioPrompt = buildOpenAIBackupSystemPrompt("portfolio", false, false);
assert.match(portfolioPrompt, /holdings or portfolio document/i);
assert.match(portfolioPrompt, /holdings extraction over inventing ledger transactions/i);

assert.equal(
  shouldUseColdVisualImportFastPath({
    importMode: "statement",
    documentFamily: "generic_document",
    pageImageCount: 4,
    textLength: 20,
    parsedRowsCount: 0,
    metadataConfidence: 15,
    hasInstitution: false,
    hasAccountIdentity: false,
  }),
  true,
  "Expected an unfamiliar scanned statement to start with the bounded cold-layout path."
);
assert.equal(
  shouldUseColdVisualImportFastPath({
    importMode: "statement",
    documentFamily: "bank_statement",
    pageImageCount: 1,
    textLength: 0,
    parsedRowsCount: 0,
    metadataConfidence: 92,
    hasInstitution: true,
    hasAccountIdentity: true,
  }),
  true,
  "A one-page cold image must start with the fast classifier even when its filename produced a confident account guess."
);
assert.equal(
  shouldUseColdVisualImportFastPath({
    importMode: "statement",
    documentFamily: "bank_statement",
    pageImageCount: 2,
    textLength: 2_000,
    parsedRowsCount: 18,
    metadataConfidence: 94,
    hasInstitution: true,
    hasAccountIdentity: true,
  }),
  false,
  "Expected a trained deterministic statement to stay off the cold-layout path."
);

const weakColdCandidate = {
  document_type: "statement",
  institution: null,
  account: {
    display_name: null,
    institution_name: null,
    account_number: null,
    account_last4: null,
  },
  transactions: [
    {
      date: null,
      post_date: null,
      transaction_date: null,
      amount: 250,
      raw_name: "PAYMENT",
      parser_evidence: { source_text: null },
    },
  ],
  quality_checks: { transaction_count: 8 },
};
assert.equal(coldLayoutCandidateNeedsStrongRetry({ candidate: weakColdCandidate, pageImageCount: 4 }), true);

const strongColdCandidate = {
  document_type: "statement",
  institution: "Example Bank",
  account: {
    display_name: "Example Bank 1234",
    institution_name: "Example Bank",
    account_number: null,
    account_last4: "1234",
  },
  transactions: Array.from({ length: 6 }, (_, index) => ({
    date: `2026-07-${String(index + 1).padStart(2, "0")}`,
    post_date: null,
    transaction_date: null,
    amount: 100 + index,
    raw_name: `Merchant ${index + 1}`,
    parser_evidence: { source_text: `Visible statement row ${index + 1}` },
  })),
  quality_checks: { transaction_count: 6 },
};
assert.ok(scoreColdLayoutCandidate(strongColdCandidate) >= 62);
assert.equal(coldLayoutCandidateNeedsStrongRetry({ candidate: strongColdCandidate, pageImageCount: 4 }), false);

const rowDerivedFamilySignature = buildStatementFamilySignature({
  rows: strongColdCandidate.transactions.map((transaction) => ({
    date: transaction.date,
    amount: transaction.amount.toFixed(2),
    merchantRaw: transaction.raw_name,
    merchantClean: transaction.raw_name,
    type: "expense",
    balance: (1_000 - transaction.amount).toFixed(2),
  })),
  metadata: {
    institution: "Example Bank",
    accountType: "bank",
    startDate: "2026-07-01",
    endDate: "2026-07-31",
  },
  fileType: "application/pdf",
});
assert.match(rowDerivedFamilySignature ?? "", /Example Bank\|bank\|application\/pdf/);

console.log("Backup parser prompt regression checks passed.");
