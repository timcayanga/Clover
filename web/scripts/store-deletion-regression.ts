import assert from "node:assert/strict";
import { storeDeletionPlan, assertAppleDeletionAcknowledged, cancelGoogleDeletionSubscriptions } from "../lib/store-deletion-rules";
import { mobileOperation } from "../lib/mobile-api-policy";
const now = Date.parse("2026-10-03T12:00:00Z");
const config = { appUserId: "user_test", sandbox: false, sandboxAppUserIds: ["user_test"] };
const google = { store: "play_store", is_sandbox: false, expires_date: "2026-11-01T00:00:00Z", product_plan_identifier: "monthly", store_transaction_id: "GPA.1234-1234-1234-12345", ownership_type: "PURCHASED", unsubscribe_detected_at: null, refunded_at: null };
const apple = { ...google, store: "app_store", store_transaction_id: "100000000", product_plan_identifier: null };
const payload = (subscriptions: Record<string, unknown>, extra = {}) => ({ request_date_ms: now, subscriber: { original_app_user_id: "user_test", subscriptions }, ...extra });
const parse = (subscriptions: Record<string, unknown>) => storeDeletionPlan(payload(subscriptions), config, now);
async function main() {
  assert.deepEqual(parse({}), { appleCancellationRequired: false, googleTransactionIds: [] });
  assert.deepEqual(parse({ "clover.plus": google }).googleTransactionIds, [google.store_transaction_id]);
  const both = parse({ "clover.plus": google, "clover.pro.monthly": apple, "clover.pro": { ...google, store_transaction_id: "GPA.5678-1234-1234-12345..2" } });
  assert.equal(both.googleTransactionIds.length, 2);
  assert.equal(both.appleCancellationRequired, true);
  assert.throws(() => assertAppleDeletionAcknowledged(both, false), /Apple Subscriptions/);
  assert.doesNotThrow(() => assertAppleDeletionAcknowledged(both, true));
  for (const change of [{ unsubscribe_detected_at: "2026-10-01T00:00:00Z" }, { refunded_at: "2026-10-01T00:00:00Z" }, { ownership_type: "FAMILY_SHARED" }, { expires_date: "2026-09-01T00:00:00Z" }]) {
    assert.equal(parse({ "clover.plus": { ...google, ...change } }).googleTransactionIds.length, 0);
    assert.equal(parse({ "clover.plus.monthly": { ...apple, ...change } }).appleCancellationRequired, false);
  }
  for (const change of [{ billing_issues_detected_at: "2026-09-01T00:00:00Z" }, { auto_resume_date: "2026-11-01T00:00:00Z" }, { auto_resume_date: "2026-11-01T00:00:00Z", unsubscribe_detected_at: "2026-09-01T00:00:00Z" }])
    assert.equal(parse({ "clover.plus": { ...google, expires_date: "2026-09-01T00:00:00Z", ...change } }).googleTransactionIds.length, 1);
  for (const change of [{ store_transaction_id: null }, { store_transaction_id: "foreign/path" }, { product_plan_identifier: "unknown" }])
    assert.throws(() => parse({ "clover.plus": { ...google, ...change } }));
  assert.throws(() => parse({ "other.subscription": google }));
  assert.throws(() => parse({ "clover.plus:annual": google }));
  assert.throws(() => storeDeletionPlan(payload({ "clover.plus": google }), { ...config, appUserId: "user_foreign" }, now));
  assert.throws(() => storeDeletionPlan(payload({}, { request_date_ms: now - 700000 }), config, now));
  assert.throws(() => storeDeletionPlan(payload({ "clover.plus": google }), { ...config, sandbox: true }, now));
  assert.throws(() => storeDeletionPlan(payload({ "clover.plus": { ...google, is_sandbox: true } }), { ...config, sandboxAppUserIds: [] }, now));
  assert.equal(parse({ "clover.plus": { ...google, is_sandbox: true } }).googleTransactionIds.length, 1);
  const calls: string[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push(String(url)); assert.equal(init?.method, "POST"); assert.equal(init?.cache, "no-store");
    return new Response("{}", { status: 200 });
  };
  await cancelGoogleDeletionSubscriptions(config.appUserId, both.googleTransactionIds, "test-only", fetcher);
  assert.equal(calls.length, 2); assert(calls.every(url => url.endsWith("/cancel") && !url.includes("revoke") && !url.includes("refund")));
  calls.length = 0;
  await assert.rejects(() => cancelGoogleDeletionSubscriptions(config.appUserId, both.googleTransactionIds, "test-only", async url => { calls.push(String(url)); return new Response("{}", { status: 503 }); }), /has not been deleted/);
  assert.equal(calls.length, 1, "stop on cancellation failure");
  await assert.rejects(() => cancelGoogleDeletionSubscriptions(config.appUserId, both.googleTransactionIds, "test-only", async () => { throw new Error("timeout"); }));
  assert.equal(mobileOperation("GET", ["settings", "delete-account"]), "settings-delete-account");
  console.log("PASS store deletion: ownership, freshness, environments, multiple stores, pending renewals/retries, cancellation and Apple acknowledgment");
}
void main();
