import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const requireFixture = createRequire(resolve("package.json"));
async function main() {
  const fixture = `
let claimed=false, exchanges=0, created=0, bankCalls=0, refreshCalls=0, updates=[], planTier='pro';
export function setPlan(value){planTier=value;}
export const getAccountBrand=()=>({logoSrc:null,fallbackIconSrc:"/assets/account-types/bank.png"});
export const enforceBankAllowance=async()=>{};
export const bankLifecycleOverview=async()=>({limit:2,connections:[]});
export const hasUnlimitedPlanLimits=()=>false;
export const getProAccess=async()=>({planTier});
export const refreshProAccess=async()=>planTier;
export function reset(){claimed=false;exchanges=0;created=0;bankCalls=0;refreshCalls=0;updates=[];}
export function stats(){return {exchanges,created,bankCalls,refreshCalls,updates};}
export const requireAuth=async()=>({userId:'owner'});
export const requireAdminAuth=async()=>{if(planTier==='free')throw Error('FORBIDDEN');return {userId:'owner'};};
export const getFinverseInstitutionCatalog=async()=>({mode:'live',institutions:[{id:'bpi',name:'BPI',countries:['PHL'],status:'BETA',products:['ACCOUNTS'],tags:['real'],shownInClover:false,excludedReasons:['Provider status: BETA']}]});
export const assertWorkspaceAccess=async(user,id)=>{if(id!=='profile')throw Error('WORKSPACE_NOT_FOUND');return {id,userId:user};};
export class PlanQuotaError extends Error {}
export const assertPlanQuota=async()=>{};
export const getActiveFinverseToken=async()=>"access";
export const bankLinkAllowance=async()=>({usedIds:new Set(),remaining:5});
export const getFinverseAccountNumber=async()=>null;
export const getMobileRequestContext=()=>({userId:'owner'});
export const isFinverseEnabled=()=>true;
export const getFinverseConfig=()=>({redirectUri:'https://staging.clover.ph/api/integrations/finverse/callback',encryptionKey:'test'});
export const getFinverseBanks=async()=>{bankCalls++;return {banks:[{id:'bank',name:'Test bank',countries:['PHL']}],mode:'test'};};
export const createFinverseRefresh=async()=>{refreshCalls++;return {link_url:'https://link.finverse.com/refresh'};};
export const decryptFinverseToken=()=> 'access';
export const getFinverseLoginIdentity=async()=>({login_identity:{status:'DATA_RETRIEVAL_IN_PROGRESS',refresh:{refresh_allowed:true}}});
export const isFinverseDataReady=()=>false;
export const getAllFinverseTransactions=async()=>[];
export const getFinverseAccounts=async()=>({accounts:[]});
export const normalizeFinverseAccount=()=>({});
export const normalizeFinverseTransaction=()=>null;
export const refreshFinverseToken=async()=>({});
export const getEffectiveUserLimits=()=>({accountLimit:10});
export const countNonCashAccounts=()=>0;
export const createFinverseLink=async()=>({link_url:'https://link.finverse.com/test'});
export const hashFinverseState=s=>s;
export const encryptFinverseToken=()=> 'encrypted';
export const exchangeFinverseCode=async()=>{exchanges++;return {login_identity_id:'identity',access_token:'secret',refresh_token:'secret',expires_in:3600};};
export const prisma={user:{findUniqueOrThrow:async()=>({planTier})},$transaction:async f=>f({}),finverseConnection:{
 findUniqueOrThrow:async()=>({status:"ready"}),
 findFirst:async({where})=>{if(where.workspaceId!=='profile'||where.user.clerkUserId!=='owner'||where.status.not!=='disconnected')throw Error('unsafe scope');return {id:'connection',userId:'owner',loginIdentityId:'identity',encryptedAccessToken:'cipher',accessTokenExpiresAt:new Date(Date.now()+3600000)};},
 findMany:async({where,select})=>{if(where.workspaceId!=='profile'||where.user.clerkUserId!=='owner')throw Error('unsafe scope');return [{id:'pending',status:'awaiting_selection',institutionName:'Test bank',lastSyncedAt:null,accountLinks:[]},{id:'linked',status:'ready',institutionName:'Test bank',lastSyncedAt:'2026-09-24T00:00:00Z',accountLinks:[{account:{id:'account',name:'Savings',institution:'Test bank',accountNumber:'1234567890',type:'bank'}}]}];},
 create:async({data})=>{created++;return{id:'connection'};},
 findUnique:async({where})=>['native.valid','native.refresh.valid'].includes(where.stateHash)?{id:'connection',workspaceId:'profile',stateExpiresAt:new Date(Date.now()+60000),status:claimed?'authorizing':'link_pending'}:null,
 updateMany:async({where,data})=>{if(where.status && typeof where.status === "object"){updates.push(data);return{count:1};}if(claimed)return{count:0};claimed=true;return{count:1};},
 update:async({data})=>{updates.push(data);return{};}
}};
`;
  const bundled = await build({ stdin: { contents: `export {GET as catalog} from './app/api/admin/finverse/catalog/route'; export {POST as sync} from './app/api/integrations/finverse/sync/route'; export {GET as connections} from './app/api/integrations/finverse/connections/route'; export {GET as institutions} from './app/api/integrations/finverse/institutions/route'; export {POST as link} from './app/api/integrations/finverse/link/route'; export {GET as callback} from './app/api/integrations/finverse/callback/route'; export {reset,stats,setPlan} from 'fixture';`, resolveDir: process.cwd() }, bundle: true, platform: "node", format: "cjs", packages: "external", write: false, plugins: [{ name: "finverse-boundaries", setup(b) { b.onResolve({filter:/^(fixture|@\/lib\/(admin|auth|finverse-access-token|bank-link-usage|user-limits|account-limit-count|account-brand|finverse-lifecycle|workspace-access|finverse|prisma|plan-quota|pro-access|mobile-request-context))$/},()=>({path:"fixture",namespace:"test"})); b.onLoad({filter:/.*/,namespace:"test"},()=>({contents:fixture,loader:"ts",resolveDir:process.cwd()})); }}] });
  const Module = requireFixture("node:module"), mod = new Module(resolve("finverse-test.cjs")); mod.filename=resolve("finverse-test.cjs");mod.paths=Module._nodeModulePaths(process.cwd());mod._compile(bundled.outputFiles[0].text,mod.filename);
  const api=mod.exports;
  api.setPlan('free');
  assert.equal((await api.catalog(new Request('https://clover.test/catalog'))).status,403);
  api.setPlan('pro');
  const catalog=await api.catalog(new Request('https://clover.test/catalog'));
  assert.equal(catalog.headers.get('cache-control'),'private, no-store');
  const catalogue=await catalog.json(); assert.equal(catalogue.total,1);
  assert.equal(catalogue.institutions[0].shownInClover,false);
  assert.deepEqual(catalogue.institutions[0].countryNames,['Philippines']);
  const csv=await api.catalog(new Request('https://clover.test/catalog?format=csv'));
  assert(csv.headers.get('content-disposition').includes('finverse-institutions.csv'));
  assert((await csv.text()).includes('BETA'));

  assert.equal((await api.connections(new Request('https://clover.test/api?workspaceId=other'))).status,404);
  const connections=await api.connections(new Request('https://clover.test/api?workspaceId=profile'));
  assert.equal(connections.headers.get('cache-control'),'private, no-store');
  const linkedData=await connections.json();
  assert.deepEqual(linkedData.pending,[{id:'pending',name:'Test bank'}]);
  assert.equal(linkedData.accounts[0].last4,'7890');
  assert.equal(linkedData.accounts[0].lastSyncedAt,'2026-09-24T00:00:00Z');
  assert(!JSON.stringify(linkedData).includes('1234567890'));

  assert.equal((await api.institutions(new Request('https://clover.test/api?workspaceId=other'))).status,404);
  assert.deepEqual(await (await api.institutions(new Request('https://clover.test/api?workspaceId=profile'))).json(),{banks:[{id:'bank',name:'Test bank',countries:['PHL'],accountTypes:{},logoUrl:'/assets/account-types/bank.png',logoUrls:{PHL:'/assets/account-types/bank.png'}}],mode:'test',available:true});
  const link=(body:object)=>api.link(new Request('https://clover.test/link',{method:'POST',body:JSON.stringify(body)}));
  api.reset(); api.setPlan('free');
  const freeList = await api.institutions(new Request('https://clover.test/api?workspaceId=profile'));
  assert.equal(freeList.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await freeList.json(), {banks:[],available:false,upgradeRequired:true});
  const freeLink = await link({workspaceId:'profile',institutionId:'bank'});
  assert.equal(freeLink.status,403);
  assert.equal((await freeLink.json()).upgradeRequired,true);
  assert.equal(api.stats().bankCalls,0,'Free users must not retrieve Finverse banks');
  assert.equal(api.stats().created,0,'Free users must not create connections');
  for (const tier of ['plus','pro']) {
    api.setPlan(tier);
    const paidList=await api.institutions(new Request('https://clover.test/api?workspaceId=profile'));
    assert.equal((await paidList.json()).available,true);
    assert.equal((await link({workspaceId:'profile',institutionId:'bank'})).status,200);
  }
  api.reset();
  assert.equal((await link({workspaceId:'profile',institutionId:'unknown'})).status,400);
  assert.equal((await link({workspaceId:'profile',institutionId:'bank',returnUrl:'https://evil.test'})).status,400);
  assert.equal((await link({workspaceId:'other',institutionId:'bank'})).status,404);
  assert.equal(api.stats().created,0);
  assert.equal((await link({workspaceId:'profile',institutionId:'bank'})).status,200);
  const sync=(body:object)=>api.sync(new Request('https://clover.test/sync',{method:'POST',body:JSON.stringify(body)}));
  api.reset();api.setPlan('free');
  assert.equal((await sync({workspaceId:'profile',connectionId:'connection',refresh:true})).status,403);
  assert.equal(api.stats().refreshCalls,0);
  api.setPlan('pro');
  assert.equal((await sync({workspaceId:'other',connectionId:'connection',refresh:true})).status,404);
  const refreshResponse=await sync({workspaceId:'profile',connectionId:'connection',refresh:true});
  assert.equal((await refreshResponse.json()).status,'authorize');
  assert.equal(api.stats().refreshCalls,1);
  assert(api.stats().updates.every((data:Record<string,unknown>)=>!('lastSyncedAt' in data)),'Starting refresh must not update Last Synced');
  const polling=await sync({workspaceId:'profile',connectionId:'connection'});
  assert.equal((await polling.json()).status,'retrieving');
  assert.equal(api.stats().refreshCalls,1,'Polling must not start another provider refresh');
  assert(api.stats().updates.every((data:Record<string,unknown>)=>!('lastSyncedAt' in data)));
  const callback=(state:string,code='code')=>api.callback(new Request(`https://clover.test/callback?state=${state}&code=${code}`));
  api.reset();
  const responses=await Promise.all([callback('native.valid'),callback('native.valid')]);
  assert.equal(api.stats().exchanges,1);
  assert.equal(responses.filter((r:Response)=>r.headers.get('location')?.startsWith('clover://accounts')).length,1);
  const success=responses.find((r:Response)=>r.headers.get('location')?.startsWith('clover://accounts'));
  assert(!success.headers.get('location').includes('secret'));
  assert(success.headers.get('location').includes('finverseWorkspace=profile'));
  api.reset(); const cancelled=await callback('native.valid',''); assert.equal(api.stats().exchanges,0);assert(cancelled.headers.get('location')?.includes('finverse=cancelled'));
  api.reset();const invalid=await callback('native.invalid');assert.equal(api.stats().exchanges,0);assert(invalid.headers.get('location')?.startsWith('https://staging.clover.ph/accounts'));
  api.reset();
  const refreshed = await callback('native.refresh.valid','');
  assert(refreshed.headers.get('location')?.includes('finverse=connected'));
  assert.equal(api.stats().exchanges,0,'Refresh retains existing credentials');
  const refreshReplay = await callback('native.refresh.valid','');
  assert(refreshReplay.headers.get('location')?.includes('invalid_callback'));
  api.reset();
  const refreshError = await api.callback(new Request('https://clover.test/callback?state=native.refresh.valid&error=login_cancelled'));
  assert(refreshError.headers.get('location')?.includes('finverse=error'));
  console.log('Finverse routes: workspace isolation, bank validation, fixed native redirect, cancellation and concurrent replay protection passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
