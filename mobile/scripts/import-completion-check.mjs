import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const code = ts.transpileModule(fs.readFileSync(new URL('../src/import-activity.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const slots = [], timers = new Map(), acknowledged = [], refreshes = [];
  let index = 0, dirty = false, effects = [], now = 0, nextTimer = 0, path = '/transactions', finishRefresh;
  const session = { profileId: 'p', queuedFiles: [], offlineStatus: { online: true }, refresh() {}, fileQueue: { acknowledgeProgress: async id => acknowledged.push(id) } };
  const exports = {};
  vm.runInNewContext(code, { exports, console, setTimeout: (fn, ms) => { const id = ++nextTimer; timers.set(id, { fn, at: now + ms }); return id; }, clearTimeout: id => timers.delete(id), require: name => {
    if (name === 'react') return {
      useState(initial) { const i = index++; if (!(i in slots)) slots[i] = initial; return [slots[i], update => { const value = typeof update === 'function' ? update(slots[i]) : update; if (!Object.is(value, slots[i])) { slots[i] = value; dirty = true; } }]; },
      useRef(initial) { const i = index++; return slots[i] ??= { current: initial }; },
      useEffect(fn, deps) { const i = index++, prev = slots[i]; if (!prev || deps.some((v, n) => !Object.is(v, prev.deps[n]))) effects.push(() => { prev?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
    };
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    if (name === 'react-native') return { View: 'View', Pressable: 'Pressable', Platform: { OS: 'ios' }, Keyboard: { addListener: () => ({ remove() {} }) } };
    if (name === 'expo-router') return { router: { push() {} }, usePathname: () => path };
    if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ bottom: 34 }) };
    if (name === './session') return { useSession: () => session };
    if (name === './ui') return { Button: 'Button', Field: 'Field', Icon: 'Icon', useTheme: () => ({ colors: {} }) };
    if (name === './app-text') return { Text: 'Text' };
    if (name === './plan-ui') return { Progress: 'Progress' };
    if (name === './offline/upload-progress') return { uploadProgress: file => file.state === 'done' ? 100 : 45 };
    if (name.endsWith('/import-stage')) return { getImportStageLabel: () => 'Reading file' };
    if (name === './screen-refresh') return { refreshScreen: p => { refreshes.push(p); return new Promise(resolve => { finishRefresh = resolve; }); } };
    throw Error(`Unexpected import ${name}`);
  } });
  function render() { let tree, passes = 0; do { assert(++passes < 20, 'No render loop'); index = 0; dirty = false; effects = []; tree = exports.ImportActivity(); effects.forEach(f => f()); } while (dirty); const nodes = []; function walk(n) { if (Array.isArray(n)) return n.forEach(walk); if (!n || typeof n !== 'object') return; nodes.push(n); walk(n.props?.children); } walk(tree); return nodes; }
  return { session, render, acknowledged, refreshes, setPath: p => { path = p; }, finish: async () => { finishRefresh(true); await tick(); return render(); }, advance(ms) { now += ms; for (const [id, t] of timers) if (t.at <= now) { timers.delete(id); t.fn(); } return render(); }, unmount() { slots.forEach(s => s?.cleanup?.()); }, timers };
}
const file = (id, state) => ({ id, state, workspaceId: 'p' });
const h = harness();
h.session.queuedFiles = [file('a', 'processing')]; h.render();
h.session.queuedFiles = [file('a', 'done')]; let nodes = h.render();
assert.equal(nodes.find(n => n.type === 'Progress').props.value, 95);
h.advance(20_000); assert.deepEqual(h.acknowledged, [], 'Never hide before page refresh completes');
nodes = await h.finish();
assert.equal(nodes.find(n => n.type === 'Progress').props.value, 100);
assert(!nodes.some(n => n.type === 'Button'), 'Successful completion has no Review action');
assert(h.advance(9_999).length, 'Completion stays visible for ten seconds');
h.setPath('/accounts'); h.session.queuedFiles = [file('a', 'done')]; h.render();
assert.equal(h.advance(1).length, 0, 'Ordinary rerenders/navigation must not restart the timer');
assert.deepEqual(h.acknowledged, ['a']);
const next = harness(); next.session.queuedFiles = [file('a', 'processing')]; next.render(); next.session.queuedFiles = [file('a', 'done')]; next.render(); await next.finish(); next.advance(9_000);
next.session.queuedFiles = [file('a', 'done'), file('b', 'processing')]; next.render();
assert.equal(next.advance(2_000).find(n => n.type === 'Progress').props.value, 45, 'Old timer cannot dismiss another upload');
assert.deepEqual(next.acknowledged, []);
next.session.queuedFiles = [file('b', 'attention')]; nodes = next.render();
assert(nodes.some(n => n.props.title === 'Review'), 'Real failures retain their recovery action');
assert(next.advance(30_000).length, 'Errors do not silently auto-dismiss');
const hidden = harness(); hidden.session.queuedFiles = [file('a', 'processing')]; hidden.render(); hidden.session.queuedFiles = [file('a', 'done')]; hidden.render(); hidden.setPath('/import/a'); await hidden.finish();
assert.equal(hidden.advance(20_000).length, 0); assert.deepEqual(hidden.acknowledged, []);
hidden.setPath('/transactions'); hidden.render(); assert(hidden.advance(9_999).length); assert.equal(hidden.advance(1).length, 0);
const cleanup = harness(); cleanup.session.queuedFiles = [file('a', 'processing')]; cleanup.render(); cleanup.session.queuedFiles = [file('a', 'done')]; cleanup.render(); await cleanup.finish(); cleanup.unmount(); assert.equal(cleanup.timers.size, 0);
console.log('PASS native import completion: 100% after refresh, no Review, ten-second dismissal, navigation/new-upload isolation, errors and cleanup');
