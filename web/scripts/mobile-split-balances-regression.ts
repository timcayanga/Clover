import assert from 'node:assert/strict';
import { outstandingSplitBalances } from '../../mobile/src/split-balances';
const bill = (amount: number, currency = 'PHP', settlementStatus = 'open') => ({
  currency, settlementStatus,
  settlement: {
    participants: [{name:'A', balance:300},{name:'B',balance:-300}],
    transfers: amount ? [{fromParticipantName:'B',toParticipantName:'A',amount}] : [],
  },
});
const settled=bill(0,'PHP','settled');
const partial=bill(125);
const usd=bill(20,'USD');
const fixtures=[settled,partial,usd];
const before=JSON.stringify(fixtures);
const balances=outstandingSplitBalances(fixtures);
assert.equal(balances.get('A')?.get('PHP'),125);
assert.equal(balances.get('B')?.get('PHP'),-125);
assert.equal(balances.get('A')?.get('USD'),20);
assert.equal(balances.get('B')?.get('USD'),-20);
assert.equal(outstandingSplitBalances([settled]).get('B')?.get('PHP'),0);
assert.equal(outstandingSplitBalances([bill(300)]).get('B')?.get('PHP'),-300);
assert.equal(JSON.stringify(fixtures),before);
console.log('Native split balances: settled zero, partial remainder, currency separation and source preservation passed.');

// Native headline cards use the same complete-workspace projection as mobile web.
import { splitBillBalanceSummary, isSameSplitBillPerson } from '../lib/split-bill-balance-summary';
import { mobileApiResponse } from '../lib/mobile-api-response';
import { formatSplitBillAmount } from '../lib/split-bill';
assert.deepEqual(splitBillBalanceSummary([], 'B'), {youOwe:formatSplitBillAmount(0,'PHP'),owedToYou:formatSplitBillAmount(0,'PHP')});
assert.equal(splitBillBalanceSummary([partial,settled], 'B').youOwe,formatSplitBillAmount(125,'PHP'));
assert.equal(splitBillBalanceSummary([partial,settled], 'A').owedToYou,formatSplitBillAmount(125,'PHP'));
assert.equal(splitBillBalanceSummary(fixtures,'B').youOwe,'Mixed');
assert.equal(splitBillBalanceSummary(Array.from({length:45},()=>bill(10)),'B').youOwe,formatSplitBillAmount(450,'PHP'));
assert(isSameSplitBillPerson(' Tim  Cayanga ', 'tim'));
assert(!isSameSplitBillPerson('Tim Cayanga','Tim Other'));
assert(!isSameSplitBillPerson('',''));
assert.deepEqual(mobileApiResponse('split-bills',{summary:{youOwe:'₱125.00',owedToYou:'₱0.00',private:'omit'},bills:['omit']}),{summary:{youOwe:'₱125.00',owedToYou:'₱0.00'}});
assert.equal(JSON.stringify(fixtures),before);
console.log('Split Bills headline parity: complete totals, partial settlements, mixed currencies, name matching and response minimization passed.');
