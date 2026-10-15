import type { DetectedStatementMetadata, ParsedImportRow } from './import-parser';
import { SourceReviewRequiredError } from './import-source-review';

type Item = { str?: unknown; transform?: number[]; width?: number };
const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function fail(why: string): never { throw new SourceReviewRequiredError(`Native source requires review: ${why}`); }
const rupiah = (s: string) => /^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:\.\d{3})+)$/.test(s) ? Number(s.replaceAll('.','')) : fail('invalid IDR grouping');
const day = (d: string, m: string, y: string) => {
  const n=months.indexOf(m.toUpperCase()), result=new Date(Date.UTC(Number(y),n,Number(d),12));
  if(n<0 || result.getUTCFullYear()!==Number(y) || result.getUTCMonth()!==n || result.getUTCDate()!==Number(d)) fail('invalid calendar date');
  return result.toISOString().slice(0,10);
};

/** Keep Indonesian integer grouping, empty columns and every native occurrence. */
export function buildSeaBankIndonesiaPdfRows(items: Item[]): string[] {
  const cells=items.map(i=>({text:String(i.str??'').trim(),x:Number(i.transform?.[4]),y:Number(i.transform?.[5]),end:Number(i.transform?.[4])+Number(i.width??0)})).filter(i=>i.text && Number.isFinite(i.x) && Number.isFinite(i.y));
  if(!cells.some(c=>c.text==='REKENING KORAN' || c.text==='BANK STATEMENT')) return [];
  const header=cells.find(c=>c.text==='TANGGAL' || c.text==='DATE');
  if(!header) return ['SEABANK_ID_ROW_COUNT 0'];
  const dates=cells.filter(c=>c.x<110 && c.y<header.y && /^\d{2} [A-Z]{3}$/.test(c.text)).sort((a,b)=>b.y-a.y);
  const rows=dates.map((d,index)=>{
    const amounts=cells.filter(c=>Math.abs(c.y-d.y)<=2.25 && c.x>270 && /^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(c.text));
    const out=amounts.filter(c=>Math.abs(c.end-342.84)<4),incoming=amounts.filter(c=>Math.abs(c.end-445.28)<4),balance=amounts.filter(c=>Math.abs(c.end-544.77)<4);
    const upper=index===0?header.y-3:(dates[index-1].y+d.y)/2,lower=dates[index+1]?(dates[index+1].y+d.y)/2:d.y-30;
    const description=cells.filter(c=>c.x>110 && c.x<270 && c.y<upper && c.y>lower).sort((a,b)=>b.y-a.y || a.x-b.x).map(c=>c.text).join(' ').replaceAll('|',' / ');
    if(out.length+incoming.length!==1 || balance.length!==1 || !description) return 'SEABANK_ID_INVALID_COLUMNS';
    return ['SEABANK_ID_TXN',d.text,out.length?'outgoing':'incoming',(out[0]??incoming[0]).text,balance[0].text,description].join(' | ');
  });
  return [`SEABANK_ID_ROW_COUNT ${dates.length}`,...rows];
}

