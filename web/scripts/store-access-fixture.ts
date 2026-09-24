import assert from "node:assert/strict";
import { verifiedStoreAccess } from "../lib/store-access-rules";
import { calculateProAccess } from "../lib/pro-access-rules";
import { prisma } from "../lib/prisma";
import { syncStoreAccess } from "../lib/store-access";
import { POST as webhook } from "../app/api/billing/revenuecat/webhook/route";
const db = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost"].includes(db.hostname) ||
  !db.pathname.endsWith("_qa")
)
  throw Error("Isolated QA database required");
const now = new Date();
const future = new Date(+now + 86400000).toISOString();
const config = {
  appUserId: "user_storeFixture",
  entitlementId: "clover_plus",
  products: ["clover.plus.monthly"],
  tiers: [{ entitlementId: "clover_plus", products: ["clover.plus.monthly"] }],
  sandbox: true,
};
const sample = () => ({
  request_date_ms: +now,
  subscriber: {
    original_app_user_id: config.appUserId,
    entitlements: {
      clover_plus: { product_identifier: config.products[0], expires_date: future },
    },
    subscriptions: {
      [config.products[0]]: {
        expires_date: future,
        is_sandbox: true,
        store: "app_store",
        refunded_at: null as string | null,
        unsubscribe_detected_at: null as string | null,
      },
    },
  },
});
let count = 0;
function test(name: string, run: () => void) {
  run();
  count++;
  console.log(`PASS ${name}`);
}
async function main() {
  test("Verified supported subscription grants access only through its expiry", () => {
    const result = verifiedStoreAccess(sample(), config, now);
    assert.equal(result.expiresAt?.toISOString(), future);
    assert.equal(result.renewing, true);
  });
  test("Sandbox, unknown products and different account cannot grant access", () => {
    assert.equal(
      verifiedStoreAccess(sample(), { ...config, sandbox: false }, now)
        .expiresAt,
      null,
    );
    assert.equal(
      verifiedStoreAccess(sample(), { ...config, tiers: [] }, now).expiresAt,
      null,
    );
    assert.throws(
      () =>
        verifiedStoreAccess(
          sample(),
          { ...config, appUserId: "user_other" },
          now,
        ),
      /ownership/,
    );
  });
  test("Cancellation retains paid-through access; refunds remove it", () => {
    const data = sample();
    data.subscriber.subscriptions[config.products[0]].unsubscribe_detected_at =
      now.toISOString();
    assert.equal(verifiedStoreAccess(data, config, now).renewing, false);
    assert.ok(verifiedStoreAccess(data, config, now).expiresAt);
    data.subscriber.subscriptions[config.products[0]].refunded_at =
      now.toISOString();
    assert.equal(verifiedStoreAccess(data, config, now).expiresAt, null);
  });
  test("Expired, malformed and stale responses cannot grant Pro", () => {
    const data = sample();
    data.subscriber.entitlements.clover_plus.expires_date = new Date(0).toISOString();
    assert.equal(verifiedStoreAccess(data, config, now).expiresAt, null);
    assert.throws(() => verifiedStoreAccess({ planTier: "pro" }, config, now));
    assert.throws(
      () =>
        verifiedStoreAccess(
          { ...sample(), request_date_ms: +now - 3600000 },
          config,
          now,
        ),
      /stale/,
    );
  });
  test("Store expiry preserves independent grants; Admin locks retain precedence", () => {
    const input = {
      planTier: "free" as const,
      planTierLocked: false,
      subscription: null,
      storeAccess: { expiresAt: new Date(future), renewing: false },
      grants: [],
    };
    assert.equal(calculateProAccess(input, now).planTier, "pro");
    assert.equal(
      calculateProAccess(input, new Date(+now + 172800000)).planTier,
      "free",
    );
    assert.equal(
      calculateProAccess({ ...input, planTierLocked: true }, now).planTier,
      "free",
    );
    assert.equal(
      calculateProAccess(
        {
          ...input,
          storeAccess: null,
          grants: [
            { startsAt: now, endsAt: new Date(future), revokedAt: null },
          ],
        },
        now,
      ).planTier,
      "pro",
    );
  });
  const target = await prisma.user.create({
    data: {
      clerkUserId: config.appUserId,
      email: "store-fixture@example.invalid",
      environment: "staging",
    },
  });
  const originalFetch = globalThis.fetch;
  try {
    process.env.VERCEL_ENV = "preview";
    process.env.CLOVER_NATIVE_PURCHASES_ENABLED = "false";
    await assert.rejects(syncStoreAccess(target.id), /not configured/);
    count++;
    console.log("PASS Unconfigured store integration fails closed");
    process.env.CLOVER_NATIVE_PURCHASES_ENABLED = "true";
    process.env.REVENUECAT_SECRET_API_KEY = "fixture-only";
    process.env.REVENUECAT_WEBHOOK_SECRET = "fixture-secret";
    process.env.REVENUECAT_ENTITLEMENT_ID = config.entitlementId;
    process.env.CLOVER_STORE_PRODUCT_IDS = config.products.join(",");
    let body = sample();
    globalThis.fetch = async (url) => {
      assert.equal(
        String(url),
        `https://api.revenuecat.com/v1/subscribers/${config.appUserId}`,
      );
      return Response.json(body);
    };
    await syncStoreAccess(target.id);
    await syncStoreAccess(target.id);
    assert.equal(
      await prisma.storeAccess.count({ where: { userId: target.id } }),
      1,
    );
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: target.id } }))
        .planTier,
      "pro",
    );
    body = { ...sample(), request_date_ms: +now - 1000 };
    body.subscriber.subscriptions[config.products[0]].refunded_at =
      now.toISOString();
    await syncStoreAccess(target.id);
    assert.ok(
      (
        await prisma.storeAccess.findUniqueOrThrow({
          where: { userId: target.id },
        })
      ).expiresAt,
    );
    body.request_date_ms = +now + 1000;
    await syncStoreAccess(target.id);
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: target.id } }))
        .planTier,
      "free",
    );
    count++;
    console.log(
      "PASS Server sync persists once, ignores older snapshots, applies verified refunds",
    );
    assert.equal(
      (
        await webhook(
          new Request("https://fixture.invalid", {
            method: "POST",
            body: "{}",
          }),
        )
      ).status,
      401,
    );
    const result = await webhook(
      new Request("https://fixture.invalid", {
        method: "POST",
        headers: { authorization: "Bearer fixture-secret" },
        body: JSON.stringify({ event: { id: "test-fixture", type: "TEST" } }),
      }),
    );
    assert.equal(result.status, 200);
    count++;
    console.log(
      "PASS Webhook requires its secret and accepts authenticated test events",
    );
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.user.delete({ where: { id: target.id } });
    await prisma.$disconnect();
  }
  console.log(
    `${count}/${count} store preparation checks passed. No store connection or purchase was made.`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
