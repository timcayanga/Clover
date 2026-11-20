import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../app/(tabs)/_layout.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
for (const focused of [true, false, true]) {
  const exports = {};
  const opened = [], navigated = [];
  const dependencies = {
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { View: 'View' },
    'expo-router': { Tabs: Object.assign(() => {}, { Screen: 'TabScreen' }), router: {}, useIsFocused: () => focused, usePathname: () => '/transactions', useGlobalSearchParams: () => ({}) },
    '../../src/page-ask-context': {usePageAskClover: () => context => opened.push(context)},
    '../../../shared/ask-clover-page': {askPageContext: () => ({page:'transactions',title:'Transactions'})},
    '../../src/accessibility-preferences': { useAccessibilityPreferences: () => ({reduceMotion: false}) },
    '../../src/access': { useAccess: () => ({ active: true }) },
    '../../src/session': { useSession: () => ({ profileId: 'sample', demo: false }) },
    '../../src/ui': { useTheme: () => ({ colors: {}, dark: false }), ProfileGate: 'ProfileGate' },
  };
  vm.runInNewContext(code, { exports, require: name => dependencies[name] ?? {} });
  const view = exports.default().props.children;
  assert.equal(view.props.accessibilityElementsHidden, !focused);
  assert.equal(view.props.importantForAccessibility, focused ? 'auto' : 'no-hide-descendants');
  assert.equal(view.props.pointerEvents, focused ? 'auto' : 'none');
  function findTabs(node) { if (!node) return; if(Array.isArray(node)) return node.map(findTabs).find(Boolean); if(node.props?.tabBar) return node; return findTabs(node.props?.children); }
  const tabs=findTabs(view);
  const state={routes:[{name:'transactions',key:'tx'},{name:'adviser',key:'ask'}],index:0};
  const bar=tabs.props.tabBar({state,descriptors:{tx:{options:{title:'Transactions'}},ask:{options:{title:'Ask Clover'}}},emitter:{emit:()=>({defaultPrevented:false})},navigateToTab:(...args)=>navigated.push(args)});
  bar.props.children.find(node=>node.props.label==='Ask Clover').props.onPress();
  assert.deepEqual(navigated,[['ask']], 'Bottom navigation must open the main Ask Clover tab');
  assert.equal(opened.length,0,'Bottom navigation must not open the contextual sheet');

}
console.log('PASS covered tab content hides from assistive navigation and restores interaction on return');

// Exercise the actual shared header/menu and detail-page bottom navigation.
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
const allNodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(allNodes) : [node, ...allNodes(node.props?.children)];
const load = (relative, dependencies) => {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL(relative, import.meta.url),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{exports,require:name=>dependencies[name] ?? {}});
  return exports;
};
for (const path of ['/reports','/accounts','/recurring','/transaction/t1','/circles']) {
  const navigated=[], opened=[];
  let stateIndex=0;
  class AnimatedValue { interpolate(){return 0;} }
  const dependencies = {
    'react/jsx-runtime':jsx,
    'react':{useState:v=>[stateIndex++===2 ? 'menu' : v,()=>{}],useRef:v=>({current:v}),useEffect:()=>{}},
    'react-native':{StyleSheet:{create:v=>v,absoluteFill:{},hairlineWidth:1},View:'View',Pressable:'Pressable',ScrollView:'ScrollView',Animated:{Value:AnimatedValue,View:'AnimatedView',timing:()=>({start:cb=>cb?.({finished:true})})},useColorScheme:()=> 'light',useWindowDimensions:()=>({width:393,height:852})},
    'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},
    'expo-router':{usePathname:()=>path,useGlobalSearchParams:()=>({currency:'PHP'}),router:{navigate:route=>navigated.push(route)}},
    './session':{useSession:()=>({profileId:'qa',demo:true})},
    './access':{useAccess:()=>({active:true})},
    './accessibility-preferences':{useAccessibilityPreferences:()=>({highContrast:false})},
    './display-preferences':{useDisplayPreferences:()=>({appearance:'light'})},
    './page-ask-context':{usePageAskClover:()=>context=>opened.push(context)},
    '../../shared/ask-clover-page':{askPageContext:(pathname,params,title)=>({pathname,params,title})},
    './navigation-groups':{navigationGroups:[{title:'Understand',items:[{route:'/adviser',label:'Ask Clover',icon:'chatbubble-ellipses-outline'}]}]},
    './app-text':{Text:'Text'},
    './navigation-bar':{NavigationBar:'NavigationBar',NavigationItem:'NavigationItem'},
  };
  const ui=load('../src/ui.tsx',dependencies);
  const header=allNodes(ui.AppHeader({title:'Reports'}));
  const icon=header.find(n=>n.props?.accessibilityLabel==='Open Ask Clover');
  assert(icon,'The page header retains its contextual Clover action');
  icon.props.onPress();
  assert.equal(opened.length,1);assert.equal(opened[0].pathname,path);assert.equal(navigated.length,0);
  const menu=header.find(n=>n.type==='Pressable'&&allNodes(n.props.children).some(child=>child.props?.children==='Ask Clover'));
  assert(menu,'The main menu exposes Ask Clover');menu.props.onPress();
  assert.deepEqual(navigated,['/(tabs)/adviser']);assert.equal(opened.length,1,'Menu navigation must not open another contextual sheet');
  const bottom=allNodes(ui.DetailNavigation()).find(n=>n.props?.label==='Ask Clover');
  bottom.props.onPress();assert.deepEqual(navigated,['/(tabs)/adviser','/(tabs)/adviser']);assert.equal(opened.length,1);
}
const quickJumps=[];
const quick=load('../src/home-quick-access.tsx',{
  'react/jsx-runtime':jsx,'react':{useRef:v=>({current:v}),useState:v=>[v,()=>{}]},'react-native':{View:'View',Pressable:'Pressable',ScrollView:'ScrollView'},
  'expo-router':{useNavigation:()=>({dispatch:event=>quickJumps.push(event)})},
  './accessibility-preferences':{useAccessibilityPreferences:()=>({reduceMotion:false})},
  './ui':{Card:'Card',Icon:'Icon',useTheme:()=>({colors:{},dark:false})},'./app-text':{Text:'Text'},
  '../../shared/circle-experience':{productPages:[[{key:'adviser',href:'/adviser',label:'Ask Clover',icon:'chatbubble-ellipses-outline'}]]},
});
allNodes(quick.HomeQuickAccess()).find(n=>n.type==='Pressable'&&allNodes(n.props.children).some(child=>child.props?.children==='Ask Clover')).props.onPress();
assert.deepEqual(JSON.parse(JSON.stringify(quickJumps)),[{type:'JUMP_TO',payload:{name:'adviser'}}]);
console.log('PASS Ask Clover destinations: actual main tabs, menu and detail navigation open the main page across five page contexts; header icons retain page context; Quick Access jumps to the main tab.');
