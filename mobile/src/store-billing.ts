import { matchesStorePackage, STORE_OFFERING_ID, STORE_PACKAGES } from "../../shared/store-catalog";
import { trackOperation } from "../../shared/analytics";
import { Platform } from "react-native";
import Purchases, { type PurchasesPackage } from "react-native-purchases";
export type StoreStatus = {
  available: boolean;
  appUserId: string;
  entitlementId: string;
  offeringId?: string;
  productIds: string[];
  planTier: "free" | "pro" | "premium";
  accessEndsAt: string | null;
  renewing: boolean;
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
  else if (account !== status.appUserId)
    await Purchases.logIn(status.appUserId);
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
      throw new Error("This product is unavailable.");
    await trackOperation("store_purchase", () => Purchases.purchasePackage(item), { phase: "store_confirmation", target_plan: STORE_PACKAGES.find(p => p.identifier === item.identifier)?.tier, billing_provider: Platform.OS === "ios" ? "app_store" : "play_store", product_id: item.product.identifier });
    // Caller must now ask Clover's server to verify; SDK state cannot grant Pro.
  });
}
export function restoreStorePurchases(status: StoreStatus) {
  return exclusive(async () => {
    await identify(status);
    await trackOperation("store_restore", () => Purchases.restorePurchases(), { phase: "store_confirmation" });
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
