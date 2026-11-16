import { normalizeKoreanFinancialText, parseKoreanDate } from "@/lib/korean-financial-text";
import { looksLikeKoreanBankTableHeader } from "@/lib/korean-bank-table";
import { looksLikeIndonesianBankTableHeader } from "@/lib/indonesian-bank-table";
import { hasIndonesianFinancialText, parseIndonesianAmount } from "@/lib/indonesian-financial-text";
import { looksLikeIndonesianPaymentProof } from "@/lib/indonesian-payment-proof";

type EvidenceRow = { amount?: unknown; date?: unknown; confidence?: unknown; rawPayload?: unknown };
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** These checks precede trust in institution names, cached parses and templates. */
export function assessImportEvidenceSafety(rows: EvidenceRow[], sourceText = '') {
  const reasons = new Set<string>();
  const koreanBankColumns = sourceText.split(/\r?\n/).some(looksLikeKoreanBankTableHeader);
  const indonesianBankColumns = sourceText.split(/\r?\n/).some(looksLikeIndonesianBankTableHeader);
  const indonesianPaymentProof = looksLikeIndonesianPaymentProof(sourceText);
  const ledger = rows.filter(row => !['account_snapshot_marker', 'opening_balance', 'receivable_commitment_marker'].includes(String(record(row.rawPayload).kind)));
  // A workbook can legitimately have a separate transaction worksheet.
  const documentLedger = ledger.filter(row => !record(row.rawPayload).worksheetName);
  const koreanHoldings = /종목명|펀드명|투자상품명/.test(sourceText) && /평가금액|평가액/.test(sourceText) && /평가일|기준일|조회일/.test(sourceText);
  const indonesianHoldings = /\bnama (?:investasi|reksa ?dana|saham|produk)\b/i.test(sourceText) && /\bnilai (?:pasar|investasi|portofolio)\b/i.test(sourceText) && /\b(?:tanggal (?:valuasi|penilaian|nab)|per tanggal)\b/i.test(sourceText);
  if (documentLedger.length && (koreanHoldings || indonesianHoldings || (/\bmarket\s+value\b/i.test(sourceText) && /\bvaluation\s+date\b/i.test(sourceText) && /\b(?:investment|holdings?|portfolio)\b/i.test(sourceText)))) {
    reasons.add('holdings_summary_as_transactions');
  }
  for (const row of ledger) {
    const raw = record(row.rawPayload);
    const evidence = record(raw.parserEvidence);
    const line = normalizeKoreanFinancialText([raw.line, raw.sourceText, evidence.source_text].find(value => typeof value === 'string') as string | undefined ?? '');
    const dates = /(?<!\d)(?:\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일|\d{4}[./-]\s*\d{1,2}[./-]\s*\d{1,2}\.?|\d{1,2}[/-]\d{1,2}[/-]\d{4})(?!\d)/g;
    const dateTokens = [...line.matchAll(dates)].flatMap(match => (match[0].match(/\d+/g) ?? []).map(Number));
    // Compact dates need a date position/label. A printed 20260930원 is a
    // possible amount and must not be erased just because it resembles a date.
    const compactDates = /(?:^|(?:거래|결제|승인|평가|기준|조회)일(?:자|시)?\s*[:：]?\s*)(\d{8})(?=\s|$)(?!\s*(?:KRW|원))/g;
    const withoutDates = line.replace(dates, ' ').replace(/\b\d{1,2}[\s-]+(?:jan(?:uari)?|feb(?:ruari)?|mar(?:et)?|apr(?:il)?|mei|jun(?:i)?|jul(?:i)?|agu(?:stus)?|ags|sep(?:t(?:ember)?)?|okt(?:ober)?|nov(?:ember)?|des(?:ember)?)[\s-]+\d{4}\b/gi, match => {
      dateTokens.push(...(match.match(/\d+/g) ?? []).map(Number)); return ' ';
    }).replace(compactDates, (match, value: string) => {
      const date = parseKoreanDate(value);
      if (!date) return match;
      dateTokens.push(Number(value), date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
      return ' ';
    });
    const amount = Math.abs(Number(String(row.amount ?? '').replace(/,/g, '')));
    const indonesian = raw.accountCurrency === 'IDR' || raw.documentLocale === 'id' || String(raw.source).startsWith('indonesian') || hasIndonesianFinancialText(sourceText);
    const remainingNumbers = [...withoutDates.matchAll(/[-+]?\d[\d,.]*/g)].map(match => indonesian ? Math.abs(parseIndonesianAmount(match[0]) ?? NaN) : Math.abs(Number(match[0].replace(/,/g, ''))));
    if (Number.isFinite(amount) && dateTokens.includes(amount) && !remainingNumbers.includes(amount)) {
      reasons.add('amount_from_date');
    }
    // raw.line alone is the unvalidated generic heuristic path, not source
    // evidence tying a monetary field to a transaction. Do not give it 100.
    if (typeof raw.line === 'string' && !raw.kind && !raw.parserEvidence && !(Number(row.confidence) > 0)) {
      reasons.add('unverified_heuristic_rows');
    }
    if (typeof raw.line === 'string' && !raw.parserEvidence && !raw.source && koreanBankColumns) {
      reasons.add('korean_table_without_column_evidence');
    }
    if (typeof raw.line === 'string' && !raw.parserEvidence && !raw.source && indonesianBankColumns) reasons.add('indonesian_table_without_column_evidence');
    if (typeof raw.line === 'string' && !raw.parserEvidence && !raw.source && indonesianPaymentProof) reasons.add('indonesian_payment_without_field_evidence');
  }
  return { reasons: [...reasons], critical: reasons.has('amount_from_date') || reasons.has('holdings_summary_as_transactions') || reasons.has('korean_table_without_column_evidence') || reasons.has('indonesian_table_without_column_evidence') || reasons.has('indonesian_payment_without_field_evidence') };
}

export function assertSafeImportEvidence(rows: EvidenceRow[], sourceText = '') {
  const assessment = assessImportEvidenceSafety(rows, sourceText);
  if (assessment.reasons.length) {
    throw new Error('Clover could not verify the extracted amounts against the source. Nothing was added. Try a clearer file or the original spreadsheet.');
  }
}
