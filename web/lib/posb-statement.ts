import type { DetectedStatementMetadata, ParsedImportRow } from './import-parser';

type Item = { str?: unknown; transform?: number[]; width?: number };
const money = (s: string) => Number(s.replaceAll(',', ''));
const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const date = (day: string, month: string, year: number) => {
  const m = months.indexOf(month.toLowerCase());
  const d = new Date(Date.UTC(year, m, Number(day), 12));
  return m >= 0 && d.getUTCMonth() === m && d.getUTCDate() === Number(day) ? d : null;
};

export function hasVerifiedPosbRows(text: string, rows: Array<{ amount?: unknown; date?: unknown; rawPayload?: unknown }>): boolean {
  try {
    const source=parsePosbStatement(text);
    if(!source || !source.rows.length || source.metadata.openingBalance===null || source.metadata.endingBalance===null || rows.length!==source.rows.length) return false;
    const nativeDates=text.split(/\r?\n/).filter(l=>/^\d{1,2}\s+[A-Z]{3}\s+/i.test(l.trim()));
    if(nativeDates.length && nativeDates.length!==source.rows.length) return false;
    return rows.every((row,index)=>{
      const raw=row.rawPayload as Record<string,unknown> | null;
      const expected=source.rows[index];
      return Number(row.amount)===Number(expected.amount) && row.date===expected.date && raw?.source==='posb_pdf_columns' && raw.direction===expected.rawPayload?.direction && raw.line===expected.rawPayload?.line;
    });
  }catch{return false;}
}

/** Preserve empty withdrawal/deposit columns before whitespace normalization. */
export function buildPosbPdfRows(items: Item[]): string[] {
  const points = items.map(i => ({ text: String(i.str ?? '').replace(/\s+/g, ' ').trim(), x: Number(i.transform?.[4]), y: Number(i.transform?.[5]), width: Number(i.width ?? 0) })).filter(i => i.text && Number.isFinite(i.x) && Number.isFinite(i.y));
  if (!points.some(i => /Details of Your POSB Payroll Account/i.test(i.text))) return [];
  const headers = [/^WITHDRAWAL\(\$\)$/i, /^DEPOSIT\(\$\)$/i, /^BALANCE\(\$\)$/i].map(re => points.find(i => re.test(i.text)));
  if (headers.some(h => !h)) return [];
  const [withdrawal, deposit, balance] = headers as typeof points;
  if (!(withdrawal.x < deposit.x && deposit.x < balance.x)) return [];
  const dates = points.filter(i => i.x < withdrawal.x && i.y < withdrawal.y && /^\d{1,2}\s+[A-Z]{3}$/i.test(i.text)).sort((a,b) => b.y-a.y);
  const footer = points.filter(i => /^Balance Carried Forward$/i.test(i.text)).sort((a,b) => b.y-a.y)[0];
  return dates.map((d,index) => {
    const numbers = points.filter(i => Math.abs(i.y-d.y) <= 2.25 && /^\d[\d,]*\.\d{2}$/.test(i.text) && i.x >= withdrawal.x-30);
    const columns = headers.map(h => numbers.filter(i => Math.abs(i.x+i.width-(h!.x+h!.width)) <= 12));
    const [out, incoming, balances] = columns;
    if (out.length + incoming.length !== 1 || balances.length > 1) return 'POSB_INVALID_COLUMN_EVIDENCE';
    const lower = dates[index+1]?.y ?? footer?.y ?? d.y-20;
    const description = points.filter(i => i.x > d.x+30 && i.x < withdrawal.x-25 && i.y <= d.y+2.25 && i.y > lower+2.25).sort((a,b) => b.y-a.y || a.x-b.x).map(i=>i.text).join(' ');
    if (!description) return 'POSB_INVALID_COLUMN_EVIDENCE';
    return ['POSB_TXN', d.text, out.length ? 'outgoing' : 'incoming', (out[0] ?? incoming[0]).text, balances[0]?.text ?? '', description.replaceAll('|',' / ')].join(' | ');
  });
}

