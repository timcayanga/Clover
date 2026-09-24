/** Exact native products configured in Clover's RevenueCat project.
 * Persisted pro means Plus; premium means the current Pro tier. */
export const STORE_OFFERING_ID = "clover_membership";
export const STORE_PACKAGES = [
  { identifier: "pro_monthly", tier: "premium", entitlementId: "clover_pro", period: "P1M", ios: "clover.pro.monthly", android: "clover.pro:monthly" },
  { identifier: "pro_annual", tier: "premium", entitlementId: "clover_pro", period: "P1Y", ios: "clover.pro.annual", android: "clover.pro:annual" },
  { identifier: "plus_monthly", tier: "pro", entitlementId: "clover_plus", period: "P1M", ios: "clover.plus.monthly", android: "clover.plus:monthly" },
  { identifier: "plus_annual", tier: "pro", entitlementId: "clover_plus", period: "P1Y", ios: "clover.plus.annual", android: "clover.plus:annual" },
] as const;
export function storeProductTier(productId: string | null | undefined) {
  return STORE_PACKAGES.find((p) => p.ios === productId || p.android === productId)?.tier;
}
export function matchesStorePackage(item: { identifier: string; product: { identifier: string; subscriptionPeriod: string | null } }, platform: string) {
  const expected = STORE_PACKAGES.find((p) => p.identifier === item.identifier);
  return Boolean(expected && (platform === "ios" || platform === "android") &&
    expected[platform as "ios" | "android"] === item.product.identifier && expected.period === item.product.subscriptionPeriod);
}
