import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const flatten = value => Array.isArray(value) ? Object.assign({}, ...value.filter(Boolean).map(flatten)) : value ?? {};
const tick = () => new Promise(resolve => setImmediate(resolve));
function load(file, { os = 'ios', available = true, api = true, target = { current: {} }, reduced = false, transparencySupported = true, session = {} } = {}) {
  const states = [], refs = [], effects = [], animations = [];
  let stateIndex = 0, refIndex = 0;
  const react = {
    createContext: initial => ({ initial }), useContext: () => ({ target }), useCallback: fn => fn,
    useState: initial => { const i = stateIndex++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value; }]; },
    useRef: initial => refs[refIndex++] ??= { current: initial }, useEffect: effect => effects.push(effect),
  };
  const Native = {
    View: 'View', Pressable: 'Pressable', Image: 'Image', StyleSheet: { create: x => x, flatten, absoluteFill: { position: 'absolute', inset: 0 } },
    Platform: { OS: os }, useColorScheme: () => 'light',
    AccessibilityInfo: { isReduceMotionEnabled: async () => reduced, ...(transparencySupported ? { isReduceTransparencyEnabled: async () => reduced } : {}), addEventListener: () => ({ remove() {} }) },
    Animated: { View: 'Animated.View', Value: class { constructor(v) { this.value = v; } setValue(v) { this.value = v; } stopAnimation() {} },
      timing: (value, options) => ({ start() { animations.push(options); value.setValue(options.toValue); } }) },
  };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' };
    if (name === 'react-native') return Native;
    if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 44, bottom: os === 'ios' ? 34 : 24 }) };
    if (name === 'expo-glass-effect') return { GlassView: 'GlassView', isLiquidGlassAvailable: () => available, isGlassEffectAPIAvailable: () => api };
    if (name === 'expo-blur') return { BlurView: 'BlurView', BlurTargetView: 'BlurTargetView' };
    if (name === 'expo-router') return { usePathname: () => '/', useFocusEffect() {}, router: {} };
    if (name === '@clerk/expo') return { useUser: () => ({ user: { hasImage: true, imageUrl: 'test://photo' } }) };
    if (name.endsWith('/session')) return { useSession: () => session };
    if (name.endsWith('/display-preferences')) return { useDisplayPreferences: () => ({ appearance: 'light' }) };
    if (name.endsWith('/access')) return { useAccess: () => ({ active: true }) };
    if (name.endsWith('/icon-assets')) return { mobileNavigationIcons: {}, mobileInterfaceIcons: {}, mobileCategoryIcons: {} };
    if (name.endsWith('/glass-backdrop')) return { GlassBackdrop: 'GlassBackdrop', GlassContent: 'GlassContent' };
    if (name.endsWith('/navigation-bar')) return { NavigationBar: 'NavigationBar', NavigationItem: 'NavigationItem' };
    return new Proxy({}, { get: (_, key) => key === '__esModule' ? true : String(key) });
  } });
  return { render(name, props = {}) { stateIndex = 0; refIndex = 0; effects.length = 0; return exports[name](props); }, effects, animations };
}
function nodes(tree) { const result = []; const visit = node => { if (Array.isArray(node)) return node.forEach(visit); if (!node || typeof node !== 'object') return; result.push(node); visit(node.props?.children); }; visit(tree); return result; }
const name = node => typeof node.type === 'function' ? node.type.name : node.type;
for (const os of ['ios', 'android']) {
  const bar = load('../src/navigation-bar.tsx', { os });
  const tree = bar.render('NavigationBar', { children: 'ITEMS' });
  assert.equal(flatten(tree.props.style).height, 72);
  assert.equal(flatten(tree.props.style).bottom, os === 'ios' ? 34 : 24, 'Safe area belongs outside the shared capsule');
  const row = nodes(tree).find(node => node.props?.children === 'ITEMS');
  assert.equal(flatten(row.props.style).paddingVertical, 7, 'Equal top/bottom padding keeps the add control centered');
  const add = bar.render('NavigationItem', { label: 'Add', children: '+', add: true, color: 'teal', onPress() {} });
  assert.equal(flatten(add.props.style({ pressed: false })).justifyContent, 'center');
  assert.equal(nodes(add).length, 1, 'The add control must not reserve hidden label space');
  const reduced = load('../src/glass-backdrop.tsx', { os, reduced: true });
  reduced.render('GlassBackdrop'); reduced.effects.forEach(effect => effect()); await tick();
  assert.equal(reduced.render('GlassBackdrop').type, 'View', 'Reduced transparency uses an opaque accessible surface');
}
for (const [options, expected] of [[{}, 'GlassView'], [{ api: false }, 'View'], [{ available: false }, 'View'], [{ os: 'android' }, 'View']]) {
  const h = load('../src/glass-backdrop.tsx', options), tree = h.render('GlassBackdrop');
  assert.equal(tree.type, expected);
  if (options.os === 'android') assert(nodes(tree).some(node => node.type === 'BlurView' && node.props.blurTarget), 'Android must blur the focused screen target');
}
// Passing null explicitly represents the period before the focused target registers.
const missing = load('../src/glass-backdrop.tsx', { os: 'android', target: null }).render('GlassBackdrop');
assert.equal(nodes(missing).length, 1); assert.equal(flatten(missing.props.style).backgroundColor, '#F7FBFC');
const webGlass = load('../src/glass-backdrop.tsx', { os: 'web', transparencySupported: false });
webGlass.render('GlassBackdrop');
assert.doesNotThrow(() => webGlass.effects.forEach(effect => effect()), 'Platforms without the iOS transparency API must still render navigation');
for (const reduced of [false, true]) {
  const h = load('../src/route-reveal.tsx', { reduced });
  const tree = h.render('RouteReveal', { children: 'GLASS' });
  assert.equal(tree.props.style.opacity, undefined, 'No zero-opacity ancestor may suppress native Liquid Glass');
  h.effects.forEach(effect => effect()); await tick();
  assert.equal(h.animations[0].toValue, 0); assert.equal(h.animations[0].duration, reduced ? 0 : 220);
}
const session = { ready: true, profileId: '', setupPending: true, error: '', demo: false, data: { profiles: [] }, refresh() {} };
const gate = load('../src/ui.tsx', { session });
let tree = gate.render('ProfileGate', { children: 'AUTHORISED_CONTENT' });
assert.equal(flatten(tree.props.style).paddingTop, undefined, 'The root safe-area container already supplies the top inset');
assert(!JSON.stringify(tree).includes('Set up your Profile'));
assert(!JSON.stringify(tree).includes('Create your first Profile'));
assert(nodes(tree).some(node => node.props?.children === 'Home'));
assert(nodes(tree).some(node => name(node) === 'DetailNavigation' && node.props.disabled), 'No page request may navigate before an authorized Profile exists');
assert(!nodes(tree).some(node => node.props?.title === 'Try again'), 'Normal background completion should not present an error');
session.profileId = 'server-authorized-profile';
assert.equal(gate.render('ProfileGate', { children: 'AUTHORISED_CONTENT' }).props.children, 'AUTHORISED_CONTENT');
session.profileId = ''; session.setupPending = false;
assert(nodes(gate.render('ProfileGate')).some(node => node.props?.title === 'Try again'), 'An actual missing Profile remains recoverable');
const avatar = gate.render('AccountAvatar');
assert.equal(avatar.type().props.style.borderRadius, 17, 'Photo avatars match the 34px circular fallback');
console.log('PASS onboarding Home handoff, retry recovery, circle avatar, shared Android/iOS nav geometry, glass initialization and accessibility fallback');
