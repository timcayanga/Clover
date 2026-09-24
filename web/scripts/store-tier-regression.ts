import assert from "node:assert/strict";
import { STORE_PACKAGES, matchesStorePackage, storeProductTier } from "../../shared/store-catalog";
import { verifiedStoreAccess } from "../lib/store-access-rules";
import { calculateProAccess } from "../lib/pro-access-rules";
import { storeBillingConfig } from "../lib/store-access";
import { POST } from "../app/api/billing/revenuecat/webhook/route";

async function main() {
  const now = new Date();
  const future = new Date(+now + 86400000).toISOString();
  const config = { ...storeBillingConfig(), appUserId: "user_tier_regression", sandbox: true };
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
      data.subscriber.subscriptions[item[platform]].refunded_at = now.toISOString();
      assert.equal(verifiedStoreAccess(data, config, now).expiresAt, null);
    }
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
  both.subscriber.subscriptions["clover.pro.monthly"].refunded_at = now.toISOString();
  assert.equal(storeProductTier(verifiedStoreAccess(both, config, now).productId), "pro");
  assert.throws(() => verifiedStoreAccess(both, { ...config, appUserId: "user_someone_else" }, now), /ownership/);
  assert.throws(() => verifiedStoreAccess({ ...both, request_date_ms: +now - 3600000 }, config, now), /stale/);
  const oldSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
  const oldFlag = process.env.CLOVER_NATIVE_PURCHASES_ENABLED;
  try {
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
  }
  console.log("Store tier regression passed: all 8 native products, tier limits, package/period/platform checks, sandbox isolation, refunds, overlapping tiers, ownership, freshness, and disabled-integration webhook authentication. No external requests or purchases.");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