export function parseHeldNativeSource(text: string): {metadata: DetectedStatementMetadata; rows: ParsedImportRow[]} | null {
  if (/GCASH\s*PHILIPPINES/i.test(text) && /CASH IN YOUR GCASH ACCOUNT/i.test(text) && /USD/i.test(text)) fail('GCash payment template mixes currencies and an unverified cash-in instruction; no reliable payment established');
  if(/^SEABANK_ID_NATIVE_PAGES /m.test(text)) return parseSeaBankIndonesia(text);
  if(/^DBS_NATIVE_PAGES /m.test(text)) return parseDbsZeroSnapshot(text);
  return null;
}
export function hasSeaBankIndonesiaEnglishHeader(text: string): boolean {
  return /BANK STATEMENT/.test(text) && /SEABANK ?ACCOUNT:/.test(text) && /cs@seabank\.co\.id/.test(text);
}
function parseSeaBankIndonesia(text: string) {
  const english=/^SEABANK_ID_NATIVE_LANGUAGE EN$/m.test(text);
  const physical=[...text.matchAll(/^SEABANK_ID_NATIVE_PAGES (\d+)$/gm)];
  const printed=[...text.matchAll(english ? /page\s+(\d+)\s+of\s+(\d+)/gi : /halaman\s+(\d+)\s+dr\s+(\d+)/gi)];
  const pages=Number(physical[0]?.[1]);
  if(physical.length!==1 || pages<1 || pages>100 || printed.length!==pages || printed.some((m,i)=>Number(m[1])!==i+1 || Number(m[2])!==pages)) fail('Indonesian SeaBank page coverage');
  if(!(english ? /BANK STATEMENT/.test(text) && /SAVINGS\s*-\s*TRANSACTION DETAILS/.test(text) : /REKENING KORAN/.test(text) && /TABUNGAN\s*-\s*RINCIAN TRANSAKSI/.test(text)) || !/cs@seabank\.co\.id/.test(text)) fail('Indonesian SeaBank source family');
  // A native font run can split exactly three plus nine digits. Do not
  // join arbitrary numbers, lines, adjacent balances or masked identities.
  const ids=[...text.matchAll(english ? /SEABANK ?ACCOUNT:[ \t]*(\d{12}|\d{3}[ \t]+\d{9})(?![\dA-Za-z_])/g : /NO\. REKENING SEABANK:[ \t]*(\d{12}|\d{3}[ \t]+\d{9})(?![\dA-Za-z_])/g)].map(m=>m[1].replace(/[ \t]/g,''));
  if(ids.length!==1) fail('full twelve-digit Indonesian account');
  const periods=[...text.matchAll(english ? /(\d{2}) ([A-Z]{3}) (\d{4}) to (\d{2}) ([A-Z]{3}) (\d{4})/g : /(\d{2}) ([A-Z]{3}) (\d{4}) sampai (\d{2}) ([A-Z]{3}) (\d{4})/g)];
  if(periods.length!==1) fail('one Indonesian statement period');
  const p=periods[0],start=day(p[1],p[2],p[3]),end=day(p[4],p[5],p[6]);
  if(start>end || p[2]!==p[5] || p[3]!==p[6]) fail('monthly Indonesian period');
  const summary=text.slice(text.indexOf(english?'ACCOUNT SUMMARY':'RINGKASAN REKENING'),text.indexOf(english?'SAVINGS - TRANSACTION DETAILS':'TABUNGAN - RINCIAN TRANSAKSI'));
  const labels=english?['STARTING BALANCE','TOTAL OUTGOING','TOTAL INCOMING','ENDING BALANCE']:['SALDO AWAL','TRANSAKSI KELUAR','TRANSAKSI MASUK','SALDO AKHIR'];
  const stackedEnglishColumns=english && /STARTING BALANCE TOTAL OUTGOING TOTAL INCOMING ENDING BALANCE\s+ACCOUNT \(IDR\) \(IDR\) \(IDR\) \(IDR\)/.test(summary);
  if(!stackedEnglishColumns && labels.some(label=>!new RegExp(label+'\\s*\\(IDR\\)').test(summary))) fail('IDR summary columns');
  const values=summary.match(english ? /SAVINGS\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+TOTAL:\s*([\d.]+)/ : /TABUNGAN\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+TOTAL:\s*([\d.]+)/);
  if(!values) fail('complete IDR summary');
  const [opening,outgoing,incoming,closing,total]=values.slice(1).map(rupiah);
  if(opening+incoming-outgoing!==closing || closing!==total) fail('IDR summary arithmetic');
  const lines=text.split(/\r?\n/).filter(l=>l.startsWith('SEABANK_ID_TXN |'));
  const counts=[...text.matchAll(/^SEABANK_ID_ROW_COUNT (\d+)$/gm)].map(m=>Number(m[1]));
  if(text.includes('SEABANK_ID_INVALID_COLUMNS') || counts.length!==pages || counts.reduce((a,b)=>a+b,0)!==lines.length || !lines.length) fail('complete native IDR row coverage');
  let running=opening,actualIn=0,actualOut=0;
  const accountNumber=ids[0],accountName=`SeaBank Indonesia ${accountNumber.slice(-4)}`;
  const rows=lines.map((line,sourceRowIndex): ParsedImportRow=>{
    const parts=line.split(/\s*\|\s*/);if(parts.length!==6) fail('IDR row shape');
    const [,stamp,direction,amountText,balanceText,description]=parts;const dm=stamp.match(/^(\d{2}) ([A-Z]{3})$/);if(!dm || !['incoming','outgoing'].includes(direction)) fail('IDR date/direction');
    const date=day(dm[1],dm[2],p[3]),amount=rupiah(amountText),balance=rupiah(balanceText);if(date<start || date>end || amount<=0 || !Number.isSafeInteger(amount*100)) fail('IDR movement outside period');
    running+=direction==='incoming'?amount:-amount;if(running!==balance) fail('IDR running balance');
    if(direction==='incoming')actualIn+=amount;else actualOut+=amount;
    const categoryName=/^(?:Biaya|Fee)\b/.test(description)?'Financial':/^(?:Bunga Tabungan|Savings Interest)\b/.test(description)?'Income':/\bTransfer\b|Top Up - eWallet/.test(description)?'Transfers':/Top Up - Paket Data/.test(description)?'Bills & Utilities':'Other';
    return {date,amount:amount.toFixed(2),currency:'IDR',type:direction==='incoming'?'income':'expense',categoryName,merchantRaw:description,merchantClean:description,description,accountNumber,accountName,institution:'SeaBank Indonesia',confidence:95,balance,rawPayload:{source:'seabank_indonesia_native',kind:'bank_transaction',line,sourceRowIndex,accountNumber,accountCurrency:'IDR',accountType:'bank',direction,notes:description,amountText,balance,balanceReconciled:true,reconciliation:{version:'seabank-id-native-v1',openingBalance:opening,endingBalance:closing,totalIncoming:incoming,totalOutgoing:outgoing,physicalPages:pages},sourceDocumentText:text}};
  });
  if(actualIn!==incoming || actualOut!==outgoing || running!==closing) fail('IDR complete movement totals');
  return {rows,metadata:{institution:'SeaBank Indonesia',accountName,accountNumber,accountType:'bank' as const,currency:'IDR',openingBalance:opening,endingBalance:closing,startDate:start,endDate:end,confidence:95,currencyConfidence:100,institutionConfidence:100,identityEvidence:['seabank-id-native-v1','Full twelve-digit account, IDR columns, complete pages and running balances']}};
}

