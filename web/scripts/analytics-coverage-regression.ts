import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { beginTelemetry, browserContext, getTelemetryHeaders, requestTelemetry, safeRoute, setTelemetryHeaderProvider, setTelemetrySink, telemetry, trackOperation, type TelemetryProperties } from "../../shared/analytics";
import { OfflineEngine } from "../../mobile/src/offline/engine";
import { openOfflineStore } from "../../mobile/src/offline/store";
import { apiRequest, ApiError, NetworkError } from "../../mobile/src/api";
async function main() {
const events: Array<{ event: string; properties: TelemetryProperties }> = [];
setTelemetrySink((event, properties) => events.push({ event, properties }));
const finish = beginTelemetry("flow", { operation: "POST /transactions" });
finish("failed", { status: 422 }); finish("completed");
assert.deepEqual(events.map(e => e.event), ["flow_started", "flow_failed"]);
assert.equal(events[0].properties.operation_id, events[1].properties.operation_id);
assert.equal(safeRoute("/api/imports/a/status?password=secret&name=private.pdf"), "/api/imports/:id/status");
assert.equal(safeRoute("/split-bill/request/short-token"), "/split-bill/request/:id");
assert.equal(safeRoute("/(tabs)/accounts/123"), "/accounts/:id");
assert.equal(requestTelemetry("imports/private/status"), null);
assert.equal(requestTelemetry("uploads/private/part", "POST"), null);
assert.equal(requestTelemetry("/api/transactions", "POST")?.resource, "transactions");
assert.equal(browserContext("Mozilla/5.0 (iPhone) Mobile Safari").platform, "mobile_web");
assert.equal(browserContext("Mozilla/5.0 (Macintosh) Safari", 1024, 5).device_type, "tablet");
assert.equal(browserContext("Windows NT Chrome/100").platform, "desktop_web");
setTelemetrySink(() => { throw new Error("SDK down"); });
assert.doesNotThrow(() => telemetry("screen_viewed"));
assert.equal(await trackOperation("account_create", async () => "saved"), "saved");
setTelemetrySink((event, properties) => events.push({ event, properties }));
setTelemetryHeaderProvider(() => ({ "x-clover-platform": "ios", "x-clover-device-model": "iPhone simulator" }));
assert.equal(getTelemetryHeaders()["x-clover-platform"], "ios");
const originalFetch = globalThis.fetch;
try {
  let seenHeaders = new Headers();
  globalThis.fetch = async (_input, init) => { seenHeaders = new Headers(init?.headers); return Response.json({ transaction: { id: "private-record" } }); };
  events.length = 0;
  const result = await apiRequest<{transaction:{id:string}}>("secret-token", "transactions?workspaceId=private", { method: "POST", body: JSON.stringify({ amount: 99, merchant: "SECRET MERCHANT" }) });
  assert.equal(result.transaction.id, "private-record");
  assert.equal(seenHeaders.get("x-clover-platform"), "ios");
  assert.deepEqual(events.map(e => e.event), ["flow_started", "flow_completed"]);
  assert.doesNotMatch(JSON.stringify(events), /SECRET|private|secret-token|amount/);
  events.length = 0;
  globalThis.fetch = async () => Response.json({ error: "Sensitive error text" }, { status: 422 });
  await assert.rejects(apiRequest("token", "accounts", {method:"POST"}), ApiError);
  assert.equal(events.at(-1)?.event, "flow_failed");
  assert.doesNotMatch(JSON.stringify(events), /Sensitive/);
  events.length = 0;
  const controller = new AbortController(); controller.abort();
  globalThis.fetch = async () => { throw new Error("network"); };
  await assert.rejects(apiRequest("token", "reports", {signal:controller.signal}), NetworkError);
  assert.equal(events.at(-1)?.event, "data_load_canceled");
  events.length = 0;
  globalThis.fetch = async () => Response.json({ items: [] });
  await apiRequest("token", "reports?from=private");
  assert.deepEqual(events.map(e => e.event), ["data_load_started", "data_load_completed", "data_ready"]);
} finally { globalThis.fetch = originalFetch; }
// Offline financial data never enters telemetry; queue and conflict outcomes remain observable.
const store = await openOfflineStore("analytics-test");
const bootstrap = { profiles: [{ id: "private-profile" }], offlineEpoch: null };
await store.set("cache:bootstrap", { value: bootstrap, savedAt: Date.now() });
let conflict = false;
const engine = new OfflineEngine(store, async <T>(path: string) => {
  if (path === "bootstrap") return bootstrap as T;
  if (conflict) throw new ApiError("PRIVATE CONFLICT", 409);
  return { transaction: { id: "private-id" } } as T;
}, () => Math.random().toString(36));
await engine.init(); await engine.setOnline(false); events.length = 0;
const draft = { method: "POST", body: JSON.stringify({ accountId: "private-account", merchantRaw: "PRIVATE SHOP", date: "2026-09-20", amount: 123, type: "expense" }) };
await engine.request("transactions?workspaceId=private-profile", draft);
assert.ok(events.some(e => e.event === "offline_action_queued"));
await engine.setOnline(true);
assert.ok(events.some(e => e.event === "offline_sync_completed"));
await engine.setOnline(false); conflict = true;
await engine.request("transactions?workspaceId=private-profile", draft);
await engine.setOnline(true);
assert.ok(events.some(e => e.event === "offline_sync_conflict"));
assert.doesNotMatch(JSON.stringify(events), /PRIVATE|private-profile|private-account|merchantRaw/);
await engine.dispose();
// Request-scoped server events preserve device/operation context and run after response.
let outgoing: any[] = [], scheduled: Array<() => Promise<void>> = [];
let requestHeaders: Headers | null = new Headers({ "x-clover-platform": "android", "x-clover-device-model": "Pixel", "x-clover-os-version": "16", "x-clover-app-version": "0.1.0", "x-clover-operation-id": "test-operation-001" });
const serverModule = { exports: {} as any };
const serverCode = ts.transpileModule(readFileSync("lib/analytics-server.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(serverCode, { exports: serverModule.exports, require: (id: string) => {
  if (id === "next/headers") return { headers: async () => { if (!requestHeaders) throw Error("worker"); return requestHeaders; } };
  if (id === "next/server") return { after: (run: () => Promise<void>) => { if (!requestHeaders) throw Error("worker"); scheduled.push(run); } };
  if (id.endsWith("shared/analytics")) return { browserContext };
  if (id === "./analytics") return { capturePostHogServerEvent: async (...args: any[]) => { outgoing.push(args); } };
  throw Error(id);
} });
await serverModule.exports.capturePostHogServerEvent("account_created", "test-user", { account_type: "cash" });
assert.equal(outgoing.length, 0); assert.equal(scheduled.length, 1);
await scheduled.pop()!();
assert.equal(outgoing[0][2].platform, "android");
assert.equal(outgoing[0][2].operation_id, "test-operation-001");
assert.equal(outgoing[0][2].device_model, "Pixel");
requestHeaders = null; outgoing = [];
await serverModule.exports.capturePostHogServerEvent("import_processing_completed", "test-user");
assert.equal(outgoing[0][2].platform, "server");
// Every static page/screen segment must remain distinguishable after redaction.
let pages = 0;
for (const root of [path.resolve("app"), path.resolve("../mobile/app")]) {
  const walk = (folder: string) => { for (const entry of readdirSync(folder, {withFileTypes:true})) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) walk(file);
    else if ((root.endsWith("mobile/app") ? /\.tsx$/.test(entry.name) && !entry.name.startsWith("_") : entry.name === "page.tsx")) {
      const relative = path.relative(root, file).replace(/\/(page|index)\.tsx$/, "").replace(/\.tsx$/, "");
      for (const part of relative.split("/")) if (!part.includes("[") && !part.includes("(") && !["page", "index", "+not-found"].includes(part)) assert.notEqual(safeRoute(part), "/:id", `unmapped route ${relative}`);
      pages++;
    }
  }};
  walk(root);
}
const native = readFileSync("../mobile/src/analytics.ts", "utf8");
assert.match(native, /enableSessionReplay: false/);
assert.match(native, /maxQueueSize: 500/);
assert.match(native, /candidate\.reset\(\)/);
console.log(`Analytics regression passed: lifecycle outcomes, privacy, device context, request preservation, offline-safe sink and ${pages} route/screen definitions.`);

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
