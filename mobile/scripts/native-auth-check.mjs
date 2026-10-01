import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { redirectSystemPath } from "../app/+native-intent.ts";

const require = createRequire(import.meta.url);
const callback = "clover://sso-callback?created_session_id=untrusted_fixture&rotating_token_nonce=fixture_nonce";
for (const path of [callback, callback.replace("clover:", "clover-preview:"), "clover:///sso-callback?error=denied", "/sso-callback#fixture", "sso-callback"]) {
  assert.equal(redirectSystemPath({ path, initial: false }), null, "Keep the pending sign-in mounted");
  assert.equal(redirectSystemPath({ path, initial: true }), "/auth?restartSSO=1", "Cold callbacks require a fresh sign-in without leaking credentials");
}
for (const path of ["clover://settings?section=account", "clover://transaction/fixture", "clover://sso-callback-other", "https://example.com/sso-callback", "", "not a URL"]) {
  assert.equal(redirectSystemPath({ path, initial: false }), path, "Unrelated links must retain their destinations");
}

function loadModule(file, mocks) {
  const exports = {};
  runInNewContext(readFileSync(file, "utf8"), {
    exports, URL, Promise,
    require: name => {
      assert.ok(name in mocks, `Unexpected dependency: ${name}`);
      return mocks[name];
    },
  }, { filename: file });
  return exports;
}

// Exercise the installed Expo Router subscriber and Clerk SSO hook together.
// Only the device event bus, browser and remote Clerk responses are stubbed.
// Router must ignore the callback while Clerk independently receives its nonce.
async function checkFlow(outcome) {
  const listeners = new Set();
  const navigations = [];
  const finalized = [];
  const nonces = [];
  let respond;
  let opened;
  const browserOpened = new Promise(resolve => { opened = resolve; });
  const Linking = { addEventListener: (_event, listener) => {
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  } };
  const { subscribe } = loadModule(require.resolve("expo-router/build/link/linking.js"), {
    "expo-linking": Linking, "react-native": { Platform: { OS: "android" } },
    "../fork/extractPathFromURL": {}, "../fork/getPathFromState": {},
    "../fork/getStateFromPath": {}, "../fork/useLinking": {},
    "../getRoutesRedirects": { applyRedirects: url => url },
  });
  const unsubscribe = subscribe({ redirectSystemPath })(url => navigations.push(url));
  const signIn = {
    create: async () => ({ error: null }),
    firstFactorVerification: { externalVerificationRedirectURL: "https://identity.example.test/oauth" },
  };
  const verifiedResource = {
    createdSessionId: outcome === "verification" ? null : "verified_fixture_session",
    firstFactorVerification: { status: "verified" },
    finalize: async () => { finalized.push("verified_fixture_session"); return { error: null }; },
  };
  const { useSSO } = loadModule(resolve(dirname(require.resolve("@clerk/expo/experimental")), "hooks/useSSO.experimental.js"), {
    "@clerk/react": {
      useClerk: () => ({
        client: { signIn: { reload: async ({ rotatingTokenNonce }) => {
          nonces.push(rotatingTokenNonce);
          if (outcome === "rejected") throw new Error("Invalid nonce fixture");
          return { __internal_future: verifiedResource };
        } } },
        setActive: async () => { throw new Error("Incoming session IDs must never be trusted"); },
      }),
      useSignIn: () => ({ signIn }), useSignUp: () => ({ signUp: {} }),
    },
    "../utils/errors": { errorThrower: { throw: message => { throw new Error(message); } } },
    "./ssoDependencies": { loadSSODependencies: () => ({
      AuthSession: { makeRedirectUri: () => "clover://sso-callback" },
      WebBrowser: { openAuthSessionAsync: async (_url, returnUrl) => {
        const response = new Promise(resolve => { respond = resolve; });
        const subscription = Linking.addEventListener("url", ({ url }) => {
          if (url.startsWith(returnUrl)) respond({ type: "success", url });
        });
        opened();
        try { return await response; } finally { subscription.remove(); }
      } },
    }) },
  });
  const pending = useSSO().startSSOFlow({ strategy: "oauth_google" });
  await browserOpened;
  if (["cancel", "dismiss"].includes(outcome)) respond({ type: outcome });
  else await Promise.all([...listeners].map(listener => listener({ url: callback })));
  if (outcome === "rejected") await assert.rejects(pending, /Invalid nonce fixture/);
  else {
    const result = await pending;
    assert.equal(result.createdSessionId, outcome === "success" ? "verified_fixture_session" : null);
  }
  assert.deepEqual(navigations, [], "OAuth must never replace the auth form with an unmatched route");
  assert.deepEqual(finalized, outcome === "success" ? ["verified_fixture_session"] : []);
  assert.deepEqual(nonces, ["cancel", "dismiss"].includes(outcome) ? [] : ["fixture_nonce"]);
  unsubscribe();
  assert.equal(listeners.size, 0);
}
for (const outcome of ["success", "verification", "rejected", "cancel", "dismiss"]) await checkFlow(outcome);
console.log("Native auth: warm/cold callbacks, Clerk nonce verification, cancellation and unrelated links passed.");
