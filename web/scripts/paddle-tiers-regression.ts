import assert from "node:assert/strict";
import { getPaddlePlans, getPaddlePlanById } from "../lib/paddle-plans";
import { getPaddlePlan } from "../lib/paddle-billing";
import { matchesPaddleApprovedPrice, paddlePlusPricing, paddlePremiumPricing } from "../lib/billing-offer-rules";
import { calculateProAccess } from "../lib/pro-access-rules";
import type { AppEnv } from "../lib/env";
const env = {
  PADDLE_MONTHLY_PRICE_ID: "old_month", PADDLE_ANNUAL_PRICE_ID: "old_year", PADDLE_PRODUCT_ID: "old_product",
  PADDLE_PLUS_MONTHLY_PRICE_ID: "plus_month", PADDLE_PLUS_ANNUAL_PRICE_ID: "plus_year",
  PADDLE_PRO_MONTHLY_PRICE_ID: "pro_month", PADDLE_PRO_ANNUAL_PRICE_ID: "pro_year",
} as AppEnv;
assert.equal(getPaddlePlans(env).length, 4);
assert.equal(getPaddlePlanById("old_month", env), null, "explicit mapping excludes legacy generic IDs");
for (const plan of getPaddlePlans(env)) {
  const result = getPaddlePlan({items: [{price: {id: plan.priceId, product_id: "new_product"}}], custom_data: {planTier: "spoofed"}}, env);
  assert.equal(result.tier, plan.tier === "plus" ? "pro" : "premium");
  assert.equal(result.interval, plan.interval);
  const catalog = plan.tier === "plus" ? paddlePlusPricing : paddlePremiumPricing;
  const price = {status: "active", billing_cycle: {interval: plan.interval === "monthly" ? "month" : "year", frequency: 1}, unit_price: {currency_code: "USD", amount: String(Math.round(catalog.global[plan.interval].amount * 100))}, unit_price_overrides: [{country_codes: ["PH"], unit_price: {currency_code: "USD", amount: String(Math.round(catalog.ph[plan.interval].amount * 100))}}]};
  for (const country of ["PH", "US"]) {
    assert(matchesPaddleApprovedPrice(price, country, plan.interval, plan.tier));
    assert(!matchesPaddleApprovedPrice(price, country, plan.interval, plan.tier === "plus" ? "pro" : "plus"));
    assert(!matchesPaddleApprovedPrice({...price, status: "archived"}, country, plan.interval, plan.tier));
    assert(!matchesPaddleApprovedPrice({...price, trial_period: {}}, country, plan.interval, plan.tier));
    assert(!matchesPaddleApprovedPrice(price, country, plan.interval === "monthly" ? "annual" : "monthly", plan.tier));
  }
  assert(!matchesPaddleApprovedPrice({...price, unit_price_overrides: []}, "PH", plan.interval, plan.tier));
  assert(!matchesPaddleApprovedPrice({...price, unit_price_overrides: [{country_codes: ["PH"], unit_price: {currency_code: "PHP", amount: "34900"}}]}, "PH", plan.interval, plan.tier));
}
assert.equal(getPaddlePlan({items: [{price_id: "unknown"}]}, env).tier, null);
assert.equal(getPaddlePlan({items: [{price_id: "plus_month"}, {price_id: "pro_month"}]}, env).tier, null);
assert.equal(getPaddlePlan({items: [{price_id: "pro_month", product_id: "wrong"}]}, {...env, PADDLE_PRO_PRODUCT_ID: "right"}).tier, null);
assert.equal(getPaddlePlanById("pro_month", {...env, PADDLE_PLUS_MONTHLY_PRICE_ID: "pro_month"}), null);
assert.equal(getPaddlePlanById("old_month", {PADDLE_MONTHLY_PRICE_ID: "old_month"} as AppEnv)?.planTier, "pro", "legacy-only config remains Plus");
assert.equal(getPaddlePlanById("old_month", {PADDLE_MONTHLY_PRICE_ID: "old_month", PADDLE_PRO_MONTHLY_PRICE_ID: "pro_month"} as AppEnv), null);
const input = {planTier: "free" as const, planTierLocked: false, grants: [], subscription: {status: "cancelled", interval: "monthly", planTier: "premium" as const, paidThrough: new Date("2030-02-01")}};
assert.equal(calculateProAccess(input, new Date("2030-01-01")).planTier, "premium");
assert.equal(calculateProAccess(input, new Date("2030-03-01")).planTier, "free");
console.log("PASS Paddle Plus/Pro: four prices, regional USD charges, spoofing, duplicate IDs, product checks, legacy isolation, cancellation and expiry.");

