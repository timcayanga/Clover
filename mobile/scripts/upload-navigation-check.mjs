import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync(new URL('../app/(tabs)/add.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
function harness(source,{sheet=false,cancel=true,permission=true,canGoBack=true}={}){
 const states=[],refs=[],routes=[],calls=[];let si=0,ri=0,effects=[];
 const session={demo:false,profileId:'profile',data:{profiles:[{id:'profile',name:'Personal'}]},request:async()=>({importFiles:[]}),setProfileId:()=>{},registerUpload:async()=>{calls.push('register');}};
 const picker=async name=>{calls.push(name);return {canceled:cancel,assets:[{uri:'file:///receipt.jpg',name:'receipt.jpg',fileName:'receipt.jpg',mimeType:'image/jpeg',size:100,fileSize:100}]};};
 const exports={};const router={back:()=>routes.push('back'),replace:v=>routes.push(v),push:v=>routes.push(v),setParams:()=>{},canGoBack:()=>canGoBack};
 vm.runInNewContext(code,{exports,console,Error,require:name=>{
  if(name==='react')return {useState:v=>{const i=si++;if(!(i in states))states[i]=typeof v==='function'?v():v;return [states[i],v=>{states[i]=v;}];},useRef:v=>{const i=ri++;return refs[i]??={current:v};},useEffect:f=>effects.push(f),useCallback:f=>f};
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'};
  if(name==='expo-router')return {router,useFocusEffect:f=>effects.push(f),useLocalSearchParams:()=>({entry:`upload-${source}`,picker:source})};
  if(name==='react-native')return {Platform:{OS:'android'},Alert:{alert:()=>{}},View:'View',Pressable:'Pressable',Image:'Image',KeyboardAvoidingView:'KeyboardAvoidingView'};
  if(name==='react-native-safe-area-context')return {useSafeAreaInsets:()=>({top:0})};
  if(name==='expo-document-picker')return {getDocumentAsync:()=>picker('file')};
  if(name==='expo-image-picker')return {requestCameraPermissionsAsync:async()=>({granted:permission}),launchCameraAsync:()=>picker('camera'),launchImageLibraryAsync:()=>picker('library')};
  if(name==='expo-crypto')return {randomUUID:()=> 'upload-id'};
  if(name==='expo-file-system')return {File:class{size=100;}};
  if(name.endsWith('/session'))return {useSession:()=>session};
  if(name.endsWith('/analytics'))return {beginTelemetry:()=>()=>{}};
  if(name.endsWith('/upload'))return {fileProblem:()=>null,removeUploadCopy:()=>{}};
  if(name.endsWith('/transaction-entry'))return {emptyTransaction:()=>({}),Choices:'Choices',ManualTransaction:'ManualTransaction',TransactionChat:'TransactionChat'};
  if(name.endsWith('/ui'))return {...Object.fromEntries(['Body','Button','Card','Heading','Icon','Notice','Screen'].map(k=>[k,k])),useTheme:()=>({colors:{}})};
  if(name.endsWith('.png'))return name;
  return new Proxy({},{get:(_,k)=>k==='__esModule'?true:String(k)});
 }});
 function render(){si=0;ri=0;effects=[];const tree=exports.default({sheet});for(const f of effects)f();const nodes=[];function walk(x){if(!x)return;if(Array.isArray(x)){x.forEach(walk);return;}if(typeof x==='object'){nodes.push(x);walk(x.props?.children);}}walk(tree);return nodes;}
 return {render,calls,routes};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
for(const source of ['file','camera','library']){
 const h=harness(source);h.render();await tick();let n=h.render();await tick();n=h.render();
 assert.deepEqual(h.calls,[source],'Picker must open exactly once, including after cancellation and re-render');
 assert.equal(n.find(x=>x.type==='Screen').props.sheet,false,'Onboarding upload is full-screen');
 n.find(x=>x.type==='PlanHeader').props.back();assert.equal(h.routes.at(-1),'/(tabs)','Back must escape to Home');
 const selected=harness(source,{cancel:false});selected.render();await tick();selected.render();await tick();
 assert.deepEqual(selected.calls,[source,'register']);assert.equal(selected.routes[0].pathname,'/import/[id]');
}
const denied=harness('camera',{permission:false});denied.render();await tick();let n=denied.render();assert.deepEqual(denied.calls,[]);assert.ok(n.some(x=>x.type==='Notice'&&String(x.props.children).includes('Camera permission')));
for(const canGoBack of [true,false]){
 const h=harness('file',{sheet:true,canGoBack});h.render();await tick();n=h.render();await tick();n=h.render();assert.equal(n.find(x=>x.type==='Screen').props.sheet,true);n.find(x=>x.type==='PlanHeader').props.back();assert.equal(h.routes.at(-1),canGoBack?'back':'/(tabs)');
}
console.log('PASS upload navigation: three pickers, cancellation, permission denial, import handoff, full-screen Home return and sheet fallback');
