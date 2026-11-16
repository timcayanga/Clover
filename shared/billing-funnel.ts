export type NativeBillingProvider = "app_store" | "play_store";

// Payment correlation never uses a receipt, purchase token, or unredacted order ID in analytics.
export function storePurchaseFingerprintInput(provider: NativeBillingProvider, transactionId: unknown) {
  if (typeof transactionId !== "string") return undefined;
  const id = transactionId.trim();
  if (provider === "app_store" ? !/^\d{5,30}$/.test(id) : !/^GPA\.[\d-]+(?:\.\.\d+)?$/.test(id)) return undefined;
  return `clover-billing:v1:${provider}:${id}`;
}

export function nativePaymentKind(type: string, period: string | undefined, convertedTrial: boolean) {
  if (type !== "INITIAL_PURCHASE" && type !== "RENEWAL") return undefined;
  if (period === "TRIAL" || period === "PROMOTIONAL") return undefined;
  if (!["NORMAL", "INTRO", "PREPAID"].includes(period ?? "")) return undefined;
  return type === "INITIAL_PURCHASE" ? "initial_purchase" : convertedTrial ? "trial_conversion" : "renewal";
}
