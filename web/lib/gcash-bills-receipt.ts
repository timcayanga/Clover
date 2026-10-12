import type { DetectedStatementMetadata, ParsedImportRow } from './import-parser';

const looksLikeGcashBillsReceipt = (text: string) => /GCash Bills Pay Receipt/i.test(text) ||
  (/GCash\s+Ref\.?\s*No\./i.test(text) && /Biller Name/i.test(text) && /Total Amount/i.test(text) && /Date\/Time/i.test(text));

export function gcashBillsReceiptTextLayerIsComplete(text: string): boolean {
  if(!looksLikeGcashBillsReceipt(text)) return true;
  try{return parseGcashBillsReceipt(text)!==null;}catch{return false;}
}

export function readGcashBillsPaymentTimestamp(payload: unknown): Date | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const raw=payload as Record<string,unknown>;
  if(raw.source!=='gcash_bills_receipt' || typeof raw.paymentTimestamp!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/.test(raw.paymentTimestamp)) return null;
  const timestamp=new Date(raw.paymentTimestamp);
  return Number.isNaN(timestamp.getTime())?null:timestamp;
}

export function hasVerifiedGcashBillsRows(text: string, rows: Array<{ amount?: unknown; date?: unknown; rawPayload?: unknown }>): boolean {
  try {
    const source=parseGcashBillsReceipt(text);
    if(!source || rows.length!==source.rows.length) return false;
    return rows.every((row,index)=>{
      const raw=row.rawPayload as Record<string,unknown> | null;
      const expected=source.rows[index];
      return Number(row.amount)===Number(expected.amount) && row.date===expected.date && raw?.source==='gcash_bills_receipt' && raw.component===expected.rawPayload?.component && raw.referenceNumber===expected.rawPayload?.referenceNumber;
    });
  }catch{return false;}
}

/** A biller account is evidence for the payment, never the payer's wallet ID. */
export function parseGcashBillsReceipt(text: string): { metadata: DetectedStatementMetadata; rows: ParsedImportRow[] } | null {
  if (!looksLikeGcashBillsReceipt(text) || !/GCash\s+Ref\.?\s*No\./i.test(text)) return null;
  const uniqueAmount = (label: string) => {
    const values = [...text.matchAll(new RegExp(`\\b${label}\\s+PHP\\s+([\\d,]+\\.\\d{2})`, 'gi'))].map(m=>Math.round(Number(m[1].replaceAll(',',''))*100));
    const unique = [...new Set(values)];
    if (unique.length !== 1) throw new Error('GCash bill receipt has missing or conflicting totals; review the source.');
    return unique[0];
  };
  const total=uniqueAmount('Total Amount'), fee=uniqueAmount('Fee');
  const paid=[...text.matchAll(/\bAmount Paid\s+PHP\s+([\d,]+\.\d{2})/gi)].map(m=>Math.round(Number(m[1].replaceAll(',',''))*100));
  const bill=total-fee;
  if (bill<=0 || fee<0 || paid.some(n=>n!==bill && n!==total) || !paid.includes(bill)) throw new Error('GCash bill and fee do not reconcile with the printed total.');
  const stamp=text.match(/Date\/Time\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i);
  const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
  if (!stamp) throw new Error('GCash payment timestamp requires review.');
  const month=months.indexOf(stamp[2].toLowerCase()), day=Number(stamp[1]), year=Number(stamp[3]);
  const checked=new Date(Date.UTC(year,month,day));
  if(month<0 || checked.getUTCMonth()!==month || checked.getUTCDate()!==day || Number(stamp[4])<1 || Number(stamp[4])>12 || Number(stamp[5])>59 || Number(stamp[6])>59) throw new Error('GCash payment timestamp is invalid.');
  const references=[...new Set([...text.matchAll(/GCash\s+Ref\.?\s*No\.\s+(\d+)/gi)].map(m=>m[1]))];
  if(references.length!==1) throw new Error('GCash receipt contains multiple payment references; review each source.');
  const reference=references[0];
  const billerAccount=text.match(/Account Number\s+(\d+)/i)?.[1]??null;
  // The complete native transcript places the value before Biller Name;
  // the image transcript may place it after. Restrict to the receipt fields.
  const lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const labelIndex=lines.findIndex(l=>/^Biller Name$/i.test(l));
  const isField=(line:string)=>/^(?:PHP\b|Amount Paid\b|Total Amount\b|Fee\b|Account\b|Date\/Time\b|GCash\b|Email Receipt\b|Subject:|Date:|To:|Pay Bills\b)/i.test(line);
  const before=labelIndex>=0 ? lines.slice(Math.max(0,labelIndex-2),labelIndex).filter(l=>!isField(l)) : [];
  const after:string[]=[];
  if(labelIndex>=0)for(const line of lines.slice(labelIndex+1)){if(isField(line))break;after.push(line);}
  let biller=[...new Set([...before,...after])].join(' ');
  if(!biller) biller=text.match(/Biller Nam(?:e)?\s+(.+?)(?=\s+Total Amount)/is)?.[1]?.replace(/[©\n]/g,' ').replace(/\s+/g,' ').trim()??'';
  if(!biller || /Amount Paid|GCash Ref|Date\/Time/i.test(biller)) throw new Error('GCash biller requires source review.');
  const dayText=checked.toISOString().slice(0,10);
  const hour=(Number(stamp[4])%12)+(stamp[7].toUpperCase()==='PM'?12:0);
  const paymentTimestamp=`${dayText}T${String(hour).padStart(2,'0')}:${stamp[5]}:${stamp[6]}+08:00`;
  const rows: ParsedImportRow[]=[{amount:(bill/100).toFixed(2),merchantRaw:biller,merchantClean:biller,description:`GCash bill payment • ${biller}`,categoryName:/ELECTRIC/i.test(biller)?'Utilities':'Other'},...(fee>0?[{amount:(fee/100).toFixed(2),merchantRaw:'GCash Bills Payment Fee',merchantClean:'GCash Bills Payment Fee',description:`GCash fee • ${biller}`,categoryName:'Financial'}]:[])].map((r,index)=>({...r,date:paymentTimestamp,currency:'PHP',type:'expense',accountName:'GCash',institution:'GCash',confidence:95,rawPayload:{kind:'wallet_transaction',source:'gcash_bills_receipt',line:text,referenceNumber:reference,billerAccountNumber:billerAccount,paymentTimestamp,amountText:r.amount,totalAmount:total/100,billAmount:bill/100,feeAmount:fee/100,component:index===0?'bill':'fee',notes:`${biller} • Reference ${reference}`,parserEvidence:{currency:'PHP',totalReconciled:true,billerAccountIsNotWalletIdentity:true}}}));
  return {rows,metadata:{institution:'GCash',accountName:'GCash',accountNumber:null,accountType:'wallet',currency:'PHP',openingBalance:null,endingBalance:null,startDate:paymentTimestamp,endDate:paymentTimestamp,confidence:95,currencyConfidence:100,institutionConfidence:100,identityEvidence:['GCash bill receipt and reference','PHP bill plus fee equals total']}};
}
