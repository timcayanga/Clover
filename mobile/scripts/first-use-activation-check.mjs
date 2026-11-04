import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile = file => ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const loaders = {}; vm.runInNewContext(compile('../src/screen-refresh.ts'), { exports: loaders, Map, Set, Promise });
const states = [], routes = [], requests = []; let stateIndex = 0, focus, cleanup;
let payload = { state: 'start', workspaceId: 'profile-a' }, delayed = null;
const session = { demo: false, profileId: 'profile-a', request: async (path, options) => {
  requests.push({ path, options }); if (options) return {};
  if (delayed) return new Promise(resolve => delayed.push(resolve));
  return { activation: payload };
} };
const exports = {};
vm.runInNewContext(compile('../src/first-use-activation.tsx'), { exports, encodeURIComponent, require: name => {
  if (name === 'react') return { useState: value => { const i = stateIndex++; if (!(i in states)) states[i] = value; return [states[i], value => { states[i] = value; }]; }, useCallback: fn => fn };
  if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' };
  if (name === 'expo-router') return { router: { push: route => routes.push(route) }, useFocusEffect: fn => { focus = fn; } };
  if (name === 'react-native') return { View: 'View' };
  if (name === './screen-refresh') return loaders;
  if (name === './session') return { useSession: () => session };
  if (name === './ui') return { ...Object.fromEntries(['Body','Button','Card','Heading'].map(k => [k,k])), money: (amount, currency) => `${currency} ${amount}` };
  throw Error(name);
} });
function render(hidden = false) {
  stateIndex = 0; const nodes = [];
  function walk(value) { if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') { nodes.push(value); walk(value.props?.children); } }
  walk(exports.FirstUseActivation({ hidden })); return nodes;
}
const tick = () => new Promise(resolve => setImmediate(resolve));
render(); cleanup = focus(); await tick(); let nodes = render();
assert(nodes.some(node => node.props.children === 'Start with one transaction'));
nodes.find(node => node.props.title === 'Add a transaction').props.onPress(); assert.equal(routes[0], '/add-transaction');
payload = { state: 'result', workspaceId: 'profile-a', transaction: { id: 'saved-row', name: 'Synthetic lunch', amount: '120', currency: 'PHP', type: 'expense', needsReview: true } };
await loaders.refreshScreen('/'); nodes = render();
assert(nodes.some(node => node.props.children === 'Your first transaction is in Clover'), 'Background import completion refreshes the mounted Home card without another focus');
assert(requests.some(request => request.options && JSON.parse(request.options.body).action === 'view'));
nodes.find(node => node.props.title === 'View your transaction').props.onPress(); assert.equal(routes[1].params.id, 'saved-row');
assert(!JSON.stringify(render(true)).includes('PHP 120'), 'Home privacy also masks the first result');
// A delayed read from the previous Profile cannot replace the new Profile state.
delayed = []; const oldRefresh = loaders.refreshScreen('/'); await tick(); cleanup(); session.profileId = 'profile-b'; render(); delayed[0]({ activation: payload }); delayed = null;
payload = { state: 'start', workspaceId: 'profile-b' }; cleanup = focus(); await oldRefresh; await tick();
nodes = render(); assert(nodes.some(node => node.props.children === 'Start with one transaction')); assert(!JSON.stringify(nodes).includes('Synthetic lunch'));
cleanup(); const before = requests.length; await loaders.refreshScreen('/'); assert.equal(requests.length, before, 'Blur removes the activation refresh loader');
console.log('PASS native first use: live import refresh, entry/detail destinations, amount privacy, delayed Profile isolation and focus cleanup');
