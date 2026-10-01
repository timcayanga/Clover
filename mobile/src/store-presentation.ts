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
