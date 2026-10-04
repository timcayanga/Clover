import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = ts.transpileModule(fs.readFileSync(new URL('../src/settings-data.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(fails) {
  const states = [], refs = [], effects = [], dependencies = [], calls = []; let si = 0, ri = 0, ei = 0;
  const exports = {};
  const session = { profileId: 'fixture-profile', demo: false, request: async (_path, options) => {
    if (!options) return { appleCancellationRequired: false, googleCancellationRequired: false };
    calls.push('delete-request'); if (fails) throw new Error('Deletion could not complete');
    calls.push('delete-confirmed'); return { success: true };
  }, signOut: async options => calls.push(['sign-out', options]), refresh() {} };
  vm.runInNewContext(source, { exports, Error, require: name => {
    if (name === 'react') return {
      useState: initial => { const i = si++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
      useRef: initial => refs[ri++] ??= { current: initial },
      useEffect: (effect, deps) => { const i = ei++; if (!dependencies[i] || deps.some((dep,j) => !Object.is(dep, dependencies[i][j]))) { dependencies[i] = deps; effects.push(effect); } },
    };
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' };
    if (name === 'react-native') return { AppState: { addEventListener: () => ({ remove() {} }) }, Platform: { OS: 'ios' }, Linking: {} };
    if (name === './session') return { useSession: () => session };
    if (name === './access') return { useAccess: () => ({ markAccountDeleted: () => calls.push('friendly-completion') }) };
    if (name === './ui') return { ...Object.fromEntries(['Body', 'Button', 'Card', 'Field', 'Notice'].map(n => [n, n])), useTheme: () => ({ styles: {} }) };
    if (name === './app-text') return { Text: 'Text' };
    return {};
  }});
  function render() { si = ri = ei = 0; const tree = exports.SettingsData({ accountOnly: true }); effects.splice(0).forEach(fn => fn()); const nodes = []; function walk(node) { if (Array.isArray(node)) return node.forEach(walk); if (!node || typeof node !== 'object') return; nodes.push(node); walk(node.props?.children); } walk(tree); return nodes; }
  return { render, calls };
}
for (const fails of [false, true]) {
  const h = harness(fails); let nodes = h.render();
  nodes.find(n => n.props.title === 'Delete account').props.onPress(); await tick(); nodes = h.render();
  assert.equal(nodes.find(n => n.props.title === 'Confirm deletion').props.disabled, true);
  nodes.find(n => n.props.label === 'Type DELETE to confirm').props.onChangeText('DELETE'); nodes = h.render();
  nodes.find(n => n.props.title === 'Confirm deletion').props.onPress(); await tick(); nodes = h.render();
  if (fails) {
    assert.deepEqual(h.calls, ['delete-request']);
    assert(nodes.some(n => n.type === 'Notice' && n.props.children === 'Deletion could not complete'));
  } else {
    assert.equal(JSON.stringify(h.calls), JSON.stringify(['delete-request', 'delete-confirmed', 'friendly-completion', ['sign-out', { accountDeleted: true }]]));
  }
}
console.log('PASS account deletion: confirmation required, friendly completion only after confirmed server deletion, local cleanup and failure retention');
