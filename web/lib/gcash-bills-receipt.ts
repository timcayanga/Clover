import type { DetectedStatementMetadata, ParsedImportRow } from './import-parser';

const looksLikeGcashBillsReceipt = (text: string) => /GCash Bills Pay Receipt/i.test(text) ||
  (/GCash\s+Ref\.?\s*No\./i.test(text) && /Biller Name/i.test(text) && /Total (?:Amount|Name)/i.test(text) && /Date\/Time/i.test(text));

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
function parseSingleGcashBillsReceipt(text: string): { metadata: DetectedStatementMetadata; rows: ParsedImportRow[] } | null {
  if (!looksLikeGcashBillsReceipt(text) || !/GCash\s+Ref\.?\s*No\./i.test(text)) return null;
  const uniqueAmount = (label: string) => {
    const values = [...text.matchAll(new RegExp(`\\b${label}\\s+PHP\\s+([\\d,]+\\.\\d{2})`, 'gi'))].map(m=>Math.round(Number(m[1].replaceAll(',',''))*100));
    const unique = [...new Set(values)];
    if (unique.length !== 1) throw new Error('GCash bill receipt has missing or conflicting totals; review the source.');
    return unique[0];
  };
  const total=uniqueAmount('Total (?:Amount|Name)'), fee=uniqueAmount('Fee');
  const paid=[...text.matchAll(/\bAmount Paid\s+PHP\s+([\d,]+\.\d{2})/gi)].map(m=>Math.round(Number(m[1].replaceAll(',',''))*100));
  const bill=total-fee;
  if (bill<=0 || fee<0 || paid.some(n=>n!==bill && n!==total) || !paid.includes(bill)) throw new Error('GCash bill and fee do not reconcile with the printed total.');
  // Native PDF field labels can lie between the wrapped date and AM/PM. Read
  // only a bounded region around the payment label, never the email/print date.
  const stamps = [...text.matchAll(/Date\/Time/gi)].flatMap(label => {
    const at = label.index!;
    const field = text.slice(Math.max(0, at - 110), at + 110).replace(/Date\/Time/gi, " ").replace(/\b([AP])\s+M\b/gi, "$1M");
    return [...field.matchAll(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/gi)];
  });
  const distinctStamps = [...new Map(stamps.map(s => [s.slice(1).join("|").toLowerCase(), s])).values()];
  const stamp = distinctStamps.length === 1 ? distinctStamps[0] : null;
  const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
  if (!stamp) throw new Error('GCash payment timestamp requires review.');
  const month=months.indexOf(stamp[2].toLowerCase()), day=Number(stamp[1]), year=Number(stamp[3]);
  const checked=new Date(Date.UTC(year,month,day));
  if(month<0 || checked.getUTCMonth()!==month || checked.getUTCDate()!==day || Number(stamp[4])<1 || Number(stamp[4])>12 || Number(stamp[5])>59 || Number(stamp[6])>59) throw new Error('GCash payment timestamp is invalid.');
  const references=[...new Set([...text.matchAll(/GCash\s+Ref\.?\s*No\.\s+(\d+)/gi)].map(m=>m[1]))];
  if(references.length!==1) throw new Error('GCash receipt contains multiple payment references; review each source.');
  const reference=references[0];
  const billerAccount=text.match(/Account\s+Number\s+([A-Za-z0-9*]+)/i)?.[1]??null;
  // The complete native transcript places the value before Biller Name;
  // the image transcript may place it after. Restrict to the receipt fields.
  const lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const labelIndex=lines.findIndex(l=>/^Biller Name$/i.test(l));
  const isField=(line:string)=>/^(?:PHP\b|Amount Paid\b|Total (?:Amount|Name)\b|Fee\b|Account\b|Date\/Time\b|GCash\b|Email Receipt\b|Subject:|Date:|To:|Pay Bills\b)/i.test(line);
  const before=labelIndex>=0 ? lines.slice(Math.max(0,labelIndex-2),labelIndex).filter(l=>!isField(l)) : [];
  const after:string[]=[];
  if(labelIndex>=0)for(const line of lines.slice(labelIndex+1)){if(isField(line))break;after.push(line);}
  let biller=[...new Set([...before,...after])].join(' ');
  if(!biller) biller=text.match(/Biller Nam(?:e)?\s+(.+?)(?=\s+Total (?:Amount|Name))/is)?.[1]?.replace(/[©\n]/g,' ').replace(/\s+/g,' ').trim()??'';
  if(!biller || /Amount Paid|GCash Ref|Date\/Time/i.test(biller)) throw new Error('GCash biller requires source review.');
  const dayText=checked.toISOString().slice(0,10);
  const hour=(Number(stamp[4])%12)+(stamp[7].toUpperCase()==='PM'?12:0);
  const paymentTimestamp=`${dayText}T${String(hour).padStart(2,'0')}:${stamp[5]}:${stamp[6]}+08:00`;
  const rows: ParsedImportRow[]=[{amount:(bill/100).toFixed(2),merchantRaw:biller,merchantClean:biller,description:`GCash bill payment • ${biller}`,categoryName:/ELECTRIC/i.test(biller)?'Utilities':'Other'},...(fee>0?[{amount:(fee/100).toFixed(2),merchantRaw:'GCash Bills Payment Fee',merchantClean:'GCash Bills Payment Fee',description:`GCash fee • ${biller}`,categoryName:'Financial'}]:[])].map((r,index)=>({...r,date:paymentTimestamp,currency:'PHP',type:'expense',accountName:'GCash',institution:'GCash',confidence:95,rawPayload:{kind:'wallet_transaction',source:'gcash_bills_receipt',line:text,referenceNumber:reference,billerAccountNumber:billerAccount,paymentTimestamp,amountText:r.amount,totalAmount:total/100,billAmount:bill/100,feeAmount:fee/100,component:index===0?'bill':'fee',notes:`${biller} • Reference ${reference}`,parserEvidence:{currency:'PHP',totalReconciled:true,billerAccountIsNotWalletIdentity:true}}}));
  return {rows,metadata:{institution:'GCash',accountName:'GCash',accountNumber:null,accountType:'wallet',currency:'PHP',openingBalance:null,endingBalance:null,startDate:paymentTimestamp,endDate:paymentTimestamp,confidence:95,currencyConfidence:100,institutionConfidence:100,identityEvidence:['GCash bill receipt and reference','PHP bill plus fee equals total']}};
}

