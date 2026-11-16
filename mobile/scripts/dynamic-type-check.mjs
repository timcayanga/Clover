import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/app-text.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
let fontScale = 1;
const exports = {};
const jsx = (type, props, key) => ({ type, props, key });
const dependencies = {
  react: { createContext: value => ({ Provider: 'Provider', value }), useContext: context => context.value, forwardRef: render => render, useRef: value => ({ current: value }) },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': { Text: 'NativeText', TextInput: 'NativeTextInput', StyleSheet: { flatten: value => value }, useWindowDimensions: () => ({ fontScale }) },
  './keyboard-visibility': { FocusVisibility: { value: () => {} } },
  './app-font': { resolveAppFont: () => 'Poppins-Regular' },
};
vm.runInNewContext(code, { exports, require: name => dependencies[name] });
const keys = [];
for (fontScale of [1, 2, 1]) {
  const text = exports.Text({ children: 'Account', style: { fontSize: 14 } }, null).props.children;
  keys.push(text.key);
  assert.equal(text.props.children, 'Account');
  const input = exports.TextInput({ value: 'Unsaved draft' }, null);
  assert.equal(input.key, undefined, 'Text inputs must retain native identity and focus during Dynamic Type changes');
  assert.equal(input.props.value, 'Unsaved draft');
}
assert.deepEqual(keys, [1, 2, 1], 'Changed font scale invalidates native label measurement');
console.log('PASS live Dynamic Type remeasurement preserves input identity');
