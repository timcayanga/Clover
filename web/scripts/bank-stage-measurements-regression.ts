import assert from 'node:assert/strict';
import { bankStageMeasurements,bankClientDuration,bankElapsed,bankHalfVisible,type BankPhaseObservation } from '../../shared/bank-stage-measurements';
import { runBankHostedSession } from '../../shared/bank-hosted-session';
import { observeBankVisibility } from '../lib/bank-client-visibility';
async function main(){
 assert.equal(bankClientDuration(Infinity),undefined);assert.equal(bankClientDuration(-1),undefined);assert.equal(bankElapsed(undefined,3),undefined);assert.equal(bankElapsed(8,3),undefined);
 assert(bankHalfVisible({x:-50,y:0,width:100,height:100},{width:100,height:100}));assert(!bankHalfVisible({x:-51,y:0,width:100,height:100},{width:100,height:100}));assert(!bankHalfVisible({x:0,y:0,width:0,height:0},{width:100,height:100}));
 const event=(attemptId:string,stage:string,ms:number,extra:Partial<BankPhaseObservation>={}):BankPhaseObservation=>({attemptId,stage,outcome:'succeeded',observedAt:new Date(ms).toISOString(),...extra});
 const rows=bankStageMeasurements([
 event('a','finverse_open',0,{outcome:'started'}),event('a','authorization_return',3000),event('a','account_list_ready',3500),event('a','account_list_displayed',4000,{durationMs:80,requestToVisibleMs:900,timingBoundary:'client_payload_to_visible'}),
 event('a','account_selection_submitted',9000,{durationMs:5000,timingBoundary:'client_visible_list_to_submit'}),event('a','account_selection',10000),event('a','data_available',11000),event('a','first_data_displayed',12000,{durationMs:70,requestToVisibleMs:3000,timingBoundary:'client_payload_to_visible'}),
 event('b','authorization_return',1),event('legacy','first_data_displayed',13000,{timingBoundary:'legacy_display_ack'}),event('other','data_available',0),
 ]);
 const row=(key:string)=>rows.find(r=>r.key===key)!;
 assert.equal(row('hosted_flow').p50Ms,3000);assert.equal(row('hosted_flow').missingStartOrDuration,1);assert.equal(row('list_render').p50Ms,80);assert.equal(row('list_request_to_visible').p50Ms,900);assert.equal(row('selection_decision').p50Ms,5000);assert.equal(row('selection_mapping').p50Ms,1000);assert.equal(row('save_to_visible').samples,1);assert.equal(row('save_to_visible').missingStartOrDuration,1);assert.equal(row('data_render').samples,1);assert.equal(row('data_render').missingStartOrDuration,1);
 for(const key of ['hosted_page_ready','authentication','mfa']){assert.equal(row(key).availability,'unavailable');assert.equal(row(key).p50Ms,null);}
 const signals:unknown[]=[];let clock=0;const result={type:'success',url:'private://?code=secret'};
 assert.equal(await runBankHostedSession(async()=>{clock=200;return result;},async s=>{signals.push(s);},()=>clock),result);await Promise.resolve();
 assert.deepEqual(signals,[{stage:'finverse_open',outcome:'started'},{stage:'hosted_session_ended',outcome:'succeeded',sessionResult:'returned',durationMs:200}]);assert(!JSON.stringify(signals).includes('secret'));
 const closed:unknown[]=[];await runBankHostedSession(async()=>({type:'cancel'}),async s=>{closed.push(s);throw Error('analytics down');});await Promise.resolve();assert.match(JSON.stringify(closed),/"outcome":"pending"/);
 const launchError=Error('private raw error');const failed:unknown[]=[];await assert.rejects(runBankHostedSession(async()=>{throw launchError;},async s=>{failed.push(s);}),e=>e===launchError);await Promise.resolve();assert(!JSON.stringify(failed).includes('private'));assert.match(JSON.stringify(failed),/launch_failed/);
 // Browser visibility must acknowledge pixels rather than merely mounting a component.
 let visible='hidden',connected=true,left=0,count=0;const listeners=new Map<string,()=>void>();let frame:(()=>void)|undefined;
 Object.assign(globalThis,{document:{get visibilityState(){return visible;},addEventListener:(n:string,f:()=>void)=>listeners.set(n,f),removeEventListener:(n:string)=>listeners.delete(n)},window:{innerWidth:100,innerHeight:100,addEventListener:(n:string,f:()=>void)=>listeners.set(n,f),removeEventListener:(n:string)=>listeners.delete(n)},requestAnimationFrame:(f:()=>void)=>{frame=f;return 1;},cancelAnimationFrame:()=>{frame=undefined;}});
 const node={get isConnected(){return connected;},getBoundingClientRect:()=>({left,top:0,width:100,height:100})} as HTMLElement;
 const stop=observeBankVisibility(node,async()=>{count++;return true;});frame?.();assert.equal(count,0);visible='visible';left=-51;listeners.get('scroll')?.();assert.equal(count,0);left=0;connected=false;listeners.get('resize')?.();assert.equal(count,0);connected=true;listeners.get('visibilitychange')?.();listeners.get('scroll')?.();assert.equal(count,1);await new Promise(r=>setTimeout(r,0));listeners.get('scroll')?.();assert.equal(count,1);stop();assert.equal(listeners.size,0);
 console.log('PASS separate phase boundaries, missing timing coverage, attempt isolation, hosted-session privacy and browser visibility acknowledgements');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