export function parsePosbStatement(text: string): { metadata: DetectedStatementMetadata; rows: ParsedImportRow[] } | null {
  if (!/Details of Your POSB Payroll Account/i.test(text) || !/WITHDRAWAL\(\$\).*DEPOSIT\(\$\).*BALANCE\(\$\)/i.test(text)) return null;
  if (text.includes('POSB_INVALID_COLUMN_EVIDENCE')) throw new Error('POSB statement contains ambiguous amount columns; review the original source.');
  const asAt = text.match(/As at\s+(\d{1,2})\s+([A-Z]{3})\s+(\d{4})/i);
  const statementDate = asAt ? date(asAt[1],asAt[2],Number(asAt[3])) : null;
  const accountNumber = text.match(/Account No\.:\s*([\d-]+)/i)?.[1] ?? null;
  const printedPages = [...text.matchAll(/Page\s+(\d+)\s+of\s+(\d+)/gi)];
  if (printedPages.length) {
    const totals = new Set(printedPages.map(p=>Number(p[2])));
    const pages = new Set(printedPages.map(p=>Number(p[1])));
    const total = Number(printedPages[0][2]);
    if (totals.size!==1 || total<1 || total>500 || pages.size!==total || [...pages].some(p=>p<1 || p>total)) throw new Error('POSB statement pages are missing; retain the source for review.');
  }
  const opening = text.match(/Balance Brought Forward\s+([\d,]+\.\d{2})/i)?.[1];
  const endings = [...text.matchAll(/Balance Carried Forward\s+([\d,]+\.\d{2})/gi)];
  const ending = endings.at(-1)?.[1];
  const accountName = accountNumber ? `POSB ${accountNumber.replace(/\D/g,'').slice(-4)}` : 'POSB';
  const rows: ParsedImportRow[] = [];
  for (const line of text.split(/\r?\n/).filter(l=>/^POSB_TXN\s*\|/.test(l))) {
    const parts = line.split(/\s*\|\s*/);
    if (parts.length !== 6 || !statementDate || !accountNumber) throw new Error('POSB source identity or statement year is missing.');
    const [,stamp,direction,amountText,balanceText,description] = parts;
    const dm=stamp.match(/^(\d{1,2})\s+([A-Z]{3})$/i);
    if (!dm || !['incoming','outgoing'].includes(direction) || !/^\d[\d,]*\.\d{2}$/.test(amountText)) throw new Error('POSB source fields require review.');
    let year=statementDate.getUTCFullYear();
    if (months.indexOf(dm[2].toLowerCase()) > statementDate.getUTCMonth()) year--;
    const rowDate=date(dm[1],dm[2],year);
    if (!rowDate || (balanceText && !/^\d[\d,]*\.\d{2}$/.test(balanceText))) throw new Error('POSB source date or balance requires review.');
    const type=direction==='incoming'?'income':'expense';
    const categoryName=/Cash Withdrawal/i.test(description)?'Cash & ATM':/FAST Payment/i.test(description)?'Transfers':/Salary|Interest Earned/i.test(description)?'Income':/BUS\/MRT/i.test(description)?'Transportation':'Other';
    const merchant=description.split(/Wise:|BUS\/MRT|H & M/i)[0].trim();
    rows.push({date:rowDate.toISOString().slice(0,10),amount:money(amountText).toFixed(2),currency:'SGD',type,categoryName,merchantRaw:description,merchantClean:merchant,description,accountName,accountNumber,institution:'POSB',confidence:95, ...(balanceText?{balance:money(balanceText)}:{}),rawPayload:{kind:'bank_transaction',source:'posb_pdf_columns',line,direction,amountText,balance:balanceText?money(balanceText):null,accountNumber,accountCurrency:'SGD',notes:description,parserEvidence:{statementYear:year,amountColumn:direction==='incoming'?'deposit':'withdrawal'}}});
  }
  if (rows.length && opening && ending) {
    let running=Math.round(money(opening)*100);
    for (const row of rows) {
      running+=(row.type==='income'?1:-1)*Math.round(Number(row.amount)*100);
      if (row.balance!==undefined && running!==Math.round(Number(row.balance)*100)) throw new Error('POSB running balance does not reconcile with source movements.');
    }
    if (running!==Math.round(money(ending)*100)) throw new Error('POSB closing balance does not reconcile with source movements.');
    const nativeDates=text.split(/\r?\n/).filter(l=>/^\d{1,2}\s+[A-Z]{3}\s+/i.test(l.trim()));
    if (nativeDates.length && nativeDates.length!==rows.length) throw new Error('POSB source row coverage requires review.');
    for (const row of rows) row.rawPayload={...row.rawPayload,balanceReconciled:true,reconciliation:{version:'posb-column-reconciliation-v1',openingBalance:money(opening),endingBalance:money(ending),sourceRows:rows.length,code:'BALANCE_RECONCILED'}};
  }
  return {rows,metadata:{institution:'POSB',accountNumber,accountName,accountType:'bank',currency:'SGD',openingBalance:opening?money(opening):null,endingBalance:ending?money(ending):null,statementDate:statementDate?.toISOString()??null,startDate:rows[0]?.date?`${rows[0].date}T12:00:00.000Z`:null,endDate:statementDate?.toISOString()??null,confidence:rows.length?95:55,currencyConfidence:100,institutionConfidence:100,identityEvidence:['POSB payroll account header','Singapore dollar account columns']}};
}
