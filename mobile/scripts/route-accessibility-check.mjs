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
  const bar=tabs.props.tabBar({state,descriptors:{tx:{options:{title:'Transactions'}},ask:{options:{title:'Ask Clover'}}},navigation:{emit:()=>({defaultPrevented:false}),navigate:(...args)=>navigated.push(args)}});
  bar.props.children.find(node=>node.props.label==='Ask Clover').props.onPress();
  assert.equal(navigated.length,0,'Ask Clover must not replace the current route');
  assert.equal(opened.length,1);
  assert.equal(opened[0].page,'transactions');

}
console.log('PASS covered tab content hides from assistive navigation and restores interaction on return');
