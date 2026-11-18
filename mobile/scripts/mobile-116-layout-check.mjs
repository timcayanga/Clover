import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
function load(path,deps){const exports={};const code=ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInNewContext(code,{exports,require:name=>deps[name]??new Proxy({},{get:(_,key)=>String(key)})});return exports;}
const {PlanTabs}=load('../src/plan-ui.tsx',{'react/jsx-runtime':jsx,'react-native':{ScrollView:'ScrollView',Pressable:'Pressable'},'./ui':{useTheme:()=>({colors:{},dark:false}),Icon:'Icon'}});
for(const selected of ['Overview','Expenses','Contributions']){
 const tree=PlanTabs({items:['Overview','Expenses','Contributions'],value:selected,onChange(){}});
 assert.equal(tree.props.style.height,44);assert.equal(tree.props.style.flexGrow,0);assert.equal(tree.props.style.flexShrink,0);
 for(const button of tree.props.children){assert.equal(button.props.style.height,44);const label=button.props.children[1];if(label)assert.equal(label.props.numberOfLines,1);}
}
console.log('PASS all selected states reserve the same 44 px subtab area');
let stateIndex=0,refIndex=0;const states=['income','cash','food','Reviewed',false,''],refs=[];const calls=[];let fail=true;
const react={useState(initial){const i=stateIndex++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=value}];},useRef(initial){const i=refIndex++;return refs[i]??=( {current:initial});}};
const {TransactionBulkEdit}=load('../src/transaction-bulk-edit.tsx',{'react/jsx-runtime':jsx,react,'react-native':{Modal:'Modal',View:'View',Pressable:'Pressable',ScrollView:'ScrollView'},'./ui':{useTheme:()=>({colors:{}}),Button:'Button',Field:'Field',Notice:'Notice'},'./session':{useSession:()=>({profileId:'profile-qa',request:async(path,options)=>{calls.push({path,patch:JSON.parse(options.body)});if(path.includes('/second?')&&fail){fail=false;throw Error('temporary');}}})}});
const find=(tree,type)=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(t=>find(t,type)):[...(tree.type===type?[tree]:[]),...find(tree.props?.children,type)];
let saved=[];const render=()=>{stateIndex=0;refIndex=0;return TransactionBulkEdit({ids:['first','second'],options:{accounts:[],categories:[],tags:[]},onClose(){},onSaved:ids=>saved=ids});};
find(render(),'Button')[0].props.onPress();await new Promise(setImmediate);assert.equal(calls.length,2);assert.match(states[5],/1 of 2 updated/);
find(render(),'Button')[0].props.onPress();await new Promise(setImmediate);
assert.equal(calls.length,3);assert.equal(calls.filter(c=>c.path.includes('/first?')).length,1);assert.equal(saved.length,2);
for(const call of calls){assert.match(call.path,/workspaceId=profile-qa$/);assert.deepEqual(call.patch,{type:'income',accountId:'cash',categoryId:'food',categoryCorrectionScope:'transaction',tags:['Reviewed'],tagAction:'add'});assert(!('amount' in call.patch));assert(!('date' in call.patch));}
console.log('PASS explicit bulk edits retain amount/date, scope to Profile and skip saved rows on retry');
