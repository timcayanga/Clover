import { useEffect, useRef, useState } from 'react';
import { AppState, Image, Platform, Pressable, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { useSession } from './session';
import { Text } from './app-text';
import { Body, Button, Notice } from './ui';
import { PlanCardSurface } from './plan-card-surface';
import { canUseStore, loadStorePackages, purchaseStorePackage, restoreStorePurchases, type StoreStatus } from './store-billing';
import { isPurchaseCancelled, purchaseNeedsVerification, isStoreOwnershipConflict, storeErrorMessage } from './store-change-policy';
import { storePriceLabel } from './store-presentation';
import { STORE_PACKAGES } from '../../shared/store-catalog';
import { PLAN_CATALOG } from '../../shared/plan-catalog';
import { ONBOARDING_PAID_TIERS, onboardingCanConnect, onboardingPlanBenefits } from '../../shared/onboarding-upgrade';
import { telemetry, newTelemetryId } from '../../shared/analytics';
import { beginCheckoutPreparation, planFunnelProperties } from '../../shared/plan-funnel';

type Props={embedded?:boolean;pending:boolean;onPending:(value:boolean)=>void;onBusy:(value:boolean)=>void;onVerified:(tier:'pro'|'premium')=>void};
export function OnboardingPlanOffers({pending,onPending,onBusy,onVerified,embedded=false}:Props){
 const session=useSession(),[status,setStatus]=useState<StoreStatus|null>(null),[packages,setPackages]=useState<PurchasesPackage[]>([]),[period,setPeriod]=useState<'P1M'|'P1Y'>('P1M'),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[message,setMessage]=useState(''),[revision,setRevision]=useState(0),[width,setWidth]=useState(0),[blocked,setBlocked]=useState(false);
 const actionRequired=useRef(false),viewed=useRef(false),alive=useRef(true),locked=useRef(false),checkFlight=useRef<Promise<boolean>|null>(null),callbacks=useRef({onPending,onBusy,onVerified});callbacks.current={onPending,onBusy,onVerified};
 const verifyRef=useRef<()=>Promise<boolean>>(async()=>false);
 const accept=(next:StoreStatus)=>{if(!alive.current)return false;setStatus(next);if(onboardingCanConnect(next.planTier)){callbacks.current.onPending(false);callbacks.current.onVerified(next.planTier as 'pro'|'premium');session.refresh();return true;}return false;};
 verifyRef.current=()=>{
  if(checkFlight.current)return checkFlight.current;
  const flight=session.request<StoreStatus>('billing/store',{method:'POST',body:'{}'},true).then(accept).catch(error=>{if(error&&typeof error==='object'&&'status'in error&&[401,403,409,422].includes(Number(error.status))){actionRequired.current=true;if(alive.current){setBlocked(true);setMessage('Your purchase needs attention. Sign in again or use Restore purchases, then check its status. You can still continue setup.');}}return false;}).finally(()=>{checkFlight.current=null;});checkFlight.current=flight;return flight;
 };
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{let canceled=false;setLoading(true);
  if(session.demo){setLoading(false);return;}
  void session.request<StoreStatus>('billing/store',undefined,true).then(async next=>{if(canceled)return;if(accept(next))return;if(canUseStore(next)){const choices=await loadStorePackages(next);if(!canceled){setPackages(choices);if(!viewed.current){viewed.current=true;telemetry('plan_viewed',{...planFunnelProperties('onboarding',period,choices[0]?.product.currencyCode),plan_surface:'onboarding'});}}}else setMessage('Store checkout is unavailable. You can continue with Free.');}).catch(()=>{if(!canceled)setMessage('Plans could not load. Try again or continue with Free.');}).finally(()=>{if(!canceled)setLoading(false);});
  return()=>{canceled=true;};
 },[session.request,session.demo,revision]);
 useEffect(()=>{if(!pending)return;let stopped=false,count=0,timer:ReturnType<typeof setTimeout>|undefined;
  const poll=async()=>{if(stopped||AppState.currentState!=='active')return;if(locked.current){timer=setTimeout(()=>void poll(),500);return;}if(await verifyRef.current()||stopped||actionRequired.current)return;if(++count<12)timer=setTimeout(()=>void poll(),2500);else if(alive.current)setMessage('Your purchase is still being verified. Check payment status or continue setup. Please do not purchase again.');};
  void poll();const listener=AppState.addEventListener('change',state=>{if(state==='active'&&!stopped)void poll();});return()=>{stopped=true;if(timer)clearTimeout(timer);listener.remove();};
 },[pending]);
 const choose=async(tier:'pro'|'premium')=>{
  if(locked.current||pending||blocked||!status)return;locked.current=true;setBusy(true);callbacks.current.onBusy(true);setMessage('');
  const item=packages.find(item=>STORE_PACKAGES.find(p=>p.identifier===item.identifier)?.tier===tier&&item.product.subscriptionPeriod===period);
  const props={...planFunnelProperties('onboarding',period,item?.product.currencyCode,tier),billing_provider:Platform.OS==='ios'?'app_store':'play_store',plan_surface:'onboarding'};
  telemetry('plan_selected',props);const prep=beginCheckoutPreparation(telemetry,props),attemptId=newTelemetryId();let handedOff=false;
  try{
   if(!item||!canUseStore(status)){prep.finish('plan_unavailable');setMessage('That plan is unavailable. Reload plans or continue with Free.');return;}
   await purchaseStorePackage(status,item,()=>session.request<StoreStatus>('billing/store',{method:'POST',body:'{}'},true),()=>{handedOff=true;prep.finish(undefined,attemptId);telemetry('checkout_started',{...props,checkout_attempt_id:attemptId,checkout_preparation_id:prep.id});});
   telemetry('checkout_outcome',{...props,checkout_attempt_id:attemptId,checkout_outcome:'provider_completed'});
   if(alive.current){callbacks.current.onPending(true);setMessage('Payment received. Clover is verifying your access.');}
   await verifyRef.current();
  }catch(error){
   if(!handedOff)prep.finish(isStoreOwnershipConflict(error)?'ownership_conflict':'provider_handoff_failed');
   else telemetry('checkout_outcome',{...props,checkout_attempt_id:attemptId,checkout_outcome:isPurchaseCancelled(error)?'canceled':'failed'});
   if(alive.current){if(isPurchaseCancelled(error)){callbacks.current.onPending(false);setMessage('Checkout closed. Choose a plan or continue with Free.');}else{setBlocked(isStoreOwnershipConflict(error));callbacks.current.onPending(purchaseNeedsVerification(error));setMessage(storeErrorMessage(error));}}
  }finally{locked.current=false;if(alive.current){setBusy(false);callbacks.current.onBusy(false);}}
 };
 const restore=async()=>{if(locked.current||!status||!canUseStore(status))return;locked.current=true;setBusy(true);callbacks.current.onBusy(true);try{await restoreStorePurchases(status);if(!await verifyRef.current()&&alive.current)setMessage('No active paid access is verified yet. You can continue with Free.');if(alive.current)setBlocked(false);}catch(error){if(alive.current)setMessage(storeErrorMessage(error));}finally{locked.current=false;if(alive.current){setBusy(false);callbacks.current.onBusy(false);}}};
 return <View style={{gap:16}} onLayout={e=>setWidth(e.nativeEvent.layout.width)}>
  {!embedded ? <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Image source={require('../assets/clover-icon.png')} accessibilityLabel="Clover" style={{width:56,height:56}} resizeMode="contain"/><Text style={{fontFamily:'Poppins-SemiBold',color:'#202b37'}}>Welcome to Clover</Text></View> : null}
  {embedded ? <Text style={{fontFamily:'Poppins-SemiBold',fontSize:18,color:'#202b37'}}>Choose Plus or Pro</Text> : <><Text style={{fontFamily:'Poppins-SemiBold',fontSize:25,color:'#202b37'}}>Less typing. More clarity.</Text><Body>Connect your banks and let your money update automatically.</Body></>}
  <View style={{flexDirection:'row',backgroundColor:'#edf7f8',padding:4,borderRadius:99,alignSelf:'center'}}>{(['P1M','P1Y'] as const).map(value=><Pressable key={value} accessibilityRole="button" accessibilityState={{selected:period===value,disabled:busy||pending}} disabled={busy||pending} onPress={()=>setPeriod(value)} style={{borderRadius:99,backgroundColor:period===value?'#00aabd':'transparent',paddingVertical:10,paddingHorizontal:22}}><Text style={{color:period===value?'white':'#202b37'}}>{value==='P1M'?'Monthly':'Annually'}</Text></Pressable>)}</View>
  {ONBOARDING_PAID_TIERS.map(tier=>{const item=packages.find(item=>STORE_PACKAGES.find(p=>p.identifier===item.identifier)?.tier===tier&&item.product.subscriptionPeriod===period);return <PlanCardSurface key={tier} tier={tier} width={width||340}><View style={{padding:20,gap:10}}><Text style={{fontFamily:'Poppins-SemiBold',fontSize:24,color:'#153b42'}}>{PLAN_CATALOG[tier].name}</Text><Text style={{fontFamily:'Poppins-SemiBold',fontSize:18,color:'#153b42'}}>{item?storePriceLabel(item.product):loading?'Loading price…':'Price unavailable'}</Text>{onboardingPlanBenefits(tier).map((benefit,i)=><Text key={benefit} style={{color:'#153b42',fontSize:13,lineHeight:20,fontFamily:i===0?'Poppins-SemiBold':'Poppins-Regular'}}>✓ {benefit}</Text>)}<Button title={`Choose ${PLAN_CATALOG[tier].name}`} secondary disabled={busy||pending||blocked||loading||!item||session.demo} onPress={()=>void choose(tier)}/></View></PlanCardSurface>;})}
  <Body>Subscriptions renew automatically. Review the final price and terms in Apple or Google checkout before paying.</Body>
  {message?<Notice>{message}</Notice>:null}
  <Button title={busy?'Checking…':pending?'Check payment status':'Reload available plans'} secondary disabled={busy} onPress={()=>{if(pending)void verifyRef.current();else setRevision(n=>n+1);}}/>
  {status&&canUseStore(status)?<Button title="Restore purchases" secondary disabled={busy} onPress={()=>void restore()}/>:null}
 </View>;
}
