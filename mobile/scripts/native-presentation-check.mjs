import assert from 'node:assert/strict';
import { cashFlowLayout, flowBand } from '../src/cash-flow-layout.ts';
import { recordedSummary, tokenUsagePercent } from '../src/recorded-summary.ts';

assert.deepEqual(recordedSummary([100, null, '50', '0', NaN, undefined, '']), {value:150,known:3,missing:4});
assert.deepEqual(recordedSummary([null]), {value:null,known:0,missing:1});
assert.deepEqual(recordedSummary([0, '-25', 50]), {value:25,known:3,missing:0});
assert.equal(tokenUsagePercent(undefined),'—');
assert.equal(tokenUsagePercent({used:0,limit:1000}),'0% used');
assert.equal(tokenUsagePercent({used:1,limit:1000}),'<1% used');
assert.equal(tokenUsagePercent({used:280,limit:1000}),'28% used');
assert.equal(tokenUsagePercent({used:2000,limit:1000}),'100% used');
assert.equal(tokenUsagePercent({used:0,limit:0}),'Not available');
assert.equal(tokenUsagePercent({used:100,limit:null}),'Unlimited');
for (const flows of [
 [{account:'A',income:100,expense:0}],
 [{account:'A',income:0,expense:100}],
 [{account:'A',income:100,expense:80},{account:'B',income:50,expense:200}],
 Array.from({length:10},(_,i)=>({account:`A${i}`,income:i+1,expense:20-i})),
 [{account:'Small',income:1,expense:0},{account:'Big',income:1000000,expense:2000000}],
]) {
 const before=JSON.stringify(flows), layout=cashFlowLayout(flows);
 let inBottom=layout.top,outBottom=layout.top,nodeBottom=layout.top;
 for (const node of layout.nodes) {
  assert.equal(node.height,Math.max(node.incomeHeight,node.expenseHeight));
  assert.equal(node.incomeY,inBottom);assert.equal(node.expenseY,outBottom);
  assert(node.y>=nodeBottom);
  inBottom+=node.incomeHeight;outBottom+=node.expenseHeight;nodeBottom=node.y+node.height;
  assert(!/NaN|Infinity/.test(flowBand(22,124,node.incomeY,node.y,node.incomeHeight)));
 }
 assert(Math.abs(inBottom-layout.top-layout.incomeHeight)<1e-8);
 assert(Math.abs(outBottom-layout.top-layout.expenseHeight)<1e-8);
 assert.equal(layout.nodes.reduce((n,r)=>n+r.income,0),flows.reduce((n,r)=>n+r.income,0));
 assert.equal(layout.nodes.reduce((n,r)=>n+r.expense,0),flows.reduce((n,r)=>n+r.expense,0));
 assert.equal(JSON.stringify(flows),before);
}
assert.equal(cashFlowLayout([]),null);
assert.equal(cashFlowLayout([{account:'Empty',income:0,expense:0}]),null);
assert.equal(cashFlowLayout([{account:'Invalid',income:NaN,expense:-10}]),null);
console.log('PASS native partial summaries, percentage usage and proportional, nonoverlapping cash-flow bands');
