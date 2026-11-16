import { createHash } from "node:crypto";
import { storePurchaseFingerprintInput, nativePaymentKind, type NativeBillingProvider } from "../../shared/billing-funnel";
import { STORE_PACKAGES } from "../../shared/store-catalog";
import { publicPlan } from "../../shared/plan-analytics";
import { capturePostHogServerEvent } from "./analytics-server";

function purchaseKey(provider: NativeBillingProvider, transactionId: unknown) {
  const input = storePurchaseFingerprintInput(provider, transactionId);
  return input ? createHash("sha256").update(input).digest("hex") : undefined;
}

export async function captureVerifiedStorePayment(userId: string, event: {
  type: string; environment?: string; period_type?: string; is_trial_conversion?: boolean;
  is_family_share?: boolean; store?: string; product_id?: string; transaction_id?: string;
  price?: number | null; price_in_purchased_currency?: number | null; currency?: string; purchased_at_ms?: number;
}) {
  const provider = event.store === "APP_STORE" ? "app_store" : event.store === "PLAY_STORE" ? "play_store" : null;
  const kind = nativePaymentKind(event.type, event.period_type, event.is_trial_conversion === true);
  if (!provider || !kind || event.environment !== "PRODUCTION" || event.is_family_share || !((event.price_in_purchased_currency ?? event.price ?? 0) > 0)) return;
  const item = STORE_PACKAGES.find(plan => event.product_id === (provider === "app_store" ? plan.ios : plan.android));
  if (!item) return;
  const key = purchaseKey(provider, event.transaction_id);
  if (!key || !event.purchased_at_ms || event.purchased_at_ms > Date.now() + 60_000) return;
  await capturePostHogServerEvent("billing_payment_verified", userId, {
    selected_plan: publicPlan(item.tier),
    billing_interval: item.period === "P1Y" ? "annual" : "monthly",
    billing_provider: provider,
    purchase_key: key,
    payment_kind: kind,
    payment_currency: /^[A-Z]{3}$/.test(event.currency ?? "") ? event.currency : undefined,
    provider_paid_at_ms: event.purchased_at_ms,
    $insert_id: `verified-store-payment:${key}`,
  });
}

export async function captureVerifiedStoreUnlock(userId: string, state: {
  store: string | null; productId: string | null; expiresAt: Date | null; sandbox: boolean;
}, raw: unknown, unlockedAt: number) {
  if (state.sandbox || !state.expiresAt || !state.productId || (state.store !== "app_store" && state.store !== "play_store")) return;
  // Only a server-fetched record for the exact verified product is eligible.
  const provider = state.store;
  const subscriptions = (raw as { subscriber?: { subscriptions?: Record<string, {
    store?: string; is_sandbox?: boolean; product_plan_identifier?: string;
    store_transaction_id?: string; purchase_date?: string; period_type?: string;
  }> } })?.subscriber?.subscriptions ?? {};
  const matching = Object.entries(subscriptions).filter(([id, sub]) =>
    sub.store === provider && sub.is_sandbox === false &&
    (id === state.productId || (provider === "play_store" && `${id}:${sub.product_plan_identifier}` === state.productId)));
  if (matching.length !== 1) return;
  const receipt = matching[0][1];
  if (["TRIAL", "PROMOTIONAL"].includes(receipt.period_type?.toUpperCase() ?? "")) return;
  const key = purchaseKey(provider, receipt.store_transaction_id);
  const paidAt = Date.parse(receipt.purchase_date ?? "");
  if (!key || !Number.isFinite(paidAt) || paidAt > unlockedAt) return;
  await capturePostHogServerEvent("billing_access_verified", userId, {
    billing_provider: provider, purchase_key: key,
    provider_paid_at_ms: paidAt, payment_to_access_ms: unlockedAt - paidAt,
    $insert_id: `verified-store-access:${key}`,
  });
}
