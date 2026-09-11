import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import assert from 'node:assert/strict';
import {OnboardingForm} from '@/components/onboarding-form';
import {normalizeRegionalPreferences} from '@/lib/regional-preferences';
import {plannedProPrices} from '@/lib/public-plan-comparison';
for (const market of ['ph','global'] as const) {
  for (const interval of ['monthly','annual'] as const) {
    const html = renderToStaticMarkup(React.createElement(AppRouterContext.Provider,{value:{} as any},React.createElement(OnboardingForm,{
      workspaceId:'qa',billingCustomerId:'qa',workspaceAccounts:[],upgradeForPro:true,upgradeInterval:interval,pricingMarket:market,regionalDefaults:normalizeRegionalPreferences({})
    })));
    for(const price of Object.values(plannedProPrices(market))) assert.ok(html.includes(price));
    assert.doesNotMatch(html,/USD 2\.99|USD 29\.99/);
    assert.match(html,new RegExp('aria-pressed="true"[^>]*>'+ (interval==='monthly'?'Monthly':'Annually')));
    assert.match(html,/Upgrade later/);
  }
}
console.log('[PASS] Actual onboarding component renders approved PH/global prices, requested interval and Upgrade later in all four combinations.');
