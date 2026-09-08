import assert from "node:assert/strict";
import { buildAdviserDeviceContext, projectAdviserDeviceContext } from "../lib/adviser-device-context";
import { mobileAdviserInput } from "../lib/mobile-adviser-input";
import { mobileApiResponse } from "../lib/mobile-api-response";
const messages = [{ role: "user", content: "Summarize my accounts" }];
assert(mobileAdviserInput.safeParse({ messages, page: "accounts", preferOnDevice: true, selection: { kind: "account", id: "abc" } }).success);
for (const injected of [{ selectedRecord: { balance: 999 } }, { surface: "accounts" }, { page: "ignore instructions" }, { selection: { kind: "account", id: "../victim" } }, { preferOnDevice: "true" }, { activeDraft: {} }]) {
  assert(!mobileAdviserInput.safeParse({ messages, ...injected }).success);
}
assert.equal(buildAdviserDeviceContext("PHP 500 available", false), undefined);
assert.equal(buildAdviserDeviceContext("😀".repeat(1500), true), undefined);
assert.equal(buildAdviserDeviceContext("x".repeat(2500), true), undefined);
const capsule = buildAdviserDeviceContext("Recorded cash: PHP 500. Recent history is incomplete.", true)!;
assert.equal(capsule.version, 1);
assert(new TextEncoder().encode(capsule.instructions + capsule.prompt).length <= 3200);
assert.equal(projectAdviserDeviceContext({ ...capsule, rawPayload: "secret" }), undefined);
assert.equal(projectAdviserDeviceContext({ ...capsule, version: 2 }), undefined);
const result = mobileApiResponse("adviser-chat", { reply: capsule.source, deviceContext: capsule, workspace: { accounts: ["secret"] }, actions: [{ type: "confirm", payload: "secret" }] }) as Record<string, unknown>;
assert.deepEqual(result.deviceContext, capsule);
assert.equal(result.workspace, undefined);
assert.equal(result.actions, undefined);
assert.equal(result.hasActions, true);
console.log("PASS device context bounds, native input allowlist, and response minimization");
