import { ApiError } from "./api";
import { CloverLocalAI } from "../modules/clover-local-ai";
import { matchesStorePackage, STORE_OFFERING_ID, STORE_PACKAGES } from "../../shared/store-catalog";
import { trackOperation } from "../../shared/analytics";
import { Platform } from "react-native";
import Purchases, { type PurchasesPackage } from "react-native-purchases";
import { assertStoreOwner, currentStoreProduct, googleReplacement, StoreActionError, type PurchaseIntent } from './store-change-policy';
export type StoreStatus = {
  available: boolean;
  purchaseRecoveryAvailable?: boolean;
  appUserId: string;
  entitlementId: string;
  offeringId?: string;
  productIds: string[];
  planTier: "free" | "pro" | "premium";
  accessEndsAt: string | null;
  renewing: boolean;
  hasPaidSubscription?: boolean;
  billingProvider?: string | null;
  accessSource?: string;
};
let account: string | null = null;
let serial: Promise<unknown> = Promise.resolve();
const exclusive = <T>(run: () => Promise<T>): Promise<T> => {
  const operation = serial.then(run, run);
  serial = operation.catch(() => {});
  return operation;
};
function apiKey() {
  return Platform.OS === "ios"
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
    : Platform.OS === "android"
      ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
      : undefined;
}
export function canUseStore(status: StoreStatus) {
  const key = apiKey();
  return (
    status.available &&
    status.appUserId.startsWith("user_") &&
    status.productIds.length > 0 &&
    Boolean(
      key &&
      (Platform.OS === "ios"
        ? key.startsWith("appl_")
        : key.startsWith("goog_")),
    )
  );
}
async function identify(status: StoreStatus) {
  if (!canUseStore(status))
    throw new Error("Store purchases are not configured yet.");
  if (!(await Purchases.isConfigured()))
    Purchases.configure({ apiKey: apiKey()!, appUserID: status.appUserId });
  else if ((await Purchases.getAppUserID()) !== status.appUserId)
    await Purchases.logIn(status.appUserId);
  // Never trust only our JS cache after app reloads or a failed account switch.
  // All SDK actions share this queue, including logout, so identity cannot be
  // changed by another Clover billing operation during checkout or restore.
  if ((await Purchases.getAppUserID()) !== status.appUserId)
    throw new StoreActionError("Your store session could not be switched to this Clover account. Sign out and sign in again before purchasing.");
  account = status.appUserId;
}
export function loadStorePackages(status: StoreStatus) {
  return exclusive(async () => {
    await identify(status);
    const offerings = await Purchases.getOfferings();
    const offering = offerings.all[status.offeringId ?? STORE_OFFERING_ID];
    return (offering?.availablePackages ?? []).filter((p) =>
      status.productIds.includes(p.product.identifier) && matchesStorePackage(p, Platform.OS),
    ).sort((a, b) => STORE_PACKAGES.findIndex((p) => p.identifier === a.identifier) - STORE_PACKAGES.findIndex((p) => p.identifier === b.identifier));
  });
}
export function purchaseStorePackage(
  status: StoreStatus,
  item: PurchasesPackage,
) {
  return exclusive(async () => {
    await identify(status);
    if (!status.productIds.includes(item.product.identifier) || !matchesStorePackage(item, Platform.OS))
      throw new StoreActionError("This product is unavailable. Refresh the available plans and try again.");
    const target = STORE_PACKAGES.find(p => p.identifier === item.identifier)!;
    await Purchases.invalidateCustomerInfoCache();
    const current = currentStoreProduct(await Purchases.getCustomerInfo(), status.appUserId);
    const paid = status.hasPaidSubscription === true || (status.hasPaidSubscription !== false && status.planTier !== 'free');
    let change: ReturnType<typeof googleReplacement> | null = null;
    if (current || paid) {
      if (!current || !paid || current.tier !== status.planTier)
        throw new StoreActionError('Your store and Clover plan are not yet in sync. Refresh plan status or use Restore purchases before buying again.');
      if (Platform.OS !== 'android' || status.billingProvider !== 'play_store' || current.store !== 'PLAY_STORE')
        throw new StoreActionError('Manage this subscription in its original store.');
      change = googleReplacement(current, item.product.identifier);
    }
    await trackOperation("store_purchase", () => Purchases.purchasePackage(item, null, change ? {
      oldProductIdentifier: change.oldProductIdentifier,
      replacementMode: Purchases.STORE_REPLACEMENT_MODE[change.replacementMode],
    } : null), { phase: "store_confirmation", target_plan: target.tier, billing_provider: Platform.OS === "ios" ? "app_store" : "play_store", product_id: item.product.identifier });
    await Purchases.invalidateCustomerInfoCache().catch(() => {});
    // Caller must now ask Clover's server to verify; SDK state cannot grant Pro.
    return { productId: item.product.identifier, tier: target.tier, effect: change?.effect ?? 'immediate', requestedAt: Date.now(), effectiveAt: current?.expiresAt ?? null } satisfies PurchaseIntent;
  });
}

