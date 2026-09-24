import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const requireFixture = createRequire(resolve("package.json"));
async function main() {
  const fixture = `
let claimed=false, exchanges=0, created=0, bankCalls=0, planTier='pro';
export function setPlan(value){planTier=value;}
export const getProAccess=async()=>({planTier});
export function reset(){claimed=false;exchanges=0;created=0;bankCalls=0;}
export function stats(){return {exchanges,created,bankCalls};}
export const requireAuth=async()=>({userId:'owner'});
export const assertWorkspaceAccess=async(user,id)=>{if(id!=='profile')throw Error('WORKSPACE_NOT_FOUND');return {id,userId:user};};
export class PlanQuotaError extends Error {}
export const assertPlanQuota=async()=>{};
export const getMobileRequestContext=()=>({userId:'owner'});
export const isFinverseEnabled=()=>true;
export const getFinverseConfig=()=>({redirectUri:'https://staging.clover.ph/api/integrations/finverse/callback',encryptionKey:'test'});
export const getFinverseBanks=async()=>{bankCalls++;return {banks:[{id:'bank',name:'Test bank'}],mode:'test'};};
export const createFinverseLink=async()=>({link_url:'https://link.finverse.com/test'});
export const hashFinverseState=s=>s;
export const encryptFinverseToken=()=> 'encrypted';
export const exchangeFinverseCode=async()=>{exchanges++;return {login_identity_id:'identity',access_token:'secret',refresh_token:'secret',expires_in:3600};};
export const prisma={$transaction:async f=>f({}),finverseConnection:{
 create:async({data})=>{created++;return{id:'connection'};},
 findUnique:async({where})=>where.stateHash==='native.valid'?{id:'connection',workspaceId:'profile',stateExpiresAt:new Date(Date.now()+60000),status:claimed?'authorizing':'link_pending'}:null,
 updateMany:async()=>{if(claimed)return{count:0};claimed=true;return{count:1};},
 update:async()=>({})
}};
`;
  const bundled = await build({ stdin: { contents: `export {GET as institutions} from './app/api/integrations/finverse/institutions/route'; export {POST as link} from './app/api/integrations/finverse/link/route'; export {GET as callback} from './app/api/integrations/finverse/callback/route'; export {reset,stats,setPlan} from 'fixture';`, resolveDir: process.cwd() }, bundle: true, platform: "node", format: "cjs", packages: "external", write: false, plugins: [{ name: "finverse-boundaries", setup(b) { b.onResolve({filter:/^(fixture|@\/lib\/(auth|workspace-access|finverse|prisma|plan-quota|pro-access|mobile-request-context))$/},()=>({path:"fixture",namespace:"test"})); b.onLoad({filter:/.*/,namespace:"test"},()=>({contents:fixture,loader:"ts",resolveDir:process.cwd()})); }}] });
  const Module = requireFixture("node:module"), mod = new Module(resolve("finverse-test.cjs")); mod.filename=resolve("finverse-test.cjs");mod.paths=Module._nodeModulePaths(process.cwd());mod._compile(bundled.outputFiles[0].text,mod.filename);
  const api=mod.exports;
  assert.equal((await api.institutions(new Request('https://clover.test/api?workspaceId=other'))).status,404);
  assert.deepEqual(await (await api.institutions(new Request('https://clover.test/api?workspaceId=profile'))).json(),{banks:[{id:'bank',name:'Test bank'}],mode:'test',available:true});
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
  console.log('Finverse routes: workspace isolation, bank validation, fixed native redirect, cancellation and concurrent replay protection passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
