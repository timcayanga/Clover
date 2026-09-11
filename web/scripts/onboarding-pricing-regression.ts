import assert from 'node:assert/strict';
import { plannedProPrices } from '@/lib/public-plan-comparison';
import { matchesOnboardingPrice } from '@/lib/onboarding-pricing';
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
console.log('[PASS] Four advertised prices match; old prices, wrong currencies/cadences, inactive plans and setup fees are rejected.');
