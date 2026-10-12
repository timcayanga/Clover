import type { DetectedStatementMetadata, ParsedImportRow } from './import-parser';
import { summarizeMerchantText } from './merchant-labels';

function fail(reason: string): never { throw new Error(`MariBank native statement requires source review: ${reason}`); }
const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function date(day: string, month: string, year: string): string {
  const m = months.indexOf(month.toUpperCase()), y = Number(year), d = Number(day);
  const result = new Date(Date.UTC(y, m, d, 12));
  if (m < 0 || result.getUTCFullYear() !== y || result.getUTCMonth() !== m || result.getUTCDate() !== d) fail('invalid period or movement date');
  return result.toISOString().slice(0, 10);
}
const money = (text: string) => Math.round(Number(text.replaceAll(',', '')) * 100);

export function parseMariBankNativeLedger(text: string): { metadata: DetectedStatementMetadata; rows: ParsedImportRow[] } | null {
  if (!/^MARIBANK_NATIVE_PAGES \d+$/m.test(text)) return null;
  const native = [...text.matchAll(/^MARIBANK_NATIVE_PAGES (\d+)$/gm)];
  if (native.length !== 1) fail('duplicate page proof');
  const pages = Number(native[0][1]);
  const printed = [...text.matchAll(/\bpage\s+(\d+)\s+of\s+(\d+)/gi)];
  if (pages < 1 || pages > 100 || printed.length !== pages || printed.some((m, i) => Number(m[1]) !== i + 1 || Number(m[2]) !== pages)) fail('printed and physical pages must agree');
  const identities = [...text.matchAll(/(?:MARI\s*BANK|SEABANK)\s+ACCOUNT:\s*(\d{11})(?=\b|Call\b)/gi)].map(m => m[1]);
  if (!identities.length || new Set(identities).size !== 1) fail('full source account identity is missing or conflicting');
  const accountNumber = identities[0];
  const periods = [...text.matchAll(/\b(\d{1,2})\s+([A-Z]{3})\s+(\d{4})\s+to\s+(\d{1,2})\s+([A-Z]{3})\s+(\d{4})\b/gi)];
  if (periods.length !== 1) fail('one complete statement period is required');
  const p = periods[0], start = date(p[1], p[2], p[3]), end = date(p[4], p[5], p[6]);
  if (start > end || p[2].toUpperCase() !== p[5].toUpperCase() || p[3] !== p[6]) fail('unsupported statement period');
  const summaryStart = text.search(/ACCOUNT\s+SUMMARY/i), detailStart = text.search(/SAVINGS\s*-\s*TRANSACTION\s+DETAILS/i);
  if (summaryStart < 0 || detailStart < summaryStart) fail('summary and savings ledger must be present');
  const summary = text.slice(summaryStart, detailStart);
  if (!/TOTAL\s+OUTGOING|OUTGOING\s*\(PHP\)/i.test(summary) || !/TOTAL\s+INCOMING|INCOMING\s*\(PHP\)/i.test(summary) || !/PHP/i.test(summary)) fail('summary currency/column labels are incomplete');
  const values = [...summary.matchAll(/\d[\d,]*\.\d{2}/g)].map(m => money(m[0]));
  if (values.length !== 5 || values[3] !== values[4]) fail('four summary amounts and matching closing total are required');
  const [opening, outgoing, incoming, closing] = values;
  if (opening + incoming - outgoing !== closing) fail('summary totals do not reconcile');
  const lines = text.split(/\r?\n/).filter(l => l.startsWith('MARIBANK_TXN |'));
  const coverage = [...text.matchAll(/^MARIBANK_NATIVE_ROW_COUNT (\d+)$/gm)].map(m => Number(m[1]));
  if (!lines.length) {
    const taxStart = text.search(/SAVINGS\s*-\s*INTEREST\s*&\s*TAX\s+DETAILS/i);
    const ledger = taxStart > detailStart ? text.slice(detailStart, taxStart) : '';
    if (!coverage.length || coverage.some(n => n !== 0) || !/\bNO RECENT TRANSACTION\b/i.test(ledger) || outgoing !== 0 || incoming !== 0 || opening !== closing) fail('empty ledger needs explicit source evidence and zero movement totals');
    if (/\b\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/i.test(ledger)) fail('dated movements conflict with empty ledger');
    const accountName = `MariBank ${accountNumber.slice(-4)}`;
    const line = `MARIBANK_EMPTY_LEDGER | ${start} | ${end} | ${accountNumber} | ${(closing / 100).toFixed(2)}`;
    return { metadata: { institution: 'MariBank', accountName, accountNumber, accountType: 'bank', currency: 'PHP', openingBalance: opening / 100, endingBalance: closing / 100, startDate: start, endDate: end, confidence: 95, currencyConfidence: 100, institutionConfidence: 100, identityEvidence: ['maribank-native-ledger-v1', 'maribank-native-empty-snapshot-v1', 'Complete native pages, explicit empty savings ledger and zero source flows'] },
      rows: [{ date: end, amount: '0.00', currency: 'PHP', type: 'income', merchantRaw: accountName, merchantClean: accountName, description: 'No recent transaction; account balance snapshot', accountNumber, accountName, institution: 'MariBank', categoryName: 'Other', confidence: 95,
        rawPayload: { source: 'maribank_native_columns', kind: 'account_snapshot_marker', line, sourceRowIndex: 0, accountNumber, accountName, accountType: 'bank', accountCurrency: 'PHP', balance: closing / 100, statementEndingBalance: closing / 100, snapshotDate: end, sourceEmptyLedgerLabel: 'NO RECENT TRANSACTION', balanceReconciled: true, reconciliation: { version: 'maribank-native-ledger-v1', openingBalance: opening / 100, endingBalance: closing / 100, totalIncoming: 0, totalOutgoing: 0, physicalPages: pages }, sourceDocumentText: text } }] };
  }
  if (!lines.length || coverage.reduce((n, x) => n + x, 0) !== lines.length) fail('dated native movements are missing');
  let actualIn = 0, actualOut = 0;
  const rows = lines.map((line, sourceRowIndex): ParsedImportRow => {
    const parts = line.split(/\s*\|\s*/);
    if (parts.length !== 6) fail('native movement fields are incomplete');
    const [, dayText, direction, amountText, merchant, detail] = parts;
    if (!/^(?:incoming|outgoing)$/.test(direction) || !/^\d[\d,]*\.\d{2}$/.test(amountText)) fail('invalid amount/direction');
    const amount = money(amountText);
    if (amount <= 0 || !merchant) fail('positive movement and source description required');
    const d = dayText.match(/^(\d{1,2}) ([A-Z]{3})$/i);
    const movementDate = d ? date(d[1], d[2], p[3]) : dayText.toUpperCase() === p[5].toUpperCase() && /Net Interest/i.test(detail) && direction === 'incoming' ? end : fail('invalid movement date');
    if (movementDate < start || movementDate > end) fail('movement outside source period');
    if (direction === 'incoming') actualIn += amount; else actualOut += amount;
    const combined = `${merchant} ${detail}`;
    const categoryName = /fee|tax|reward|cashback/i.test(combined) ? 'Financial' : /interest/i.test(combined) ? 'Income' : /transfer|moneysend/i.test(combined) ? 'Transfers' : /bill|load|top up/i.test(combined) ? 'Bills & Utilities' : 'Other';
    return { date: movementDate, amount: (amount / 100).toFixed(2), currency: 'PHP', type: direction === 'incoming' ? 'income' : 'expense', merchantRaw: merchant, merchantClean: summarizeMerchantText(merchant, 'MariBank'), description: `${merchant} • ${detail}`, accountNumber, accountName: `MariBank ${accountNumber.slice(-4)}`, institution: 'MariBank', categoryName, confidence: 95,
      rawPayload: { source: 'maribank_native_columns', kind: 'savings_transaction', line, sourceRowIndex, accountNumber, direction, detailLine: detail, notes: `${merchant} • ${detail}`, amountText, balanceReconciled: true, reconciliation: { version: 'maribank-native-ledger-v1', openingBalance: opening / 100, endingBalance: closing / 100, totalIncoming: incoming / 100, totalOutgoing: outgoing / 100, physicalPages: pages }, sourceDocumentText: text } };
  });
  if (actualIn !== incoming || actualOut !== outgoing) fail('all incoming/outgoing source movements must match summary totals');
  return { rows, metadata: { institution: 'MariBank', accountName: `MariBank ${accountNumber.slice(-4)}`, accountNumber, accountType: 'bank', currency: 'PHP', openingBalance: opening / 100, endingBalance: closing / 100, startDate: start, endDate: end, confidence: 95, currencyConfidence: 100, institutionConfidence: 100, identityEvidence: ['maribank-native-ledger-v1', 'Full Philippine MariBank/SeaBank account, complete native page/row coverage and source totals'] } };
}

export function hasVerifiedMariBankNativeRows(text: string, rows: Array<{ amount?: unknown; date?: unknown; rawPayload?: unknown }>): boolean {
  try {
    const source = parseMariBankNativeLedger(text);
    return Boolean(source && rows.length === source.rows.length && rows.every((r, i) => {
      const raw = r.rawPayload as Record<string, unknown> | null;
      return Number(r.amount) === Number(source.rows[i].amount) && r.date === source.rows[i].date && raw?.source === 'maribank_native_columns' && raw.line === source.rows[i].rawPayload?.line && raw.sourceRowIndex === i;
    }));
  } catch { return false; }
}
