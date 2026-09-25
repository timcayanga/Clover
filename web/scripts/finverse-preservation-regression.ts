import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { bankNumbersMatch, matchingBankAccounts } from '../lib/finverse-matching';
import { bankLinkPeriod, bankLinkAllowance } from '../lib/bank-link-usage';
async function main() {
 assert(bankNumbersMatch('0012345678901','001******8901'));
 assert(!bankNumbersMatch('0012345678901','0018901'));
 assert(!bankNumbersMatch('0012345678901','9912345678901'));
 const identity={institution:'Metrobank',accountNumber:'0012345678901',currency:'PHP',type:'bank'};
 assert.equal(matchingBankAccounts([identity],{...identity,institution:'Metropolitan Bank'}).length,1);
 assert.equal(matchingBankAccounts([identity],{...identity,currency:'USD'}).length,0);
 assert.equal(bankLinkPeriod(new Date('2026-01-31'),new Date('2026-02-28T01:00Z')).periodEnd.toISOString(),'2026-03-31T00:00:00.000Z');
 const usage:any[]=[];let active:{externalAccountId:string;normalizedPayload?:unknown}[]=[{externalAccountId:'a'},{externalAccountId:'b'}];
 const quotaTx:any={user:{findUniqueOrThrow:async()=>({planTier:'pro',createdAt:new Date('2026-01-10'),clerkUserId:'qa'})},storeAccess:{findUnique:async()=>null},billingSubscription:{findUnique:async()=>({approvedAt:new Date('2026-01-10')})},finverseAccountLink:{findMany:async()=>active},bankLinkUsage:{createMany:async({data}:any)=>{for(const d of data)if(!usage.some(u=>u.externalAccountId===d.externalAccountId&&+u.periodStart===+d.periodStart))usage.push(d);},findMany:async({where}:any)=>usage.filter(u=>+u.periodStart===+where.periodStart)}};
 assert.equal((await bankLinkAllowance(quotaTx,'u',new Date('2026-09-25'))).remaining,0);active=[{externalAccountId:'rotated-a',normalizedPayload:{quotaIdentity:'a'}},{externalAccountId:'b'}];
 assert.equal((await bankLinkAllowance(quotaTx,'u',new Date('2026-09-25'))).usedIds.size,2,'active reauthorized IDs retain their original quota identity');active=[];
 assert.equal((await bankLinkAllowance(quotaTx,'u',new Date('2026-09-26'))).remaining,0);
 assert.equal((await bankLinkAllowance(quotaTx,'u',new Date('2026-10-10'))).remaining,2);
 const fixture=`
let accounts=[],links=[],records=[],transactions=[],used=new Set(),creates=0,tail=Promise.resolve();
export function reset(){accounts=[{id:'existing',workspaceId:'w',name:'My Metrobank',institution:'Metrobank',accountNumber:'0012345678901',currency:'PHP',type:'bank',source:'manual',balance:'73000',finverseAccountLink:null}];links=[];records=[];transactions=[];used=new Set();creates=0;}
export function seed(){transactions.push({id:'t'+transactions.length,accountId:'existing',workspaceId:'w',createdAt:new Date(0),currency:'PHP',type:'expense',amount:100,date:new Date('2026-09-24'),merchantRaw:'Coffee store',reviewStatus:'confirmed',categoryId:'user-category'});}
export function state(){return {accounts,links,records,transactions,used:[...used],creates};}
export function reserve(){used.add('bank-b');} export function disconnect(){links.forEach(l=>l.unlinkedAt=new Date());}
export function remove(){transactions=[];records.forEach(r=>r.transactionId=null);}
export const bankLinkAllowance=async()=>({usedIds:used,remaining:Math.max(0,2-used.size),periodStart:new Date('2026-09-01'),periodEnd:new Date('2026-10-01')});
export const refreshProAccess=async()=> 'pro';
export class PlanQuotaError extends Error {}
export const getEffectiveUserLimits=()=>({accountLimit:10});export const countNonCashAccounts=r=>r.length;
export const requireAuth=async()=>({userId:'u'});export const assertWorkspaceAccess=async(u,w)=>{if(w!=='w')throw Error('WORKSPACE_NOT_FOUND');return {userId:'u',id:'w'};};export const getActiveFinverseToken=async()=>'token';export const getMobileRequestContext=()=>null;
const tx={$executeRaw:async()=>0,workspace:{findUniqueOrThrow:async()=>({id:'w',userId:'u',user:{planTier:'pro'}})},finverseConnection:{findUniqueOrThrow:async()=>({status:'ready'}),update:async()=>({})},
account:{findMany:async()=>accounts.map(a=>({...a,finverseAccountLink:links.find(l=>l.accountId===a.id)||null})),create:async({data})=>{creates++;const a={id:'a'+creates,...data};accounts.push(a);return a;},update:async({where,data})=>Object.assign(accounts.find(a=>a.id===where.id),data)},
bankLinkUsage:{createMany:async({data})=>data.forEach(d=>used.add(d.externalAccountId))},
finverseAccountLink:{count:async({where})=>links.filter(l=>l.id!==where.id.not&&!l.unlinkedAt&&l.accountId).length,findFirst:async({where})=>links.find(l=>(!where.connectionId||l.connectionId===where.connectionId)&&(typeof where.accountId!=='string'||l.accountId===where.accountId)&&(!where.externalAccountId||l.externalAccountId===where.externalAccountId)&&(!('unlinkedAt' in where)||l.unlinkedAt===null)),update:async({where,data})=>Object.assign(links.find(l=>l.id===where.id),data),create:async({data})=>{const l={id:'l'+links.length,connection:{id:data.connectionId},...data};links.push(l);return l;}},
transaction:{findMany:async({where})=>transactions.filter(t=>t.accountId===where.accountId&&t.currency===where.currency&&t.type===where.type&&Number(t.amount)===where.amount&&t.date>=where.date.gte&&t.date<where.date.lt&&!where.id?.notIn?.includes(t.id)&&!records.some(r=>r.transactionId===t.id&&r.connectionId===where.OR?.[1]?.finverseTransactionRecord?.connectionId?.not)).map(t=>({...t,finverseTransactionRecord:records.find(r=>r.transactionId===t.id)||null})),create:async({data})=>{const t={id:'new'+transactions.length,createdAt:new Date(),...data};transactions.push(t);return t;}},
finverseTransactionRecord:{findFirst:async({where})=>records.find(r=>r.externalTransactionId===where.externalTransactionId&&r.externalAccountId===where.externalAccountId),update:async({where,data})=>Object.assign(records.find(r=>r.id===where.id),data),create:async({data})=>{const r={id:'r'+records.length,...data};records.push(r);return r;}}};
export const prisma={...tx,$transaction:fn=>{const result=tail.then(()=>fn(tx));tail=result.catch(()=>{});return result;}};
`;
 const output=await build({stdin:{contents:`export {importAccount,importTransaction} from './app/api/integrations/finverse/sync/route';export {POST as unlink} from './app/api/integrations/finverse/unlink/route';export {reset,seed,state,reserve,disconnect,remove} from 'fixture';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',packages:'external',write:false,plugins:[{name:'fixture',setup(b){b.onLoad({filter:/integrations\/finverse\/sync\/route\.ts$/},a=>({contents:readFileSync(a.path,'utf8')+'\nexport {importAccount,importTransaction};',loader:'ts'}));b.onResolve({filter:/^(fixture|@\/lib\/(prisma|auth|pro-access|workspace-access|plan-quota|bank-link-usage|user-limits|account-limit-count|mobile-request-context|finverse-access-token))$/},()=>({path:'fixture',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:fixture,loader:'ts',resolveDir:process.cwd()}));}}]});
 const require=createRequire(resolve('package.json'));const Module=require('node:module');const mod=new Module(resolve('preservation-test.cjs'));mod.filename=resolve('preservation-test.cjs');mod.paths=Module._nodeModulePaths(process.cwd());mod._compile(output.outputFiles[0].text,mod.filename);const api=mod.exports;
 const bank={account_id:'bank-a',account_name:'Savings',account_number_full:'0012345678901',account_currency:'PHP',balance:{value:45000}};
 api.reset();assert.equal(await api.importAccount('c1','w',bank,'Metrobank',true),'existing');assert.equal(api.state().creates,0);assert.equal(api.state().accounts[0].balance,'73000');assert.equal(api.state().links[0].normalizedPayload.balance,45000);
 api.reserve();api.disconnect();assert.equal(await api.importAccount('c1','w',bank,'Metrobank'),null);assert.equal(await api.importAccount('c2','w',bank,'Metrobank',true),'existing');await assert.rejects(api.importAccount('c2','w',{...bank,account_id:'bank-c',account_number_full:'9992345678901'},'Metrobank',true),/allowance is full/);
 api.seed();const before=JSON.stringify(api.state().transactions[0]);const payment={transaction_id:'p1',account_id:'bank-a',amount:{value:-100,currency:'PHP'},posted_date:'2026-09-24',description:'Coffee store'};
 assert.equal(await api.importTransaction('c2','w',payment),'existing');assert.equal(JSON.stringify(api.state().transactions[0]),before);assert.equal(await api.importTransaction('c2','w',payment),'existing');
 const next={...payment,transaction_id:'p2',amount:{value:-200,currency:'PHP'}};assert.deepEqual(await Promise.all([api.importTransaction('c2','w',next),api.importTransaction('c2','w',next)]),['created','existing']);
 assert.equal(await api.importTransaction('c2','w',{...payment,transaction_id:'pending',is_pending:true}),'skipped');api.remove();assert.equal(await api.importTransaction('c2','w',payment),'existing');
 api.reset();api.seed();api.seed();await api.importAccount('c1','w',bank,'Metrobank',true);assert.equal(await api.importTransaction('c1','w',payment),'existing');assert.equal(await api.importTransaction('c1','w',{...payment,transaction_id:'p2'}),'existing');assert.equal(await api.importTransaction('c1','w',{...payment,transaction_id:'p3'}),'created');
 api.reset();api.seed();await api.importAccount('c1','w',bank,'Metrobank',true);assert.equal(await api.importTransaction('c1','w',{...payment,description:'Different bank text'}),'created');assert.equal(api.state().transactions[1].isExcluded,true,'uncertain overlap must not inflate totals before review');
 api.reset();api.seed();api.seed();await api.importAccount('c1','w',bank,'Metrobank',true);
 await api.importTransaction('c1','w',payment);await api.importTransaction('c1','w',{...payment,transaction_id:'p2'});
 const confirmedHistory=JSON.stringify(api.state().transactions);const originalRecords=JSON.stringify(api.state().records);
 api.reserve();api.disconnect();const rotated={...bank,account_id:'rotated-bank-a'};
 assert.equal(await api.importAccount('c3','w',rotated,'Metrobank',true),'existing');
 assert.deepEqual(api.state().used,['bank-a','bank-b'],'reconnecting a rotated ID must not consume a new slot');
 assert.equal(api.state().links.length,1);assert.equal(api.state().links[0].normalizedPayload.quotaIdentity,'bank-a');
 const claimed=new Set<string>();
 for(const id of ['rotated-p1','rotated-p2']) assert.equal(await api.importTransaction('c3','w',{...payment,account_id:rotated.account_id,transaction_id:id},claimed),'existing');
 assert.equal(JSON.stringify(api.state().transactions),confirmedHistory,'confirmed ledger rows remain unchanged');
 assert.equal(JSON.stringify(api.state().records.slice(0,2)),originalRecords,'original provider audit records remain intact');
 assert.equal(api.state().records[2].normalizedPayload.reconciledTransactionId,'t0');
 assert.equal(api.state().records[3].normalizedPayload.reconciledTransactionId,'t1');
 const replay=new Set<string>();
 for(const id of ['rotated-p1','rotated-p2']) assert.equal(await api.importTransaction('c3','w',{...payment,account_id:rotated.account_id,transaction_id:id},replay),'existing');
 assert.equal(replay.size,2);assert.equal(api.state().transactions.length,2);
 const previousFetch=globalThis.fetch;let revokes=0;globalThis.fetch=(async(url,init)=>{assert.equal(String(url),'https://api.prod.finverse.net/login_identity');assert.equal(init?.method,'DELETE');revokes++;return new Response('{}');}) as typeof fetch;
 try {api.reset();await api.importAccount('c1','w',bank,'Metrobank',true);api.seed();const history=JSON.stringify(api.state().transactions);const request=(workspaceId:string)=>new Request('https://clover.test/unlink',{method:'POST',body:JSON.stringify({workspaceId,accountId:'existing'})});assert.equal((await api.unlink(request('other'))).status,404);assert.equal((await api.unlink(request('w'))).status,200);assert.equal(revokes,1);assert.equal(api.state().accounts.length,1);assert.equal(JSON.stringify(api.state().transactions),history);assert(api.state().used.includes('bank-a'));assert(api.state().links[0].unlinkedAt);assert.equal((await api.unlink(request('w'))).status,200);assert.equal(revokes,1,'unlink retry is idempotent');} finally {globalThis.fetch=previousFetch;}
 console.log('Finverse preservation: account reuse, snapshots, confirmed edits, duplicate retries, concurrent sync, tombstones, pending entries, repeated same-amount payments, masked numbers, and monthly retention passed.');
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
