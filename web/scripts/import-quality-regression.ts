import assert from "node:assert/strict";
import { assessStatementExtractionQuality, compareStatementExtractionCandidates } from "@/lib/import-quality";

const row = (overrides: Record<string, unknown> = {}) => ({
  date: "2026-01-01",
  amount: "100.00",
  merchantRaw: "JOLLIBEE",
  merchantClean: "Jollibee",
  categoryName: "Food & Dining",
  rawPayload: { parserEvidence: { page: 1, source_text: "01/01 JOLLIBEE 100.00" } },
  ...overrides,
});

const main = () => {
  const complete = assessStatementExtractionQuality({
    rows: [row(), row({ date: "2026-01-02", rawPayload: { parserEvidence: { page: 2, source_text: "01/02 DUNKIN 100.00" } }, merchantRaw: "DUNKIN", merchantClean: "Dunkin" })],
    pageCount: 2,
    declaredTransactionCount: 2,
    balanceReconciled: true,
  });
  assert.equal(complete.critical, false);
  assert.equal(complete.score, 100);

  const incomplete = assessStatementExtractionQuality({
    rows: [row()],
    pageCount: 4,
    declaredTransactionCount: 7,
    balanceReconciled: false,
  });
  assert.equal(incomplete.critical, true);
  assert.ok(incomplete.reasons.includes("declared_count_mismatch"));
  assert.ok(incomplete.reasons.includes("incomplete_page_coverage"));

  const weakEnrichment = assessStatementExtractionQuality({
    rows: [row({ merchantClean: null, categoryName: "Other" }), row({ merchantClean: null, categoryName: "Other", date: "2026-01-02" })],
    pageCount: 1,
    declaredTransactionCount: 2,
  });
  assert.ok(weakEnrichment.reasons.includes("low_normalized_name_coverage"));
  assert.ok(weakEnrichment.reasons.includes("high_other_rate"));

  const duplicateRows = assessStatementExtractionQuality({
    rows: [row(), row()],
    pageCount: 1,
    declaredTransactionCount: 2,
  });
  assert.ok(duplicateRows.reasons.includes("duplicate_row_keys"));

  const candidateComparison = compareStatementExtractionCandidates({
    local: incomplete,
    backup: complete,
  });
  assert.equal(candidateComparison.winner, "backup");
  assert.equal(candidateComparison.reason, "backup_materially_better");

  const criticalBackupComparison = compareStatementExtractionCandidates({
    local: complete,
    backup: incomplete,
  });
  assert.equal(criticalBackupComparison.winner, "local");
  assert.equal(criticalBackupComparison.reason, "backup_critical");

  console.log("Import quality regression checks passed.");
};

main();
