// Read-only deployment diagnostic. Never prints credentials, provider payloads or customers.
async function main() {
  if (!['production', 'preview'].includes(process.env.VERCEL_ENV ?? '')) {
    console.log('Billing readiness check skipped outside Vercel deployment.');
    return;
  }
  const { getVerifiedBillingOffers } = await import('../lib/billing-offers.server');
  for (const country of ['PH', 'US']) {
    const offers = await getVerifiedBillingOffers(country);
    console.log('billing_offer_readiness', {
      market: offers.market,
      plusMonthly: Boolean(offers.paddle.monthly || offers.paypal.monthly),
      plusAnnual: Boolean(offers.paddle.annual || offers.paypal.annual),
      proMonthly: Boolean(offers.pro?.paddle.monthly),
      proAnnual: Boolean(offers.pro?.paddle.annual),
    });
  }
}
void main().catch(() => { console.error('Billing readiness diagnostic failed; inspect provider configuration before promotion.'); process.exitCode = 1; });
