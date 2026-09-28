import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

async function main() {
  const fixture = `
let connection, linked=false, revokes=0, requested=0;
export function reset(hasLinks=false){linked=hasLinks;revokes=0;requested=0;connection={id:'attempt',status:'error',disconnectRequestedAt:null};}
export const state=()=>({connection,revokes,requested});
export const requireAuth=async()=>({userId:'clerk-owner'});
export const assertWorkspaceAccess=async(user,id)=>{if(user!=='clerk-owner'||id!=='profile')throw Error('WORKSPACE_NOT_FOUND');return {userId:'db-owner'};};
export const requestBankDisconnect=async(id,reason,lastSync,requireEmpty)=>{requested++;if(id!=='attempt'||requireEmpty!==true)throw Error('unsafe cancellation');if(!linked)Object.assign(connection,{status:'disconnect_pending',disconnectRequestedAt:new Date()});};
export const revokeBankConnection=async()=>{revokes++;connection.status='disconnected';return true;};
export const prisma={finverseConnection:{findFirst:async({where})=>{if(where.workspaceId!=='profile'||where.userId!=='db-owner')throw Error('unsafe scope');return where.id==='attempt'?connection:null;},findUniqueOrThrow:async()=>connection}};
export const bankLinkAllowance=async()=>{throw Error('cancelling must not reserve slots');};
export const getActiveFinverseToken=async()=>{};export const unlinkFinverseIdentity=async()=>{};
`;
  const output = await build({ stdin: {contents: `export {POST} from './app/api/integrations/finverse/unlink/route'; export {reset,state} from 'fixture';`,resolveDir:process.cwd()}, bundle:true,platform:'node',format:'cjs',packages:'external',write:false,plugins:[{name:'cancel-fixture',setup(b){b.onResolve({filter:/^(fixture|@\/lib\/(auth|workspace-access|prisma|finverse-lifecycle|bank-link-usage|finverse-access-token|finverse))$/},()=>({path:'fixture',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:fixture,loader:'ts'}));}}] });
  const require = createRequire(resolve('package.json')), Module=require('node:module'), mod=new Module(resolve('cancel-test.cjs'));
  mod.filename=resolve('cancel-test.cjs');mod.paths=Module._nodeModulePaths(process.cwd());mod._compile(output.outputFiles[0].text,mod.filename);
  const api=mod.exports;
  const cancel=(body:object)=>api.POST(new Request('https://clover.test/unlink',{method:'POST',body:JSON.stringify(body)}));
  api.reset();
  assert.equal((await cancel({workspaceId:'other',connectionId:'attempt'})).status,404);
  assert.equal((await cancel({workspaceId:'profile',connectionId:'foreign'})).status,404);
  assert.equal((await cancel({workspaceId:'profile',connectionId:'attempt',accountId:'account'})).status,400);
  assert.equal(api.state().requested,0);
  const response=await cancel({workspaceId:'profile',connectionId:'attempt'});
  assert.equal(response.status,200);assert.equal((await response.json()).status,'cancelled');assert.equal(api.state().revokes,1);
  api.reset(true);
  assert.equal((await cancel({workspaceId:'profile',connectionId:'attempt'})).status,409);
  assert.equal(api.state().revokes,0,'A concurrent account link must prevent setup cancellation');
  assert.equal(api.state().connection.status,'error');
  console.log('Bank setup cancellation: workspace isolation, exclusive target, empty setup revocation and linked-account race protection passed.');
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
