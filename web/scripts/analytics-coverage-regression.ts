import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { STORE_PACKAGES } from "../../shared/store-catalog";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { beginTelemetry, browserContext, getTelemetryHeaders, requestTelemetry, safeRoute, setTelemetryHeaderProvider, setTelemetrySink, telemetry, trackOperation, type TelemetryProperties } from "../../shared/analytics";
import { OfflineEngine } from "../../mobile/src/offline/engine";
import { openOfflineStore } from "../../mobile/src/offline/store";
import { apiRequest, ApiError, NetworkError } from "../../mobile/src/api";
import { RequestCancelledError } from "../../mobile/src/request-lifecycle";
import { beginCheckoutPreparation, planEntryPoint, planFunnelProperties } from "../../shared/plan-funnel";
import { nativePaymentKind, storePurchaseFingerprintInput } from "../../shared/billing-funnel";
import { normalizePlanAnalytics, publicPlan } from "../../shared/plan-analytics";
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
assert.equal(nativePaymentKind("INITIAL_PURCHASE", "NORMAL", false), "initial_purchase");
assert.equal(nativePaymentKind("INITIAL_PURCHASE", "TRIAL", false), undefined);
assert.equal(nativePaymentKind("INITIAL_PURCHASE", "PROMOTIONAL", false), undefined);
assert.equal(nativePaymentKind("RENEWAL", "NORMAL", true), "trial_conversion");
assert.equal(nativePaymentKind("RENEWAL", "NORMAL", false), "renewal");
assert.equal(nativePaymentKind("TRANSFER", "NORMAL", false), undefined);
assert.equal(nativePaymentKind("CANCELLATION", "NORMAL", false), undefined);
assert.equal(storePurchaseFingerprintInput("app_store", "2000000456789012"), "clover-billing:v1:app_store:2000000456789012");
assert.equal(storePurchaseFingerprintInput("play_store", "GPA.1234-5678-9012-34567..0"), "clover-billing:v1:play_store:GPA.1234-5678-9012-34567..0");
assert.equal(storePurchaseFingerprintInput("play_store", "sensitive-purchase-token"), undefined);
assert.equal(planEntryPoint("upgrade_prompt"), "upgrade_prompt");
assert.equal(planEntryPoint("/private/path?session=secret"), "direct");
assert.equal(planEntryPoint(["pricing", "notification"], "settings"), "settings");
assert.deepEqual(planFunnelProperties("account_menu", "P1Y", "PHP", "premium"), {
  entry_point: "account_menu", billing_interval: "annual", displayed_currency: "PHP", selected_plan: "pro",
});
assert.equal(planFunnelProperties("pricing", "P1M", "USD", "pro").selected_plan, "plus");
assert.equal(planFunnelProperties("settings", "monthly", "bogus", "free").displayed_currency, undefined);
assert.equal(planFunnelProperties("settings", "monthly", "PHP", "free").billing_interval, undefined);

const preparationEvents: Array<{ event: string; properties: TelemetryProperties }> = [];
const capturePreparation = (event: string, properties: TelemetryProperties) =>
  preparationEvents.push({ event, properties });