/** Only the completely empty, single SGD My Account layout; never generic DBS. */
function parseDbsZeroSnapshot(text: string) {
  const pages=[...text.matchAll(/^DBS_NATIVE_PAGES (\d+)$/gm)],printed=[...text.matchAll(/Page\s+(\d+)\s+of\s+(\d+)/g)];
  if(pages.length!==1 || pages[0][1]!=='3' || printed.length!==3 || printed.some((m,i)=>m[1]!==String(i+1) || m[2]!=='3')) fail('complete DBS zero snapshot pages');
  const summarySection=text.slice(text.indexOf('Account Summary as at'),text.indexOf('Transaction Details as at'));
  if ([...summarySection.matchAll(/\d{3}-\d{6}-\d/g)].length !== 1 || /\b(?:USD|EUR|GBP|JPY|Fixed Deposit)\b/i.test(summarySection)) fail('DBS multiple accounts/currencies are outside zero snapshot scope');
  const dates=[...text.matchAll(/(?:Account Summary|Transaction Details) as (?:at|of) (\d{2}) ([A-Za-z]+) (\d{4})/g)].map(m=>day(m[1],m[2].slice(0,3),m[3]));
  if(dates.length<4 || new Set(dates).size!==1) fail('DBS statement date consistency');
  const summary=text.match(/(My Account(?: \(digiVault\))?)\s+(\d{3}-\d{6}-\d)\s+SGD\s+0\.00\s+0\.00/);
  if(!summary || !/Total: SGD Equivalent 0\.00/.test(text) || !/CURRENCY: SINGAPORE DOLLAR/.test(text)) fail('DBS single SGD zero account');
  const ids=[...text.matchAll(/Account No\.\s*(\d[\d-]*)/g)].map(m=>m[1]);if(ids.length!==1 || ids[0]!==summary[2]) fail('DBS full summary/ledger identity');
  const ledger=text.slice(text.indexOf('Transaction Details as at'),text.indexOf('Messages For You'));
  if(!/Balance Brought Forward\s+SGD 0\.00/.test(ledger) || !/Total Balance Carried Forward in SGD:\s+0\.00\s+0\.00\s+0\.00/.test(ledger)) fail('DBS empty balance anchors');
  const native=[...text.matchAll(/^DBS_ZERO_COLUMN_PROOF (.+)$/gm)];if(native.length!==1) fail('DBS zero row column evidence');
  const proof=JSON.parse(native[0][1]);if(proof.accountNumber!==summary[2] || proof.product!==summary[1] || proof.date!==dates[0] || proof.rows!==1 || proof.movements!==0 || proof.balance!==0) fail('DBS zero column proof');
  const accountNumber=summary[2],accountName=`DBS ${summary[1]} ${accountNumber.slice(-4)}`,date=dates[0];
  return {metadata:{institution:'DBS',accountName,accountNumber,accountType:'bank' as const,currency:'SGD',openingBalance:0,endingBalance:0,statementDate:date,startDate:date,endDate:date,confidence:95,currencyConfidence:100,institutionConfidence:100,identityEvidence:['dbs-native-zero-v1']},rows:[{date,amount:'0.00',currency:'SGD',type:'income' as const,categoryName:'Other',merchantRaw:accountName,merchantClean:accountName,description:'No movements; DBS account snapshot',accountName,accountNumber,institution:'DBS',confidence:95,rawPayload:{source:'dbs_native_zero',kind:'account_snapshot_marker',line:native[0][0],sourceRowIndex:0,accountNumber,accountName,accountType:'bank',accountCurrency:'SGD',balance:0,statementEndingBalance:0,snapshotDate:date,balanceReconciled:true,reconciliation:{version:'dbs-native-zero-v1',openingBalance:0,endingBalance:0,physicalPages:3},sourceDocumentText:text}}]};
}
export function buildDbsZeroPdfProof(items: Item[]): string[] {
  const cells=items.map(i=>({text:String(i.str??'').trim(),x:Number(i.transform?.[4]),y:Number(i.transform?.[5]),end:Number(i.transform?.[4])+Number(i.width??0)})).filter(i=>i.text);
  const product=cells.find(c=>/^My Account(?: \(digiVault\))?$/.test(c.text)),id=cells.find(c=>/^Account No\. \d{3}-\d{6}-\d$/.test(c.text));if(!product || !id) return [];
  const dateCells=cells.filter(c=>/^\d{2}\/\d{2}\/\d{4}$/.test(c.text));
  if(dateCells.length!==1)return [];
  const d=dateCells[0],numbers=cells.filter(c=>Math.abs(c.y-d.y)<2.25 && /^\d[\d,]*\.\d{2}$/.test(c.text));
  if(numbers.length!==1 || numbers[0].text!=='0.00' || numbers[0].x<500 || cells.some(c=>c.x>100 && c.x<330 && Math.abs(c.y-d.y)<2.25)) return [];
  const [dd,mm,yy]=d.text.split('/');const date=day(dd,months[Number(mm)-1]??'',yy);
  return ['DBS_ZERO_COLUMN_PROOF '+JSON.stringify({product:product.text,accountNumber:id.text.slice(12),date,rows:1,movements:0,balance:0})];
}
export function hasVerifiedHeldNativeRows(text: string, rows: Array<{date?: unknown; amount?: unknown; currency?: unknown; type?: unknown; accountNumber?: unknown; rawPayload?: unknown}>): boolean {
  try{const source=parseHeldNativeSource(text);return Boolean(source && rows.length===source.rows.length && rows.every((r,i)=>{const raw=r.rawPayload as Record<string,unknown>|null,expected=source.rows[i];return r.date===expected.date && Number(r.amount)===Number(expected.amount) && r.currency===expected.currency && r.type===expected.type && r.accountNumber===expected.accountNumber && raw?.source===expected.rawPayload?.source && raw?.line===expected.rawPayload?.line && raw?.sourceRowIndex===i;}));}catch{return false;}
}
