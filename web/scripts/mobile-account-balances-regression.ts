import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { prisma } from '../lib/prisma';
import { mobileAccountBalances } from '../lib/mobile-account-balances';
import { mobileApiResponse } from '../lib/mobile-api-response';
async function main() {
  const tx = (amount:number,type:string,rawPayload:unknown=null,currency='PHP') => ({amount,type,rawPayload,currency,merchantRaw:'QA',merchantClean:null,description:null,date:new Date('2026-09-14'),createdAt:new Date('2026-09-14')});
  const fixtures = [
    {id:'bank',type:'bank',currency:'PHP',balance:'10000',transactions:[tx(2000,'income'),tx(500,'expense'),tx(1000,'transfer',{amountDelta:-1000})],statementCheckpoints:[]},
    {id:'cash',type:'cash',currency:'PHP',balance:'0',transactions:[tx(1000,'transfer',{amountDelta:1000}),tx(50,'income',null,'USD')],statementCheckpoints:[]},
    {id:'usd',type:'cash',currency:'USD',balance:'100',transactions:[],statementCheckpoints:[]},
  ];
  const before=JSON.stringify(fixtures);
  const original = prisma.account.findMany;
  const find=mock.fn(async(args:unknown)=>{
    const q=args as {where:unknown;select:{transactions:{where:unknown}}};
    assert.deepEqual(q.where,{workspaceId:'qa-profile',id:{in:['bank','cash','usd']},source:'manual'});
    assert.deepEqual(q.select.transactions.where,{deletedAt:null,isExcluded:false});
    return fixtures;
  });
  prisma.account.findMany = find as typeof original;
  try {
    assert.equal((await mobileAccountBalances('qa-profile',[])).size,0);
    assert.equal(find.mock.callCount(),0);
    const balances=await mobileAccountBalances('qa-profile',['bank','cash','usd']);
    assert.equal(balances.get('bank'),'10500.00');
    assert.equal(balances.get('cash'),'1000.00');
    assert.equal(balances.get('usd'),'100.00');
    assert.equal(JSON.stringify(fixtures),before);
    const account={id:'bank',balance:'10000',displayBalance:balances.get('bank'),rawPayload:'private'};
    assert.deepEqual(mobileApiResponse('accounts',{accounts:[account]}),{accounts:[{id:'bank',balance:'10000',displayBalance:'10500.00'}]});
    assert.deepEqual(mobileApiResponse('account',{account}),{account:{id:'bank',balance:'10000',displayBalance:'10500.00'}});
  } finally {prisma.account.findMany = original;}
  console.log('Mobile balances: opening balances preserved; transfers, currency isolation, Profile scope and response projection passed.');
}
void main();