for (const [provider, reason] of [
  ["app_store", "ownership_conflict"],
  ["play_store", "plan_unavailable"],
  ["paddle", "checkout_session_failed"],
  ["paypal", "provider_handoff_failed"],
] as const) {
  preparationEvents.length = 0;
  const start = beginCheckoutPreparation(capturePreparation, {
    ...planFunnelProperties("settings", "monthly", "PHP", "pro"), billing_provider: provider,
  });
  start.finish(reason);
  start.finish(undefined, "duplicate");
  assert.deepEqual(preparationEvents.map(item => item.event), ["checkout_prepare_started", "checkout_prepare_finished"]);
  assert.equal(preparationEvents[1].properties.checkout_preparation_id, start.id);
  assert.equal(preparationEvents[1].properties.preparation_outcome, "blocked");
  assert.equal(preparationEvents[1].properties.preparation_reason, reason);
  assert.equal(preparationEvents[1].properties.checkout_attempt_id, undefined);
}
const handoff = beginCheckoutPreparation(capturePreparation, { billing_provider: "paddle" });
handoff.finish(undefined, "checkout-fixture");
assert.equal(preparationEvents.at(-1)?.properties.preparation_outcome, "ready");
assert.equal(preparationEvents.at(-1)?.properties.checkout_attempt_id, "checkout-fixture");

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
  let canceledFetches = 0;
  globalThis.fetch = async () => { canceledFetches++; throw new Error("network"); };
  await assert.rejects(apiRequest("token", "reports", {signal:controller.signal}), error => error instanceof RequestCancelledError && !(error instanceof NetworkError));
  assert.equal(canceledFetches, 0, "A pre-canceled request must not reach the network");
  assert.equal(events.at(-1)?.event, "data_load_canceled");
  assert.equal(events.at(-1)?.properties.reason, "user_abort");
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
let deletedIdentity = false;
let outgoing: any[] = [], scheduled: Array<() => Promise<void>> = [];
let requestHeaders: Headers | null = new Headers({ "x-clover-platform": "android", "x-clover-device-model": "Pixel", "x-clover-os-version": "16", "x-clover-app-version": "0.1.0", "x-clover-operation-id": "test-operation-001" });
const serverModule = { exports: {} as any };
const serverCode = ts.transpileModule(readFileSync("lib/analytics-server.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(serverCode, { exports: serverModule.exports, require: (id: string) => {
  if (id === "next/headers") return { headers: async () => { if (!requestHeaders) throw Error("worker"); return requestHeaders; } };
  if (id === "next/server") return { after: (run: () => Promise<void>) => { if (!requestHeaders) throw Error("worker"); scheduled.push(run); } };
  if (id.endsWith("shared/analytics")) return { browserContext };
  if (id === "./analytics-capture") return { capturePostHogServerEvent: async (...args: any[]) => { outgoing.push(args); } };
  if (id === "./analytics-audience") return { getAnalyticsAudience: async () => ({analytics_audience:"customer",analytics_excluded:false,analytics_audience_version:1}) };
  if (id === "./prisma") return { prisma: { user: { findUnique: async () => ({ clerkUserId: "user_billing" }) }, clerkIdentityDeletion: { findUnique: async () => deletedIdentity ? { clerkUserId: "user_billing" } : null } } };
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
await serverModule.exports.capturePostHogServerEvent("billing_renewed", "database-user", { plan_tier: "premium" });
assert.equal(outgoing.at(-1)[1], "user_billing", "billing events must join the signed-in analytics identity");
deletedIdentity = true; outgoing = [];
await serverModule.exports.capturePostHogServerEvent("billing_renewed", "database-user", { plan_tier: "premium" });
assert.equal(outgoing.length, 0, "late billing events must not recreate a deleted analytics identity");
// Execute native setup under a React Native-shaped environment (no AbortSignal.timeout).
for (const platform of ["ios", "android"]) {
  const captures: any[] = [], identities: string[] = [];
  let resets = 0, sdkOptions: any, nativeSink: any;
  class PostHogStub {
    constructor(_key: string, options: any) { sdkOptions = options; }
    async ready() {}
    reset() { resets++; }
    identify(id: string) { identities.push(id); }
    register() {}
    capture(event: string, properties: any) { captures.push({event,properties}); }
    async flush() {}
  }
  const nativeModule = { exports: {} as any };
  const code = ts.transpileModule(readFileSync("../mobile/src/analytics.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports: nativeModule.exports, AbortController, AbortSignal: {}, setTimeout, clearTimeout,
    fetch: async () => Response.json({ key: "public-test-token", host: "https://example.invalid", environment: "staging", epoch: {analytics_epoch:"test-epoch"} }),
    require: (id: string) => {
      if (id === "posthog-react-native") return PostHogStub;
      if (id === "expo-application") return { nativeApplicationVersion: "1.0", nativeBuildVersion: "10" };
      if (id === "expo-device") return { DeviceType: {TABLET:2}, deviceType:1, modelName:"test-model", osName:platform, osVersion:"test-os", isDevice:false };
      if (id === "expo-constants") return { expoConfig: {version:"1.0"} };
      if (id === "react-native") return { Platform: {OS:platform, Version:"test-os"} };
      if (id === "./api-base") return {apiBase:()=>"https://example.invalid"};
      if (id.endsWith("shared/analytics")) return { setTelemetrySink:(next:any)=>{nativeSink=next;}, setTelemetryHeaderProvider:()=>{}, clearPendingTelemetry:()=>{} };
      if (id.endsWith("shared/plan-analytics")) return { normalizePlanAnalytics };
      throw Error(id);
    }
  });
  nativeModule.exports.identifyNativeAnalytics("user-a");
  assert.equal(await nativeModule.exports.initializeNativeAnalytics(), true, `native setup must initialize on ${platform} without browser-only AbortSignal helpers`);
  nativeSink("flow_started", {operation:"POST /accounts"});
  assert.equal(captures.at(-1).properties.platform, platform);
  assert.equal(captures.at(-1).properties.analytics_epoch, "test-epoch");
  assert.equal(nativeModule.exports.analyticsHeaders()["x-clover-platform"], platform);
  nativeModule.exports.identifyNativeAnalytics(null);
  nativeModule.exports.identifyNativeAnalytics("user-b");
  assert.deepEqual(identities, ["staging:user-a", "staging:user-b"]);
  assert.equal(resets, 2);
  assert.equal(sdkOptions.maxQueueSize, 500);
  assert.equal(sdkOptions.enableSessionReplay, false);
  const redacted = sdkOptions.before_send({properties:{url:"private",$device_name:"private",device_model:"test-model"}});
  assert.equal(redacted.properties.url, undefined);
  assert.equal(redacted.properties.$device_name, undefined);
  assert.equal(redacted.properties.device_model,"test-model");
}
// Exercise actual verification telemetry without calling any store or analytics provider.
const milestones: Array<{ event: string; properties: Record<string, unknown> }> = [];
const capturedMilestone = async (event: string, _identity: string, properties: Record<string, unknown>) =>
  milestones.push({ event, properties });
const billingModule = (file: string, dependencies: Record<string, object>) => {
  const module = { exports: {} as Record<string, (...args: any[]) => Promise<unknown>> };
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports: module.exports, require: (id: string) => {
    if (id === "node:crypto") return { createHash };
    if (id === "./analytics-server") return { capturePostHogServerEvent: capturedMilestone };
    if (id in dependencies) return dependencies[id];
    throw Error(id);
  } });
  return module.exports;
};
const verifiedStore = billingModule("lib/store-billing-analytics.ts", {
  "../../shared/billing-funnel": { storePurchaseFingerprintInput, nativePaymentKind },
  "../../shared/store-catalog": { STORE_PACKAGES },
  "../../shared/plan-analytics": { publicPlan },
});
const paidAt = new Date(Date.now() - 6000);
const transactionId = "2000000456789012";
const charge = {
  type: "INITIAL_PURCHASE", environment: "PRODUCTION", store: "APP_STORE", product_id: "clover.pro.monthly",
  transaction_id: transactionId, period_type: "NORMAL", price_in_purchased_currency: 12.99, purchased_at_ms: +paidAt,
};
await verifiedStore.captureVerifiedStorePayment("user-fixture", { ...charge, period_type: "TRIAL" });
await verifiedStore.captureVerifiedStorePayment("user-fixture", { ...charge, environment: "SANDBOX" });
await verifiedStore.captureVerifiedStorePayment("user-fixture", { ...charge, price_in_purchased_currency: 0 });
await verifiedStore.captureVerifiedStorePayment("user-fixture", { ...charge, type: "TRANSFER" });
assert.equal(milestones.length, 0);
await verifiedStore.captureVerifiedStorePayment("user-fixture", charge);
const state = { store: "app_store", productId: charge.product_id, expiresAt: new Date(+paidAt + 86400000), sandbox: false };
const raw = { subscriber: { subscriptions: { [charge.product_id]: {
  store: "app_store", is_sandbox: false, store_transaction_id: transactionId, purchase_date: paidAt.toISOString(),
} } } };
await verifiedStore.captureVerifiedStoreUnlock("user-fixture", { ...state, expiresAt: null }, raw, +paidAt + 6000);
assert.equal(milestones.length, 1);
await verifiedStore.captureVerifiedStoreUnlock("user-fixture", state, raw, +paidAt + 6000);
assert.equal(milestones[0].event, "billing_payment_verified");
assert.equal(milestones[0].properties.payment_kind, "initial_purchase");
assert.equal(milestones[1].event, "billing_access_verified");
assert.equal(milestones[1].properties.payment_to_access_ms, 6000);
assert.equal(milestones[0].properties.purchase_key, milestones[1].properties.purchase_key);
assert.ok(!JSON.stringify(milestones).includes(transactionId));
await verifiedStore.captureVerifiedStorePayment("user-fixture", { ...charge, transaction_id: "2000000456789013", type: "RENEWAL" });
assert.equal(milestones.at(-1)?.properties.payment_kind, "renewal");