async function verifyServerFlows() {
  const { getVerifiedBillingOffers } = await import("../lib/billing-offers.server");
  const { applyPaddleEntitlement } = await import("../lib/paddle-billing");
  const { prisma } = await import("../lib/prisma");
  const oldFetch = globalThis.fetch;
  const oldDeployment = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "preview";
  const configured = {...env, PADDLE_ENV: "sandbox" as const, PADDLE_API_KEY: "test", PADDLE_CLIENT_TOKEN: "test", PADDLE_WEBHOOK_SECRET: "test"};
  try {
    globalThis.fetch = (async (url: string | URL | Request) => {
      assert(String(url).startsWith("https://sandbox-api.paddle.com/prices/"));
      const plan = getPaddlePlanById(String(url).split("/").at(-1), configured)!;
      const rates = plan.tier === "plus" ? paddlePlusPricing : paddlePremiumPricing;
      return Response.json({data: {id: plan.priceId, status: "active", billing_cycle: {interval: plan.interval === "monthly" ? "month" : "year", frequency: 1}, unit_price: {currency_code: "USD", amount: String(Math.round(rates.global[plan.interval].amount * 100))}, unit_price_overrides: [{country_codes: ["PH"], unit_price: {currency_code: "USD", amount: String(Math.round(rates.ph[plan.interval].amount * 100))}}]}});
    }) as typeof fetch;
    for (const country of ["PH", "US"]) {
      const offers = await getVerifiedBillingOffers(country, configured);
      assert.deepEqual(offers.paddle, {monthly: "plus_month", annual: "plus_year"});
      assert.deepEqual(offers.pro?.paddle, {monthly: "pro_month", annual: "pro_year"});
      assert.equal(offers.pro?.paddlePrices.monthly, country === "PH" ? "US$5.99" : "US$12.99");
    }
    const wrongEnvironment = await getVerifiedBillingOffers("PH", {...configured, PADDLE_ENV: "live"});
    assert.equal(wrongEnvironment.paddle.monthly, null);
    assert.equal(wrongEnvironment.pro?.paddle.monthly, null);
    globalThis.fetch = (async () => Response.json({error: "unavailable"}, {status: 403})) as typeof fetch;
    const unavailable = await getVerifiedBillingOffers("PH", configured);
    assert.equal(unavailable.pro?.paddle.annual, null);
    assert.equal(unavailable.paddle.annual, null);
  } finally { globalThis.fetch = oldFetch; }
  // Exercise the actual webhook handler against isolated in-memory persistence.
  const restorers: Array<() => void> = [];
  function mock(target: any, key: string, fn: any) { const original = target[key]; target[key] = fn; restorers.push(() => {target[key] = original;}); }
  let saved: any = null;
  let status = "active";
  let duplicate = false;
  const user = {id: "qa_user", environment: "staging", planTierLocked: true};
  mock(prisma.billingSubscription, "findUnique", async () => ({user, provider: "paddle", planTier: "pro", status, rawPayload: null}));
  mock(prisma.billingEvent, "findUnique", async () => duplicate ? {processedAt: new Date()} : null);
  mock(prisma.billingEvent, "upsert", async ({create}: any) => create);
  mock(prisma.growthPayment, "findFirst", async () => ({paidThrough: new Date("2030-02-01")}));
  mock(prisma.billingSubscription, "upsert", async ({create}: any) => { saved = create; return create; });
  try {
    for (const plan of getPaddlePlans(configured)) {
      for (const eventStatus of ["active", "canceled", "past_due"]) {
        status = eventStatus === "canceled" ? "cancelled" : eventStatus;
        saved = null;
        const result = await applyPaddleEntitlement({event_id: "evt_test", event_type: "subscription.updated", data: {id: "sub_test", status: eventStatus, items: [{price: {id: plan.priceId}}]}}, configured);
        assert(result.applied);
        assert.equal(saved.planTier, plan.planTier);
        assert.equal(saved.interval, plan.interval);
      }
    }
    saved = null;
    await applyPaddleEntitlement({event_id: "evt_bad", event_type: "subscription.updated", data: {id: "sub_test", status: "active", items: [{price_id: "unknown"}], custom_data: {planTier: "premium"}}}, configured);
    assert.equal(saved, null, "unknown prices cannot change entitlements");
    duplicate = true;
    await applyPaddleEntitlement({event_id: "evt_test", event_type: "subscription.updated", data: {id: "sub_test", status: "active", items: [{price_id: "pro_month"}]}}, configured);
    assert.equal(saved, null, "duplicate events cannot repeat subscription writes");
  } finally {
    restorers.reverse().forEach(restore => restore());
    if (oldDeployment === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = oldDeployment;
  }
  console.log("PASS verified regional offers and actual Paddle webhook persistence: Plus/Pro, monthly/annual, active/cancelled/past-due, unknown IDs and duplicates (mock storage only).");
}
verifyServerFlows().catch(error => { console.error(error); process.exitCode = 1; });
