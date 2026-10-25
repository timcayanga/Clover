// These source checks refuse contradictory or unsupported evidence. They do
// not repair amounts, infer accounts, create rows or replace accepted parsers.
const amountPattern = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}`;
const cents = (value: string) => Math.round(Number(value.replaceAll(',', '')) * 100);

export function heldSourceReviewReason(text: string): string | null {
  if (/^Driver Statement\s*$/mi.test(text) && /Weekly Total/i.test(text) &&
      /Earnings details/i.test(text) && /Cash Wallet/i.test(text) && /Credit Wallet/i.test(text)) {
    return 'Driver earnings need review: weekly totals, delivery earnings and wallet settlements must be separated, with dated incentives and complete account evidence, to avoid counting the same money twice.';
  }
  if (/SUPPORTING WITHHOLDING TAX DOCUMENT/i.test(text) && /SEABANK\s*ACCOUNT:/i.test(text) &&
      !/^(?:BANK STATEMENT|REKENING KORAN)\s*$/mi.test(text)) {
    return 'This SeaBank tax summary needs review: it does not establish dated transactions and an explicit transaction currency. Upload the underlying complete bank statement.';
  }
  if (/^Statement of Account\s*$/mi.test(text) && /(?:GSave|FastPlus|UPSave)\s*-\s*Savings Account No\./i.test(text) && /\bSUMMARY\b/.test(text)) {
    const summary = text.split(/(?:GSave|FastPlus|UPSave)\s*-\s*Savings Account No\./i)[0];
    const read = (label: string) => {
      const matches = [...summary.matchAll(new RegExp(label + String.raw`\s+PHP\s+(` + amountPattern + ')', 'gi'))];
      return matches.length === 1 ? cents(matches[0][1]) : null;
    };
    const opening = read('Opening Balance'), incoming = read('Total Deposit'), outgoing = read('Total Withdrawal');
    const closing = read(String.raw`Closing Balance(?: as of [^\r\n]*?)?`);
    if (opening !== null && incoming !== null && outgoing !== null && closing !== null && opening + incoming - outgoing !== closing) {
      return 'This CIMB statement needs review: its printed opening balance plus deposits minus withdrawals does not equal its closing balance. Obtain a corrected complete statement.';
    }
  }
  if (/\bGCash Transaction History\b/i.test(text) && /Date and Time\s+Description\s+Reference No\./i.test(text) &&
      /\bSTARTING BALANCE\b/.test(text) && /\bENDING BALANCE\b/.test(text) && /\bTotal Debit\b/.test(text) && /\bTotal Credit\b/.test(text)) {
    const read = (label: string) => {
      const matches = [...text.matchAll(new RegExp(label + String.raw`\s+(` + amountPattern + ')', 'g'))];
      return matches.length === 1 ? cents(matches[0][1]) : null;
    };
    const opening = read('STARTING BALANCE'), closing = read('ENDING BALANCE');
    const debit = read('Total Debit'), credit = read('Total Credit');
    const dateLines = text.split(/\r?\n/).filter(line => /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?\b/.test(line.trim()));
    // A period heading or a lone screenshot cannot establish this table.
    if (dateLines.length < 2) return null;
    if (opening === null || closing === null || debit === null || credit === null) {
      return 'This GCash history needs review: its complete opening, closing, debit and credit totals could not be verified.';
    }
    let previous = opening, mismatches = 0;
    for (const line of dateLines) {
      const values = line.trim().match(new RegExp(String.raw`\b\d{12,}\s+(` + amountPattern + String.raw`)\s+(` + amountPattern + ')$'));
      if (!values) return 'This GCash history needs review: a dated row is missing its full reference, amount or running balance.';
      const amount = cents(values[1]), balance = cents(values[2]);
      if (Math.abs(balance - previous) !== amount) mismatches++;
      previous = balance;
    }
    if (mismatches > 0) return `This GCash history needs review: ${mismatches} running balance${mismatches === 1 ? '' : 's'} disagree with the printed transaction amounts. Obtain a corrected complete history.`;
    if (previous !== closing || opening + credit - debit !== closing) {
      return 'This GCash history needs review: its transaction balances and printed debit/credit totals do not reconcile to the closing balance.';
    }
  }
  return null;
}