const checkout = { id: "clvref_fixture", userId: "buyer", provider: "paddle", environment: "production", planId: "plus", interval: "monthly",
  createdAt: new Date(+paidAt - 6000), expiresAt: new Date(+paidAt + 86400000) };
let priorSubscription: { id: string } | null = null;
const verifiedWeb = billingModule("lib/web-billing-analytics.ts", {
  "./prisma": { prisma: {
    user: { findUnique: async () => ({ environment: "production" }) },
    referralCheckout: { findUnique: async () => checkout },
    growthPayment: {
      findUnique: async () => ({ paidAt, reversedAt: null }),
      findFirst: async () => priorSubscription,
    },
  } },
  "./pro-access": {},
});
const payment = { id: "paddle:fixture", provider: "paddle", currency: "PHP", userId: "buyer", subscriptionId: "subscription", planId: "plus", checkoutId: checkout.id, paidAt };
await verifiedWeb.captureVerifiedWebPayment(payment);
assert.equal(milestones.at(-1)?.properties.checkout_attempt_id, checkout.id);
assert.equal(milestones.at(-1)?.properties.payment_kind, "initial_purchase");
await verifiedWeb.captureVerifiedWebPayment({ ...payment, planId: "mismatched" });
assert.equal(milestones.at(-1)?.properties.checkout_attempt_id, undefined);
priorSubscription = { id: "earlier" };
await verifiedWeb.captureVerifiedWebPayment(payment);
assert.equal(milestones.at(-1)?.properties.payment_kind, "renewal");
assert.equal(milestones.at(-1)?.properties.checkout_attempt_id, undefined);

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
