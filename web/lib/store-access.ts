import type { AnalyticsEventName } from "./analytics";
import { capturePostHogServerEvent } from "./analytics-server";
import { STORE_OFFERING_ID, STORE_PACKAGES, storeProductTier } from "../../shared/store-catalog";
import { prisma } from "./prisma";
import { getDeploymentEnvironment } from "./deployment-environment";
import { verifiedStoreAccess } from "./store-access-rules";
import { refreshProAccess } from "./pro-access";
export function storeBillingConfig() {
  const products = STORE_PACKAGES.flatMap((p) => [p.ios, p.android]);
  const tiers = ["premium", "pro"].map((tier) => ({
    entitlementId: tier === "premium" ? "clover_pro" : "clover_plus",
    products: STORE_PACKAGES.filter((p) => p.tier === tier).flatMap((p) => [p.ios, p.android]),
  }));
  const enabled =
    process.env.CLOVER_NATIVE_PURCHASES_ENABLED === "true" &&
    Boolean(
      process.env.REVENUECAT_SECRET_API_KEY &&
      products.length &&
      process.env.REVENUECAT_WEBHOOK_SECRET,
    );
  return {
    enabled,
    purchaseRecoveryAvailable: enabled && Boolean(process.env.REVENUECAT_RECOVERY_API_KEY),
    entitlementId: "clover_plus", // Compatibility field for older clients; never used for verification.
    offeringId: STORE_OFFERING_ID,
    tiers,
    products,
    sandbox: getDeploymentEnvironment() !== "production",
    // Exact Clerk IDs, configured server-side for TestFlight/Play testers and
    // review accounts. Never accept a client-provided environment or allowlist.
    sandboxAppUserIds: (process.env.REVENUECAT_SANDBOX_APP_USER_IDS ?? "")
      .split(/[\s,]+/).filter((id) => id.startsWith("user_")),
  };
}
export async function syncStoreAccess(userId: string) {
  const config = storeBillingConfig();
  if (!config.enabled)
    throw new Error("Store purchases are not configured yet.");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, clerkUserId: true, environment: true },
  });
  if (config.sandbox !== (user.environment !== "production"))
    throw new Error("Store environment does not match this account.");
  const response = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(user.clerkUserId)}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.REVENUECAT_SECRET_API_KEY}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok)
    throw new Error("Could not verify your store subscription. Please retry.");
  const payload: unknown = await response.json();
  const verifiedRecoveryAlias = await verifyRecoveredStoreAlias(payload, user.clerkUserId, user.environment);
  const { refunded, ...state } = verifiedStoreAccess(payload, {
    ...config,
    appUserId: user.clerkUserId,
    verifiedRecoveryAlias,
  });
  const lifecycle = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`store-access:${user.id}`}))`;
    const current = await tx.storeAccess.findUnique({ where: { userId } });
    if (current && current.verifiedAt >= state.verifiedAt) return;
    await tx.storeAccess.upsert({
      where: { userId },
      create: { userId, ...state },
      update: state,
    });
    const previouslyActive = Boolean(current?.expiresAt);
    const event: AnalyticsEventName | null = !previouslyActive && state.expiresAt ? "billing_success"
      : previouslyActive && !state.expiresAt ? (refunded ? "billing_refunded" : "billing_expired")
      : current?.renewing && !state.renewing && state.expiresAt ? "billing_cancelled"
      : current?.productId === state.productId && current?.expiresAt && state.expiresAt && state.expiresAt > current.expiresAt ? "billing_renewed" : null;
    return event ? { event, provider: state.store ?? current?.store, tier: storeProductTier(state.productId ?? current?.productId), sandbox: state.productId ? state.sandbox : current?.sandbox ?? state.sandbox } : null;
  });
  if (lifecycle) void capturePostHogServerEvent(lifecycle.event, user.clerkUserId, { billing_provider: lifecycle.provider, plan_tier: lifecycle.tier, sandbox: lifecycle.sandbox }).catch(() => {});
  await refreshProAccess(userId);
  return { verifiedRecoveryAlias };
}

/** RevenueCat can retain an anonymous original ID after a verified transfer.
 * Never infer ownership from that alias: require our completed deletion audit
 * and a fresh provider lookup for each subscription returned to this identity. */
export async function verifyRecoveredStoreAlias(raw: unknown, appUserId: string, environment: string) {
  const value = raw as { subscriber?: { original_app_user_id?: string; subscriptions?: Record<string, {store?: string; store_transaction_id?: string; is_sandbox?: boolean}> } };
  const subscriber = value?.subscriber;
  const original = subscriber?.original_app_user_id;
  if (!original?.startsWith("$RCAnonymousID:")) return undefined;
  const audit = await prisma.storePurchaseRecovery.findFirst({ where: { targetClerkUserId: appUserId, environment, completedAt: { not: null } }, select: { id: true } });
  if (!audit) return undefined;
  const subscriptions = Object.values(subscriber?.subscriptions ?? {});
  if (!subscriptions.length) return undefined;
  const { subscriptionOwner } = await import("./store-purchase-recovery");
  if (subscriptions.some(s => s.store !== "app_store" || !s.store_transaction_id)) return undefined;
  const owners = await Promise.all(subscriptions.map(s => subscriptionOwner(s.store_transaction_id!, s.is_sandbox ? "sandbox" : "production")));
  if (owners.some(owner => owner !== appUserId)) return undefined;
  return original;
}
