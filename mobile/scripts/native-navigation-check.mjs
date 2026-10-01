import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { PageCache, isPageRead } from '../src/page-cache.ts';
import { institutionGroups } from '../src/institution-groups.ts';
let now=1000;
const cache = new PageCache(()=>now,300000), otherUser = new PageCache(()=>now);
const path='accounts?workspaceId=one&currency=PHP';
const snapshot={accounts:[{id:'asset-1',balance:'100'}]};
await cache.read(path,async()=>snapshot);
assert.equal(cache.peek('accounts?currency=PHP&workspaceId=one'),snapshot);
assert.equal(cache.peek('accounts?workspaceId=two&currency=PHP'),null);
assert.equal(otherUser.peek(path),null);
now+=300001; assert.equal(cache.peek(path),null);
now=1000;
let finish;
const delayed=cache.read(path,()=>new Promise(resolve=>{finish=resolve}));
await Promise.resolve(); cache.clear(); finish(snapshot); await delayed;
assert.equal(cache.peek(path),null,'An old response must not repopulate cache after mutation/sign-out');
await cache.read(path,async()=>snapshot); cache.clear();assert.equal(cache.peek(path),null);
for(const route of ['billing/store','adviser/chat','finverse/sync','bootstrap'])assert.equal(isPageRead(route),false);
const assets=[
{id:'1',type:'investment',institution:' GFunds ',currency:'PHP'},
{id:'2',type:'investment',institution:'gfunds',currency:'PHP'},
{id:'3',type:'investment',institution:'GFunds',currency:'USD'},
{id:'4',type:'investment',institution:null,currency:'PHP'},
{id:'5',type:'bank',institution:'GFunds',currency:'PHP'},
];
const before=JSON.stringify(assets),groups=institutionGroups(assets);
assert.equal(groups.length,3);assert.equal(groups.find(g=>g.name==='GFunds'&&g.currency==='PHP').assets.length,2);
assert.equal(groups.reduce((s,g)=>s+g.assets.length,0),4);assert.equal(JSON.stringify(assets),before);
await cache.read(path,async()=>snapshot);
const elapsed=[];
for(let i=0;i<1000;i++){const start=performance.now();assert.equal(cache.peek(path),snapshot);elapsed.push(performance.now()-start);}
elapsed.sort((a,b)=>a-b);
assert(elapsed[950]<10,'Cached navigation lookup p95 must remain under 10ms');
console.log(`PASS identity/Profile separation, expiry, mutation races, read-only currency-safe institution grouping; cached lookup p95 ${elapsed[950].toFixed(3)}ms (not device render latency)`);

const { storePriceLabel, storeVerificationMessage } = await import('../src/store-presentation.ts');
assert.equal(storePriceLabel({priceString:'₱169.00',currencyCode:'PHP',subscriptionPeriod:'P1M'}),'₱169.00 PHP / month');
assert.equal(storePriceLabel({priceString:'$19.99',currencyCode:'USD',subscriptionPeriod:'P1Y'}),'$19.99 USD / year');
assert.equal(storeVerificationMessage('free','silent'),'');
assert.equal(storeVerificationMessage('free','refresh'),'You’re on Clover Free.');
assert.match(storeVerificationMessage('free','restore'),/No active/);
assert.match(storeVerificationMessage('free','purchase'),/awaiting store verification/);
assert.match(storeVerificationMessage('premium','purchase'),/Pro access verified/);
console.log('PASS store currency/annual labels and silent return vs explicit restore/purchase messages');

const { planManagement } = await import('../src/store-presentation.ts');
const apple = { hasPaidSubscription:true, billingProvider:'app_store' };
assert.match(planManagement(apple,'ios','premium').url,/apps.apple.com/);
assert.equal(planManagement(apple,'android','premium').url,null);
assert.match(planManagement(apple,'android','free').message,/Apple device/);
assert.match(planManagement(apple,'ios','free').message,/paid access ends/);
const google = { hasPaidSubscription:true, billingProvider:'play_store' };
assert.match(planManagement(google,'android','premium').url,/play.google.com/);
assert.equal(planManagement(google,'ios','free').url,null);
assert.equal(planManagement({hasPaidSubscription:false},'ios','free').url,null);
assert.equal(planManagement({},'android','free').url,null,'Unknown source must not guess the device store');
assert.equal(planManagement({hasPaidSubscription:true,billingProvider:'paddle'},'ios','premium').url,null);
const concurrent = new PageCache(); let calls=0, release;
const first=concurrent.read(path,()=>{calls++;return new Promise(r=>release=r)});
const second=concurrent.read('accounts?currency=PHP&workspaceId=one',()=>{calls++;return snapshot});
await Promise.resolve(); assert.equal(calls,1); release(snapshot); await Promise.all([first,second]);
let oldFinish;
const old=concurrent.read(path,()=>new Promise(r=>oldFinish=r)); await Promise.resolve();
concurrent.clear(); const fresh={accounts:[]}; await concurrent.read(path,async()=>fresh);
oldFinish(snapshot); await old; assert.equal(concurrent.peek(path),fresh);
console.log('PASS original-store management, shared in-flight reads and invalidation races');
