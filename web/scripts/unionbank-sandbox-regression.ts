import assert from "node:assert/strict";
import { authorizationUrl, sandboxConfig, runSandboxProbe, UNIONBANK_CALLBACK, UNIONBANK_SANDBOX_BASE } from "../lib/unionbank-sandbox";

async function main() {
  const env = { UNIONBANK_ENV: "sandbox", UNIONBANK_CLIENT_ID: "test-client", UNIONBANK_CLIENT_SECRET: "secret-fixture", UNIONBANK_REDIRECT_URI: UNIONBANK_CALLBACK };
  const config = sandboxConfig(env);
  assert.throws(() => sandboxConfig({ ...env, UNIONBANK_ENV: "production" }));
  assert.throws(() => sandboxConfig({ ...env, UNIONBANK_REDIRECT_URI: "https://clover.ph/api/bank-connections/unionbank/callback" }));
  assert.throws(() => sandboxConfig({ ...env, UNIONBANK_CLIENT_SECRET: " " }));
  const authorization = new URL(authorizationUrl(config, "state-fixture"));
  assert.equal(authorization.searchParams.get("scope"), "account_inquiry");
  assert.equal(authorization.searchParams.get("type"), "single");
  assert.equal(authorization.searchParams.get("state"), "state-fixture");
  assert.equal(authorization.searchParams.get("redirect_uri"), UNIONBANK_CALLBACK);
  assert.ok(!authorization.toString().includes(config.clientSecret));
  const paths: string[] = [];
  const fake: typeof fetch = async (input, init) => {
    const url = String(input);
    assert.ok(url.startsWith(`${UNIONBANK_SANDBOX_BASE}/`));
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    paths.push(url);
    if (url.endsWith("/customers/v1/oauth2/token")) {
      const body = init?.body as URLSearchParams;
      assert.equal(body.get("code"), "code-fixture");
      assert.equal(body.get("redirect_uri"), UNIONBANK_CALLBACK);
      return Response.json({ access_token: "customer-secret", metadata: "session-secret" });
    }
    if (url.endsWith("/partners/v1/oauth2/token")) {
      assert.equal((init?.body as URLSearchParams).get("scope"), "account");
      return Response.json({ access_token: "partner-secret" });
    }
    const headers = new Headers(init?.headers);
    if (url.endsWith("/customers/v1/accounts/info")) {
      assert.equal(headers.get("authorization"), "Bearer partner-secret");
      assert.deepEqual(JSON.parse(String(init?.body)), { sessionToken: "session-secret" });
      return Response.json({ account_token: "account-secret", masked_an: "***1234" });
    }
    assert.equal(headers.get("authorization"), "Bearer customer-secret");
    if (url.endsWith("/balances")) return Response.json({ currentBalance: 100 });
    return Response.json({ records: [{ amount: 1 }] });
  };
  const report = await runSandboxProbe("code-fixture", config, fake);
  assert.equal(report.checks.length, 5);
  assert.ok(report.checks.every(check => check.ok));
  assert.equal(paths.length, 6);
  assert.ok(paths.some(path => path.includes("tranType=C")));
  assert.ok(paths.some(path => path.includes("tranType=D")));
  assert.ok(!JSON.stringify(report).includes("secret"));
  assert.ok(!JSON.stringify(report).includes("1234"));
  let calls = 0;
  const denied = await runSandboxProbe("bad-code", config, async () => {
    calls++;
    return Response.json({ error: "secret-bank-error" }, { status: 401 });
  });
  assert.equal(calls, 1);
  assert.equal(denied.checks[0].detail, "HTTP 401");
  assert.equal(denied.checks[0].ok, false);
  const malformed = await runSandboxProbe("code-fixture", config, async (input, init) => {
    if (String(input).endsWith("/balances")) return Response.json({ currentBalance: null });
    if (String(input).includes("/transactions?")) return Response.json({ records: "invalid" });
    return fake(input, init);
  });
  assert.deepEqual(malformed.checks.map(check => check.ok), [true, true, false, false, false]);
  console.log("UnionBank sandbox regression passed: configuration, token separation, scope, fixtures, failures, and redaction.");
}
main().catch(() => { console.error("UnionBank sandbox regression failed"); process.exitCode = 1; });
