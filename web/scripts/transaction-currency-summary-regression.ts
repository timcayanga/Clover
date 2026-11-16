import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addTransactionCurrencyAmount, withTransactionCurrencyDelta, type TransactionCurrencyTotals } from '../lib/transaction-currency-summary';
const totals:TransactionCurrencyTotals={};
for(let i=0;i<6;i++)addTransactionCurrencyAmount(totals,'PHP','income',100);
assert.deepEqual(totals,{PHP:{income:600,spending:0,transfers:0}});
addTransactionCurrencyAmount(totals,'USD','expense',-10);
addTransactionCurrencyAmount(totals,'PHP','transfer',25);
addTransactionCurrencyAmount(totals,'USD','income',Number.NaN);
assert.deepEqual(totals,{PHP:{income:600,spending:0,transfers:25},USD:{income:0,spending:10,transfers:0}});
const source=readFileSync(new URL('../app/transactions/page.tsx',import.meta.url),'utf8');
assert.match(source,/currencyTotals: summaryPayload\.currencyTotals \?\? visibleSummaryFallback\?\.currencyTotals/,'The response adapter must retain authoritative per-currency totals, including totals beyond the visible page');
assert.match(source,/addTransactionCurrencyAmount\(summary\.currencyTotals!/,'Visible fallback must also retain per-currency totals');
console.log('Transaction currency summary regression passed: filtered PHP600, mixed currency buckets, transfer separation and response adapter.');

const added=withTransactionCurrencyDelta(totals,"PHP","expense",25)!;
assert.equal(added.PHP.spending,25);assert.equal(totals.PHP.spending,0);
assert.deepEqual(withTransactionCurrencyDelta(added,"PHP","expense",-25),totals);
