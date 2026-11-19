"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { PaddleCheckoutButton } from './paddle-checkout-button';
import { PayPalSubscribeButton } from './paypal-subscribe-button';
import { capturePostHogClientEvent } from './posthog-analytics';
import type { BillingOffers } from '@/lib/billing-offer-rules';
import { PLAN_CATALOG } from '../../shared/plan-catalog';
import { ONBOARDING_PAID_TIERS, onboardingCanConnect, onboardingPlanBenefits } from '../../shared/onboarding-upgrade';
import { planFunnelProperties } from '../../shared/plan-funnel';
import surface from './plan-card-surface.module.css';
import styles from './onboarding-plan-offers.module.css';

type Props = { customerId:string; email:string; paddleClientToken:string|null; paddleEnvironment:'sandbox'|'live'; paypalClientId:string|null; paypalBuyerCountry:string|null; pending:boolean; onPending:()=>void; onVerified:(tier:'pro'|'premium')=>void; interval?:'monthly'|'annual'; embedded?:boolean; };
export function OnboardingPlanOffers({customerId,email,paddleClientToken,paddleEnvironment,paypalClientId,paypalBuyerCountry,pending,onPending,onVerified,interval='monthly',embedded=false}:Props) {
  const [period,setPeriod]=useState(interval),[offers,setOffers]=useState<BillingOffers|null>(null),[offersError,setOffersError]=useState(false),[revision,setRevision]=useState(0),[message,setMessage]=useState(''),[checking,setChecking]=useState(false),[retry,setRetry]=useState(0);
  const callbacks=useRef({onVerified,onPending});callbacks.current={onVerified,onPending};
  const accessBlocked=useRef(false),mounted=useRef(true),flight=useRef<Promise<boolean>|null>(null),accessAbort=useRef<AbortController|null>(null),viewed=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;accessAbort.current?.abort();};},[]);
  useEffect(()=>{const controller=new AbortController();setOffersError(false);setOffers(null);
    void fetch('/api/billing/offers',{cache:'no-store',signal:controller.signal}).then(async r=>{if(!r.ok)throw Error();return r.json() as Promise<BillingOffers>;}).then(value=>{if(!controller.signal.aborted)setOffers(value);}).catch(()=>{if(!controller.signal.aborted)setOffersError(true);});
    return()=>controller.abort();
  },[customerId,revision]);
  useEffect(()=>{if(!offers||viewed.current)return;viewed.current=true;
    for(const tier of ONBOARDING_PAID_TIERS){const paddle=tier==='premium'?offers.pro?.paddle[period]:offers.paddle[period];const currency=paddle?'USD':offers.market==='ph'?'PHP':'USD';capturePostHogClientEvent('plan_viewed',{...planFunnelProperties('onboarding',period,currency,tier),plan_surface:'onboarding'});}
  },[offers,period]);
  const checkAccess=useCallback(()=>{
    if(flight.current)return flight.current;
    const controller=new AbortController();accessAbort.current=controller;setChecking(true);const deadline=setTimeout(()=>controller.abort(),8000);
    const operation=fetch('/api/onboarding/access',{cache:'no-store',signal:controller.signal}).then(async r=>{if(r.status===401||r.status===403){accessBlocked.current=true;if(mounted.current)setMessage('Sign in again to check your payment. Your place in setup is saved.');}if(!r.ok)throw Error();accessBlocked.current=false;return r.json();}).then(data=>{
      if(!mounted.current||controller.signal.aborted)return false;
      if(onboardingCanConnect(data.planTier)){callbacks.current.onVerified(data.planTier);return true;}
      return false;
    }).catch(()=>false).finally(()=>{clearTimeout(deadline);flight.current=null;if(mounted.current)setChecking(false);});
    flight.current=operation;return operation;
  },[]);
  useEffect(()=>{void checkAccess();},[checkAccess]);
  useEffect(()=>{const focus=()=>{if(pending)setRetry(n=>n+1);else void checkAccess();};window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[checkAccess,pending]);
  useEffect(()=>{if(!pending)return;let stopped=false,timer:ReturnType<typeof setTimeout>|undefined,count=0;
    setMessage('Payment received. Clover is checking your access. Your place in setup is saved.');
    const poll=async()=>{if(stopped||document.visibilityState==='hidden')return;const verified=await checkAccess();if(stopped||verified||accessBlocked.current)return;if(++count<12)timer=setTimeout(()=>void poll(),2500);else setMessage('Your payment is still being confirmed. Check its status or continue setup while Clover finishes. Please do not purchase again.');};
    void poll();return()=>{stopped=true;if(timer)clearTimeout(timer);};
  },[pending,retry,checkAccess]);
  const completed=()=>{callbacks.current.onPending();setRetry(n=>n+1);};
  const canceled=()=>setMessage('Checkout closed. Your account is still Free. Choose a plan or continue below.');
  const select=(tier:'pro'|'premium',currency:string)=>capturePostHogClientEvent('plan_selected',{...planFunnelProperties('onboarding',period,currency,tier),plan_surface:'onboarding'});
  return <div className={styles.shell}>
    {embedded ? <h4>Choose Plus or Pro</h4> : <div><h3>Less typing. More clarity.</h3><p>Connect your banks and let your money update automatically.</p></div>}
    <div className={styles.intervals} role="group" aria-label="Billing interval">{(['monthly','annual'] as const).map(value=><button type="button" key={value} disabled={pending} aria-pressed={period===value} onClick={()=>setPeriod(value)}>{value==='monthly'?'Monthly':'Annually'}</button>)}</div>
    <fieldset disabled={pending} className={styles.plans}><legend className="sr-only">Choose Plus or Pro</legend>{ONBOARDING_PAID_TIERS.map(tier=>{
      const paddleId=tier==='premium'?offers?.pro?.paddle[period]:offers?.paddle[period];
      const paypalId=tier==='pro'?offers?.paypal[period]:null;
      const paddleReady=Boolean(paddleClientToken&&paddleId),paypalReady=Boolean(paypalClientId&&paypalId);
      const currency=paddleReady?'USD':offers?.market==='ph'?'PHP':'USD';
      const price=paddleReady?(tier==='premium'?offers?.pro?.paddlePrices[period]:offers?.paddlePrices[period]):paypalReady?offers?.prices[period]:null;
      return <article key={tier} className={`${surface.surface} ${surface[tier]} ${styles.plan}`}>
        <h4>{PLAN_CATALOG[tier].name}</h4><strong className={styles.price}>{price?`${price} / ${period==='annual'?'year':'month'}`:offers||offersError?'Price unavailable':'Loading price…'}</strong>
        <p>{tier==='pro'?'Automatic tracking, less daily work':'For more accounts and bigger plans'}</p>
        <ul>{onboardingPlanBenefits(tier).map((benefit,index)=><li key={benefit}>{index===0?<strong>{benefit}</strong>:benefit}</li>)}</ul>
        {paddleReady?<PaddleCheckoutButton clientToken={paddleClientToken!} environment={paddleEnvironment} priceId={paddleId!} planTier={tier} customerId={customerId} customerEmail={email} interval={period} entryPoint="onboarding" displayedCurrency="USD" onStart={()=>select(tier,'USD')} onCompleted={completed} onCancelled={canceled} label={`Choose ${PLAN_CATALOG[tier].name}`} />:paypalReady?<PayPalSubscribeButton clientId={paypalClientId!} planId={paypalId!} customId={customerId} buyerCountry={paypalBuyerCountry} interval={period} entryPoint="onboarding" displayedCurrency={currency} disabled={pending} label="Choose Plus" disabledMessage="Your payment is being confirmed. Please do not purchase again." onStart={()=>select(tier,currency)} onApproved={completed} onCancelled={canceled} fundingSource="card" />:<button type="button" disabled className="button button-secondary">{offers||offersError?'Checkout unavailable':'Loading checkout…'}</button>}
      </article>;
    })}</fieldset>
    <p className={styles.terms}>Subscriptions renew automatically. Review the final price, currency and terms in secure checkout before paying.</p>
    {message?<p role="status" className={styles.status}>{message}</p>:null}
    {pending?<button type="button" className="button button-secondary" disabled={checking} onClick={()=>{void checkAccess().then(verified=>{if(!verified&&mounted.current)setMessage('Your access is not confirmed yet. You can continue setup without making another purchase.');});}}>{checking?'Checking payment…':'Check payment status'}</button>:null}
    {offersError||offers&&(!offers.pro?.paddle[period]||!offers.paddle[period]&&!offers.paypal[period])?<button type="button" className="button button-secondary" onClick={()=>setRevision(n=>n+1)}>Reload available plans</button>:null}
  </div>;
}
