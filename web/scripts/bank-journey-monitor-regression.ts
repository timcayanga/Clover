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
 const fixture=`export const rows=[],events=[],jobs=[];let fail=false;export function broken(){fail=true;}
 export const after=job=>jobs.push(job);export const capturePostHogServerEvent=async(...args)=>events.push(args);
 export const auditLog={create:async({data})=>{if(fail)throw Error('offline');const row={...data,id:String(rows.length),createdAt:new Date()};rows.push(row);return row;},findFirst:async({where})=>rows.find(r=>r.entityId===where.entityId&&r.action===where.action&&(!where.metadata||r.metadata[where.metadata.path[0]]===where.metadata.equals))??null};
 let tail=Promise.resolve();export const prisma={auditLog,$transaction:fn=>{const p=tail.then(()=>fn({auditLog,$executeRaw:async()=>0}));tail=p.catch(()=>{});return p;}};
 export const flush=async()=>{while(jobs.length)await Promise.all(jobs.splice(0).map(j=>j()));};`;
 const compiled=await build({stdin:{contents:`export * from './web/lib/bank-journey-monitor';export * from 'monitor-fixture';`,resolveDir:resolve('..'),sourcefile:'monitor-entry.ts'},bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^(monitor-fixture|next\/server)$|^\.\/(prisma|analytics-server)$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'ts'}));}}]});
 const mod={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(resolve('package.json')),mod,mod.exports);const m=mod.exports as any;
 await Promise.all(['a','b'].map(id=>m.withBankMonitoring('link',async()=>{await m.bindBankMonitoring({id,userId:'u',workspaceId:id,createdAt:new Date(),institutionId:id,institutionName:'Bank '+id},'user_'+id);await Promise.resolve();m.bankJourney('link_request','started');m.bankJourney('link_request','started');m.bankJourney('account_list','failed',{error:{status:422,message:'private password'}});})));await m.flush();
 assert.equal(m.rows.length,4);assert.equal(m.events.length,4);for(const row of m.rows){assert.equal(row.metadata.bank_id,row.entityId);assert(!JSON.stringify(row).includes('private password'));}
 await m.withBankMonitoring('sync',async()=>{await m.bindBankMonitoring({id:'a',userId:'u',workspaceId:'a',createdAt:new Date()},'user_a',true);m.bankJourney('link_request','started');});await m.flush();assert.equal(m.rows.filter((r:any)=>r.action==='bank_journey.link_request.started'&&r.entityId==='a').length,2);
 m.broken();await m.withBankMonitoring('link',async()=>{await m.bindBankMonitoring({id:'x',userId:'u',workspaceId:'x',createdAt:new Date()},'user_x');m.bankJourney('link_request','started');});await m.flush();
 console.log('PASS bank journey privacy, product boundaries, historical gaps, recovery ordering, concurrent bank isolation, deduplication, refresh and diagnostics failure isolation');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
