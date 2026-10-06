import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../app/(tabs)/_layout.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
for (const focused of [true, false, true]) {
  const exports = {};
  const dependencies = {
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { View: 'View' },
    'expo-router': { Tabs: Object.assign(() => {}, { Screen: 'TabScreen' }), router: {}, useIsFocused: () => focused },
    '../../src/access': { useAccess: () => ({ active: true }) },
    '../../src/session': { useSession: () => ({ profileId: 'sample', demo: false }) },
    '../../src/ui': { useTheme: () => ({ colors: {}, dark: false }), ProfileGate: 'ProfileGate' },
  };
  vm.runInNewContext(code, { exports, require: name => dependencies[name] ?? {} });
  const view = exports.default().props.children;
  assert.equal(view.props.accessibilityElementsHidden, !focused);
  assert.equal(view.props.importantForAccessibility, focused ? 'auto' : 'no-hide-descendants');
  assert.equal(view.props.pointerEvents, focused ? 'auto' : 'none');
}
console.log('PASS covered tab content hides from assistive navigation and restores interaction on return');
