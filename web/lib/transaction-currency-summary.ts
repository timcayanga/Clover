import { formatCurrencyCode } from './currency-format';
export type TransactionCurrencyTotals = Record<string, { income:number; spending:number; transfers:number }>;
/** Update only this newly built summary; never mutate a transaction or server response. */
export function addTransactionCurrencyAmount(totals:TransactionCurrencyTotals,currency:string,type:string,amount:number) {
  if (!Number.isFinite(amount)) return;
  const code=formatCurrencyCode(currency);
  const bucket=totals[code] ??= {income:0,spending:0,transfers:0};
  bucket[type==='income'?'income':type==='transfer'?'transfers':'spending'] += Math.abs(amount);
}
export function withTransactionCurrencyDelta(totals:TransactionCurrencyTotals|undefined,currency:string,type:string,delta:number) {
  if (!totals || !Number.isFinite(delta)) return totals;
  const code=formatCurrencyCode(currency), field=type==='income'?'income':type==='transfer'?'transfers':'spending';
  const bucket={...(totals[code]??{income:0,spending:0,transfers:0})};
  bucket[field]+=delta;
  return {...totals,[code]:bucket};
}
