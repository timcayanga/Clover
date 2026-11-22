import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
require.extensions['.css']=(module:any)=>{module.exports=new Proxy({},{get:(_target,key)=>key==='__esModule'?false:String(key)});};
const {OnboardingForm}=require('../components/onboarding-form');
import {normalizeRegionalPreferences} from '@/lib/regional-preferences';
for(const interval of ['monthly','annual'] as const){
 const render=(initialPlanTier:'free'|'pro'|'premium', initialTermsAccepted = true)=>renderToStaticMarkup(React.createElement(AppRouterContext.Provider,{value:{} as any},React.createElement(OnboardingForm,{initialTermsAccepted,workspaceId:'qa',billingCustomerId:'qa',workspaceAccounts:[],initialPlanTier,upgradeInterval:interval,regionalDefaults:normalizeRegionalPreferences({})})));
 assert.match(render('free', false), /I accept the/);
 const html=render('free');assert.match(html,/Choose Plus or Pro/);assert.match(html,/2 linked bank accounts/);assert.match(html,/5 linked bank accounts/);assert.match(html,/Continue with Free/);assert.match(html,/Loading price/);assert.doesNotMatch(html,/free trial|USD 2\.99|USD 29\.99/i);
 assert.match(html,new RegExp('aria-pressed="true"[^>]*>'+ (interval==='monthly'?'Monthly':'Annually')));
 for(const tier of ['pro','premium'] as const){const paid=render(tier);assert.match(paid,/How comfortable are you/);assert.doesNotMatch(paid,/Continue with Free/);}
}
console.log('PASS actual onboarding SSR: Free sees both paid tiers before knowledge, accurate bank allowances, no invented pre-verification prices, requested interval and Free continuation; paid users skip the offer.');
