import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {bankWarningStage,bankDisconnectDeadline,inactivityDeadline,retainedBankLinks} from '../../shared/finverse-lifecycle';
async function main(){
 const now=new Date('2026-09-25T00:00:00Z');
 assert.equal(inactivityDeadline(now,now).toISOString(),'2026-12-24T00:00:00.000Z');
 assert.equal(bankWarningStage(new Date(+now+15*864e5),now),null);
 assert.equal(bankWarningStage(new Date(+now+14*864e5),now),14);
 assert.equal(bankWarningStage(new Date(+now+3*864e5),now),3);
 assert.equal(+bankDisconnectDeadline(new Date(0),new Date(0),now,null),+now+14*864e5);
 assert.equal(+bankDisconnectDeadline(new Date(0),new Date(0),new Date(0),now),+now+14*864e5);
 const links=[{id:'a',retainOnDowngrade:false,lastSeenAt:new Date(3)},{id:'b',retainOnDowngrade:true,lastSeenAt:new Date(1)},{id:'c',retainOnDowngrade:false,lastSeenAt:new Date(2)}];
 assert.deepEqual(retainedBankLinks(links,2).map(l=>l.id),['b','a']);assert.equal(retainedBankLinks(links,0).length,0);assert.equal(retainedBankLinks(links,5).length,3);
 const fixture=`
let calls=0,fail=false;let connection,links;let tier='pro',queued=[];
export function allowanceFixture(value,items){tier=value;links=items;queued=[];}
export const queuedIds=()=>queued;
export function reset(){calls=0;fail=false;connection={id:'c',userId:'u',status:'disconnect_pending',disconnectRequestedAt:new Date(),disconnectAttempts:0,encryptedAccessToken:'encrypted',encryptedRefreshToken:'encrypted-refresh',loginIdentityId:'identity'};links=[{accountId:'a',unlinkedAt:null}];}
export const setFailure=v=>fail=v;
export const state=()=>({calls,connection,links});
export const getActiveFinverseToken=async()=> 'token';
export const unlinkFinverseIdentity=async()=>{calls++;if(fail)throw Error('provider unavailable');};
export const refreshProAccess=async()=> 'pro';export const getProAccess=async()=>({planTier:'pro'});
export const hasUnlimitedPlanLimits=()=>false;export const bankLinkAllowance=async()=>({});
const tx={$executeRaw:async()=>0,user:{findUniqueOrThrow:async()=>({planTier:tier})},finverseConnection:{findUniqueOrThrow:async()=>connection,updateMany:async({where})=>{queued=where.userId?['all']:where.id.in;},update:async({data})=>Object.assign(connection,data)},finverseAccountLink:{findMany:async()=>links,updateMany:async({data})=>links.forEach(l=>Object.assign(l,data))}};
export const prisma={$transaction:async(fn)=>fn(tx)};
`;
 const output=await build({stdin:{contents:`export {revokeBankConnection,enforceBankAllowance} from './lib/finverse-lifecycle';export {reset,state,setFailure,allowanceFixture,queuedIds} from 'fixture';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',packages:'external',write:false,plugins:[{name:'lifecycle-fixture',setup(b){b.onResolve({filter:/^(fixture|\.\/(prisma|pro-access|user-limits|finverse-access-token|finverse|bank-link-usage))$/},()=>({path:'fixture',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:fixture,loader:'ts'}));}}]});
 const require=createRequire(resolve('package.json')),Module=require('node:module'),mod=new Module(resolve('lifecycle-test.cjs'));mod.filename=resolve('lifecycle-test.cjs');mod.paths=Module._nodeModulePaths(process.cwd());mod._compile(output.outputFiles[0].text,mod.filename);const api=mod.exports;
 api.reset();api.setFailure(true);assert.equal(await api.revokeBankConnection('c'),false);let s=api.state();assert.equal(s.connection.status,'disconnect_pending');assert.equal(s.connection.encryptedRefreshToken,'encrypted-refresh');assert.equal(s.links[0].unlinkedAt,null);assert.equal(s.connection.disconnectAttempts,1);assert(s.connection.disconnectRetryAt>new Date());
 api.setFailure(false);assert.equal(await api.revokeBankConnection('c'),true);s=api.state();assert.equal(s.connection.status,'disconnected');assert.equal(s.connection.encryptedAccessToken,null);assert.equal(s.connection.encryptedRefreshToken,null);assert(s.links[0].unlinkedAt);assert.equal(s.links[0].accountId,'a');assert.equal(s.calls,2);assert.equal(await api.revokeBankConnection('c'),true);assert.equal(api.state().calls,2);

 const accounts=links.map((l,i)=>({...l,connectionId:'c'+i,createdAt:new Date(0),connection:{lastSyncedAt:l.lastSeenAt}}));
 api.allowanceFixture('pro',accounts);await api.enforceBankAllowance('u','pro');assert.deepEqual(api.queuedIds(),['c2'],'Plus keeps the selected account and newest successful sync');
 api.allowanceFixture('premium',accounts);await api.enforceBankAllowance('u','premium');assert.deepEqual(api.queuedIds(),[],'Pro retains accounts within its five-link allowance');
 api.allowanceFixture('free',accounts);await api.enforceBankAllowance('u','free');assert.deepEqual(api.queuedIds(),['all'],'Free queues all authorized identities, including identities without account cards');
 const shared=accounts.map(l=>({...l,connectionId:'shared'}));api.allowanceFixture('pro',shared);await api.enforceBankAllowance('u','pro');assert.deepEqual(api.queuedIds(),['shared'],'a shared login with excess child accounts is revoked once');
 console.log('Finverse lifecycle: warning boundaries, migration grace, provider-failure grace, retention order, Free/Plus/Pro selection, failed revocation retry, token retention, successful revocation, history preservation and idempotence passed.');
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
