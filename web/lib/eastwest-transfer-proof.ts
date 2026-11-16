import type { DetectedStatementMetadata, ParsedImportRow } from './import-parser';
import { SourceReviewRequiredError } from './import-source-review';

/** One successful EastWest mobile payment proof, with explicit sender/recipient
 * roles. A recipient bank never establishes the user's source account. */
export function parseEastwestTransferProof(text: string): { metadata: DetectedStatementMetadata; rows: ParsedImportRow[] } | null {
  const lines = text.replace(/\u00a0/g, ' ').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!/^Transfer successful!$/i.test(lines[0] ?? '') || !lines.some(line => /^east\s*west(?:\s+bank)?$/i.test(line))) return null;
  const uniqueIndex = (label: string) => {
    const hits = lines.flatMap((line, index) => line.toLowerCase() === label.toLowerCase() ? [index] : []);
    return hits.length === 1 ? hits[0] : -1;
  };
  const from = uniqueIndex('From'), to = uniqueIndex('To'), feeIndex = uniqueIndex('Transfer Fee');
  const when = uniqueIndex('Date and Time'), referenceIndex = uniqueIndex('Reference Number');
  const modeIndex = uniqueIndex('Transfer Mode');
  const money = (line: string) => {
    const match = line.match(/^PHP\s+((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})$/i);
    const value = match ? Number(match[1].replace(/,/g, '')) : NaN;
    return Number.isFinite(value) && value >= 0 ? value : null;
  };
  const amount = money(lines[1] ?? '');
  const fee = money(lines[feeIndex + 1] ?? '');
  const sender = lines.slice(from + 1, to);
  const recipient = lines.slice(to + 1, feeIndex);
  const mask = sender[1]?.match(/^[*•xX]{4,}(\d{4})$/);
  const stamp = (lines[when + 1] ?? '').match(/^([A-Za-z]{3}) (\d{1,2}) (\d{4}), (\d{1,2}):([0-5]\d) ([AP]M)$/i);
  const month = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ').indexOf(stamp?.[1].toLowerCase() ?? '');
  const calendar = stamp && month >= 0 ? new Date(Date.UTC(+stamp[3], month, +stamp[2])) : null;
  const validDate = calendar && stamp && calendar.getUTCFullYear() === +stamp[3] && calendar.getUTCMonth() === month && calendar.getUTCDate() === +stamp[2] && +stamp[4] >= 1 && +stamp[4] <= 12;
  const reference = lines[referenceIndex + 1] ?? '';
  if (!(from > 1 && to > from && feeIndex > to && when > feeIndex && referenceIndex > when && modeIndex > feeIndex) ||
      sender.length !== 2 || !/^(?:regular savings|savings|checking|current account)$/i.test(sender[0]) || !mask || recipient.length !== 3 || !/^\d{8,20}$/.test(recipient[2]) ||
      amount === null || amount <= 0 || fee === null || !validDate || !stamp || !calendar ||
      !/^[A-Z0-9-]{6,40}$/i.test(reference) || lines[modeIndex + 1]?.toLowerCase() !== 'instapay') {
    throw new SourceReviewRequiredError('This EastWest transfer proof needs a readable sender, recipient, amount, fee, date and reference. Your file is saved.');
  }
  const hour = +stamp[4] % 12 + (stamp[6].toUpperCase() === 'PM' ? 12 : 0);
  const sourceTimestamp = `${calendar.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:${stamp[5]}:00+08:00`;
  const date = new Date(sourceTimestamp).toISOString();
  const accountNumber = sender[1]; // Preserve the mask; never manufacture hidden digits.
  const metadata: DetectedStatementMetadata = {
    institution: 'EastWest', accountName: `EastWest ${mask[1]}`, accountNumber,
    accountType: 'bank', currency: 'PHP', openingBalance: null, endingBalance: null,
    startDate: date, endDate: date, confidence: 85,
  };
  const makeRow = (component: 'payment' | 'fee', value: number): ParsedImportRow => ({
    date, amount: value.toFixed(2), currency: 'PHP', type: 'expense',
    merchantRaw: component === 'fee' ? 'InstaPay transfer fee' : `Payment to ${recipient[0]}`,
    merchantClean: component === 'fee' ? 'InstaPay transfer fee' : `Payment to ${recipient[0]}`,
    description: component === 'fee' ? 'EastWest InstaPay transfer fee' : `EastWest InstaPay payment to ${recipient[0]}`,
    categoryName: component === 'fee' ? 'Financial' : 'Transfers',
    institution: 'EastWest', accountName: metadata.accountName ?? undefined, accountNumber,
    confidence: 69,
    rawPayload: { source: 'eastwest_transfer_proof', sourceText: text, component, referenceNo: reference,
      sourceTimestamp, accountType: 'bank', accountNumberIsMasked: true,
      transferFromAccountNumber: accountNumber, transferToAccountNumber: recipient[2],
      recipientName: recipient[0], recipientInstitution: recipient[1], fee, paymentAmount: amount,
      reviewRequired: true, reviewReason: 'Verify the suggested source account against the masked sender on the proof.' },
  });
  return { metadata, rows: [makeRow('payment', amount), ...(fee > 0 ? [makeRow('fee', fee)] : [])] };
}

export function hasVerifiedEastwestTransferRows(text: string, rows: ParsedImportRow[]): boolean {
  try {
    const expected = parseEastwestTransferProof(text)?.rows;
    const fields = (values: ParsedImportRow[]) => values.map(row => [row.date, row.amount, row.currency, row.type, row.accountNumber, row.rawPayload?.referenceNo, row.rawPayload?.component]);
    return !!expected && expected.length === rows.length && rows.every(row => row.rawPayload?.source === 'eastwest_transfer_proof') && JSON.stringify(fields(expected)) === JSON.stringify(fields(rows));
  } catch { return false; }
}
