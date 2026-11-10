import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
const compile=file=>ts.transpileModule(fs.readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const lifecycle={};vm.runInNewContext(compile('../src/request-lifecycle.ts'),{exports:lifecycle,AbortController,Promise,Error,setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,15)),clearTimeout});
const upload={};vm.runInNewContext(compile('../../shared/native-upload.ts'),{exports:upload});
const events=[],api={};let fetchImpl;
vm.runInNewContext(compile('../src/api.ts'),{exports:api,URL,Headers,AbortController,Date,Error,fetch:(...args)=>fetchImpl(...args),require:name=>{
 if(name==='./request-lifecycle')return lifecycle;
 if(name==='../../shared/native-upload')return upload;
 if(name==='./api-base')return {apiBase:()=> 'https://fixture.invalid'};
 if(name==='../../shared/split-bill-read')return {splitBillReadErrorCode:()=>undefined};
 if(name==='../../shared/analytics')return {newTelemetryId:()=>String(Math.random()),getTelemetryHeaders:()=>({}),requestTelemetry:path=>({operation:path.startsWith('uploads/')?'POST /uploads/:id/complete':'GET /bootstrap'}),telemetry:(event,p)=>events.push({event,...p}),beginTelemetry:()=>{let done=false;return(outcome,p)=>{if(done)return;done=true;events.push({event:outcome,...p})}}};
 throw Error(name);
}});
const tick=()=>new Promise(r=>setImmediate(r));
fetchImpl=()=>new Promise(()=>{});await assert.rejects(api.apiRequest('synthetic','bootstrap'),api.NetworkError);assert.equal(events.at(-1).reason,'timeout');
let resolveBody;fetchImpl=async()=>({ok:true,status:200,json:()=>new Promise(r=>resolveBody=r)});
const before=events.length;await assert.rejects(api.apiRequest('synthetic','bootstrap'),api.NetworkError);resolveBody({profiles:[]});await tick();assert.equal(events.length,before+1,'Late body cannot publish data_ready or successful completion');
const c=new AbortController();fetchImpl=()=>new Promise(()=>{});const canceled=api.apiRequest('synthetic','bootstrap',{signal:c.signal});c.abort(new lifecycle.RequestCancelledError('app_background'));await assert.rejects(canceled,lifecycle.RequestCancelledError);assert.equal(events.at(-1).event,'canceled');assert.equal(events.at(-1).reason,'app_background');
fetchImpl=async()=>({ok:false,status:401,json:async()=>({error:'expired'})});await assert.rejects(api.apiRequest('synthetic','bootstrap'),e=>e instanceof api.ApiError&&e.status===401);
fetchImpl=async()=>({ok:true,status:200,json:async()=>({profiles:[]})});assert.equal((await api.apiRequest('synthetic','bootstrap')).profiles.length,0);assert.equal(events.at(-1).event,'data_ready');
for(const [code, reason] of [['IMPORT_PASSWORD_REQUIRED','password_required'],['I-109','source_review_required'],['customer-private-text','unclassified']]){
 fetchImpl=async()=>({ok:false,status:422,json:async()=>({error:'private error detail',code})});
 await assert.rejects(api.apiRequest('synthetic','uploads/fixture/complete',{method:'POST'}),e=>e instanceof api.ApiError&&e.status===422);
 assert.equal(events.at(-1).upload_rejection,reason);
}
assert.doesNotMatch(JSON.stringify(events),/customer-private-text|private error detail/);
console.log('PASS actual API transport: hung native fetch/body settle, cancellation distinct, late results emit no success, 401 preserved and later requests recover');
