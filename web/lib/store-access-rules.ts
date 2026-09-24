import { z } from "zod";
const date = z.string().datetime({ offset: true });
const subscription = z.object({
  expires_date: date.nullable(),
  grace_period_expires_date: date.nullable().optional(),
  is_sandbox: z.boolean(),
  store: z.string(),
  refunded_at: date.nullable().optional(),
  unsubscribe_detected_at: date.nullable().optional(),
  billing_issues_detected_at: date.nullable().optional(),
});
const payload = z.object({
  request_date_ms: z.number().int().positive(),
  subscriber: z.object({
    original_app_user_id: z.string(),
    entitlements: z.record(
      z.string(),
      z.object({
        product_identifier: z.string(),
        expires_date: date.nullable(),
        grace_period_expires_date: date.nullable().optional(),
      }),
    ),
    subscriptions: z.record(z.string(), subscription),
  }),
});
// Only a server-fetched RevenueCat response reaches this parser. Client SDK
// CustomerInfo, receipt claims and webhook entitlement fields never grant access.
export function verifiedStoreAccess(
  raw: unknown,
  config: {
    appUserId: string;
    tiers: { entitlementId: string; products: readonly string[] }[];
    sandbox: boolean;
  },
  now = new Date(),
) {
  const data = payload.parse(raw);
  if (data.subscriber.original_app_user_id !== config.appUserId)
    throw new Error("Store account ownership does not match. Contact support.");
  if (
    data.request_date_ms > now.getTime() + 60000 ||
    data.request_date_ms < now.getTime() - 10 * 60000
  )
    throw new Error("Store verification is stale.");
  // Catalog order is highest tier first; never combine an entitlement with a
  // product from another tier, or accept Paddle/Test Store access as native.
  const states = config.tiers.map((tier) => {
    const entitlement = data.subscriber.entitlements[tier.entitlementId];
    const plan =
      entitlement &&
      data.subscriber.subscriptions[entitlement.product_identifier];
    const matches =
      entitlement &&
      plan &&
      tier.products.includes(entitlement.product_identifier) &&
      ["app_store", "play_store"].includes(plan.store) &&
      plan.is_sandbox === config.sandbox;
    const expiration =
      matches && entitlement.expires_date && plan.expires_date
        ? new Date(
            Math.min(
              +new Date(
                entitlement.grace_period_expires_date ?? entitlement.expires_date,
              ),
              +new Date(plan.grace_period_expires_date ?? plan.expires_date),
            ),
          )
        : null;
    const active = Boolean(expiration && expiration > now && !plan?.refunded_at);
    return {
      verifiedAt: new Date(data.request_date_ms),
      expiresAt: active ? expiration : null,
      store: matches ? plan.store : null,
      productId: matches ? entitlement.product_identifier : null,
      renewing:
        active &&
        !plan?.unsubscribe_detected_at &&
        !plan?.billing_issues_detected_at,
      sandbox: config.sandbox,
    };
  });
  return states.find((state) => state.expiresAt) ?? {
    verifiedAt: new Date(data.request_date_ms), expiresAt: null,
    store: null, productId: null, renewing: false, sandbox: config.sandbox,
  };
}
