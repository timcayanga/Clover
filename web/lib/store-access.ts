import { prisma } from "./prisma";
import { getDeploymentEnvironment } from "./deployment-environment";
import { verifiedStoreAccess } from "./store-access-rules";
import { refreshProAccess } from "./pro-access";
export function storeBillingConfig() {
  const products = (process.env.CLOVER_STORE_PRODUCT_IDS ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const entitlementId = process.env.REVENUECAT_ENTITLEMENT_ID ?? "";
  const enabled =
    process.env.CLOVER_NATIVE_PURCHASES_ENABLED === "true" &&
    Boolean(
      process.env.REVENUECAT_SECRET_API_KEY &&
      entitlementId &&
      products.length &&
      process.env.REVENUECAT_WEBHOOK_SECRET,
    );
  return {
    enabled,
    entitlementId,
    products,
    sandbox: getDeploymentEnvironment() !== "production",
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
  const state = verifiedStoreAccess(await response.json(), {
    ...config,
    appUserId: user.clerkUserId,
  });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`store-access:${user.id}`}))`;
    const current = await tx.storeAccess.findUnique({ where: { userId } });
    if (current && current.verifiedAt >= state.verifiedAt) return;
    await tx.storeAccess.upsert({
      where: { userId },
      create: { userId, ...state },
      update: state,
    });
  });
  await refreshProAccess(userId);
}
