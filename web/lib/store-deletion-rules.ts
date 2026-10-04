import { z } from "zod";
import { STORE_PACKAGES } from "../../shared/store-catalog";
const date = z.string().datetime({ offset: true }).nullable();
const schema = z.object({
  request_date_ms: z.number().int(),
  subscriber: z.object({
    original_app_user_id: z.string(),
    subscriptions: z.record(z.string(), z.object({
      store: z.string(), is_sandbox: z.boolean(), expires_date: date,
      product_plan_identifier: z.string().nullable().optional(),
      store_transaction_id: z.string().nullable().optional(),
      ownership_type: z.string().optional(),
      unsubscribe_detected_at: date.optional(), refunded_at: date.optional(),
      billing_issues_detected_at: date.optional(), auto_resume_date: date.optional(),
      grace_period_expires_date: date.optional(),
    })),
  }),
});
export type StoreDeletionPlan = { appleCancellationRequired: boolean; googleTransactionIds: string[] };
/** Accept only a fresh server-fetched response, never SDK/client receipt claims. */
export function storeDeletionPlan(raw: unknown, config: {
  appUserId: string; verifiedRecoveryAlias?: string; sandbox: boolean; sandboxAppUserIds?: readonly string[];
}, now = Date.now()): StoreDeletionPlan {
  const data = schema.parse(raw);
  if (data.subscriber.original_app_user_id !== config.appUserId &&
    !(config.verifiedRecoveryAlias?.startsWith("$RCAnonymousID:") && data.subscriber.original_app_user_id === config.verifiedRecoveryAlias))
    throw new Error("Store account ownership does not match. Contact support before deleting your account.");
  if (data.request_date_ms < now - 600000 || data.request_date_ms > now + 60000)
    throw new Error("Store verification is stale. Please retry.");
  const result: StoreDeletionPlan = { appleCancellationRequired: false, googleTransactionIds: [] };
  for (const [product, plan] of Object.entries(data.subscriber.subscriptions)) {
    if (!["app_store", "play_store"].includes(plan.store) || plan.ownership_type === "FAMILY_SHARED") continue;
    if (plan.refunded_at || (plan.unsubscribe_detected_at && !plan.auto_resume_date)) continue;
    // Expired entitlement alone is not proof billing stopped: retries and paused
    // subscriptions can resume without granting access today.
    const potentiallyBillable = !plan.expires_date || +new Date(plan.expires_date) > now ||
      Boolean(plan.billing_issues_detected_at || plan.auto_resume_date ||
        (plan.grace_period_expires_date && +new Date(plan.grace_period_expires_date) > now));
    if (!potentiallyBillable) continue;
    if (plan.is_sandbox !== config.sandbox && !(plan.is_sandbox && config.sandboxAppUserIds?.includes(config.appUserId)))
      throw new Error("A subscription belongs to another store environment. Contact support before deleting your account.");
    const productId = plan.store === "play_store" && !product.includes(":") && plan.product_plan_identifier
      ? `${product}:${plan.product_plan_identifier}` : product;
    const matches = STORE_PACKAGES.some(p => plan.store === "app_store" ? p.ios === productId : p.android === productId);
    if (!matches || (product.includes(":") && plan.product_plan_identifier && product.split(":")[1] !== plan.product_plan_identifier))
      throw new Error("An unrecognized store subscription needs review before account deletion. Contact support.");
    if (plan.store === "app_store") result.appleCancellationRequired = true;
    else {
      if (!plan.store_transaction_id?.match(/^GPA\.\d{4}-\d{4}-\d{4}-\d+(?:\.\.\d+)?$/))
        throw new Error("Google Play purchase details are incomplete. Restore purchases and retry account deletion.");
      result.googleTransactionIds.push(plan.store_transaction_id);
    }
  }
  result.googleTransactionIds = [...new Set(result.googleTransactionIds)];
  return result;
}
export function assertAppleDeletionAcknowledged(plan: StoreDeletionPlan, acknowledged: boolean) {
  if (plan.appleCancellationRequired && !acknowledged)
    throw new Error("Cancel Clover in Apple Subscriptions, then return to Account settings to confirm deletion. Update Clover if that option is unavailable.");
}
/** Cancellation stops renewal; it deliberately never calls refund/revoke. */
export async function cancelGoogleDeletionSubscriptions(appUserId: string, transactionIds: string[], apiKey: string, fetcher: typeof fetch = fetch) {
  for (const id of transactionIds) {
    const response = await fetcher(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}/subscriptions/${encodeURIComponent(id)}/cancel`, {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (response.status !== 200)
      throw new Error("Google Play cancellation could not be confirmed. Your Clover account has not been deleted. Please retry.");
  }
}
