type EvidenceRow = { amount?: unknown; date?: unknown; confidence?: unknown; rawPayload?: unknown };
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** These checks precede trust in institution names, cached parses and templates. */
export function assessImportEvidenceSafety(rows: EvidenceRow[], sourceText = '') {
  const reasons = new Set<string>();
  const ledger = rows.filter(row => !['account_snapshot_marker', 'opening_balance', 'receivable_commitment_marker'].includes(String(record(row.rawPayload).kind)));
  // A workbook can legitimately have a separate transaction worksheet.
  const documentLedger = ledger.filter(row => !record(row.rawPayload).worksheetName);
  if (documentLedger.length && /\bmarket\s+value\b/i.test(sourceText) && /\bvaluation\s+date\b/i.test(sourceText) && /\b(?:investment|holdings?|portfolio)\b/i.test(sourceText)) {
    reasons.add('holdings_summary_as_transactions');
  }
  for (const row of ledger) {
    const raw = record(row.rawPayload);
    const evidence = record(raw.parserEvidence);
    const line = [raw.line, raw.sourceText, evidence.source_text].find(value => typeof value === 'string') as string | undefined ?? '';
    const dates = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/g;
    const dateTokens = [...line.matchAll(dates)].flatMap(match => match[0].split(/[/-]/).map(Number));
    const amount = Math.abs(Number(String(row.amount ?? '').replace(/,/g, '')));
    const remainingNumbers = [...line.replace(dates, ' ').matchAll(/[-+]?\d[\d,]*(?:\.\d+)?/g)].map(match => Math.abs(Number(match[0].replace(/,/g, ''))));
    if (Number.isFinite(amount) && dateTokens.includes(amount) && !remainingNumbers.includes(amount)) {
      reasons.add('amount_from_date');
    }
    // raw.line alone is the unvalidated generic heuristic path, not source
    // evidence tying a monetary field to a transaction. Do not give it 100.
    if (typeof raw.line === 'string' && !raw.kind && !raw.parserEvidence && !(Number(row.confidence) > 0)) {
      reasons.add('unverified_heuristic_rows');
    }
  }
  return { reasons: [...reasons], critical: reasons.has('amount_from_date') || reasons.has('holdings_summary_as_transactions') };
}

export function assertSafeImportEvidence(rows: EvidenceRow[], sourceText = '') {
  const assessment = assessImportEvidenceSafety(rows, sourceText);
  if (assessment.reasons.length) {
    throw new Error('Clover could not verify the extracted amounts against the source. Nothing was added. Try a clearer file or the original spreadsheet.');
  }
}
