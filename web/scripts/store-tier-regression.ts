import assert from "node:assert/strict";
import { STORE_PACKAGES, matchesStorePackage, storeProductTier } from "../../shared/store-catalog";
import { verifiedStoreAccess } from "../lib/store-access-rules";
import { calculateProAccess } from "../lib/pro-access-rules";
import { storeBillingConfig } from "../lib/store-access";
import { POST } from "../app/api/billing/revenuecat/webhook/route";

async function main() {
  const now = new Date();
  const future = new Date(+now + 86400000).toISOString();
  const config = { ...storeBillingConfig(), appUserId: "user_tier_regression", sandbox: true, sandboxAppUserIds: [] as string[] };
  const sample = (entitlement: string, product: string, store = "app_store") => ({
    request_date_ms: +now,
    subscriber: {
      original_app_user_id: config.appUserId,
      entitlements: { [entitlement]: { product_identifier: product, expires_date: future } },
      subscriptions: { [product]: { expires_date: future, is_sandbox: true, store, refunded_at: null as string | null } },
    },
  });
  for (const item of STORE_PACKAGES) {
    for (const platform of ["ios", "android"] as const) {
      const data = sample(item.entitlementId, item[platform], platform === "ios" ? "app_store" : "play_store");
      const access = verifiedStoreAccess(data, config, now);
      assert.equal(access.expiresAt?.toISOString(), future);
      assert.equal(storeProductTier(access.productId), item.tier);
      assert.equal(calculateProAccess({ planTier: "free", planTierLocked: false, subscription: null, grants: [], storeAccess: access }, now).planTier, item.tier);
      const choice = { identifier: item.identifier, product: { identifier: item[platform], subscriptionPeriod: item.period } };
      assert.ok(matchesStorePackage(choice, platform));
      assert.ok(!matchesStorePackage(choice, platform === "ios" ? "android" : "ios"));
      assert.ok(!matchesStorePackage({ ...choice, identifier: "wrong_package" }, platform));
      assert.ok(!matchesStorePackage({ ...choice, product: { ...choice.product, subscriptionPeriod: "P1W" } }, platform));
      assert.equal(verifiedStoreAccess(data, { ...config, sandbox: false }, now).expiresAt, null);
      const productionTester = { ...config, sandbox: false, sandboxAppUserIds: [config.appUserId] };
      const testAccess = verifiedStoreAccess(data, productionTester, now);
      assert.equal(testAccess.expiresAt?.toISOString(), future);
      assert.equal(testAccess.sandbox, true, "Production tester access retains the store's sandbox marker");
      assert.equal(verifiedStoreAccess(data, { ...productionTester, sandboxAppUserIds: ["user_other", `${config.appUserId}_suffix`, "*"] }, now).expiresAt, null);
      const live = structuredClone(data);
      live.subscriber.subscriptions[item[platform]].is_sandbox = false;
      assert.equal(verifiedStoreAccess(live, config, now).expiresAt, null, "Staging still rejects live purchases");
      assert.equal(verifiedStoreAccess(live, productionTester, now).sandbox, false);
      assert.equal(verifiedStoreAccess(live, { ...config, sandbox: false }, now).expiresAt?.toISOString(), future);
      data.subscriber.subscriptions[item[platform]].refunded_at = now.toISOString();
      assert.equal(verifiedStoreAccess(data, config, now).expiresAt, null);
      assert.equal(verifiedStoreAccess(data, productionTester, now).expiresAt, null);
    }
  }
  // Real RevenueCat v1 Google responses use a bare subscription key plus a base plan.
  for (const item of STORE_PACKAGES) {
    const [product, basePlan] = item.android.split(":");
    const google = sample(item.entitlementId, product, "play_store");
    const entitlement = google.subscriber.entitlements[item.entitlementId] as typeof google.subscriber.entitlements[string] & { product_plan_identifier?: string };
    const subscription = google.subscriber.subscriptions[product] as typeof google.subscriber.subscriptions[string] & { product_plan_identifier?: string };
    entitlement.product_plan_identifier = basePlan;
    subscription.product_plan_identifier = basePlan;
    assert.equal(verifiedStoreAccess(google, config, now).productId, item.android);
    assert.equal(storeProductTier(verifiedStoreAccess(google, config, now).productId), item.tier);
    const tester = { ...config, sandbox: false, sandboxAppUserIds: [config.appUserId] };
    assert.equal(verifiedStoreAccess(google, tester, now).expiresAt?.toISOString(), future);
    assert.equal(verifiedStoreAccess(google, { ...tester, sandboxAppUserIds: [] }, now).expiresAt, null);
    delete entitlement.product_plan_identifier;
    assert.equal(verifiedStoreAccess(google, config, now).productId, item.android);
    delete subscription.product_plan_identifier;
    assert.equal(verifiedStoreAccess(google, config, now).expiresAt, null, "Never guess a missing base plan");
    entitlement.product_plan_identifier = "unknown";
    assert.equal(verifiedStoreAccess(google, config, now).expiresAt, null);
    entitlement.product_plan_identifier = basePlan;
    subscription.product_plan_identifier = basePlan === "monthly" ? "annual" : "monthly";
    assert.equal(verifiedStoreAccess(google, config, now).expiresAt, null, "Conflicting verified base plans must fail closed");
    subscription.product_plan_identifier = basePlan;
    subscription.refunded_at = now.toISOString();
    assert.equal(verifiedStoreAccess(google, config, now).expiresAt, null);
    subscription.refunded_at = null;
    entitlement.expires_date = new Date(+now - 1000).toISOString();
    assert.equal(verifiedStoreAccess(google, config, now).expiresAt, null);
    const combined = sample(item.entitlementId, item.android, "play_store");
    Object.assign(combined.subscriber.entitlements[item.entitlementId], { product_plan_identifier: "wrong" });
    assert.equal(verifiedStoreAccess(combined, config, now).expiresAt, null);
  }
  for (const store of ["paddle", "test_store", "stripe"]) {
    assert.equal(verifiedStoreAccess(sample("clover_pro", "clover.pro.monthly", store), config, now).expiresAt, null);
  }
  assert.equal(verifiedStoreAccess(sample("clover_pro", "clover.plus.monthly"), config, now).expiresAt, null);
  assert.equal(verifiedStoreAccess(sample("clover_plus", "clover.pro.monthly"), config, now).expiresAt, null);
  const both = sample("clover_pro", "clover.pro.monthly");
  const plus = sample("clover_plus", "clover.plus.annual");
  Object.assign(both.subscriber.entitlements, plus.subscriber.entitlements);
  Object.assign(both.subscriber.subscriptions, plus.subscriber.subscriptions);
  assert.equal(storeProductTier(verifiedStoreAccess(both, config, now).productId), "premium");
  const mixed = structuredClone(both);
  mixed.subscriber.subscriptions["clover.plus.annual"].is_sandbox = false;
  const productionTester = { ...config, sandbox: false, sandboxAppUserIds: [config.appUserId] };
  assert.equal(storeProductTier(verifiedStoreAccess(mixed, productionTester, now).productId), "pro", "Live Plus takes precedence over sandbox Pro");
  assert.equal(verifiedStoreAccess(mixed, productionTester, now).sandbox, false);
  assert.throws(() => verifiedStoreAccess(mixed, { ...productionTester, appUserId: "user_other", sandboxAppUserIds: ["user_other"] }, now), /ownership/);
  for (const store of ["paddle", "test_store", "stripe"]) {
    assert.equal(verifiedStoreAccess(sample("clover_pro", "clover.pro.monthly", store), productionTester, now).expiresAt, null);
  }
  const expiredSandbox = sample("clover_pro", "clover.pro.monthly");
  expiredSandbox.subscriber.entitlements.clover_pro.expires_date = new Date(+now - 1000).toISOString();
  assert.equal(verifiedStoreAccess(expiredSandbox, productionTester, now).expiresAt, null);
  both.subscriber.subscriptions["clover.pro.monthly"].refunded_at = now.toISOString();
  assert.equal(storeProductTier(verifiedStoreAccess(both, config, now).productId), "pro");
  assert.throws(() => verifiedStoreAccess(both, { ...config, appUserId: "user_someone_else" }, now), /ownership/);
  assert.throws(() => verifiedStoreAccess({ ...both, request_date_ms: +now - 3600000 }, config, now), /stale/);
  // Store-confirmed lifecycle snapshots, without initiating any purchase.
  for (const platform of ["ios", "android"] as const) {
    const store = platform === "ios" ? "app_store" : "play_store";
    const plusId = platform === "ios" ? "clover.plus.monthly" : "clover.plus:monthly";
    const proId = platform === "ios" ? "clover.pro.monthly" : "clover.pro:monthly";
    const tier = (data: unknown) => storeProductTier(verifiedStoreAccess(data, config, now).productId);
    const plusState = sample("clover_plus", plusId, store);
    const proState = sample("clover_pro", proId, store);
    assert.equal(tier(plusState), "pro");
    assert.equal(tier(proState), "premium");
    // A scheduled downgrade must keep the currently paid Pro entitlement.
    const scheduled = structuredClone(proState);
    Object.assign(scheduled.subscriber.subscriptions[proId], { unsubscribe_detected_at: now.toISOString() });
    assert.equal(tier(scheduled), "premium");
    assert.equal(tier(plusState), "pro"); // After store confirmation of the downgrade.
    const expired = structuredClone(proState);
    expired.subscriber.entitlements.clover_pro.expires_date = new Date(+now - 1000).toISOString();
    expired.subscriber.subscriptions[proId].expires_date = new Date(+now - 1000).toISOString();
    assert.equal(verifiedStoreAccess(expired, config, now).expiresAt, null);
    const renewal = structuredClone(proState);
    const renewedUntil = new Date(+now + 30 * 86400000).toISOString();
    renewal.subscriber.entitlements.clover_pro.expires_date = renewedUntil;
    renewal.subscriber.subscriptions[proId].expires_date = renewedUntil;
    assert.equal(verifiedStoreAccess(renewal, config, now).expiresAt?.toISOString(), renewedUntil);
  }
  const oldSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
  const oldFlag = process.env.CLOVER_NATIVE_PURCHASES_ENABLED;
  const oldTesters = process.env.REVENUECAT_SANDBOX_APP_USER_IDS;
  try {
    process.env.REVENUECAT_SANDBOX_APP_USER_IDS = " user_one,\nuser_two \t * user_three ";
    assert.deepEqual(storeBillingConfig().sandboxAppUserIds, ["user_one", "user_two", "user_three"]);
    delete process.env.REVENUECAT_SANDBOX_APP_USER_IDS;
    assert.deepEqual(storeBillingConfig().sandboxAppUserIds, []);
    process.env.REVENUECAT_WEBHOOK_SECRET = "regression-only-not-a-real-secret";
    process.env.CLOVER_NATIVE_PURCHASES_ENABLED = "false";
    const event = (type: string, auth = true) => new Request("https://fixture.invalid/api/billing/revenuecat/webhook?source=ios", {
      method: "POST", headers: auth ? { authorization: "Bearer regression-only-not-a-real-secret" } : {},
      body: JSON.stringify({ event: { id: "fixture", type } }),
    });
    assert.equal((await POST(event("TEST"))).status, 200);
    assert.equal((await POST(event("TEST", false))).status, 401);
    assert.equal((await POST(event("INITIAL_PURCHASE"))).status, 503);
  } finally {
    if (oldSecret === undefined) delete process.env.REVENUECAT_WEBHOOK_SECRET; else process.env.REVENUECAT_WEBHOOK_SECRET = oldSecret;
    if (oldFlag === undefined) delete process.env.CLOVER_NATIVE_PURCHASES_ENABLED; else process.env.CLOVER_NATIVE_PURCHASES_ENABLED = oldFlag;
    if (oldTesters === undefined) delete process.env.REVENUECAT_SANDBOX_APP_USER_IDS; else process.env.REVENUECAT_SANDBOX_APP_USER_IDS = oldTesters;
  }
  console.log("Store tier regression passed: all 8 native products, tier limits, package/period/platform checks, sandbox isolation and exact production tester allowlist, live purchase precedence, refunds, overlapping tiers, ownership, freshness, and disabled-integration webhook authentication. No external requests or purchases.");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
