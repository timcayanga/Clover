import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { mobileHome } from '../lib/mobile-home';
import { mergeHomeDetails } from '../../mobile/src/home-sections';
import { mobileHomePeriods } from "../lib/mobile-home-periods";
async function main() {
  const originals: Array<() => void> = [];
  const stub = (model: any, key: string, run: (...args: any[]) => any) => {
    const original = model[key]; originals.push(() => { model[key] = original; }); model[key] = run;
  };
  const { day } = mobileHomePeriods();
  const posting = (offset: number, type: string, amount: string, currency = "PHP") => ({
    date: new Date(+day + offset), type, amount, currency, isTransfer: type === "transfer", category: null,
  });
  const DAY = 86_400_000;
  const postings = [posting(-1,"expense","2.50"), posting(0,"income","10"), posting(1,"transfer","4"),
    posting(-7 * DAY,"expense","8"), posting(-30 * DAY,"income","5"), posting(0,"income","99","USD")];
  let secondaryCalls = 0, reviewReads = 0;
  stub(prisma.account, 'findMany', async (args) => {
    assert.equal(args.where.workspaceId,'qa-home');
    return [{id:'bank',type:'bank',currency:'PHP',source:'import',balance:'123',transactions:[],statementCheckpoints:[]}];
  });
  stub(prisma.transaction, 'findMany', async (args) => args.select?.merchantRaw ? (reviewReads++, [0,1]).map(index=>({id:`review-${index}`,reviewStatus:'pending_review',reviewReasons:[],categoryId:null,category:null,merchantRaw:'Lunch',merchantClean:'Lunch',account:{institution:'BPI'},type:'expense',rawPayload:{},normalizedPayload:{},parserConfidence:98,categoryConfidence:30,accountMatchConfidence:100,isExcluded:false})) : postings);
  stub(prisma.transaction, 'groupBy', async () => []);
  stub(prisma.financialCommitment, 'findMany', async () => []);
  stub(prisma.transaction, 'findFirst', async (args) => {
    assert.ok(args.where.AND.some((scope: { OR?: { workspaceId?: string }[] }) => scope.OR?.some(part => part.workspaceId === 'qa-home')));
    assert.ok(args.where.createdAt.gte instanceof Date);
    return { id: 'recently-recorded-old-receipt' };
  });
  stub(prisma.finverseAccountLink, 'findMany', async () => []);
  stub(prisma.budget, 'findMany', async () => { secondaryCalls++; throw Error('Slow secondary work must not run for overview'); });
  stub(prisma, '$queryRaw', async () => { secondaryCalls++; throw Error('Recurring compatibility checks must not run for overview'); });
  try {
    const start=performance.now();
    const data = await mobileHome('qa-home','PHP','PHP',true);
    assert.equal(data.balance,123); assert.equal(data.detailsPending,true);
    assert.equal(data.reviewCount,2); assert.equal(secondaryCalls,0);
    assert.deepEqual(data.budgets,[]);
    assert.equal(data.weekly.income,10);
    assert.equal(data.weekly.days.at(-1)?.expense,0);
    assert.equal(data.weekly.days.at(-2)?.expense,2.5);
    assert.equal(data.weekly.days.at(-1)?.transfer,4);
    assert.equal(data.weekly.previous.expense,8);
    assert.equal(data.monthly.expense,10.5);
    assert.equal(data.monthly.previous.income,5);
    assert.deepEqual(data.currencyReports[0].monthly,data.monthly);
    assert.equal(data.insights.some(insight => insight.kind === "reminder"), false);
    const priorReviewReads = reviewReads;
    const fast = await mobileHome('qa-home','PHP','PHP',true,true);
    assert.equal(fast.balance,data.balance);
    assert.equal(fast.reviewCount,null);
    assert.equal(reviewReads,priorReviewReads,'Balance-first Home must not wait for the review queue');
    console.log(`PASS Home overview returns balances without budget/recurring analysis (${(performance.now()-start).toFixed(1)}ms with mocked database)`);
  } finally { originals.reverse().forEach(restore => restore()); }
const input={currency:'PHP',hasRecentTransactionActivity:true,categorySpike:null,paymentTitles:[],recurringCount:0,weekly:{income:0,expense:0,transfer:0},previousWeeklyExpense:0,monthNet:0,hasRecentTransactions:false,recentReviewCount:2};
const overview:any={balance:123,detailsPending:true,insightInput:input,nextSteps:[{id:'transactions',count:2}],budgets:[]};
const detail:any={budgets:[{id:'budget'}],nextSteps:[{id:'recurring',count:1}],paymentTitles:['Rent'],recurringCount:1};
const merged=mergeHomeDetails(overview,detail);
assert.equal(mergeHomeDetails({...overview,reviewCount:null},{...detail,reviewCount:3} as any).reviewCount,3);
assert.equal(merged.balance,123); assert.equal(merged.detailsPending,false);
assert.equal(merged.nextSteps.length,2);assert.equal(merged.insights[0].label,'Upcoming payment');
assert.deepEqual(overview.budgets,[]);assert.equal(mergeHomeDetails(overview,null),overview);
assert.equal(mergeHomeDetails({balance:123},detail).balance,123,'Legacy full responses remain compatible');
console.log('PASS progressive Home merging preserves balances, review items, and legacy responses');

}
main().catch(e=>{console.error(e);process.exitCode=1});
