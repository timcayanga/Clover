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
