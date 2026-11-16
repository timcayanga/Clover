import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { newSandboxAccountReport, openSandboxAccount, sealSandboxAccount, testSandboxAccount } from "../lib/unionbank-sandbox-account";
import { UNIONBANK_CALLBACK, UNIONBANK_SANDBOX_BASE } from "../lib/unionbank-sandbox";

async function main() {
  const pending = newSandboxAccountReport();
  const config = { clientId: "test-client", clientSecret: "never-expose-this-secret" };
  const sealed = sealSandboxAccount(pending, config.clientSecret, "actor-a");
  assert.ok(!sealed.includes(pending.password));
  assert.deepEqual(openSandboxAccount(sealed, config.clientSecret, "actor-a"), pending);
  assert.throws(() => openSandboxAccount(sealed, config.clientSecret, "actor-b"));
  assert.throws(() => openSandboxAccount(sealed, "another-secret", "actor-a"));
  let creations = 0;
  const bank: typeof fetch = async (input, init) => {
    const url = String(input);
    assert.ok(url.startsWith(`${UNIONBANK_SANDBOX_BASE}/`));
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), null, "Direct tests must not require the customer login page");
    assert.equal(headers.get("x-ibm-client-secret"), config.clientSecret);
    if (url.endsWith("/sandbox/v1/accounts")) {
      creations++;
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.account_name, "Clover Sandbox Tester");
      return Response.json({ status: 1, data: { account: { account_number: "123456789012" } } });
    }
    assert.ok(url.endsWith("/accounts/v2/balances/123456789012"));
    return Response.json([{ type: "AVAIL", amount: "0", currency: "PHP" }]);
  };
  const success = await testSandboxAccount(pending, config, bank);
  assert.equal(success.creation, "created");
  assert.equal(success.balance?.ok, true);
  assert.equal(success.balance?.values?.[0].amount, "0");
  assert.ok(!JSON.stringify(success).includes(config.clientSecret));
  const denied = await testSandboxAccount(pending, config, async () => Response.json({ error: config.clientSecret }, { status: 403 }));
  assert.equal(denied.creation, "failed");
  assert.equal(denied.balance, undefined);
  assert.ok(!JSON.stringify(denied).includes(config.clientSecret));
  assert.equal((await testSandboxAccount(pending, config, async () => Response.json({ status: 0 }))).creation, "failed");
  assert.equal((await testSandboxAccount(pending, config, async () => Response.json({ status: 1, data: { account: { account_number: "../../live" } } }))).creation, "unknown");
  assert.equal((await testSandboxAccount(pending, config, async () => { throw new Error("network interrupted"); })).creation, "unknown");
  const failedBalance = await testSandboxAccount(pending, config, async (url, init) => String(url).includes("/balances/") ? Response.json([{ type: "AVAIL", amount: null, currency: "PHP" }]) : bank(url, init));
  assert.equal(failedBalance.creation, "created");
  assert.equal(failedBalance.balance?.ok, false);

  const fixture = `
    let actor = 'actor-a'; const rows = new Map();
    export function setActor(value) { actor = value; }
    export function values() { return [...rows.values()]; }
    export async function sandboxActor() { if (!actor) throw Error('UNAUTHORIZED'); return actor; }
    export function sandboxStore() { return {
      get: async key => rows.get(key) ?? null,
      set: async (key,value,mode,ttl,nx) => { if(nx === 'NX' && rows.has(key)) return null; rows.set(key,value); return 'OK'; }
    }; }
  `;
  const compiled = await build({ stdin: { contents: `export {POST} from './app/api/bank-connections/unionbank/sandbox-account/route'; export {setActor,values} from 'fixture';`, resolveDir: process.cwd() }, bundle: true, platform: "node", format: "cjs", packages: "external", write: false, plugins: [{ name: "sandbox-boundaries", setup(b) {
    b.onResolve({ filter: /^(fixture|@\/lib\/unionbank-sandbox-session)$/ }, () => ({ path: "fixture", namespace: "test" }));
    b.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: fixture, loader: "ts" }));
  } }] });
  const requireFixture = createRequire(resolve("package.json"));
  const Module = requireFixture("node:module"), mod = new Module(resolve("unionbank-direct-test.cjs"));
  mod.filename = resolve("unionbank-direct-test.cjs"); mod.paths = Module._nodeModulePaths(process.cwd()); mod._compile(compiled.outputFiles[0].text, mod.filename);
  const api = mod.exports;
  const originalFetch = globalThis.fetch;
  const savedEnv = { ...process.env };
  try {
    Object.assign(process.env, { UNIONBANK_ENV: "sandbox", UNIONBANK_CLIENT_ID: config.clientId, UNIONBANK_CLIENT_SECRET: config.clientSecret, UNIONBANK_REDIRECT_URI: UNIONBANK_CALLBACK });
    globalThis.fetch = bank;
    creations = 0;
    const call = (origin = "https://staging.clover.ph", host = "https://staging.clover.ph") => api.POST(new NextRequest(`${host}/api/bank-connections/unionbank/sandbox-account`, { method: "POST", headers: { origin } }));
    assert.equal((await call("null")).status, 403);
    assert.equal((await call("https://evil.test")).status, 403);
    assert.equal((await call("https://clover.ph", "https://clover.ph")).status, 403);
    api.setActor(null);
    assert.equal((await call()).status, 401);
    assert.equal(creations, 0);
    api.setActor("actor-a");
    const concurrent = await Promise.all([call(), call()]);
    assert.equal(creations, 1, "Concurrent tests must create only one dummy account");
    const response = await call();
    assert.equal(response.headers.get("cache-control"), "no-store, private");
    const result = await response.json();
    assert.equal(result.reused, true);
    assert.equal(result.report.creation, "created");
    assert.equal(creations, 1, "Reload/retry must reuse the first account");
    assert.ok(api.values().every((value: string) => !value.includes(result.report.password)));
    api.setActor("actor-b");
    const other = await (await call()).json();
    assert.notEqual(other.report.username, result.report.username);
    assert.equal(creations, 2);
    assert.ok(concurrent.every(response => [200, 409].includes(response.status)));
  } finally { globalThis.fetch = originalFetch; process.env = savedEnv; }
  console.log("UnionBank direct sandbox: creation, zero balance, failures, encryption, origin/auth checks, actor isolation and concurrent replay passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
