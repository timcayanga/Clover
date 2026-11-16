import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const tick=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)}};
const compile=file=>ts.transpileModule(fs.readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const lifecycle={};vm.runInNewContext(compile('../src/request-lifecycle.ts'),{exports:lifecycle,AbortController,Promise,Error,setTimeout,clearTimeout});
function harness({signedIn=true,rejectRead=false,deny=false}={}){
 const slots=[],effects=[],listeners=new Set(),reads=[],tokens=[],opening=deferred(),response=deferred();let index=0,provider,eng;
 const store={get:async key=>key==='cache:bootstrap'?{value:{profiles:[{id:'old',name:'Old'}],defaultCurrency:'USD'},savedAt:Date.now()}:null,set:async()=>{},keys:async()=>[],remove:async()=>{}};
 class ApiError extends Error{constructor(message,status){super(message);this.status=status}}
 class NetworkError extends Error{}
 class Engine{constructor(s,transport){this.store=s;this.transport=transport;this.status={online:true};eng=this}async init(){}async assertLocalAccess(){}async presentationCache(){return []}subscribe(){return ()=>{}}async request(...args){return this.transport(...args)}async acceptBootstrap(value){this.saved=value}async dispose(){}async setOnline(){}async clear(){}}
 class Queue{subscribe(){}async list(){return []}async close(){}}
 const hook={createContext:()=>({Provider:'Provider'}),useContext(){},useRef:value=>{const i=index++;return slots[i]??(slots[i]={current:value})},useState:value=>{const i=index++;if(!(i in slots))slots[i]=typeof value==='function'?value():value;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next}]},useCallback:(fn,deps)=>{const i=index++,prev=slots[i];if(!prev||deps.some((v,j)=>v!==prev.deps[j]))slots[i]={fn,deps};return slots[i].fn},useEffect:(fn,deps)=>{const i=index++,prev=slots[i];if(!prev||deps.some((v,j)=>v!==prev.deps[j])){effects.push(()=>{prev?.cleanup?.();slots[i]={deps,cleanup:fn()}})}}};
 const exports={};
 vm.runInNewContext(compile('../src/session.tsx'),{exports,AbortController,URLSearchParams,Promise,Error,Date,JSON,setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},require:name=>{
  if(name==='react')return hook;
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>{if(type==='Provider')provider=props.value;return {type,props}},jsxs:(type,props)=>{if(type==='Provider')provider=props.value;return {type,props}}};
  if(name==='react-native')return {Platform:{OS:'ios'},AppState:{currentState:'active',addEventListener:(_,fn)=>{listeners.add(fn);return {remove:()=>listeners.delete(fn)}}}};
  if(name==='./request-lifecycle')return lifecycle;
  if(name==='./api')return {ApiError,NetworkError,apiBase:()=> 'https://fixture.invalid',apiRequest:async(token,path,options)=>{reads.push({token,path,options});if(path==='bootstrap'){if(deny)throw new ApiError('revoked',401);if(rejectRead&&reads.filter(r=>r.path==='bootstrap').length===1)throw new ApiError('expired',401);return lifecycle.boundedRequest(()=>response.promise,{signal:options.signal,timeoutMs:5000})}if(options?.method==='POST')throw new ApiError('expired',401);return {}}};
  if(name==='./offline/store')return {openOfflineStore:()=>opening.promise};
  if(name==='./offline/engine')return {OfflineEngine:Engine};
  if(name==='./offline/file-queue')return {FileQueue:Queue};
  if(name==='./onboarding-persistence')return {OnboardingPersistence:class{async init(){}}};
  if(name==='./offline/file-storage')return {clearTemporaryOfflineCopies:async()=>{}};
  if(name==='./profile-selection')return {selectRecentProfile:(profiles,selected,preferred)=>profiles.find(p=>p.id===selected||p.id===preferred)?.id??profiles[0]?.id??''};
  if(name==='./page-cache')return {PageCache:class{seed(){}clear(){}peek(){return null}home(){return null}read(path,load){return load()}},isPageRead:()=>false};
  if(name==='./ai-consent')return {useCloudAiConsent:()=>({ensure:async()=>true})};
  if(name==='@react-native-community/netinfo')return {__esModule:true,default:{configure(){},addEventListener(){return ()=>{}},fetch:async()=>({isConnected:true})}};
  if(name==='./upload')return {removeUploadCopy(){}};
  if(name==='./sample-data')return {sampleTransactions:[]};
  return {};
 }});
 const props={demo:false,userId:signedIn?'verified-fixture':null,getToken:async options=>{tokens.push(options);return options?.skipCache?'fresh':'cached'},signOut:async()=>{}};
 function render(){index=0;exports.SessionProvider(props);while(effects.length)effects.shift()();return provider}
 return {render,reads,tokens,opening,response,get engine(){return eng},background(){listeners.forEach(fn=>fn('background'))},foreground(){listeners.forEach(fn=>fn('active'))},close(){for(const slot of slots)slot?.cleanup?.()}};
}
{
 const h=harness({signedIn:false});h.render();await tick();assert.equal(h.reads.length,0,'Signed-out entry never bootstraps or emits a spurious auth failure');h.close();
}
{
 const h=harness({rejectRead:true});h.render();await tick();assert.equal(h.reads.length,2,'Bootstrap starts before storage finishes and retries a rejected token only once');assert.equal(h.tokens[1].skipCache,true);
 const fresh={profiles:[{id:'fresh',name:'Fresh'}],needsOnboarding:false,defaultCurrency:'PHP',entitlement:{}};h.response.resolve(fresh);await tick();assert.equal(h.render().data,fresh);
 h.opening.resolve({});await tick();assert.equal(h.render().data,fresh,'Late disk snapshot never replaces fresh authorized account data');assert.equal(h.render().profileId,'fresh');
 const before=h.tokens.length;
 await assert.rejects(h.render().request('transactions?workspaceId=fresh',{method:'POST',body:'{}'}),e=>e.status===401);
 assert.equal(h.tokens.length,before+1,'Financial mutations are never automatically replayed on 401');h.close();
}
{
 const h=harness();h.render();await tick();assert.equal(h.reads.length,1);h.background();await tick();assert.equal(h.render().error,'','Background cancellation is not an authentication failure');h.foreground();h.render();await tick();assert.equal(h.reads.length,2,'Resume replaces suspended bootstrap');h.response.resolve({profiles:[],needsOnboarding:true,entitlement:{}});await tick();h.close();h.opening.resolve({});await tick();
}
{
 const h=harness({deny:true});h.render();await tick();assert.equal(h.reads.length,2);assert.equal(h.render().data,null);assert.match(h.render().error,/revoked/);
 h.opening.resolve({});await tick();assert.equal(h.render().data,null,'Late valid-looking disk cache must not restore a denied session');assert.equal(h.render().profileId,'');h.close();
}
console.log('PASS actual SessionProvider: signed-out guard, parallel storage/network, one fresh-token retry, stale cache exclusion, no mutation replay, suspend and resume');
