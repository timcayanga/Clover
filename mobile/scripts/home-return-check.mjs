import assert from 'node:assert/strict';
import {paymentCountdown,shortPaymentDate,dateInTimeZone,greetingName} from '../../shared/home-return.ts';
import {homePendingSplitBills} from '../../shared/home-split-bills.ts';
assert.equal(paymentCountdown('2026-11-07','2026-11-05'),'2 days left');
assert.equal(paymentCountdown('2026-11-06','2026-11-05'),'1 day left');
assert.equal(paymentCountdown('2026-11-05','2026-11-05'),'Due today');
assert.equal(paymentCountdown('2026-11-04','2026-11-05'),'1 day overdue');
assert.equal(paymentCountdown('2027-01-01','2026-12-31'),'1 day left');
assert.equal(paymentCountdown('2026-02-30','2026-02-28'),null);
assert.equal(paymentCountdown('','2026-11-05'),null);
assert.equal(shortPaymentDate('2026-11-07'),'Nov 7');
assert.equal(dateInTimeZone(new Date('2026-11-05T23:00:00Z'),'Asia/Manila'),'2026-11-06');
assert.equal(greetingName(' Tim Cayanga '),'Hi, Tim!');assert.equal(greetingName(null),'Hi there!');
const bill=(id,amount,resolved=false,currency='PHP')=>({id,title:id,currency,resolved,settlement:{transfers:[{amount}]}});
const bills=[bill('paid',0),bill('resolved',900,true),bill('partial',125),bill('idr',500,false,'IDR')];
const original=JSON.stringify(bills);
assert.deepEqual(homePendingSplitBills(bills),{count:2,bills:[{id:'partial',title:'partial',currency:'PHP',remaining:125},{id:'idr',title:'idr',currency:'IDR',remaining:500}]});
assert.equal(JSON.stringify(bills),original,'Read-only summaries preserve financial records');
assert.equal(homePendingSplitBills([]).count,0);
assert.equal(homePendingSplitBills(Array.from({length:10},(_,i)=>bill(String(i),100))).count,10);
assert.equal(homePendingSplitBills(Array.from({length:10},(_,i)=>bill(String(i),100))).bills.length,3);
console.log('PASS Home dates/countdowns, time zones, personalized greetings and pending/partial/settled Split Bill summaries');

const context = { currentUserName: 'Tim Cayanga', groups: [{id:'group-1',name:'Our Household',avatarUrl:'/household.jpg'}], people:[{name:'Jeep',avatarUrl:'/jeep.jpg'}] };
const attributed = [{...bill('group',100),groupId:'group-1',participants:[{name:'You'}]}, {...bill('people',80),participants:[{name:'You'},{name:'Jeep'},{name:'New person'}]}];
const attributionSnapshot = JSON.stringify(attributed);
const summary = homePendingSplitBills(attributed,context);
assert.deepEqual(summary.bills[0].avatars,[{name:'Our Household',avatarUrl:'/household.jpg'}]);
assert.deepEqual(summary.bills[1].avatars,[{name:'Tim Cayanga',avatarUrl:null,isSelf:true},{name:'Jeep',avatarUrl:'/jeep.jpg',isSelf:false},{name:'New person',avatarUrl:null,isSelf:false}]);
assert.equal(homePendingSplitBills([{...bill('many',100),participants:Array.from({length:8},(_,i)=>({name:`Person ${i}`}))}],context).bills[0].avatars.length,5);
assert.equal(JSON.stringify(attributed),attributionSnapshot,'Avatar projection must not alter bill participants or balances');
console.log('PASS Home group photos, participant photos, self identity, missing photos and bounded avatar stacks');

const withMarks = homePendingSplitBills([{...bill('Lunch',100), merchantName:'Grab', categoryName:'Transport'},bill('Mystery',50)],context,
  mark => ({merchantLogoUrl:mark.merchantRaw === 'Grab' ? '/assets/grab.png' : null}));
assert.equal(withMarks.bills[0].mark.merchantLogoUrl,'/assets/grab.png');
assert.equal(withMarks.bills[0].mark.categoryName,'Transport');
assert.equal(withMarks.bills[1].mark.merchantRaw,'Mystery');
assert.equal(withMarks.bills[1].mark.merchantLogoUrl,null);
