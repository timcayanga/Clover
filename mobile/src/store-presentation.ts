/** Display the store's localized metadata without inventing exchange rates. */
export function storePriceLabel(product: { priceString: string; currencyCode: string; subscriptionPeriod: string | null }) {
  return `${product.priceString} ${product.currencyCode} / ${product.subscriptionPeriod === 'P1Y' ? 'year' : 'month'}`;
}
export function storeVerificationMessage(tier: 'free' | 'pro' | 'premium', action: 'silent' | 'refresh' | 'restore' | 'purchase') {
  if (action === 'silent') return '';
  if (tier !== 'free') return `Clover ${tier === 'premium' ? 'Pro' : 'Plus'} access verified.`;
  if (action === 'restore') return 'No active Clover Plus or Pro purchase was found for this account.';
  if (action === 'purchase') return 'Your purchase is awaiting store verification. Refresh plan status before trying another purchase.';
  return 'You’re on Clover Free.';
}

/** Entitlement follows the Clover login, but billing stays with the original store. */
export function planManagement(status: { hasPaidSubscription?: boolean; billingProvider?: string | null; accessSource?: string }, platform: string, target: 'free' | 'pro' | 'premium') {
  const provider = status.billingProvider;
  const apple = provider === 'app_store', google = provider === 'play_store';
  const store = apple ? 'Apple' : 'Google Play';
  if (status.hasPaidSubscription === false) return {
    title: 'Your Clover access', url: null,
    message: 'Your current access was granted without a store subscription. There is no store subscription to cancel. Contact Clover support if you want this access changed.',
  };
  if (!apple && !google) return {
    title: 'Manage your subscription', url: null,
    message: provider ? 'Your subscription is managed by your original billing provider. Open Plan on the Clover website to manage it.' : 'Refresh plan status to identify the store that manages your subscription before changing plans.',
  };
  const sameStore = apple ? platform === 'ios' : platform === 'android';
  const action = target === 'free'
    ? 'Cancel renewal to return to Free when your paid access ends.'
    : `Choose Clover ${target === 'premium' ? 'Pro' : 'Plus'} in your subscription options. The store will show the effective date and any charge before you confirm.`;
  return {
    title: `Manage your ${store} subscription`,
    message: `${action} ${sameStore ? `Continue to ${store} subscriptions.` : `This subscription was purchased through ${store}. Manage it ${apple ? 'on your Apple device' : 'in Google Play using the Google account that purchased it'}. Your Clover access works on both platforms.`}`,
    nativeSheet: sameStore && apple,
    url: sameStore && google ? 'https://play.google.com/store/account/subscriptions' : null,
  };
}