/** Page boundaries distinguish separate payments from duplicated receipt art. */
export function buildGcashBillsNativePages(pages: string[]): string | null {
  const references = new Set(pages.flatMap(text => [...text.matchAll(/GCash\s+Ref\.?\s*No\.\s+(\d+)/gi)].map(m => m[1])));
  if (references.size < 2) return null;
  try {
    const receipts = pages.map((text, index) => ({ text, page: index + 1, parsed: parseSingleGcashBillsReceipt(text) }));
    if (receipts.some(r => !r.parsed && /Biller Name|GCash\s+Ref\.?\s*No\./i.test(r.text))) return null;
    if (receipts.filter(r => r.parsed).length < 2) return null;
    return "GCASH_BILLS_NATIVE " + JSON.stringify({ physicalPages: pages.length, pages: pages.map((text, index) => ({ page: index + 1, text })) });
  } catch { return null; }
}

export function parseGcashBillsReceipt(text: string): { metadata: DetectedStatementMetadata; rows: ParsedImportRow[] } | null {
  const native = text.split(/\r?\n/).filter(line => line.startsWith("GCASH_BILLS_NATIVE "));
  if (!native.length) return parseSingleGcashBillsReceipt(text);
  if (native.length !== 1) throw new Error("GCash receipt page evidence requires review.");
  let proof: { physicalPages: number; pages: Array<{ page: number; text: string }> };
  try { proof = JSON.parse(native[0].slice("GCASH_BILLS_NATIVE ".length)); } catch { throw new Error("GCash receipt page evidence requires review."); }
  if (!Number.isInteger(proof?.physicalPages) || proof.physicalPages < 1 || proof.physicalPages > 100 || !Array.isArray(proof.pages) || proof.pages.length !== proof.physicalPages) throw new Error("GCash receipt pages are incomplete.");
  const seen = new Map<string, string>();
  const rows: ParsedImportRow[] = [];
  let metadata: DetectedStatementMetadata | null = null;
  for (const [index, page] of proof.pages.entries()) {
    if (page.page !== index + 1 || typeof page.text !== "string" || page.text.length > 200000) throw new Error("GCash receipt page evidence requires review.");
    const parsed = parseSingleGcashBillsReceipt(page.text);
    if (!parsed) {
      if (/Biller Name|GCash\s+Ref\.?\s*No\./i.test(page.text)) throw new Error("GCash receipt fields are incomplete.");
      continue;
    }
    const reference = String(parsed.rows[0]?.rawPayload?.referenceNumber);
    const financial = JSON.stringify(parsed.rows.map(r => [r.amount, r.date, r.merchantRaw, r.rawPayload?.component, r.rawPayload?.billerAccountNumber]));
    if (seen.has(reference)) {
      if (seen.get(reference) !== financial) throw new Error("GCash repeated reference has conflicting payment fields.");
      continue;
    }
    seen.set(reference, financial);
    metadata ??= parsed.metadata;
    rows.push(...parsed.rows.map(r => ({ ...r, rawPayload: { ...r.rawPayload, sourcePage: page.page, physicalPages: proof.physicalPages } })));
  }
  if (!metadata || !rows.length) throw new Error("GCash receipt fields are incomplete.");
  const dates = rows.map(r => String(r.date)).sort();
  return { rows, metadata: { ...metadata, startDate: dates[0], endDate: dates.at(-1)! } };
}
