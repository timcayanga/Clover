import assert from 'node:assert/strict';
import { plannedProPrices, PLAN_COMPARISON_ROWS } from '@/lib/public-plan-comparison';
import { getPlanProfileLimit } from '@/lib/user-limits';
import { matchesOnboardingPrice } from '@/lib/onboarding-pricing';
import { matchesPaddleAdvertisedPrice } from '@/lib/billing-offer-rules';
import { regionalProPricing } from '@/lib/public-plan-comparison';
assert.deepEqual(PLAN_COMPARISON_ROWS.profiles.slice(1), ['free', 'pro'].map(tier => String(getPlanProfileLimit(tier as 'free' | 'pro'))), 'Public Profile allowances must match the limits used by Account Plan');
for (const market of ['ph','global'] as const) {
  for (const interval of ['monthly','annual'] as const) {
    const amount = Number(plannedProPrices(market)[interval].replace(/[^0-9.]/g,''));
    const plan = {status:'ACTIVE', billing_cycles:[{tenure_type:'REGULAR',total_cycles:0,frequency:{interval_unit:interval==='monthly'?'MONTH':'YEAR',interval_count:1},pricing_scheme:{fixed_price:{currency_code:market==='ph'?'PHP':'USD',value:String(amount)}}}]};
    assert.equal(matchesOnboardingPrice(plan,market,interval),true);
    assert.equal(matchesOnboardingPrice(plan,market==='ph'?'global':'ph',interval),false);
    assert.equal(matchesOnboardingPrice(plan,market,interval==='monthly'?'annual':'monthly'),false);
    assert.equal(matchesOnboardingPrice({...plan,status:'INACTIVE'},market,interval),false);
    assert.equal(matchesOnboardingPrice({...plan,payment_preferences:{setup_fee:{value:'5'}}},market,interval),false);
    plan.billing_cycles[0].pricing_scheme.fixed_price.value=interval==='monthly'?'2.99':'29.99';
    assert.equal(matchesOnboardingPrice(plan,market,interval),false);
  }
}
assert.equal(matchesOnboardingPrice(null,'global','annual'),false);
for (const country of ['PH', 'US']) {
  const market = country === 'PH' ? 'ph' : 'global';
  for (const interval of ['monthly', 'annual'] as const) {
    const expected = regionalProPricing[market];
    const price = { status: 'active', billing_cycle: { interval: interval === 'monthly' ? 'month' : 'year', frequency: 1 }, unit_price: { currency_code: expected.currency, amount: String(Math.round(expected[interval].amount * 100)) } };
    assert.equal(matchesPaddleAdvertisedPrice(price, country, interval), true);
    assert.equal(matchesPaddleAdvertisedPrice({...price, status: 'archived'}, country, interval), false);
    assert.equal(matchesPaddleAdvertisedPrice({...price, trial_period: {interval:'month', frequency:1}}, country, interval), false);
    assert.equal(matchesPaddleAdvertisedPrice({...price, unit_price: {...price.unit_price, amount:'2999'}}, country, interval), false);
    assert.equal(matchesPaddleAdvertisedPrice({...price, unit_price_overrides:[{country_codes:[country], unit_price:{currency_code:'USD',amount:'2999'}}]}, country, interval), false);
  }
}
assert.equal(matchesPaddleAdvertisedPrice(null, 'PH', 'monthly'), false);
console.log('[PASS] Four advertised prices match; old prices, wrong currencies/cadences, inactive plans and setup fees are rejected.');
