import assert from 'node:assert/strict';
import {bankFailure,bankProductEvidence,bankProviderStage,safeProviderCode} from '../../shared/bank-journey-monitor';
import {bankJourneyReport,type BankObservation} from '../../shared/bank-journey-report';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
async function main(){
 assert.deepEqual(bankFailure({status:422,message:'private password 654321'}),{error_code:'HTTP_422',failure_category:'provider_rejected',http_status:422});
 assert.equal(safeProviderCode({error_code:'credentials for user@email.com'}),undefined);
 assert.equal(bankFailure({providerCode:'MFA_FAILED'}).failure_category,'credentials_or_mfa');
 assert.equal(bankFailure({name:'AbortError'}).failure_category,'provider_timeout');
 assert.equal(bankProviderStage('/transactions?offset=500&token=secret'),'transaction_page');
 assert.equal(bankProviderStage('/unknown?token=secret'),null);
 const products=bankProductEvidence({product_status:{accounts:{status:'SUCCESS'},online_transactions:{status:'SUCCESS'},statements:{status:'ERROR',error_code:'NOT_SUPPORTED'}}});
 assert.equal(products[0].outcome,'succeeded');assert.equal(products[2].stage,'product_statements');assert.equal(products[2].outcome,'failed');
 const c={id:'a',bankId:'bank-a',bankName:'Bank A',status:'error',createdAt:'2026-11-01T00:00:00Z',lastSyncedAt:null,mappedAccounts:0,providerRecords:0};
 let report=bankJourneyReport([c],[]);assert.equal(report[0].historical.untracedConnections,1);assert.equal(report[0].measured.startedAttempts,0);assert.equal(report[0].stages[0].p50Ms,null);
 const e=(stage:string,outcome:string,t:number,attemptId='a'):BankObservation=>({connectionId:'a',attemptId,stage,outcome,observedAt:new Date(t).toISOString()});
 report=bankJourneyReport([c],[e('data_available','succeeded',1000),e('transaction_fetch','failed',2000)]);assert.equal(report[0].measured.recoveredAttempts,0);
 report=bankJourneyReport([c],[e('transaction_fetch','failed',1000),e('data_available','succeeded',2000),e('transaction_fetch','failed',3000,'refresh'),e('cancelled','cancelled',4000,'refresh')]);assert.equal(report[0].measured.recoveredAttempts,1);assert.equal(report[0].measured.cancelledAttempts,1);assert.equal(report[0].measured.attemptsWithErrors,2);
 const chosen={...c,bankId:'provider-b',bankName:'Provider B',selectedBankId:'bank-a',selectedBankName:'Bank A'};
 report=bankJourneyReport([chosen],[e('bank_selected','succeeded',0),e('link_url_created','succeeded',1000)],1_000_000);
 assert.equal(report[0].bankId,'bank-a');assert.equal(report[0].bankName,'Bank A');assert.equal(report[0].measured.urlReadyWithoutLaunch,1);assert.equal(report[0].measured.attemptsWithErrors,0);
 report=bankJourneyReport([c],[e('bank_selected','succeeded',0)],1_000_000);assert.equal(report[0].measured.stoppedBeforeHandoff,1);
 for(const tail of [e('authorization_return','succeeded',2000),e('callback_ignored','pending',2000),e('link_url_created','failed',2000),e('cancelled','cancelled',2000)]){report=bankJourneyReport([c],[e('bank_selected','succeeded',0),tail],1_000_000);assert.equal(report[0].measured.noReturnAfter15Minutes,0);}
 report=bankJourneyReport([c],[e('bank_selected','succeeded',0)],1000);assert.equal(report[0].measured.noReturnAfter15Minutes,0);
 const fixture=`export const rows=[],events=[],jobs=[];let fail=false;export function broken(){fail=true;}
 let platform='android';export const setPlatform=v=>platform=v;export const headers=async()=>new Headers(platform?{'x-clover-platform':platform,'x-clover-app-version':'1.1.6'}:{'user-agent':'Mozilla/5.0 (iPhone) AppleWebKit Safari/605.1.15'});export const after=job=>jobs.push(job);export const capturePostHogServerEvent=async(...args)=>events.push(args);
 export const auditLog={create:async({data})=>{if(fail)throw Error('offline');const row={...data,id:String(rows.length),createdAt:new Date()};rows.push(row);return row;},findFirst:async({where})=>rows.find(r=>r.entityId===where.entityId&&(typeof where.action==='object'?where.action.in.includes(r.action):r.action===where.action)&&(!where.metadata||r.metadata[where.metadata.path[0]]===where.metadata.equals))??null};
 let tail=Promise.resolve();export const prisma={auditLog,$transaction:fn=>{const p=tail.then(()=>fn({auditLog,$executeRaw:async()=>0}));tail=p.catch(()=>{});return p;}};
 export const flush=async()=>{while(jobs.length)await Promise.all(jobs.splice(0).map(j=>j()));};`;
 const compiled=await build({stdin:{contents:`export * from './web/lib/bank-journey-monitor';export * from 'monitor-fixture';`,resolveDir:resolve('..'),sourcefile:'monitor-entry.ts'},bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^(monitor-fixture|next\/server|next\/headers)$|^\.\/(prisma|analytics-server)$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'ts'}));}}]});
 const mod={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(resolve('package.json')),mod,mod.exports);const m=mod.exports as any;
 await Promise.all(['a','b'].map(id=>m.withBankMonitoring('link',async()=>{await m.bindBankMonitoring({id,userId:'u',workspaceId:id,createdAt:new Date(),institutionId:id,institutionName:'Bank '+id},'user_'+id);await Promise.resolve();m.bankJourney('link_request','started');m.bankJourney('link_request','started');m.bankJourney('account_list','failed',{error:{status:422,message:'private password'}});})));await m.flush();
 assert.equal(m.rows.length,4);assert.equal(m.events.length,4);for(const row of m.rows){assert.equal(row.metadata.bank_id,row.entityId);assert.equal(row.metadata.platform,'android');assert.equal(row.metadata.app_version,'1.1.6');assert(!JSON.stringify(row).includes('private password'));}
 m.setPlatform('');await m.withBankMonitoring('callback',async()=>{await m.bindBankMonitoring({id:'a',userId:'u',workspaceId:'a',createdAt:new Date()},'user_a');m.bankJourney('authorization_return','succeeded');});await m.flush();assert.equal(m.rows.find((r:any)=>r.action==='bank_journey.authorization_return.succeeded').metadata.platform,'android','Hosted return retains native attribution');m.setPlatform('android');
 await m.withBankMonitoring('sync',async()=>{await m.bindBankMonitoring({id:'a',userId:'u',workspaceId:'a',createdAt:new Date()},'user_a',true);m.bankJourney('link_request','started');});await m.flush();assert.equal(m.rows.filter((r:any)=>r.action==='bank_journey.link_request.started'&&r.entityId==='a').length,2);
 await m.withBankMonitoring('link',async()=>{await m.bindBankMonitoring({id:'origin',userId:'u',workspaceId:'origin',createdAt:new Date(),institutionId:'chosen-bank',institutionName:'Chosen bank'},'user_u');await m.bankJourney('bank_selected','succeeded',{durable:true});});
 assert(m.rows.some((r:any)=>r.entityId==='origin'&&r.action==='bank_journey.bank_selected.succeeded'),'Selection saved without running after callbacks');
 await m.withBankMonitoring('sync',async()=>{await m.bindBankMonitoring({id:'origin',userId:'u',workspaceId:'origin',createdAt:new Date(),institutionId:'provider-bank',institutionName:'Provider bank'},'user_u');m.bankJourney('account_selection','pending');});await m.flush();
 const changed=m.rows.find((r:any)=>r.entityId==='origin'&&r.action==='bank_journey.account_selection.pending').metadata;assert.equal(changed.bank_id,'chosen-bank');assert.equal(changed.bank_name,'Chosen bank');assert.equal(changed.resolved_bank_id,'provider-bank');

 const syncConnection={id:'repeated',userId:'u',workspaceId:'repeated',createdAt:new Date(),institutionId:'bank-repeat',institutionName:'Repeat Bank'};
 const runId='a695c9b3-7d50-442a-8fa7-8f94f69eb33f';
 const requestSync=async(status:number,payload:object,kind='start')=>m.monitorBankSync(async()=>{await m.bindBankMonitoring(syncConnection,'user_u');await m.beginBankSync({syncRunId:runId,syncRequestKind:kind});m.bankJourney('account_list','succeeded',{durationMs:12});m.bankJourney('account_list','succeeded',{durationMs:12});if(status===502)m.bankJourney('transaction_fetch','failed',{error:{providerCode:'PROVIDER_TIMEOUT',message:'private'}});return Response.json(payload,{status});});
 const syncResponses=await Promise.all([requestSync(200,{status:'retrieving'}),requestSync(502,{error:'private'},'poll')]);
 const recovered=await requestSync(200,{status:'ready',dataStatus:'complete'},'poll');await m.flush();
 const syncRows=m.rows.filter((r:any)=>r.entityId==='repeated');const finishes=syncRows.filter((r:any)=>r.action.startsWith('bank_journey.sync_finished.'));
 assert.equal(finishes.length,3);assert.equal(new Set(finishes.map((r:any)=>r.metadata.sync_attempt_id)).size,3);assert.equal(new Set(finishes.map((r:any)=>r.metadata.sync_run_id)).size,1);assert.equal(syncRows.filter((r:any)=>r.action==='bank_journey.account_list.succeeded').length,3,'Dedup within each request, never across repeated syncs');
 assert.equal(finishes.find((r:any)=>r.metadata.sync_result==='failed').metadata.error_code,'PROVIDER_TIMEOUT');
 assert.equal(new Set([...syncResponses,recovered].map(r=>r.headers.get('x-clover-bank-sync-attempt'))).size,3);
 const legacy=await m.monitorBankSync(async()=>{await m.bindBankMonitoring(syncConnection,'user_u');await m.beginBankSync({syncRunId:'private@email.test'});return Response.json({reconnectRequired:true},{status:409});});await m.flush();assert(legacy.headers.get('x-clover-bank-sync-attempt'));assert(!JSON.stringify(m.rows).includes('private@email.test'));
 const unmatched=await m.monitorBankSync(async()=>Response.json({error:'not-owned'},{status:404}));assert.equal(unmatched.headers.get('x-clover-bank-sync-attempt'),null);
 m.broken();await m.withBankMonitoring('link',async()=>{await m.bindBankMonitoring({id:'x',userId:'u',workspaceId:'x',createdAt:new Date()},'user_x');m.bankJourney('link_request','started');});await m.flush();
 console.log('PASS bank journey privacy, product boundaries, historical gaps, recovery ordering, concurrent bank isolation, deduplication, refresh and diagnostics failure isolation');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
