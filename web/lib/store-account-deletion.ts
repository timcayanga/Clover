import { prisma } from "./prisma";
import { storeBillingConfig, verifyRecoveredStoreAlias } from "./store-access";
import { assertAppleDeletionAcknowledged, storeDeletionPlan, cancelGoogleDeletionSubscriptions, type StoreDeletionPlan } from "./store-deletion-rules";
const empty = (): StoreDeletionPlan => ({ appleCancellationRequired: false, googleTransactionIds: [] });
export async function getStoreDeletionPlan(clerkUserId: string): Promise<StoreDeletionPlan> {
  const user = await prisma.user.findUnique({ where: { clerkUserId }, select: { environment: true, storeAccess: true } });
  if (!user) return empty();
  const config = storeBillingConfig();
  if (config.sandbox !== (user.environment !== "production")) throw new Error("Store environment does not match this account.");
  const key = process.env.REVENUECAT_SECRET_API_KEY;
  // Disabling new purchases must not disable cancellation of existing purchases.
  if (!key) {
    if (user.storeAccess || process.env.CLOVER_NATIVE_PURCHASES_ENABLED === "true")
      throw new Error("Store billing verification is unavailable. Please retry account deletion later.");
    return empty();
  }
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(clerkUserId)}`, {
    headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  if (response.status === 404 && !user.storeAccess) return empty();
  if (!response.ok) throw new Error("Could not verify your store subscription. Your account has not been deleted. Please retry.");
  const payload: unknown = await response.json();
  const verifiedRecoveryAlias = await verifyRecoveredStoreAlias(payload, clerkUserId, user.environment);
  return storeDeletionPlan(payload, { ...config, appUserId: clerkUserId, verifiedRecoveryAlias });
}
export async function cancelStoreBillingForDeletion(clerkUserId: string, appleAcknowledged?: boolean) {
  const plan = await getStoreDeletionPlan(clerkUserId);
  if (appleAcknowledged !== undefined) assertAppleDeletionAcknowledged(plan, appleAcknowledged);
  if (plan.googleTransactionIds.length)
    await cancelGoogleDeletionSubscriptions(clerkUserId, plan.googleTransactionIds, process.env.REVENUECAT_SECRET_API_KEY!);
}
