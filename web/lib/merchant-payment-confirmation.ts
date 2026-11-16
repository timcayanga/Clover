import { BANK_PRIORITY, normalizeBankName } from "./data-qa-banks";

const banks = new Set<string>(BANK_PRIORITY);
const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

/** A single completed merchant debit, not a history, transfer, bank payment,
 * refund, balance or receipt item table. No issuer/account/currency inference. */
export function readMerchantPaymentConfirmation(text: string) {
  const source = text.normalize("NFKC");
  const lines = source.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if (lines.filter(s=>/^Transaction Details$/i.test(s)).length !== 1 ||
      lines.filter(s=>/^Amount\s*:?$/i.test(s)).length !== 1 ||
      lines.filter(s=>/^Date\s*(?:&|and)\s*Time\s*:?$/i.test(s)).length !== 1 ||
      /\b(?:pending|processing|failed|declined|cancelled|canceled|refund|reversed|reversal|void|voided|transfer|transferred|sent\s+to|cash\s+in|cash\s+out|opening\s+balance|ending\s+balance|transaction\s+history)\b/i.test(source) ||
      /\b(?:account\s*(?:number|no\.?|#)|from\s+account|paid\s+from|card\s*(?:number|no\.?|ending)|payment\s*(?:method|channel))\b/i.test(source) ||
      lines.some(s=>/^(?:fee|charge|service\s+charge|tax|sub\s*total|total)\b/i.test(s))) return null;
  const payees = lines.flatMap(s=>{const m=s.match(/^Payment\s+to\s+(.{2,160})$/i);return m?[m[1].trim()]:[];});
  if (payees.length !== 1 || !/\p{L}/u.test(payees[0]) || banks.has(normalizeBankName(payees[0])) ||
      /bank|\b(?:wallet|savings|credit\s+card|loan|account)\b/i.test(payees[0])) return null;
  const afterPayee=lines[lines.findIndex(s=>/^Payment\s+to\s+/i.test(s))+1]??"";
  if (!/^\d{2,10}$/.test(afterPayee) && !/^Amount\s*:?$/i.test(afterPayee)) return null;
  const references = lines.flatMap((s,i)=>/^Reference\s+(?:Number|No\.?)\s*:?$/i.test(s) && /^\d{6,24}$/.test(lines[i+1]??"") ? [lines[i+1]] : []);
  if (references.length !== 1) return null;
  const money = /^(?:([A-Z]{3})\s*)?([-−])?\s*(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})$/;
  const amounts = lines.flatMap(s=>{const m=s.match(money);return m?[m]:[];});
  if (amounts.length !== 1 || !amounts[0][2]) return null;
  const cents = Number(amounts[0][3].replaceAll(",","")+amounts[0][4]);
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  const dates = lines.flatMap(s=>{const m=s.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s*(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);return m?[m]:[];});
  if (dates.length !== 1) return null;
  const d=dates[0], year=Number(d[3]), month=months.indexOf(d[1].toLowerCase()), day=Number(d[2]);
  const date=new Date(Date.UTC(year,month,day));
  if (date.getUTCFullYear()!==year || date.getUTCMonth()!==month || date.getUTCDate()!==day || Number(d[4])<1 || Number(d[4])>12 || Number(d[5])>59) return null;
  return { merchant:payees[0], amount:cents/100, date:date.toISOString().slice(0,10), reference:references[0] };
}