export function googleStoreManagementUrl(status: StoreStatus) {
  return exclusive(async () => {
    if (Platform.OS !== 'android' || status.billingProvider !== 'play_store' || status.hasPaidSubscription === false)
      throw new StoreActionError('Manage this subscription in its original store.');
    // A generic URL remains usable when metadata is incomplete or there are
    // multiple subscriptions to resolve. Never open an arbitrary SDK URL.
    let product: ReturnType<typeof currentStoreProduct> = null;
    try {
      await identify(status);
      await Purchases.invalidateCustomerInfoCache();
      product = currentStoreProduct(await Purchases.getCustomerInfo(), status.appUserId);
    } catch { /* Cancellation remains accessible even when the SDK is offline. */ }
    const query = product?.store === 'PLAY_STORE' ? `&sku=${encodeURIComponent(product.subscriptionId)}` : '';
    return `https://play.google.com/store/account/subscriptions?package=ph.clover.app${query}`;
  });
}
export function restoreStorePurchases(status: StoreStatus) {
  return exclusive(async () => {
    await identify(status);
    const info = await trackOperation("store_restore", () => Purchases.restorePurchases(), { phase: "store_confirmation" });
    assertStoreOwner(info, status.appUserId);
    await Purchases.invalidateCustomerInfoCache().catch(() => {});
  });
}
/** Present StoreKit in the current app environment, including TestFlight's sandbox. */
export function manageAppleStoreSubscription(status: StoreStatus) {
  return exclusive(async () => {
    if (Platform.OS !== "ios" || status.billingProvider !== "app_store" || status.hasPaidSubscription === false)
      throw new Error("Manage this subscription in its original store.");
    await identify(status);
    await Purchases.showManageSubscriptions();
    // Dismissal alone does not establish a plan change. The caller re-verifies with Clover's server.
    await Purchases.invalidateCustomerInfoCache();
  });
}
export function disconnectStoreAccount() {
  return exclusive(async () => {
    if (account && (await Purchases.isConfigured())) await Purchases.logOut();
    account = null;
  });
}
export function storeManagementUrl() {
  return Platform.OS === "ios"
    ? "https://apps.apple.com/account/subscriptions"
    : Platform.OS === "android"
      ? "https://play.google.com/store/account/subscriptions"
      : null;
}

export function canRecoverStorePurchase(status: StoreStatus) {
  return Platform.OS === "ios" && status.purchaseRecoveryAvailable === true && Boolean(CloverLocalAI?.recoverableApplePurchase);
}
export function recoverStorePurchase(status: StoreStatus, submit: (signedTransaction: string) => Promise<unknown>) {
  return exclusive(async () => {
    await identify(status);
    if (!canRecoverStorePurchase(status)) throw new StoreActionError("Contact Clover support to recover this purchase.");
    const signedTransaction = await CloverLocalAI!.recoverableApplePurchase!();
    try { await submit(signedTransaction); }
    catch (error) {
      if (error instanceof ApiError && [400, 409].includes(error.status)) throw new StoreActionError(error.message);
      throw new StoreActionError("Purchase recovery could not finish. Try Recover purchase again. You have not been charged again.");
    }
    await Purchases.invalidateCustomerInfoCache();
  });
}
