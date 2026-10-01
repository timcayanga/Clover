import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { mobileHome } from '../lib/mobile-home';
import { mergeHomeDetails } from '../../mobile/src/home-sections';
async function main() {
  const originals: Array<() => void> = [];
  const stub = (model: any, key: string, run: (...args: any[]) => any) => {
    const original = model[key]; originals.push(() => { model[key] = original; }); model[key] = run;
  };
  let secondaryCalls = 0;
  stub(prisma.account, 'findMany', async (args) => {
    assert.equal(args.where.workspaceId,'qa-home');
    return [{id:'bank',type:'bank',currency:'PHP',source:'import',balance:'123',transactions:[],statementCheckpoints:[]}];
  });
  stub(prisma.transaction, 'findMany', async () => []);
  stub(prisma.transaction, 'count', async () => 2);
  stub(prisma.financialCommitment, 'findMany', async () => []);
  stub(prisma.importFile, 'findFirst', async () => null);
  stub(prisma.finverseAccountLink, 'findMany', async () => []);
  stub(prisma.budget, 'findMany', async () => { secondaryCalls++; throw Error('Slow secondary work must not run for overview'); });
  stub(prisma, '$queryRaw', async () => { secondaryCalls++; throw Error('Recurring compatibility checks must not run for overview'); });
  try {
    const start=performance.now();
    const data = await mobileHome('qa-home','PHP','PHP',true);
    assert.equal(data.balance,123); assert.equal(data.detailsPending,true);
    assert.equal(data.reviewCount,2); assert.equal(secondaryCalls,0);
    assert.deepEqual(data.budgets,[]);
    console.log(`PASS Home overview returns balances without budget/recurring analysis (${(performance.now()-start).toFixed(1)}ms with mocked database)`);
  } finally { originals.reverse().forEach(restore => restore()); }
const input={currency:'PHP',daysSinceLastImport:1,categorySpike:null,paymentTitles:[],recurringCount:0,weekly:{income:0,expense:0,transfer:0},previousWeeklyExpense:0,monthNet:0,hasRecentTransactions:false,recentReviewCount:2};
const overview:any={balance:123,detailsPending:true,insightInput:input,nextSteps:[{id:'transactions',count:2}],budgets:[]};
const detail:any={budgets:[{id:'budget'}],nextSteps:[{id:'recurring',count:1}],paymentTitles:['Rent'],recurringCount:1};
const merged=mergeHomeDetails(overview,detail);
assert.equal(merged.balance,123); assert.equal(merged.detailsPending,false);
assert.equal(merged.nextSteps.length,2);assert.equal(merged.insights[0].label,'Upcoming payment');
assert.deepEqual(overview.budgets,[]);assert.equal(mergeHomeDetails(overview,null),overview);
assert.equal(mergeHomeDetails({balance:123},detail).balance,123,'Legacy full responses remain compatible');
console.log('PASS progressive Home merging preserves balances, review items, and legacy responses');

}
main().catch(e=>{console.error(e);process.exitCode=1});
