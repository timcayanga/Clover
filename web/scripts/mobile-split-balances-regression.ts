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
import { directoryPersonBalances, personBalanceColumns, splitBillBalanceSummary, isSameSplitBillPerson } from '../lib/split-bill-balance-summary';
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
const detail=mobileApiResponse('split-bill',{bill:{id:'b',currency:'PHP',payments:[{id:'p',participantId:'a',amount:'900',note:'GCash',private:'omit'}],transferSettlements:[{id:'s',fromParticipantId:'b',toParticipantId:'a',fromParticipantName:'B',toParticipantName:'A',amount:'450',createdAt:'2026-11-05',private:'omit'}]}}) as any;
assert.equal(detail.bill.payments[0].amount,'900');
assert.equal(detail.bill.payments[0].private,undefined);
assert.equal(detail.bill.transferSettlements[0].amount,'450');
assert.equal(detail.bill.transferSettlements[0].private,undefined);
console.log('Native bill details include recorded contribution and settlement rows while withholding private fields.');

import { simplifyDebts, remainingDebts } from '../../shared/split-debts';
import { groupCoverIndex } from '../../shared/split-group-cover';
const edges=[
  {from:"A",to:"B",currency:"PHP",cents:500},
  {from:"B",to:"C",currency:"PHP",cents:500},
  {from:"C",to:"A",currency:"PHP",cents:499},
  {from:"B",to:"A",currency:"USD",cents:500},
];
assert.deepEqual(simplifyDebts(edges),[
  {from:"A",to:"C",currency:"PHP",cents:1},
  {from:"B",to:"A",currency:"USD",cents:500},
]);
assert.deepEqual(remainingDebts([{...partial,resolved:true}]),[]);
assert.deepEqual(remainingDebts([settled]),[]);
assert.equal(remainingDebts([partial])[0].cents,12500);
assert.equal(new Set(Array.from({length:100},(_,i)=>groupCoverIndex("group-"+i))).size,8);
console.log("Group debts preserve residual cents, partial payments, and currencies. All eight covers are reachable.");
const renamed = {...partial,group:{members:[{name:"Bee",previousNames:["B"]}]}};
assert.equal(remainingDebts([renamed])[0].from,"Bee");
assert.equal(renamed.settlement.transfers[0].fromParticipantName,"B");

const directory = ["Tim", "Tim Sun", "Tim Li", "Tina", "Viewer"].map(name => ({ id: name, name }));
const directoryBills = ["PHP", "USD"].map(currency => ({
  currency, settlement: { transfers: [
    { fromParticipantName: " tim  sun ", toParticipantName: "Viewer", amount: 10 },
    { fromParticipantName: "Viewer", toParticipantName: "Tim", amount: 4 },
    { fromParticipantName: "Tim Li", toParticipantName: "Tina", amount: 25 },
  ] },
}));
for (const rates of [{}, { USD: 58 }] as Record<string, number>[]) {
  assert.deepEqual(directoryPersonBalances(directoryBills, "Viewer", directory, "PHP", rates),
    Object.fromEntries(directory.map(person => [person.id, personBalanceColumns(directoryBills, "Viewer", person.name, "PHP", rates)])));
}

import { personLedger, netDebtLabel } from "../../shared/split-person-ledger";
const lunch = { id:"lunch",title:"Lunch",currency:"PHP",recorder:"Alex",settlementStatus:"open",
  participants:[{id:"1",name:"You"},{id:"2",name:"Mia"}],
  items:[{description:"Pasta",amount:"125.01",participantIds:["1","2"]}],
  settlement:{transfers:[{fromParticipantName:"Mia",toParticipantName:"You",amount:62.50}]} };
const taxi = {...lunch,id:"taxi",settlement:{transfers:[{fromParticipantName:"You",toParticipantName:"Mia",amount:12}]}};
const ledger = personLedger([lunch,taxi,{...taxi,resolved:true},{...taxi,currency:"USD"}],"Mia","Alex");
assert.deepEqual(ledger.totals,[{currency:"PHP",owed:1200,owes:6250,net:5050},{currency:"USD",owed:1200,owes:0,net:-1200}]);
assert.equal(ledger.rows[0].items[0].amount,62.5);
assert.equal(netDebtLabel("Mia",5050,"₱50.50"),"Mia owes you ₱50.50.");
assert.equal(netDebtLabel("Mia",-1200,"$12"),"You owe Mia $12.");
assert.equal(netDebtLabel("Mia",0,"₱0"),"All settled.");
assert.deepEqual(mobileApiResponse('split-bills',{summary:{},personBalances:{mia:{owed:"$10",owes:"$5",private:"omit"}}}),{summary:{},personBalances:{mia:{owed:"$10",owes:"$5"}}});
