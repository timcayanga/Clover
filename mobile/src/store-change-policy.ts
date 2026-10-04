import type { CustomerInfo } from 'react-native-purchases';
import { STORE_PACKAGES } from '../../shared/store-catalog';

export type PlanTier = 'free' | 'pro' | 'premium';
export type PurchaseIntent = {
  productId: string;
  tier: 'pro' | 'premium';
  effect: 'immediate' | 'renewal' | 'next-payment';
  requestedAt: number;
  effectiveAt: string | null;
};
export class StoreActionError extends Error {}
export class StoreOwnershipError extends StoreActionError {}
export const STORE_OWNERSHIP_MESSAGE = 'This store purchase is linked to another Clover account. Sign in to the Clover account used for the original purchase, then restore there. If that account was deleted or you cannot access it, contact Clover support. Do not buy again.';
export function isStoreOwnershipConflict(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  return error instanceof StoreOwnershipError || ['7', '13'].includes(code);
}
export function assertStoreOwner(info: Pick<CustomerInfo, 'originalAppUserId'>, appUserId: string) {
  if (info.originalAppUserId !== appUserId) throw new StoreOwnershipError(STORE_OWNERSHIP_MESSAGE);
}

/** SDK data selects the existing purchase to replace; it never grants access. */
export function currentStoreProduct(info: CustomerInfo, appUserId: string) {
  assertStoreOwner(info, appUserId);
  const requested = Date.parse(info.requestDate);
  if (!Number.isFinite(requested) || Math.abs(Date.now() - requested) > 10 * 60000)
    throw new StoreActionError('Store details are out of date. Refresh plan status before changing plans.');
  const active = Object.values(info.subscriptionsByProductIdentifier ?? {}).filter(s => s.isActive);
  // Include active entitlements as a backstop for incomplete subscription metadata.
  const entitlements = Object.values(info.entitlements.active);
  if (!active.length && !entitlements.length && !info.activeSubscriptions.length) return null;
  if (active.length !== 1) throw new StoreActionError('Your current subscription could not be identified uniquely. Manage your subscriptions or use Restore purchases before buying again.');
  const subscription = active[0];
  const parts = subscription.productIdentifier.split(':');
  if (parts.length > 2 || (parts[1] && subscription.productPlanIdentifier && parts[1] !== subscription.productPlanIdentifier))
    throw new StoreActionError('Your current billing period could not be verified. Refresh plan status before changing plans.');
  const productId = subscription.store === 'PLAY_STORE'
    ? `${parts[0]}:${parts[1] || subscription.productPlanIdentifier || ''}`
    : subscription.productIdentifier;
  const catalog = STORE_PACKAGES.find(p => p.android === productId || p.ios === productId);
  if (!catalog || !['PLAY_STORE', 'APP_STORE'].includes(subscription.store))
    throw new StoreActionError('Manage this subscription with its original billing provider.');
  if (subscription.billingIssuesDetectedAt || subscription.refundedAt || subscription.autoResumeDate || subscription.periodType === 'PREPAID')
    throw new StoreActionError('Resolve your current subscription status in the original store before changing plans.');
  return { ...catalog, productId, subscriptionId: parts[0], store: subscription.store, expiresAt: subscription.expiresDate };
}

export function googleReplacement(current: NonNullable<ReturnType<typeof currentStoreProduct>>, targetProduct: string) {
  const target = STORE_PACKAGES.find(p => p.android === targetProduct);
  if (!target || current.store !== 'PLAY_STORE') throw new StoreActionError('Manage this subscription in its original store.');
  if (current.productId === targetProduct) throw new StoreActionError('You already have this billing plan. Use Manage subscription to review or resume renewal.');
  const sameProduct = current.subscriptionId === targetProduct.split(':')[0];
  // Google disallows time proration/deferred when only the base plan changes.
  const mode = sameProduct ? 'WITHOUT_PRORATION'
    : target.tier === 'premium' ? 'WITH_TIME_PRORATION' : 'DEFERRED';
  return { oldProductIdentifier: current.subscriptionId, replacementMode: mode,
    effect: sameProduct ? 'next-payment' : mode === 'DEFERRED' ? 'renewal' : 'immediate' } as const;
}

export function purchaseVerified(status: { planTier: PlanTier; hasPaidSubscription?: boolean }, intent: PurchaseIntent) {
  return status.hasPaidSubscription === true && (status.planTier === intent.tier || (status.planTier === 'premium' && intent.tier === 'pro'));
}
export function purchaseFeedback(status: { planTier: PlanTier; hasPaidSubscription?: boolean }, intent: PurchaseIntent) {
  const name = intent.tier === 'premium' ? 'Pro' : 'Plus';
  if (intent.effect === 'renewal') return `Google Play accepted your change to Clover ${name} for the next renewal. Your current plan stays active until then.`;
  if (intent.effect === 'next-payment') return 'Google Play accepted your billing-period change. The new price applies at your next billing date.';
  return purchaseVerified(status, intent)
    ? status.planTier !== intent.tier ? `Your Clover ${name} purchase is verified. Your existing higher-tier access remains active.` : `Clover ${name} access verified.`
    : `Your purchase is awaiting verification. Refresh plan status or use Restore purchases before trying another purchase.`;
}

export function isPurchaseCancelled(error: unknown) {
  return Boolean(error && typeof error === 'object' && (('userCancelled' in error && error.userCancelled) || ('code' in error && String(error.code) === '1')));
}
export function purchaseNeedsVerification(error: unknown) {
  if (isPurchaseCancelled(error) || error instanceof StoreActionError) return false;
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  return !['2', '3', '4', '5', '18', '23', '24'].includes(code);
}
export function storeErrorMessage(error: unknown) {
  if (error instanceof StoreActionError) return error.message;
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === '20') return 'Your payment is pending in the store. Complete or cancel it there, then refresh plan status. Please do not start another purchase.';
  if (isStoreOwnershipConflict(error)) return STORE_OWNERSHIP_MESSAGE;
  if (code === '6') return 'This subscription is already purchased in your store account. Use Restore purchases to verify it before buying again.';
  if (['2', '3', '4', '5', '18', '23', '24'].includes(code)) return 'The store could not complete this purchase. Check your payment method and available plan in the store, then try again.';
  return 'Your purchase status could not be verified. Refresh plan status or use Restore purchases before buying again.';
}
