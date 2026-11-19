import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
function load(path,deps,globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:n=>deps[n]??{},...globals});return exports;}
function find(tree,type){return !tree||typeof tree!=="object"?[]:Array.isArray(tree)?tree.flatMap(t=>find(t,type)):[...(tree.type===type?[tree]:[]),...find(tree.props?.children,type)];}
const {AccountGridCard}=load("../src/account-grid.tsx",{"react/jsx-runtime":jsx,"react-native":{Pressable:"Pressable",View:"View"},"expo-linear-gradient":{LinearGradient:"Gradient"},"./app-text":{Text:"Text"}});
let opens=0;const card=AccountGridCard({name:"QA Account",identifier:"1234",amount:"₱25",logo:null,palette:{colors:["#000","#fff"],foreground:"#fff"},onOpen:()=>opens++});
for(const button of find(card,"Pressable"))button.props.onPress();assert.equal(opens,2);assert(!find(card,"Text").some(t=>t.props.children==="›"));
const {recurringDueLabel}=load("../src/recurring-due-label.ts",{});
const bill={id:"bill",dueDate:"2026-10-31",recurrence:"monthly"};
assert.match(recurringDueLabel(bill,[{id:"bill",date:"2026-12-01",completed:false},{id:"bill",date:"2026-11-19",completed:true}],"2026-11-19"),/2026-12-01/);
assert.match(recurringDueLabel(bill,[],"2026-11-19"),/Schedule from/);
assert.equal(recurringDueLabel({id:"unknown"},[],"2026-11-19"),"Due date not set");
console.log("PASS account opens from card and ellipsis; recurring dates respect completed occurrences and missing schedule evidence");

let visible=false, listener, delay, effects=[];const animation={setValue(){},stopAnimation(){},interpolate:config=>config};
const animations=[];const refs=[];let refIndex=0;
const {ReturnGreeting}=load("../src/return-greeting.tsx",{
  "react/jsx-runtime":jsx,react:{useState:()=>[visible,v=>visible=v],useRef:initial=>refs[refIndex++]??=( {current:initial}),useCallback:f=>f,useEffect:f=>effects.push(f)},
  "react-native":{Animated:{Value:function(){return animation;},View:"AnimatedView",timing:(a,config)=>{animations.push(config);return{start:cb=>cb?.({finished:true})};}},AppState:{addEventListener:(event,cb)=>{listener=cb;return{remove(){}};}},Easing:{out:x=>x,cubic:1},Pressable:"Pressable",StyleSheet:{absoluteFill:{}}},
  "expo-status-bar":{StatusBar:"StatusBar"},"react-native-safe-area-context":{useSafeAreaInsets:()=>({top:30,left:0,right:0})},
  "./app-text":{Text:"Text"},"./accessibility-preferences":{useAccessibilityPreferences:()=>({reduceMotion:false})},"../../shared/home-return":{greetingName:n=>`Hi, ${n}!`}
},{setTimeout:(f,ms)=>{delay=ms;return 1;},clearTimeout(){}});
ReturnGreeting({firstName:"Tim"});effects[0]();assert.equal(visible,true);assert(delay>=1500);
refIndex=0;const greeting=ReturnGreeting({firstName:"Tim"});
assert.equal(greeting.props.style[1].backgroundColor,"#00AABD");assert.equal(greeting.props.style[1].top,-30);
assert.deepEqual(Array.from(greeting.props.style[1].opacity.outputRange),[0,1,0]);assert(!greeting.props.style[1].transform);
listener("background");assert.equal(visible,false);listener("active");assert.equal(visible,false);
console.log("PASS cold greeting covers safe area, fades in/out, stays readable and does not replay on warm resume");
