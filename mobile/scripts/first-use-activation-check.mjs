import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile = file => ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const homeSource = fs.readFileSync(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');
assert.ok(homeSource.indexOf('<FirstUseActivation') > 0 && homeSource.indexOf('<FirstUseActivation') < homeSource.indexOf('{!data ? ('),
  'First-use actions must mount even if the Home balance request is still loading or failed');
const loaders = {}; vm.runInNewContext(compile('../src/screen-refresh.ts'), { exports: loaders, Map, Set, Promise });
const states = [], routes = [], requests = [], telemetry = []; let stateIndex = 0, focus, cleanup;
let top = 900, appState = "active";
const frames = [];
const viewport = { current: { measureInWindow: cb => cb(0, 0, 400, 800) } };
const visibilityCheck = { current: null };
let payload = { state: 'start', workspaceId: 'profile-a' }, delayed = null, failAck = false;
const session = { demo: false, profileId: 'profile-a', request: async (path, options) => {
  requests.push({ path, options }); if (options) { if (failAck && JSON.parse(options.body).action === "acknowledge") throw Error("Temporary failure"); return {}; }
  if (delayed) return new Promise(resolve => delayed.push(resolve));
  return { activation: payload };
} };
const exports = {};
vm.runInNewContext(compile('../src/first-use-activation.tsx'), { exports, encodeURIComponent, requestAnimationFrame: fn => frames.push(fn), cancelAnimationFrame: () => {}, require: name => {
  if (name === 'react') return { useState: value => { const i = stateIndex++; if (!(i in states)) states[i] = value; return [states[i], value => { states[i] = value; }]; }, useRef: value => { const i = stateIndex++; return states[i] ??= { current: value }; }, useCallback: fn => fn, useEffect: fn => fn() };
  if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' };
  if (name === 'expo-router') return { router: { push: route => routes.push(route) }, useFocusEffect: fn => { focus = fn; } };
  if (name === 'react-native') return { View: 'View', AppState: { get currentState() { return appState; }, addEventListener: () => ({ remove() {} }) } };
  if (name === '../../shared/analytics') return { telemetry: (event, props) => telemetry.push({ event, ...props }) };
  if (name === './screen-refresh') return loaders;
  if (name === './session') return { useSession: () => session };
  if (name === './ui') return { ...Object.fromEntries(['Body','Button','Card','Heading'].map(k => [k,k])), money: (amount, currency) => `${currency} ${amount}` };
  throw Error(name);
} });
function render(hidden = false) {
  stateIndex = 0; const nodes = [];
  function walk(value) { if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') { nodes.push(value); walk(value.props?.children); } }
  walk(exports.FirstUseActivation({ hidden, viewport, visibilityCheck }));
  for (const node of nodes) if (node.type === "View" && node.props.onLayout) {
    node.props.ref.current = { measureInWindow: cb => cb(20, top, 360, 96) };
    node.props.onLayout();
  }
  while (frames.length) frames.shift()();
  return nodes;
}
const tick = () => new Promise(resolve => setImmediate(resolve));
render(); cleanup = focus(); await tick(); let nodes = render();
assert(nodes.some(node => node.props.children === 'Start with one transaction'));
nodes.find(node => node.props.title === 'Add a transaction').props.onPress(); assert.equal(routes[0], '/add-transaction');
nodes.find(node => node.props.title === "Scan a receipt").props.onPress();
nodes.find(node => node.props.title === "Choose a receipt or statement").props.onPress();
assert.deepEqual(routes.slice(1).map(route => route.params.picker), ["camera", "file"]);
assert.deepEqual(telemetry.filter(event => event.event === "activation_method_selected").map(event => event.method), ["manual", "camera", "file"]);
payload = { state: 'result', workspaceId: 'profile-a', transaction: { id: 'saved-row', name: 'Synthetic lunch', amount: '120', currency: 'PHP', type: 'expense', needsReview: true } };
await loaders.refreshScreen('/'); nodes = render();
assert(nodes.some(node => node.props.children === 'Your first transaction is in Clover'), 'Background import completion refreshes the mounted Home card without another focus');
const displayed = () => requests.filter(request => request.options && JSON.parse(request.options.body).action === 'displayed');
assert.equal(displayed().length, 0, "A result outside the viewport does not count");
top = 100;
appState = "background";
render();
assert.equal(displayed().length, 0, "A backgrounded app does not count");
appState = "active";
render();
assert.equal(displayed().length, 1, "The displayed transaction counts");
assert.equal(JSON.parse(displayed()[0].options.body).transactionId, "saved-row");
await loaders.refreshScreen('/'); render();
assert.equal(displayed().length, 1);
nodes.find(node => node.props.title === 'View your transaction').props.onPress(); assert.equal(routes[3].params.id, 'saved-row');
assert(!JSON.stringify(render(true)).includes('PHP 120'), 'Home privacy also masks the first result');
failAck = true; nodes.find(node => node.props.title === 'Got it').props.onPress(); await tick();
assert(JSON.stringify(render()).includes('Could not dismiss this yet'), 'A failed acknowledgement explains why nothing changed');
failAck = false; render().find(node => node.props.title === 'Got it').props.onPress(); await tick(); assert.equal(render().length, 0);
// A delayed read from the previous Profile cannot replace the new Profile state.
delayed = []; const oldRefresh = loaders.refreshScreen('/'); await tick(); cleanup(); session.profileId = 'profile-b'; render(); delayed[0]({ activation: payload }); delayed = null;
payload = { state: 'start', workspaceId: 'profile-b' }; cleanup = focus(); await oldRefresh; await tick();
nodes = render(); assert(nodes.some(node => node.props.children === 'Start with one transaction')); assert(!JSON.stringify(nodes).includes('Synthetic lunch'));
cleanup(); const before = requests.length; await loaders.refreshScreen('/'); assert.equal(requests.length, before, 'Blur removes the activation refresh loader');
console.log('PASS native first use: live import refresh, entry/detail destinations, amount privacy, delayed Profile isolation and focus cleanup');
