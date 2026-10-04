import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const code = ts.transpileModule(`${fs.readFileSync(new URL('../app/auth.tsx', import.meta.url), 'utf8')}\nexport { AuthForm };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(active, fails = false) {
  const calls = [], states = [], exports = {}; let index = 0;
  const session = { error: active ? 'Unable to load your account.' : '', refresh: () => calls.push('retry'), signOut: async () => { calls.push('sign-out'); if (fails) throw new Error('Offline'); } };
  vm.runInNewContext(code, { exports, Error, require: name => {
    if (name === 'react') return { useEffect() {}, useRef: value => ({ current: value }), useState: initial => { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value; }]; } };
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' };
    if (name === 'react-native') return { Platform: { OS: 'ios' }, ...Object.fromEntries(['Image', 'View', 'KeyboardAvoidingView', 'Pressable', 'Switch'].map(n => [n,n])) };
    if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 50, bottom: 34 }) };
    if (name === 'expo-router') return { useLocalSearchParams: () => ({}) };
    if (name === '@clerk/expo') return { useSignIn: () => ({ signIn: {} }), useSignUp: () => ({ signUp: {} }) };
    if (name === '@clerk/expo/apple') return { useSignInWithApple: () => ({}) };
    if (name === '@clerk/expo/experimental') return { useSSO: () => ({}) };
    if (name === '../src/access') return { useAccess: () => ({ active, welcomeAllowed: !active, beginAuthEntry() {} }) };
    if (name === '../src/session') return { useSession: () => session };
    if (name === '../src/ui') return { ...Object.fromEntries(['Body','Button','Card','Field','Heading','Icon','Notice','Screen'].map(n => [n,n])), useTheme: () => ({ colors: {} }) };
    return {};
  }});
  function render() { index = 0; const nodes = []; function walk(node) { if (Array.isArray(node)) return node.forEach(walk); if (!node || typeof node !== 'object') return; nodes.push(node); walk(node.props?.children); } walk(exports.AuthForm()); return nodes; }
  return { render, calls };
}
const signedOut = harness(false).render();
assert(signedOut.some(n => n.props.title === 'Continue with Google'));
assert(signedOut.some(n => n.props.label === 'Email address'));
for (const fails of [false, true]) {
  const h = harness(true, fails); let nodes = h.render();
  assert(!nodes.some(n => n.type === 'Field' || n.props.title === 'Continue with Google' || n.props.title === 'Sign in with Apple'), 'Do not offer inert authentication actions after sign-in');
  nodes.find(n => n.props.title === 'Try again').props.onPress();
  nodes.find(n => n.props.title === 'Sign out').props.onPress(); await tick(); nodes = h.render();
  assert.deepEqual(h.calls, ['retry', 'sign-out']);
  assert.equal(nodes.find(n => n.props.title === 'Sign out').props.disabled, false);
  if (fails) assert(nodes.some(n => n.type === 'Notice' && n.props.children === 'Unable to sign out. Please try again.'));
}
console.log('PASS auth bootstrap recovery: retry and sign out remain available, active session hides login actions, failed sign-out can retry');
