import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { nativeEntryAccess } from '../src/launch-history.ts';
const code = ts.transpileModule(`${fs.readFileSync(new URL('../app/auth.tsx', import.meta.url), 'utf8')}\nexport { AuthForm };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const require = createRequire(import.meta.url);
const { ClerkAPIResponseError } = require('@clerk/shared/errors/clerkApiResponseError');
const authHelpers = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../../shared/auth-failure.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: authHelpers });
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(active, fails = false, bootstrapError = active, mode = "sign-in", recovery, signInFixture, startSSOFlow) {
  const calls = [], telemetry = [], states = [], exports = {}; let index = 0;
  const session = { error: bootstrapError ? 'Unable to load your account.' : '', refresh: () => calls.push('retry'), signOut: async () => { calls.push('sign-out'); if (fails) throw new Error('Offline'); } };
  vm.runInNewContext(code, { exports, Error, require: name => {
    if (name === 'react') return { useEffect() {}, useRef: value => { const i = index++; return states[i] ??= { current: value }; }, useState: initial => { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value; }]; } };
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' };
    if (name === 'react-native') return { Platform: { OS: signInFixture ? 'android' : 'ios' }, ...Object.fromEntries(['ActivityIndicator', 'Image', 'View', 'KeyboardAvoidingView', 'Pressable', 'Switch'].map(n => [n,n])) };
    if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 50, bottom: 34 }) };
    if (name === 'expo-router') return { useLocalSearchParams: () => ({ mode }) };
    if (name === '@clerk/expo') return { useSignIn: () => ({ signIn: signInFixture ?? { password: async () => ({error:{errors:[{code:'session_exists',message:'Already signed in'}]}}) } }), useSignUp: () => ({ signUp: {} }) };
    if (name === '@clerk/expo/apple') return { useSignInWithApple: () => ({}) };
    if (name === '@clerk/expo/experimental') return { useSSO: () => ({startSSOFlow}) };
    if (name === '../src/access') return { useAccess: () => ({ active, welcomeAllowed: !active, beginAuthEntry() {}, duringAuthentication: action => action(), recoverSession: async () => { calls.push('recover'); return recovery; } }) };
    if (name === '../src/session-recovery') return {alreadySignedIn: error => error?.errors?.[0]?.code === 'session_exists'};
    if (name === '../../shared/auth-failure') return authHelpers;
    if (name === '../../shared/analytics') return {beginTelemetry: (_kind, base) => (outcome, extra) => telemetry.push({ ...base, outcome, ...extra })};
    if (name === '../src/auth-token-cache') return {setRememberSession: async () => {}};
    if (name === '../src/session') return { useSession: () => session };
    if (name === '../src/ui') return { ...Object.fromEntries(['Body','Button','Card','Field','Heading','Icon','Notice','Screen'].map(n => [n,n])), useTheme: () => ({ colors: {} }) };
    return {};
  }});
  function render() { index = 0; const nodes = []; function walk(node) { if (Array.isArray(node)) return node.forEach(walk); if (!node || typeof node !== 'object') return; nodes.push(node); walk(node.props?.children); } walk(exports.AuthForm()); return nodes; }
  return { render, calls, telemetry, setActive: value => { active = value; }, entry: needsOnboarding => nativeEntryAccess(active, needsOnboarding, mode) };
}
const signedOut = harness(false).render();
assert(signedOut.some(n => n.props.title === 'Continue with Google'));
assert(signedOut.some(n => n.props.label === 'Email address'));
for (const mode of ['sign-in', 'sign-up']) {
  const nodes = harness(true, false, false, mode).render();
  assert(nodes.some(n => n.type === 'ActivityIndicator' && n.props.accessibilityLabel === 'Opening Clover'));
  assert(!nodes.some(n => n.type === 'Heading' || n.type === 'Field'), 'No auth title or form after authentication, even during delayed bootstrap');
}
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

for (const succeeds of [true, false]) {
  const h = harness(false, false, false, 'sign-in', succeeds);
  h.render().find(n => n.props.label === 'Email address').props.onChangeText('fixture@example.test');
  h.render().find(n => n.props.label === 'Password').props.onChangeText('fixture-password');
  const button = h.render().find(n => n.type === 'Button' && n.props.title === 'Sign In');
  assert(button, 'Password submit exists');
  button.props.onPress(); await tick(); await tick();
  assert.deepEqual(h.calls, ['recover']);
  const notices = h.render().filter(n => n.type === 'Notice').map(n => n.props.children);
  if (succeeds) assert(!notices.some(message => /already signed in/i.test(String(message))));
  else assert(notices.some(message => /could not resume/.test(String(message))));
}
console.log('PASS actual sign-in submit recovers an existing session and gives a retryable connection error if verification fails');

// Exercise AuthForm's Android submit handlers against actual 422 HTTP responses,
// converted into the installed Clerk SDK's error class. No live accounts are used.
const server = createServer((req, res) => {
  const code = {
    '/password': 'form_password_incorrect',
    '/compromised': 'form_password_pwned',
    '/send-code': 'form_param_value_invalid',
    '/finalize': 'form_param_value_invalid',
    '/google': 'strategy_for_instance_invalid',
  }[req.url];
  res.writeHead(code ? 422 : 200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(code ? { errors: [{ code, message: 'private@example.test', long_message: 'fixture private message', meta: { secret: 'fixture-secret' } }] } : {}));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const failures = path => fetch(`http://127.0.0.1:${server.address().port}/${path}`).then(async response => {
  const data = await response.json();
  return { error: response.ok ? null : new ClerkAPIResponseError('fixture private message', { data: data.errors, status: response.status }) };
});
const find = (h, key, value) => {
  const node = h.render().find(n => n.props[key] === value);
  assert(node, `Missing ${key} ${value}`);
  return node.props;
};
const press = async (h, title) => {
  const button = find(h, 'title', title);
  assert.equal(button.disabled, false);
  await button.onPress();
};
const completeStep = (h, label, key = 'title') => new Promise((resolve, reject) => {
  const deadline = Date.now() + 4000;
  function check() {
    if (h.render().some(node => node.props[key] === label && !node.props.disabled)) return resolve();
    if (Date.now() > deadline) return reject(new Error(`Timed out waiting for ${label}`));
    setTimeout(check, 5);
  }
  check();
});
const fill = (h, password) => {
  find(h, 'label', 'Email address').onChangeText('private@example.test');
  find(h, 'label', 'Password').onChangeText(password);
};
try {
  let passwordCalls = 0, codeSends = 0, finalizes = 0;
  const signIn = {
    status: 'needs_identifier',
    supportedSecondFactors: [{ strategy: 'email_code' }],
    password: async () => {
      passwordCalls++;
      if (passwordCalls === 1) return failures('password');
      signIn.status = 'needs_client_trust';
      return failures('ok');
    },
    mfa: {
      sendEmailCode: () => failures(++codeSends === 1 ? 'send-code' : 'ok'),
      verifyEmailCode: async () => {
        signIn.status = 'complete';
        return failures('ok');
      },
    },
    finalize: () => failures(++finalizes === 1 ? 'finalize' : 'ok'),
  };
  const h = harness(false, false, false, 'sign-in', undefined, signIn);
  fill(h, 'wrong-password');
  const firstSubmit = find(h, 'title', 'Sign In').onPress;
  firstSubmit();
  firstSubmit();
  // Submit handlers intentionally return void, so wait for the form to settle.
  await completeStep(h, 'Continue with Google');
  assert.equal(passwordCalls, 1, 'Duplicate taps send only one password request');
  assert.equal(find(h, 'title', 'Sign In').disabled, true, 'Rejected credentials cannot be resubmitted unchanged');
  assert.equal(find(h, 'label', 'Email address').value, 'private@example.test');
  fill(h, 'correct-password');
  await press(h, 'Sign In');
  await completeStep(h, 'Resend code');
  await press(h, 'Resend code');
  await completeStep(h, 'Resend code');
  find(h, 'label', 'Verification code').onChangeText('123456');
  await press(h, 'Continue');
  await completeStep(h, 'Finish signing in');
  await press(h, 'Finish signing in');
  await completeStep(h, 'Finish signing in');
  assert.deepEqual([passwordCalls, codeSends, finalizes], [2, 2, 2]);
  const errors = h.telemetry.filter(event => event.outcome === 'failed');
  assert.deepEqual(errors.map(({ status, provider_code, auth_stage }) => [status, provider_code, auth_stage]), [
    [422, 'form_password_incorrect', 'password'],
    [422, 'form_param_value_invalid', 'send_email_code'],
    [422, 'form_param_value_invalid', 'finalize_sign_in'],
  ]);
  assert.equal(h.telemetry.at(-1).outcome, 'completed');
  assert.doesNotMatch(JSON.stringify(h.telemetry), /private|fixture-secret|correct-password|123456/);

  let resetStarts = 0, resetSends = 0, resetSubmissions = 0, resetFinalizes = 0, rejectedPasswords = 0;
  const resetSignIn = {
    status: 'needs_identifier',
    password: () => { rejectedPasswords++; return failures('compromised'); },
    create: ({ identifier }) => { assert.equal(identifier, 'private@example.test'); resetStarts++; return failures('ok'); },
    resetPasswordEmailCode: {
      sendCode: () => failures(++resetSends === 1 ? 'send-code' : 'ok'),
      verifyCode: () => failures('ok'),
      submitPassword: () => {
        if (++resetSubmissions === 1) return failures('compromised');
        resetSignIn.status = 'complete';
        return failures('ok');
      },
    },
    finalize: async () => { resetFinalizes++; reset.setActive(true); return failures('ok'); },
  };
  const reset = harness(false, false, false, 'sign-in', undefined, resetSignIn);
  fill(reset, 'known-compromised-fixture');
  await press(reset, 'Sign In');
  await completeStep(reset, 'Send reset code');
  assert.equal(resetSends, 1, 'Android requests a code directly after the password rejection');
  assert.equal(find(reset, 'label', 'Email address').value, 'private@example.test');
  await press(reset, 'Send reset code');
  await completeStep(reset, 'Resend code');
  find(reset, 'label', 'Verification code').onChangeText('123456');
  await press(reset, 'Continue');
  await completeStep(reset, 'Back to sign in');
  for (const password of ['rejected-new-fixture', 'accepted-new-fixture']) {
    find(reset, 'label', 'New password').onChangeText(password);
    find(reset, 'label', 'Confirm password').onChangeText(password);
    await press(reset, 'Save new password');
    if (password === 'rejected-new-fixture') await completeStep(reset, 'Back to sign in');
  }
  await completeStep(reset, 'Opening Clover', 'accessibilityLabel');
  assert.equal(reset.entry(undefined).auth, true);
  assert.equal(reset.entry(false).auth, false);
  assert.equal(reset.entry(false).app, true);
  assert(reset.render().some(node => node.props.accessibilityLabel === 'Opening Clover'));
  assert(!reset.render().some(node => node.props.title === 'Sign In'));
  assert.deepEqual([rejectedPasswords, resetStarts, resetSends, resetSubmissions, resetFinalizes], [1, 1, 2, 2, 1]);
  assert.deepEqual(reset.telemetry.filter(event => event.outcome === 'failed').map(event => event.auth_stage),
    ['password', 'send_email_code', 'submit_new_password']);
  assert.doesNotMatch(JSON.stringify(reset.telemetry), /private|fixture|123456/);

  let directSends = 0;
  const direct = harness(false, false, false, 'sign-in', undefined, {
    password: () => failures('compromised'),
    create: ({ identifier }) => {
      assert.equal(identifier, 'private@example.test');
      return failures('ok');
    },
    resetPasswordEmailCode: { sendCode: () => { directSends++; return failures('ok'); } },
  });
  fill(direct, 'compromised-fixture');
  await press(direct, 'Sign In');
  await completeStep(direct, 'Resend code');
  assert.equal(directSends, 1);
  assert.equal(find(direct, 'label', 'Verification code').value, '');
  assert(direct.render().some(node => Array.isArray(node.props.children) &&
    node.props.children.includes('private@example.test')));
  assert.equal(direct.telemetry.at(-1).method, 'password_reset');

  let oauthCalls = 0;
  const google = harness(false, false, false, 'sign-in', undefined, {}, async () => {
    oauthCalls++;
    if (oauthCalls === 1) throw (await failures('google')).error;
    return { createdSessionId: 'verified-fixture-session', authSessionResult: { type: 'success' } };
  });
  await press(google, 'Continue with Google');
  await completeStep(google, 'Continue with Google');
  assert.equal(google.telemetry[0].provider_code, 'strategy_for_instance_invalid');
  assert.equal(google.telemetry[0].auth_stage, 'google_oauth');
  await press(google, 'Continue with Google');
  await completeStep(google, 'Continue with Google');
  assert.equal(google.telemetry[1].outcome, 'completed');
  assert.equal(oauthCalls, 2);
} finally {
  await new Promise(resolve => server.close(resolve));
}
console.log('PASS Android HTTP 422 recovery: corrected password, resend code, finalize retry and Google retry, with safe Clerk codes');
