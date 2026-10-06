import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../app/(tabs)/adviser.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function render(wide, keyboardOpen) {
  let arrayCount = 0;
  const exports = {};
  const dependencies = {
    react: { useEffect() {}, useRef: value => ({ current: value }), useState: value => [Array.isArray(value) && arrayCount++ === 0 ? [{ role: 'user', content: 'How much did I spend?' }, { role: 'assistant', content: 'Here is your summary.' }] : value, () => {}] },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { View: 'View', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'ios' }, Pressable: 'Pressable' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 44, bottom: 34 }) },
    'expo-router': { useLocalSearchParams: () => ({}), router: {} },
    '../../src/adaptive-detail': { useDetailPane: () => wide },
    '../../src/adaptive': { useAdaptiveLayout: () => ({ dockHeight: 72 }) },
    '../../src/navigation-bar': { useKeyboardOpen: () => keyboardOpen },
    '../../src/session': { useSession: () => ({ offlineStatus: { online: true }, profileId: 'fixture', demo: false, data: {} }) },
    '../../src/ui': { useTheme: () => ({ colors: {} }), Body: 'Body', Card: 'Card', Icon: 'Icon', Notice: 'Notice', Screen: 'Screen' },
    '../../../shared/use-adviser-history': { createAdviserHistoryHook: () => () => ({ conversations: [], busy: false }) },
    '../../src/adviser-input-tools': { AdviserInputTools: 'AdviserInputTools' },
  };
  vm.runInNewContext(code, { exports, require: name => dependencies[name] ?? new Proxy({}, { get: (_, key) => String(key) }) });
  return exports.default();
}
function find(tree, predicate, parent) {
  if (Array.isArray(tree)) return tree.flatMap(child => find(child, predicate, parent));
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [{ node: tree, parent }] : []), ...find(tree.props?.children, predicate, tree)];
}
for (const wide of [false, true]) for (const keyboard of [false, true]) {
  const tree = render(wide, keyboard);
  const composers = find(tree, node => node.type === 'AdviserInputTools');
  assert.equal(composers.length, 1, 'A reply must leave exactly one composer, even while resizing');
  assert.equal(composers[0].parent.props.style.paddingBottom, keyboard ? 16 : 122, 'After a reply, the composer must clear the visible navigation and safe area, without a duplicate gap above the keyboard');
  assert(find(tree, node => node.type === 'Screen').every(({ node }) => node.props.keyboardInsets === false), 'Chat uses its outer keyboard avoider, never a second inset');
}
console.log('PASS chat after-reply composer: phone/tablet, keyboard shown/hidden, dock clearance and one composer');
