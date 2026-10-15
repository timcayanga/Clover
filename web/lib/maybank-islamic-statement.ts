import type { DetectedStatementMetadata, ParsedImportRow } from './import-parser';
import { SourceReviewRequiredError } from './import-source-review';
import { getStrongMerchantCategoryHint } from './merchant-category-hints';
import { summarizeMerchantText } from './merchant-labels';

const sourceVersion = 'maybank-islamic-savings-native-v1';
const bankHeader = /^Maybank Islamic Berhad \(787435-M\)$/m;
const amount = (value: string) => Math.round(Number(value.replaceAll(',', '')) * 100);
const fail = (reason: string): never => {
  throw new SourceReviewRequiredError(`Maybank Islamic statement requires source review: ${reason}`);
};

function dateFromPrinted(value: string): string {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!match) fail('invalid printed date');
  const day = Number(match![1]), month = Number(match![2]), year = 2000 + Number(match![3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) fail('invalid calendar date');
  return date.toISOString().slice(0, 10);
}

const rowPattern = /^(\d{2}\/\d{2}\/\d{2})\s+(.+?)\s+([\d,]+\.\d{2}[+-])\s+([\d,]+\.\d{2})$/;

export function parseMaybankIslamicStatement(text: string): { metadata: DetectedStatementMetadata; rows: ParsedImportRow[] } | null {
  if (!bankHeader.test(text) || !/SAVINGS ACCOUNT-I/i.test(text)) return null;
  const pages = text.split(/(?=^Maybank Islamic Berhad \(787435-M\)$)/m).filter(page => bankHeader.test(page));
  if (pages.length < 1 || pages.length > 50) fail('physical page count is missing or unsupported');
  const identities = new Set<string>();
  const printedDates = new Set<string>();
  const rows: ParsedImportRow[] = [];
  let opening: number | null = null;
  let ending: number | null = null;
  let printedCredits: number | null = null;
  let printedDebits: number | null = null;
  let runningBalance: number | null = null;
  let actualCredits = 0;
  let actualDebits = 0;
  let previousDate: string | null = null;
  let dateLines = 0;

  for (const [pageIndex, page] of pages.entries()) {
    const numberLine = page.match(/^0*(\d{1,3})\s+IBS\b[^\n]*\s+(\d{1,3})$/m);
    if (!numberLine || Number(numberLine[1]) !== pageIndex + 1 || Number(numberLine[2]) !== pageIndex + 1) fail('printed and physical page order disagree');
    const account = page.match(/\b\d{6}-\d{6}\b/g) ?? [];
    if (account.length !== 1) fail('one statement account is required on every page');
    identities.add(account[0]!);
    if (!/PROTECTED BY PIDM UP TO RM250,000/i.test(page) || !/ACCOUNT TRANSACTIONS/i.test(page) || !/TRANSACTION AMOUNT\s+STATEMENT BALANCE/i.test(page)) fail('complete Malaysian savings table labels are required');
    const dateLabel = page.match(/\b\d{2}\/\d{2}\/\d{2}\b(?=[\s\S]*?STATEMENT DATE)/);
    const statementDate = dateLabel?.[0] ?? page.match(/\b\d{2}\/\d{2}\/\d{2}\b/)?.[0];
    if (!statementDate) fail('statement date is missing');
    printedDates.add(dateFromPrinted(statementDate!));
    const header = page.match(/^ENTRY DATE\s+TRANSACTION DESCRIPTION\s+TRANSACTION AMOUNT\s+STATEMENT BALANCE\s*$/m);
    const footer = page.search(/^Perhation\s*\/\s*Note\s*$/m);
    if (!header || header.index === undefined || footer < header.index) fail('native transaction table is incomplete');
    const body = page.slice(header!.index! + header![0].length, footer);
    for (const sourceLine of body.split(/\r?\n/)) {
      const line = sourceLine.trim().replace(/\s+/g, ' ');
      if (!line) continue;
      const openingLine = line.match(/^BEGINNING BALANCE\s+([\d,]+\.\d{2})$/);
      if (openingLine) {
        if (opening !== null || rows.length) fail('beginning balance is duplicated or misplaced');
        opening = amount(openingLine[1]);
        runningBalance = opening;
        continue;
      }
      const endingLine = line.match(/^ENDING BALANCE\s*:\s*([\d,]+\.\d{2})$/);
      if (endingLine) {
        if (ending !== null) fail('ending balance is duplicated');
        ending = amount(endingLine[1]);
        continue;
      }
      const creditLine = line.match(/^TOTAL CREDIT\s*:\s*([\d,]+\.\d{2})$/);
      if (creditLine) {
        if (printedCredits !== null) fail('total credit is duplicated');
        printedCredits = amount(creditLine[1]);
        continue;
      }
      const debitLine = line.match(/^TOTAL DEBIT\s*:\s*([\d,]+\.\d{2})$/);
      if (debitLine) {
        if (printedDebits !== null) fail('total debit is duplicated');
        printedDebits = amount(debitLine[1]);
        continue;
      }
      const row = line.match(rowPattern);
      if (row) {
        if (runningBalance === null || ending !== null) fail('movement is outside statement balances');
        const transactionDate = dateFromPrinted(row[1]);
        if (previousDate && transactionDate < previousDate) fail('movement dates are out of order');
        const cents = amount(row[3].slice(0, -1));
        const printedBalance = amount(row[4]);
        if (cents <= 0 || !Number.isSafeInteger(cents) || !Number.isSafeInteger(printedBalance)) fail('invalid monetary column');
        const incoming = row[3].endsWith('+');
        if (runningBalance! + (incoming ? cents : -cents) !== printedBalance) fail('running balance does not reconcile');
        if (incoming) actualCredits += cents; else actualDebits += cents;
        const description = row[2];
        const rawPayload: Record<string, unknown> = {
          source: 'maybank_islamic_native', version: sourceVersion, kind: 'savings_transaction',
          sourceRowIndex: rows.length, physicalPage: pageIndex + 1, sourceLineParts: [line],
          printedDate: row[1], printedSignedAmount: row[3], printedBalance: row[4],
          balance: printedBalance / 100, balanceReconciled: true,
        };
        rows.push({
          date: transactionDate, amount: (cents / 100).toFixed(2), currency: 'MYR',
          type: incoming ? 'income' : 'expense', institution: 'Maybank Islamic',
          merchantRaw: description, merchantClean: summarizeMerchantText(description, 'Maybank Islamic'),
          description, categoryName: getStrongMerchantCategoryHint(description) ?? 'Other',
          confidence: 96, parserConfidence: 98, categoryConfidence: 55,
          rawPayload,
        });
        runningBalance = printedBalance;
        previousDate = transactionDate;
        dateLines++;
        continue;
      }
      if (/^\d{2}\/\d{2}\/\d{2}\b/.test(line)) fail('dated source movement has incomplete financial columns');
      if (/^(?:BEGINNING BALANCE|ENDING BALANCE|TOTAL CREDIT|TOTAL DEBIT)\b/.test(line)) fail('summary balance or total has incomplete amount');
      if (rows.length === 0) fail('unassigned native description before first movement');
      const last = rows[rows.length - 1];
      const raw = last.rawPayload!;
      (raw.sourceLineParts as string[]).push(line);
      last.description = `${last.description} ${line}`;
      last.merchantRaw = last.description;
      last.merchantClean = summarizeMerchantText(last.description, 'Maybank Islamic');
      last.categoryName = getStrongMerchantCategoryHint(last.description) ?? 'Other';
    }
  }
  if (identities.size !== 1 || printedDates.size !== 1) fail('page identities or statement dates disagree');
  if (opening === null || ending === null || printedCredits === null || printedDebits === null || !rows.length) fail('opening, closing, totals and dated movements are required');
  if (dateLines !== rows.length || actualCredits !== printedCredits || actualDebits !== printedDebits || runningBalance !== ending || opening! + actualCredits - actualDebits !== ending) fail('full statement totals do not reconcile');
  const accountNumber = [...identities][0];
  const statementDate = [...printedDates][0];
  if (rows.some(row => !row.date || row.date > statementDate)) fail('movement occurs after printed statement date');
  const accountName = `Maybank Islamic ${accountNumber.slice(-4)}`;
  for (const row of rows) {
    row.accountName = accountName;
    row.accountNumber = accountNumber;
    Object.assign(row.rawPayload!, { description: row.description, line: (row.rawPayload!.sourceLineParts as string[]).join('\n'), accountType: 'bank', accountNumber, accountCurrency: 'MYR', reconciliation: { version: sourceVersion, physicalPages: pages.length, rowCount: rows.length, openingBalance: opening! / 100, endingBalance: ending! / 100, totalCredit: printedCredits! / 100, totalDebit: printedDebits! / 100 } });
  }
  return {
    metadata: { institution: 'Maybank Islamic', accountName, accountNumber, accountType: 'bank', currency: 'MYR', openingBalance: opening! / 100, endingBalance: ending! / 100, startDate: rows[0].date!, endDate: statementDate, confidence: 97, currencyConfidence: 98, institutionConfidence: 100, identityEvidence: [sourceVersion, 'Repeated native Malaysian savings headers, account, printed page numbers and fully reconciled signed running balances'] },
    rows,
  };
}

export function hasVerifiedMaybankIslamicRows(text: string, rows: ParsedImportRow[]): boolean {
  try {
    const proof = parseMaybankIslamicStatement(text);
    return Boolean(proof && proof.rows.length === rows.length && rows.every((row, index) => {
      const expected = proof.rows[index];
      const raw = row.rawPayload as Record<string, unknown> | null;
      return row.date === expected.date && row.amount === expected.amount && row.currency === 'MYR' && row.accountNumber === expected.accountNumber && row.description === expected.description && row.type === expected.type && raw?.source === 'maybank_islamic_native' && raw.version === sourceVersion && raw.balanceReconciled === true && raw.sourceRowIndex === index && raw.balance === expected.rawPayload?.balance;
    }));
  } catch { return false; }
}
