import { createHash } from "node:crypto";
import { SignedDataVerifier, Environment } from "@apple/app-store-server-library";
import { clerkClient } from "@clerk/nextjs/server";
import { STORE_PACKAGES } from "../../shared/store-catalog";
import { appleStoreRoot } from "./apple-store-root";
import { prisma } from "./prisma";
import { storeBillingConfig, syncStoreAccess } from "./store-access";
import { getDeploymentEnvironment } from "./deployment-environment";
import { NativeInputError } from "./native-input-error";
import { assertRateLimit } from "./rate-limit";

const project = "c4469f47";
const iosApp = "app1b9b72f65f";
const help = "This purchase cannot be recovered automatically. Contact Clover support. Please do not buy again.";
export const purchaseRecoveryEnabled = () => storeBillingConfig().enabled && Boolean(process.env.REVENUECAT_RECOVERY_API_KEY);
const fail = (message = help): never => { throw new NativeInputError(message); };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

async function revenuecat(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.revenuecat.com/v2/projects/${project}/${path}`, {
    ...init, headers: { Authorization: `Bearer ${process.env.REVENUECAT_RECOVERY_API_KEY}`, "Content-Type": "application/json" },
    cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) fail("Purchase recovery could not finish. Try Recover purchase again. Your purchase has not been charged again.");
  return response.status === 204 ? {} : record(await response.json());
}

export async function verifyRecoveryReceipt(signedTransaction: string, appUserId: string) {
  if (signedTransaction.length > 24000 || signedTransaction.split(".").length !== 3) fail();
  const config = storeBillingConfig();
  // Sandbox is permitted only for the same server-side testers used by normal billing.
  const environments = config.sandbox ? [Environment.SANDBOX]
    : config.sandboxAppUserIds.includes(appUserId) ? [Environment.PRODUCTION, Environment.SANDBOX] : [Environment.PRODUCTION];
  for (const environment of environments) {
    try {
      const verifier = new SignedDataVerifier([appleStoreRoot], true, environment, "ph.clover.app", 6811711508);
      const proof = await verifier.verifyAndDecodeTransaction(signedTransaction);
      if (!proof.transactionId || !proof.originalTransactionId || !STORE_PACKAGES.some(p => p.ios === proof.productId)
        || proof.inAppOwnershipType !== "PURCHASED" || proof.revocationDate || proof.type !== "Auto-Renewable Subscription") fail();
      return { transactionId: proof.transactionId!, environment: environment === Environment.SANDBOX ? "sandbox" : "production" };
    } catch { /* A proof for another environment or with an invalid signature grants nothing. */ }
  }
  return fail("Apple could not verify this Clover purchase. Check the App Store account used for the purchase, then try again.");
}

export async function subscriptionOwner(transactionId: string, environment: string) {
  const result = await revenuecat(`subscriptions?store_subscription_identifier=${encodeURIComponent(transactionId)}`);
  const items = Array.isArray(result.items) ? result.items.map(record) : [];
  if (result.next_page || items.length !== 1) fail();
  const item = items[0];
  if (item.store !== "app_store" || item.environment !== environment || item.ownership !== "purchased"
    || typeof item.customer_id !== "string" || !item.customer_id.startsWith("user_")) fail();
  // The lookup identifier came from a cryptographically verified Clover iOS
  // transaction. Transfer is additionally restricted to the Clover iOS app.
  return item.customer_id as string;
}

/** Receipt proof + completed deletion, never an email match or client-provided owner. */
export async function recoverDeletedStorePurchase(userId: string, signedTransaction: string) {
  if (!purchaseRecoveryEnabled()) fail("Purchase recovery is not available yet. Contact Clover support.");
  assertRateLimit(`store-recovery:${userId}`, 4, 60 * 60 * 1000);
  const target = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { clerkUserId: true, environment: true } });
  if (target.environment !== getDeploymentEnvironment()) fail();
  const proof = await verifyRecoveryReceipt(signedTransaction, target.clerkUserId);
  const source = await subscriptionOwner(proof.transactionId, proof.environment);
  if (source === target.clerkUserId) {
    await prisma.storePurchaseRecovery.updateMany({ where: { targetClerkUserId: target.clerkUserId, environment: target.environment, transactionHash: createHash("sha256").update(proof.transactionId).digest("hex"), completedAt: null }, data: { completedAt: new Date() } });
    await syncStoreAccess(userId); return;
  }
  const provider = await clerkClient();
  try { await provider.users.getUser(source); fail(); }
  catch (error) { if (!(error && typeof error === "object" && "status" in error && error.status === 404)) throw error; }
  // Reserve the destination durably before the remote operation. An unknown
  // network outcome can only be retried for this same destination.
  const key = { sourceClerkUserId_appId: { sourceClerkUserId: source, appId: iosApp } };
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`store-recovery:${source}`}))`;
    const erasure = await tx.accountErasureTask.findUnique({ where: { clerkUserId_provider: { clerkUserId: source, provider: "revenuecat" } } });
    if (erasure?.status === "completed" || record(erasure?.payload).deletionRequested === true) fail();
    const deleted = await tx.clerkIdentityDeletion.findUnique({ where: { clerkUserId: source } });
    if (!deleted?.completedAt || deleted.environment !== target.environment || await tx.user.findUnique({ where: { clerkUserId: source } })) fail();
    const prior = await tx.storePurchaseRecovery.findUnique({ where: key });
    if (prior && (prior.targetClerkUserId !== target.clerkUserId || prior.environment !== target.environment)) fail();
    if (!prior) await tx.storePurchaseRecovery.create({ data: {
      sourceClerkUserId: source, targetClerkUserId: target.clerkUserId, environment: target.environment, appId: iosApp,
      transactionHash: createHash("sha256").update(proof.transactionId).digest("hex"),
    } });
  });
  await prisma.$transaction(async tx => {
    // Deletion uses this same identity lock. Do not transfer into a deleted account.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clerk-identity:${target.clerkUserId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`store-recovery:${source}`}))`;
    if (await tx.clerkIdentityDeletion.findUnique({ where: { clerkUserId: target.clerkUserId } }) || !await tx.user.findUnique({ where: { id: userId } })) fail();
    const erasure = await tx.accountErasureTask.findUnique({ where: { clerkUserId_provider: { clerkUserId: source, provider: "revenuecat" } } });
    if (erasure?.status === "completed" || record(erasure?.payload).deletionRequested === true) fail();
    const currentOwner = await subscriptionOwner(proof.transactionId, proof.environment);
    if (currentOwner !== source && currentOwner !== target.clerkUserId) fail();
    if (currentOwner === source) {
      const existing = await tx.storeAccess.findUnique({ where: { userId } });
      if (existing?.expiresAt && existing.expiresAt > new Date()) fail("This Clover account already has a store subscription. Contact support before recovering another purchase.");
      await revenuecat(`customers/${encodeURIComponent(source)}/actions/transfer`, {
        method: "POST", body: JSON.stringify({ target_customer_id: target.clerkUserId, app_ids: [iosApp] }),
      });
    }
    await tx.storePurchaseRecovery.update({ where: key, data: { completedAt: new Date() } });
  }, { timeout: 45000 });
  // RevenueCat remains the authority for expiry, renewal, refunds, and tier.
  // This does not restore any deleted financial data or start a new purchase.
  await syncStoreAccess(userId);
}
