import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync(new URL('../app/onboarding.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
function harness(fail=false){
 const states=[],refs=[],requests=[],routes=[];let si=0,ri=0,effects=[];
 const session={data:{needsOnboarding:true,currencyChoices:[{code:'PHP',name:'Philippine Peso'}]},completeOnboarding:async(body)=>{requests.push({path:"onboarding",body});if(fail)throw new Error("Setup unavailable");session.data={...session.data,needsOnboarding:false};},refresh:()=>{session.data={...session.data,needsOnboarding:false};}};
 const exports={};
 vm.runInNewContext(code,{exports,Intl,Error,require:name=>{
  if(name==='react')return {useState:v=>{const i=si++;if(!(i in states))states[i]=v;return [states[i],v=>{states[i]=v;}];},useRef:v=>{const i=ri++;return refs[i]??=( {current:v});},useEffect:f=>effects.push(f)};
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'};
  if(name==='expo-router')return {router:{replace:v=>routes.push(v)}};
  if(name==='react-native')return {Image:'Image',Pressable:'Pressable',View:'View'};
  if(name.endsWith('/app-text'))return {Text:'Text'};
  if(name.endsWith('/session'))return {useSession:()=>session};
  if(name.endsWith('/ui'))return {...Object.fromEntries(['Body','Button','Card','Heading','Notice','Screen'].map(k=>[k,k])),useTheme:()=>({colors:{}})};
  if(name.endsWith('.png'))return name;
  throw new Error(name);
 }});
 function render(){si=0;ri=0;effects=[];const tree=exports.default();for(const f of effects)f();const nodes=[];function walk(x){if(!x)return;if(Array.isArray(x)){x.forEach(walk);return;}if(typeof x==='object'){nodes.push(x);walk(x.props?.children);}}walk(tree);return nodes;}
 return {render,requests,routes,session};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
for(const action of ['skip','file','camera','library']){
 const h=harness();let nodes=h.render();
 assert.equal(nodes.find(n=>n.props.accessibilityLabel==='Clover').props.source,'../assets/organize/clover.png');
 const plants=nodes.filter(n=>n.type==='Image'&&n.props.source.includes('/onboarding/')).map(n=>n.props.source.split('/').pop());
 assert.deepEqual(plants,['beginner.png','intermediate.png','advanced.png']);
 nodes.find(n=>n.props.accessibilityRole==='radio').props.onPress();nodes=h.render();
 nodes.find(n=>n.props.title==='Continue').props.onPress();nodes=h.render();
 const title={skip:'Skip for now',file:'Choose Files',camera:'Take Photo',library:'Photo Library'}[action];
 const button=nodes.find(n=>n.props.title===title||n.props.accessibilityLabel===title);
 button.props.onPress();button.props.onPress();await tick();nodes=h.render();
 assert.equal(h.requests.length,1,'Double tap must not save twice');assert.deepEqual(Object.keys(h.requests[0].body).sort(),['currency','experience','locale','timeZone']);
 assert.equal(h.requests[0].body.experience,'beginner');
 assert.equal(h.routes.length,1);
 if(action==='skip')assert.equal(h.routes[0],'/(tabs)');
 else {assert.equal(h.routes[0].pathname,'/(tabs)/add');assert.equal(h.routes[0].params.picker,action);}
}
const h=harness(true);let n=h.render();n.find(x=>x.props.accessibilityRole==='radio').props.onPress();n=h.render();n.find(x=>x.props.title==='Continue').props.onPress();n=h.render();n.find(x=>x.props.title==='Skip for now').props.onPress();await tick();n=h.render();
assert.equal(h.routes.length,0);assert.ok(n.some(x=>x.type==='Notice'&&x.props.children==='Setup unavailable'));
assert.equal(n.find(x=>x.props.title==='Skip for now').props.disabled,false);
console.log('PASS native onboarding: fixed artwork order, transparent mark, all four destinations, duplicate taps and retryable failure');
